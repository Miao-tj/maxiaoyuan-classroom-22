import { Wllama } from './vendor/wllama.js';
import { sha256 } from './vendor/sha256.js';
const modelURL =
  'https://modelscope.cn/models/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/master/qwen2.5-0.5b-instruct-q4_0.gguf';
const size = 428730208,
  chunkSize = 8 * 1024 * 1024,
  digest = '7671c0c304e6ce5a7fc577bcb12aba01e2c155cc2efd29b2213c95b18edaf6ed';
let loading, engine;
async function initialise(status, signal) {
  let cache;
  try {
    cache = await caches.open('mxy-qwen-' + digest.slice(0, 12));
  } catch {}
  const chunks = Array(Math.ceil(size / chunkSize));
  let next = 0,
    loaded = 0;
  async function reader() {
    while (next < chunks.length) {
      const index = next++,
        start = index * chunkSize,
        end = Math.min(size, start + chunkSize) - 1,
        expected = end - start + 1;
      signal?.throwIfAborted();
      const key = new URL('./.model-cache/' + digest + '/' + index, location.href).href;
      let response = await cache?.match(key);
      let chunk = response ? await response.blob() : null;
      if (chunk?.size !== expected) {
        response = await fetch(modelURL + '?part=' + index, {
          headers: { Range: 'bytes=' + start + '-' + end },
          signal,
        });
        if (response.status !== 206) throw Error('模型文件下载未完成，请在 Wi-Fi 下重试。');
        chunk = await response.blob();
        if (chunk.size !== expected) throw Error('模型分片长度不符，请重试。');
        if (cache) {
          try {
            await cache.put(key, new Response(chunk));
          } catch {
            cache = null;
          }
        }
      }
      chunks[index] = chunk;
      loaded += expected;
      status('准备通义千问 · ' + Math.floor((loaded / size) * 100) + '%');
    }
  }
  await Promise.all([reader(), reader(), reader()]);
  status('正在校验模型…');
  const hash = sha256.create();
  for (const chunk of chunks) {
    signal?.throwIfAborted();
    hash.update(new Uint8Array(await chunk.arrayBuffer()));
  }
  const actual = Array.from(hash.digest(), (v) => v.toString(16).padStart(2, '0')).join('');
  if (actual !== digest) throw Error('模型校验未通过，请清理该站点的模型缓存后重试。');
  const instance = new Wllama({
    'single-thread/wllama.wasm': new URL('./vendor/wllama.wasm', import.meta.url).href,
  });
  try {
    await instance.loadModel([new Blob(chunks)], { n_ctx: 3072, n_batch: 128, n_threads: 1 });
  } catch {
    throw Error('这台设备未能载入模型，可改用云端或电脑验收版。');
  }
  return instance;
}
async function ready(status, signal) {
  if (engine) return engine;
  if (!loading)
    loading = initialise(status, signal)
      .then((e) => (engine = e))
      .finally(() => {
        loading = null;
      });
  return loading;
}
const prompt = (system, text) =>
  '<|im_start|>system\n' +
  system +
  '<|im_end|>\n<|im_start|>user\n' +
  text.replaceAll('<|', '＜｜') +
  '<|im_end|>\n<|im_start|>assistant\n';
export async function deviceChat(text, source, history, { signal, status, update }) {
  const llm = await ready(status, signal);
  signal?.throwIfAborted();
  status('通义千问正在回答…');
  const content = [
    ...history
      .slice(-2)
      .map((x) => '上次提问：' + x.q.slice(0, 150) + '\n上次回答：' + x.a.slice(0, 220)),
    source && '参考讲义：' + source,
    '问题：' + text,
  ]
    .filter(Boolean)
    .join('\n');
  return llm.createCompletion(
    prompt('你是马小原课程助教。请用中文解释概念并给一个例子，不编造引文。', content),
    {
      nPredict: 300,
      abortSignal: signal,
      sampling: { temp: 0.3 },
      onNewToken: (_id, _p, s) => update(s),
    },
  );
}
const labels = ['理论理解', '文本依据', '联系实际', '结构与表达'],
  maxima = [30, 25, 25, 20];
const gradingGrammar = String.raw`root ::= first "|" remark "\n" second "|" remark "\n" second "|" remark "\n" fourth "|" remark "\n"
first ::= "30" | [12] [0-9] | [0-9]
second ::= "2" [0-5] | "1" [0-9] | [0-9]
fourth ::= "20" | "1" [0-9] | [0-9]
remark ::= [^|\r\n]{5,35}`;

export async function deviceReview(text, { signal, status }) {
  if (text.length > 2200) throw Error('设备模型单次可评 40～2200 字。请选取段落，或使用云端模型。');
  const llm = await ready(status, signal);
  signal?.throwIfAborted();
  status('通义千问正在阅读正文…');
  const instruction =
    '你是课程教师。依次评价理论理解（30分）、文本依据（25分）、联系实际（25分）、结构表达（20分）。每行只写整数分数、竖线和一句精简中文评语。评语引用本文的内容。没有所读原文的举证，应扣文本依据分。只写四行。';
  const result = await llm.createCompletion(prompt(instruction, text), {
    abortSignal: signal,
    nPredict: 480,
    sampling: { temp: 0.2, grammar: gradingGrammar },
    onNewToken: (_id, _piece, answer) => {
      const finished = answer.split('\n').length - 1;
      if (finished > 0 && finished < 4) status('通义千问已分析 ' + finished + ' / 4 项…');
    },
  });
  const rows = result.trim().split(/\r?\n/);
  if (rows.length !== 4) throw Error('设备模型没有完成四项评语，请重试。');
  const dimensions = rows.map((row, i) => {
    const match = /^(\d{1,2})\|(.+)$/.exec(row.trim());
    if (!match || Number(match[1]) > maxima[i]) throw Error('模型给分超出量规，请重试。');
    return { name: labels[i], max: maxima[i], score: Number(match[1]), comment: match[2].trim() };
  });
  const weakest = dimensions.reduce((a, b) => (a.score / a.max <= b.score / b.max ? a : b));
  return {
    dimensions,
    total: dimensions.reduce((sum, d) => sum + d.score, 0),
    summary: '可优先复核「' + weakest.name + '」。' + weakest.comment,
    method: '设备模型',
  };
}
