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
    await instance.loadModel([new Blob(chunks)], { n_ctx: 8192, n_batch: 128, n_threads: 1 });
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
const bands = [
  { letter: 'A', ratio: 1, title: '充分' },
  { letter: 'B', ratio: 0.85, title: '较充分' },
  { letter: 'C', ratio: 0.65, title: '基本' },
  { letter: 'D', ratio: 0.35, title: '薄弱' },
  { letter: 'E', ratio: 0, title: '未体现' },
];
const criteria = [
  '核心概念的含义准确，解释概念间关系并限定条件。',
  '指出所读篇目、原句或可定位段落，并作解释。全文未引用或交代任何文本，只能选择D或E。',
  '给出具体真实情境，说明行动、观察和结论之间的联系。',
  '结构清楚，使用完整语句，能连贯论证并回应主题。',
];

export async function deviceReview(text, { signal, status }) {
  if (text.length > 9000) throw Error('请提交 40～9000 字的正文。');
  const llm = await ready(status, signal);
  const choices = new Map();
  for (const band of bands) {
    for (const value of [band.letter, ' ' + band.letter]) {
      const ids = await llm.tokenize(value, false);
      if (ids.length === 1) choices.set(ids[0], band);
    }
  }
  const dimensions = [];
  for (const [i, name] of labels.entries()) {
    signal?.throwIfAborted();
    status('通义千问正在评阅 ' + (i + 1) + ' / 4 · ' + name);
    const instruction =
      '你是马克思主义基本原理课程教师。阅读学生的作业，按指定量规独立评价。请以文中证据为依据。';
    const question =
      '学生正文：\n' +
      text +
      '\n\n本项为' +
      name +
      '。量规：' +
      criteria[i] +
      '\n选择最符合证据的一档。A=充分，B=较充分，C=基本，D=薄弱，E=未体现。请先写一个英文字母作为等级，再结合文中细节写一句中文评语。';
    const input = prompt(instruction, question) + '等级：';
    if ((await llm.tokenize(input, true)).length + 100 > 8192)
      throw Error('正文超过设备模型的上下文容量，请分段或使用云端评阅。');
    // Evaluate the actual five label probabilities without asking the small model to serialize a report.
    await llm.createCompletion(input, { nPredict: 0, useCache: true, abortSignal: signal });
    signal?.throwIfAborted();
    let selected = (await llm.getLogits(256)).find((item) => choices.has(item.token));
    if (!selected) selected = (await llm.getLogits(-1)).find((item) => choices.has(item.token));
    if (!selected) throw Error('模型未能判断评分档位，请重试。');
    const band = choices.get(selected.token);
    const response = await llm.createCompletion(input + band.letter + '\n评语：', {
      nPredict: 80,
      useCache: true,
      abortSignal: signal,
      sampling: { temp: 0.25 },
      onNewToken: (_id, _piece, answer, control) => {
        if (/[。！？]/.test(answer) && answer.trim().length >= 8) control.abortSignal();
      },
    });
    signal?.throwIfAborted();
    const comment = response
      .trim()
      .split(/\n|<\|/)[0]
      .trim();
    dimensions.push({
      name,
      max: maxima[i],
      score: Math.round(maxima[i] * band.ratio),
      comment: band.title + '。' + (comment || '请对照本项量规复核。'),
    });
  }
  const weakest = dimensions.reduce((a, b) => (a.score / a.max <= b.score / b.max ? a : b));
  return {
    dimensions,
    total: dimensions.reduce((n, d) => n + d.score, 0),
    summary: '按模型对各项证据的五档判断计分。可优先复核「' + weakest.name + '」。' + weakest.comment,
    method: '设备模型',
  };
}
