import { unzipSync, strFromU8 } from './vendor/fflate.js';

export const bankModules = [
  '唯物论',
  '辩证法',
  '认识论',
  '历史唯物主义',
  '政治经济学',
  '科学社会主义',
];
export const bankKinds = { single: '单选题', multi: '多选题', judge: '判断题' };
export const bankLevels = ['基础', '提高', '挑战'];
const fields = {
  prompt: ['题干', '题目', '问题', 'prompt', 'question', 'stem'],
  type: ['题型', '类型', 'type'],
  options: ['选项', '备选项', 'options'],
  a: ['a', '选项a', 'a选项'],
  b: ['b', '选项b', 'b选项'],
  c: ['c', '选项c', 'c选项'],
  d: ['d', '选项d', 'd选项'],
  e: ['e', '选项e', 'e选项'],
  correct: ['正确答案', '答案', 'correct', 'keys', '标准答案', 'answer'],
  why: ['解析', '答案解析', '说明', 'why', 'explanation', 'analysis'],
  module: ['知识模块', '模块', '章节', 'module', 'chapter'],
  concept: ['知识点', '考点', 'concept'],
  level: ['难度', 'level', 'difficulty'],
  source: ['来源', '资料来源', 'source'],
};
export const fieldTitles = {
  prompt: '题干',
  type: '题型',
  options: '合并选项',
  a: '选项 A',
  b: '选项 B',
  c: '选项 C',
  d: '选项 D',
  e: '选项 E',
  correct: '正确答案',
  why: '解析',
  module: '知识模块',
  concept: '知识点',
  level: '难度',
  source: '来源',
};
const clean = (value) => String(value ?? '').trim();
const key = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/[\s_：:（）()]/g, '');
export const fingerprint = (value) =>
  clean(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
function splitCsv(text) {
  const delimiter = text.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [],
    cell = '',
    quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quote && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quote || !cell) quote = !quote;
      else cell += c;
    } else if (!quote && c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (!quote && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
    if (rows.length > 350) throw Error('每个文件最多读取 100 道题，请分文件导入。');
  }
  if (quote) throw Error('CSV 引号没有闭合，请核对最后一个含逗号或换行的字段。');
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
const children = (xml, tag) => Array.from(xml.getElementsByTagNameNS('*', tag));
function xmlPart(bytes, label) {
  if (!bytes) throw Error('Excel 缺少' + label + '。');
  const doc = new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
  if (doc.querySelector('parsererror')) throw Error('无法解析 Excel 的' + label + '。');
  return doc;
}
function xlsxRows(bytes) {
  let used = 0;
  const meta = unzipSync(bytes, {
    filter: (entry) => {
      if (
        !['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml'].includes(
          entry.name,
        )
      )
        return false;
      used += entry.originalSize;
      if (used > 8 * 1024 * 1024) throw Error('工作簿过大，请导出单个工作表。');
      return true;
    },
  });
  const book = xmlPart(meta['xl/workbook.xml'], '工作簿');
  const rels = xmlPart(meta['xl/_rels/workbook.xml.rels'], '工作表索引');
  const targets = new Map(
    children(rels, 'Relationship')
      .filter(
        (x) =>
          x.getAttribute('Type')?.endsWith('/worksheet') &&
          x.getAttribute('TargetMode') !== 'External',
      )
      .map((x) => [x.getAttribute('Id'), x.getAttribute('Target')]),
  );
  const sheets = children(book, 'sheet').filter(
    (x) => !['hidden', 'veryHidden'].includes(x.getAttribute('state')),
  );
  const sheet = sheets.find((x) =>
    targets.has(
      x.getAttribute('r:id') ||
        x.getAttributeNS(
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          'id',
        ),
    ),
  );
  if (!sheet) throw Error('工作簿中没有可见工作表。');
  const id =
    sheet.getAttribute('r:id') ||
    sheet.getAttributeNS(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'id',
    );
  const target = new URL(
    targets.get(id),
    'https://workbook.invalid/xl/workbook.xml',
  ).pathname.slice(1);
  if (!/^xl\/worksheets\/[^/]+\.xml$/.test(target)) throw Error('工作表路径无效。');
  const parts = unzipSync(bytes, {
    filter: (e) => {
      if (e.name !== target) return false;
      if (e.originalSize > 8 * 1024 * 1024) throw Error('工作表内容过大，请拆分文件。');
      return true;
    },
  });
  const shared = meta['xl/sharedStrings.xml']
    ? children(xmlPart(meta['xl/sharedStrings.xml'], '文本索引'), 'si').map((n) =>
        children(n, 't')
          .map((x) => x.textContent)
          .join(''),
      )
    : [];
  const table = xmlPart(parts[target], '题目工作表');
  const rows = children(table, 'row').map((n, i) => {
    const list = [];
    for (const cell of children(n, 'c')) {
      const address = cell.getAttribute('r') || '',
        letters = address.match(/^[A-Z]+/i)?.[0];
      const k = letters
        ? Array.from(letters.toUpperCase()).reduce((x, c) => x * 26 + c.charCodeAt(0) - 64, 0) - 1
        : list.length;
      if (k > 70) continue;
      const v = children(cell, 'v')[0]?.textContent || '';
      list[k] =
        cell.getAttribute('t') === 's'
          ? (shared[Number(v)] ?? '')
          : cell.getAttribute('t') === 'inlineStr'
            ? children(cell, 't')
                .map((x) => x.textContent)
                .join('')
            : v;
    }
    return { line: Number(n.getAttribute('r')) || i + 1, values: list };
  });
  return { rows, sheet: sheet.getAttribute('name') };
}
function decodeText(bytes) {
  const utf = new TextDecoder('utf-8').decode(bytes);
  return (utf.includes('\uFFFD') ? new TextDecoder('gb18030').decode(bytes) : utf).replace(
    /^\uFEFF/,
    '',
  );
}
export async function readBankFile(file) {
  if (!file || file.size > 4 * 1024 * 1024)
    throw Error('请选择 4 MB 以内的 XLSX、CSV 或 JSON 文件。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let rows = [],
    headers = [],
    sheet = '',
    format = '';
  if (/\.xlsx$/i.test(file.name)) {
    const result = xlsxRows(bytes);
    rows = result.rows;
    sheet = result.sheet;
    format = 'xlsx';
  } else if (/\.csv$/i.test(file.name)) {
    format = 'csv';
    rows = splitCsv(decodeText(bytes)).map((values, i) => ({ line: i + 1, values }));
  } else if (/\.json$/i.test(file.name)) {
    format = 'json';
    let parsed;
    try {
      parsed = JSON.parse(decodeText(bytes));
    } catch {
      throw Error('JSON 格式有误。');
    }
    const data = Array.isArray(parsed) ? parsed : parsed?.questions;
    if (!Array.isArray(data) || !data.length || data.length > 101)
      throw Error('JSON 需要 1～100 条题目，或含表头的二维数组。');
    if (Array.isArray(data[0])) rows = data.map((values, i) => ({ line: i + 1, values }));
    else {
      if (!data.every((x) => x && typeof x === 'object' && !Array.isArray(x)))
        throw Error('JSON 每一行都应是题目对象。');
      headers = [...new Set(data.flatMap((x) => Object.keys(x)))];
      rows = data.map((x, i) => ({ line: i + 1, values: headers.map((h) => x[h]) }));
    }
  } else throw Error('支持 .xlsx、.csv 和 .json 文件。');
  rows = rows.filter((r) => r.values.some((x) => clean(x) !== ''));
  if (!headers.length) headers = (rows.shift()?.values || []).map(clean);
  headers = Array.from(headers, (x) => clean(x));
  if (!headers.some(Boolean) || !rows.length || rows.length > 100 || headers.length > 70)
    throw Error('一个文件需包含表头与 1～100 道题，最多 70 列。');
  return { name: file.name, headers, rows, sheet, format };
}
export const autoMap = (headers) =>
  Object.fromEntries(
    Object.entries(fields).map(([k, names]) => [
      k,
      headers.findIndex((s) => names.includes(key(s))),
    ]),
  );
export const blankQuestion = () => ({
  prompt: '',
  type: 'single',
  module: '',
  concept: '',
  level: '基础',
  options: ['', '', '', ''],
  correct: -1,
  why: '',
  source: '',
  status: 'draft',
});
const parseOptions = (v) =>
  Array.isArray(v)
    ? v.map((x) => clean(x?.text ?? x))
    : clean(v)
      ? clean(v)
          .split(/\r?\n|[|｜]/)
          .map(clean)
      : [];
function parseKind(v) {
  const s = key(v);
  return !s || ['single', '单选', '单选题', '单项选择题'].includes(s)
    ? 'single'
    : ['multi', 'multiple', '多选', '多选题', '多项选择题'].includes(s)
      ? 'multi'
      : ['judge', '判断', '判断题', 'truefalse'].includes(s)
        ? 'judge'
        : clean(v);
}
export function mapBankRow(raw, map, file) {
  const take = (k) => (map[k] >= 0 ? raw.values[map[k]] : undefined);
  const kind = parseKind(take('type'));
  let opts = parseOptions(take('options'));
  if (!opts.length) {
    opts = ['a', 'b', 'c', 'd', 'e'].filter((k) => map[k] >= 0).map((k) => clean(take(k)));
    while (opts.length && !opts.at(-1)) opts.pop();
  }
  if (kind === 'judge' && !opts.length) opts = ['正确', '错误'];
  const rawKeys = take('correct'),
    keyName = key(file.headers[map.correct]),
    indexed = file.format === 'json' && ['correct', 'keys'].includes(keyName);
  let tokens = Array.isArray(rawKeys)
    ? rawKeys
    : kind === 'multi' && /^[a-e]{2,}$/i.test(clean(rawKeys))
      ? Array.from(clean(rawKeys))
      : kind === 'multi'
        ? clean(rawKeys).split(/[、，,;；|\s]+/)
        : [rawKeys];
  let correct = tokens
    .filter((x) => x != null && clean(x) !== '')
    .map((x) => {
      const s = clean(x);
      if (/^[A-E]$/i.test(s)) return s.toUpperCase().charCodeAt(0) - 65;
      if (/^\d+$/.test(s)) return +s - (indexed ? 0 : 1);
      if (kind === 'judge' && ['true', 'false', '对', '错', '是', '否'].includes(s.toLowerCase()))
        return ['true', '对', '是'].includes(s.toLowerCase()) ? 0 : 1;
      return opts.findIndex((o) => o === s);
    });
  if (kind !== 'multi') correct = correct.length === 1 ? correct[0] : -1;
  return {
    prompt: clean(take('prompt')),
    type: kind,
    options: opts,
    correct,
    why: clean(take('why')),
    module: clean(take('module')),
    concept: clean(take('concept')),
    level: clean(take('level')) || '基础',
    source: clean(take('source')) || file.name,
    status: 'draft',
  };
}
export function normalizeBankQuestion(q) {
  const options = parseOptions(q.options);
  const raw = q.keys ?? q.correct;
  const correct =
    q.type === 'multi'
      ? Array.isArray(raw)
        ? raw
        : raw == null
          ? []
          : [raw]
      : Array.isArray(raw)
        ? (raw[0] ?? -1)
        : (raw ?? -1);
  const normalized = {
    ...blankQuestion(),
    ...q,
    options,
    correct,
    type: q.type || 'single',
    module: q.module || '',
    level: q.level || '基础',
    status: q.status || 'published',
  };
  delete normalized.keys;
  return normalized;
}
export function invalidFields(q) {
  const problems = [];
  if (!q.prompt.trim() || q.prompt.length > 700) problems.push(['prompt', '题干需为 1～700 字']);
  if (!Object.hasOwn(bankKinds, q.type)) problems.push(['type', '未知题型']);
  if (
    q.options.length < 2 ||
    q.options.length > 5 ||
    q.options.some((v) => !v.trim() || v.length > 250)
  )
    problems.push(['options', '需要 2～5 个非空选项，每项最多 250 字']);
  else if (new Set(q.options.map((x) => x.trim())).size !== q.options.length)
    problems.push(['options', '选项中有重复内容']);
  if (q.type === 'judge' && q.options.length !== 2)
    problems.push(['options', '判断题需要两个选项']);
  const keys = Array.isArray(q.correct) ? q.correct : [q.correct];
  if (
    !keys.length ||
    keys.some((k) => !Number.isInteger(k) || k < 0 || k >= q.options.length) ||
    new Set(keys).size !== keys.length ||
    (q.type !== 'multi' && keys.length !== 1)
  )
    problems.push(['correct', '请选择有效的正确答案']);
  if (!q.why.trim() || q.why.length > 900) problems.push(['why', '解析需为 1～900 字']);
  if (!bankLevels.includes(q.level)) problems.push(['level', '请选择有效难度']);
  if (q.module.length > 50 || q.concept.length > 100 || q.source.length > 180)
    problems.push(['metadata', '模块、知识点或来源过长']);
  return problems;
}
