import { esc as h } from './ui.js';
import {
  bankModules,
  bankKinds,
  bankLevels,
  fieldTitles,
  readBankFile,
  autoMap,
  mapBankRow,
  normalizeBankQuestion,
  blankQuestion,
  invalidFields,
  fingerprint,
} from './bank-file.js';
const statusNames = { draft: '草稿', published: '已发布', disabled: '已停用' };
const fieldNames = {
  prompt: '题干',
  type: '题型',
  options: '选项',
  correct: '正确答案',
  why: '解析',
  level: '难度',
  metadata: '章节与来源',
};
const btn = (id, text, value = '', cls = '', disabled = false) =>
  '<button type="button" class="' +
  cls +
  '" data-bk="' +
  id +
  '" data-value="' +
  h(value) +
  '" ' +
  (disabled ? 'disabled' : '') +
  '>' +
  text +
  '</button>';
const pick = (attr, values, value, empty = '') =>
  '<select ' +
  attr +
  '>' +
  (empty ? '<option value="">' + h(empty) + '</option>' : '') +
  Object.entries(values)
    .map(
      ([k, s]) =>
        '<option value="' +
        h(k) +
        '" ' +
        (String(k) === String(value) ? 'selected' : '') +
        '>' +
        h(s) +
        '</option>',
    )
    .join('') +
  '</select>';
const valMap = (a) => Object.fromEntries(a.map((v) => [v, v]));
const tag = (s, style = '') => '<span class="bk-tag ' + style + '">' + h(s) + '</span>';
const markStatus = (k) => tag(statusNames[k] || k, k);
const alphabet = 'ABCDE';
const clean = (q) => ({
  ...(q.id ? { id: q.id } : {}),
  prompt: q.prompt.trim(),
  options: q.options.map((x) => x.trim()),
  correct: q.correct,
  why: q.why.trim(),
  module: q.module.trim(),
  concept: q.concept.trim(),
  level: q.level,
  type: q.type,
  source: q.source.trim(),
  status: q.status,
});
const copy = (q) => JSON.parse(JSON.stringify(q));
const badge = (item) =>
  item.skipped
    ? 'skipped'
    : item.problems.length
      ? 'error'
      : item.duplicate && !item.allowDuplicate
        ? 'duplicate'
        : 'ok';
const resultLabels = {
  all: '全部',
  ok: '校验通过',
  error: '待修复',
  duplicate: '疑似重复',
  skipped: '已跳过',
};
function rich(value) {
  return String(value || '')
    .split('\n')
    .map((s) =>
      h(s)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/^- /, '• '),
    )
    .join('<br>');
}
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}

export function createTeacherBank(ctx) {
  let actor = '',
    view = 'list',
    query = '',
    filters = {},
    page = 1,
    chosen = new Set(),
    editor = null,
    step = 1,
    file = null,
    mapping = {},
    items = [],
    row = -1,
    rowForm = null,
    group = 'all',
    preview = 'student',
    previewChoice = [],
    scan = '',
    busy = false,
    feedback = '',
    clearAfter = false,
    sessionKey = '',
    dirty = false,
    restore = null,
    ask = null;
  const at = () => document.querySelector('[data-bank-studio]');
  const room = () => ctx.room() || {};
  const questions = () => Array.from(room().questions || [], normalizeBankQuestion);
  function scope() {
    const identity = String(ctx.token?.() || room().invite || room().title || '');
    if (actor === identity) return;
    actor = identity;
    let hash = 2166136261;
    for (const c of identity) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
    sessionKey = 'mxy-bank-24-' + hash.toString(36);
    view = 'list';
    query = '';
    filters = {};
    page = 1;
    chosen = new Set();
    editor = null;
    file = null;
    items = [];
    feedback = '';
    dirty = false;
    busy = false;
    ask = null;
    loadDraft();
  }
  function loadDraft() {
    try {
      restore = JSON.parse(localStorage.getItem(sessionKey) || 'null');
    } catch {
      restore = null;
    }
  }
  function storeDraft() {
    if (view !== 'edit' && view !== 'import') return true;
    const value =
      view === 'edit'
        ? { view, editor }
        : {
            view,
            step,
            file,
            mapping,
            items: items.map(({ line, q, allowDuplicate, skipped }) => ({
              line,
              q,
              allowDuplicate,
              skipped,
            })),
            row,
            rowForm,
            group,
          };
    try {
      localStorage.setItem(sessionKey, JSON.stringify(value));
      restore = value;
      dirty = false;
      feedback = '草稿已保存在此设备。';
      return true;
    } catch {
      feedback = '设备空间不足，草稿未保存。';
      return false;
    }
  }
  function resetDraft() {
    localStorage.removeItem(sessionKey);
    restore = null;
    dirty = false;
  }
  function resume() {
    if (!restore) return;
    if (restore.view === 'edit') {
      editor = normalizeBankQuestion(restore.editor);
      view = 'edit';
    } else if (restore.view === 'import') {
      view = 'import';
      step = restore.step;
      file = restore.file;
      mapping = restore.mapping || {};
      items = restore.items || [];
      row = restore.row ?? -1;
      rowForm = restore.rowForm || null;
      group = restore.group || 'all';
      if (items.length) validate();
    }
    preview = 'student';
    previewChoice = [];
    dirty = false;
    feedback = '';
  }
  function tableRows() {
    const term = query.trim().toLowerCase();
    return questions().filter(
      (q) =>
        Object.entries(filters).every(([k, v]) => !v || q[k] === v) &&
        (!term ||
          [q.prompt, q.module, q.concept, q.source, q.id].some((x) =>
            String(x || '')
              .toLowerCase()
              .includes(term),
          )),
    );
  }
  function list() {
    const all = questions(),
      rows = tableRows(),
      pages = Math.max(1, Math.ceil(rows.length / 15));
    page = Math.min(page, pages);
    const slice = rows.slice((page - 1) * 15, page * 15),
      modules = [...new Set([...bankModules, ...all.map((q) => q.module).filter(Boolean)])];
    return (
      '<div class="bk-title"><div><small>教师工作台　/　课程题库</small><h1>题库管理</h1><p>维护题目、答案与解析，发布给本班学生。</p></div><div>' +
      btn('import', '↑ 导入题库', '', 'primary') +
      ' ' +
      btn('new', '＋ 新增题目') +
      '</div></div>' +
      (restore
        ? '<div class="bk-draft">上次有未完成的' +
          (restore.view === 'import' ? '题库导入' : '题目编辑') +
          '草稿。 ' +
          btn('restore', '继续编辑') +
          '</div>'
        : '') +
      '<nav class="bk-tabs">' +
      [
        ['', '全部题目'],
        ['published', '已发布'],
        ['draft', '草稿'],
        ['disabled', '已停用'],
      ]
        .map(([k, t]) =>
          btn(
            'status-tab',
            t + ' ' + all.filter((x) => !k || x.status === k).length,
            k,
            (filters.status || '') === k ? 'active' : '',
          ),
        )
        .join('') +
      '</nav>' +
      '<div class="bk-controls"><input type="search" data-bank-search aria-label="搜索题库" placeholder="搜索题干或题目编号" value="' +
      h(query) +
      '">' +
      pick('data-filter="module" aria-label="章节"', valMap(modules), filters.module, '全部章节') +
      pick('data-filter="type" aria-label="题型"', bankKinds, filters.type, '全部题型') +
      pick('data-filter="level" aria-label="难度"', valMap(bankLevels), filters.level, '全部难度') +
      pick('data-filter="status" aria-label="发布状态"', statusNames, filters.status, '全部状态') +
      btn('reset', '重置') +
      '</div>' +
      '<div class="bk-batch"><label><input type="checkbox" data-all ' +
      (slice.length && slice.every((q) => chosen.has(q.id)) ? 'checked' : '') +
      '> 本页</label><span>已选 ' +
      chosen.size +
      ' 道</span>' +
      btn('batch', '批量发布', 'published', '', !chosen.size) +
      btn('batch', '批量停用', 'disabled', '', !chosen.size) +
      '</div>' +
      '<div class="bk-scroll"><table><thead><tr><th></th><th>编号与题干</th><th>知识模块</th><th>题型</th><th>完整性</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
      slice
        .map((q) => {
          const invalid = invalidFields(q);
          return (
            '<tr><td><input type="checkbox" data-id="' +
            h(q.id) +
            '" aria-label="选择 ' +
            h(q.prompt) +
            '" ' +
            (chosen.has(q.id) ? 'checked' : '') +
            '></td><td><strong>' +
            h(q.prompt || '未填写题干') +
            '</strong><small>' +
            h(String(q.id).slice(0, 8)) +
            '　·　' +
            h(q.level) +
            '</small></td><td>' +
            h(q.module || '未分模块') +
            '</td><td>' +
            h(bankKinds[q.type] || q.type) +
            '</td><td>' +
            (invalid.length ? tag(invalid[0][1], 'error') : tag('答案、解析齐全', 'ok')) +
            '</td><td>' +
            markStatus(q.status) +
            '</td><td>' +
            btn('edit', '编辑', q.id, 'text-link') +
            ' ' +
            btn('peek', '预览', q.id, 'text-link') +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>' +
      (!rows.length ? '<p class="bk-empty">当前条件下没有题目。</p>' : '') +
      '<div class="bk-pager"><small>共 ' +
      rows.length +
      ' 道题</small>' +
      btn('page', '上一页', page - 1, '', page === 1) +
      '<span>' +
      page +
      ' / ' +
      pages +
      '</span>' +
      btn('page', '下一页', page + 1, '', page === pages) +
      '</div>'
    );
  }
  const field = (label, body) => '<label class="bk-field"><b>' + label + '</b>' + body + '</label>';
  function selectField(q, k, values) {
    return pick('data-q="' + k + '" aria-label="' + k + '"', values, q[k]);
  }
  function textField(q, k, max, placeholder = '') {
    return (
      '<input data-q="' +
      k +
      '" maxlength="' +
      max +
      '" value="' +
      h(q[k]) +
      '" placeholder="' +
      h(placeholder) +
      '">'
    );
  }
  function questionFields(q, compact = false) {
    const modules = [...new Set([...bankModules, q.module].filter(Boolean))],
      keys = Array.isArray(q.correct) ? q.correct : [q.correct];
    return (
      '<div class="bk-fieldgrid">' +
      field('题型', selectField(q, 'type', bankKinds)) +
      field('知识模块', pick('data-q="module"', valMap(modules), q.module, '未分模块')) +
      field('难度', selectField(q, 'level', valMap(bankLevels))) +
      '</div>' +
      field(
        '题干',
        (!compact
          ? '<div class="bk-format">' +
            btn('format', '<b>B</b>', 'bold') +
            btn('format', '<i>I</i>', 'italic') +
            btn('format', '• 列表', 'list') +
            '</div>'
          : '') +
          '<textarea data-q="prompt" maxlength="700" rows="3">' +
          h(q.prompt) +
          '</textarea>',
      ) +
      '<div class="bk-field"><b>选项</b>' +
      q.options
        .map(
          (o, i) =>
            '<div class="bk-option"><span>' +
            alphabet[i] +
            '</span><input data-opt="' +
            i +
            '" maxlength="250" aria-label="选项 ' +
            alphabet[i] +
            '" value="' +
            h(o) +
            '">' +
            (q.type === 'judge' ? '' : btn('remove-opt', '移除', i, '', q.options.length <= 2)) +
            '</div>',
        )
        .join('') +
      (q.type === 'judge' ? '' : btn('add-opt', '＋ 添加选项', '', '', q.options.length >= 5)) +
      '</div>' +
      '<fieldset class="bk-key"><legend>正确答案</legend>' +
      q.options
        .map(
          (_, i) =>
            '<label><input type="' +
            (q.type === 'multi' ? 'checkbox' : 'radio') +
            '" data-correct="' +
            i +
            '" name="bankKeys" ' +
            (keys.includes(i) ? 'checked' : '') +
            '> ' +
            alphabet[i] +
            '</label>',
        )
        .join('') +
      '</fieldset>' +
      field('解析', '<textarea data-q="why" maxlength="900" rows="3">' + h(q.why) + '</textarea>') +
      '<div class="bk-fieldgrid">' +
      field('知识点', textField(q, 'concept', 100)) +
      field('来源', textField(q, 'source', 180, '教师自编或资料名称')) +
      '</div>'
    );
  }
  function previewPane(q) {
    const keys = Array.isArray(q.correct) ? q.correct : [q.correct];
    return (
      '<div class="bk-preview"><div class="bk-hrow"><h3>学生视图预览</h3><div>' +
      btn('preview', '作答态', 'student', preview === 'student' ? 'active' : '') +
      btn('preview', '解析态', 'review', preview === 'review' ? 'active' : '') +
      '</div></div>' +
      '<div>' +
      tag(bankKinds[q.type] || q.type) +
      ' ' +
      tag(q.level) +
      '</div><h3>' +
      rich(q.prompt || '尚未填写题干') +
      '</h3>' +
      q.options
        .map((o, i) =>
          btn(
            'choose',
            '<span>' + alphabet[i] + '</span> ' + h(o || '未填写选项'),
            i,
            'bk-choice ' +
              (preview === 'review' && keys.includes(i)
                ? 'ok'
                : previewChoice.includes(i)
                  ? 'active'
                  : ''),
            preview === 'review',
          ),
        )
        .join('') +
      (preview === 'review'
        ? '<div class="bk-explain"><strong>正确答案　' +
          h(
            keys
              .filter((i) => i >= 0 && i < 5)
              .map((i) => alphabet[i])
              .join('、') || '未设置',
          ) +
          '</strong><p>' +
          rich(q.why || '尚未填写解析') +
          '</p></div>'
        : '') +
      '</div>'
    );
  }
  function editorView() {
    const q = editor || blankQuestion(),
      only = view === 'preview',
      bad = invalidFields(q);
    return (
      '<div class="bk-title"><div><small>题库管理　/　' +
      (only ? '学生预览' : '编辑题目') +
      '</small><h1>' +
      (only ? '题目预览' : '编辑题目') +
      '</h1></div><div>' +
      btn('back', '返回题库') +
      (only ? '' : ' ' + btn('draft', '保存草稿') + ' ' + btn('publish', '发布题目', '', 'primary')) +
      '</div></div>' +
      (only
        ? previewPane(q)
        : '<div class="bk-editor"><div class="bk-card">' +
          questionFields(q) +
          '</div><aside><div data-preview>' +
          previewPane(q) +
          '</div><div class="bk-card"><h3>发布检查</h3><div data-check>' +
          checkList(q) +
          '</div><p>发布范围　' +
          h(room().title || '本课程') +
          '</p></div></aside></div>')
    );
  }
  function checkList(q) {
    const bad = invalidFields(q);
    return bad.length
      ? bad
          .map(([k, msg]) => '<p class="bk-warn">' + h(fieldNames[k] || k) + ' · ' + h(msg) + '</p>')
          .join('')
      : '<p class="bk-good">✓ 题干、选项、答案与解析齐全</p>';
  }
  function validate() {
    const known = new Map(
      questions().map((q) => [fingerprint(q.prompt), '题库 ' + String(q.id).slice(0, 8)]),
    );
    const earlier = new Map();
    const exact = new Set(questions().map((q) => String(q.prompt).trim()));
    for (const item of items) {
      item.problems = invalidFields(item.q);
      const prompt = item.q.prompt.trim();
      item.exact = exact.has(prompt);
      if (item.exact) item.allowDuplicate = false;
      if (!item.skipped) exact.add(prompt);
      const name = fingerprint(prompt);
      item.duplicate = (name && (known.get(name) || earlier.get(name))) || '';
      if (name && !item.skipped && !earlier.has(name)) earlier.set(name, '文件第 ' + item.line + ' 行');
    }
  }
  function count(k) {
    return items.filter((i) => k === 'all' || badge(i) === k).length;
  }
  function srcInfo() {
    return file
      ? h(file.name) + (file.sheet ? ' · ' + h(file.sheet) : '') + ' · ' + file.rows.length + ' 行'
      : '';
  }
  function issuesTable() {
    const rows = items
      .map((v, i) => [v, i])
      .filter(
        ([v]) =>
          (group === 'all' || badge(v) === group) &&
          (!scan || (v.q.prompt + ' ' + v.line).includes(scan)),
      );
    return (
      '<nav class="bk-tabs">' +
      Object.entries(resultLabels)
        .map(([k, l]) => btn('group', l + ' ' + count(k), k, k === group ? 'active' : ''))
        .join('') +
      '</nav><div class="bk-controls"><input type="search" data-row-search aria-label="搜索导入题目" placeholder="搜索题干或行号" value="' +
      h(scan) +
      '">' +
      btn('issues', '下载问题清单') +
      '</div><div class="bk-scroll"><table><thead><tr><th>行号</th><th>题目</th><th>校验结果</th><th>操作</th></tr></thead><tbody>' +
      rows
        .map(([x, i]) => {
          const st = badge(x),
            desc = x.skipped
              ? '已跳过'
              : x.problems.length
                ? x.problems[0][1]
                : x.duplicate && !x.allowDuplicate
                  ? '与' + x.duplicate + '相似'
                  : x.allowDuplicate && x.duplicate
                    ? '已核实保留'
                    : '校验通过';
          return (
            '<tr class="' +
            (i === row ? 'selected' : '') +
            '"><td>' +
            x.line +
            '</td><td>' +
            h(x.q.prompt || '缺少题干') +
            '</td><td>' +
            tag(desc, st) +
            '</td><td>' +
            btn('row', x.skipped ? '查看' : '修复', i, 'text-link') +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>' +
      (!rows.length ? '<p class="bk-empty">这一栏没有题目。</p>' : '')
    );
  }
  function repair() {
    if (row < 0 || !items[row] || !rowForm)
      return '<aside class="bk-card bk-tip"><h3>修复题目</h3><p>从校验表选择一行，核对题干、正确答案和解析。</p></aside>';
    const item = items[row],
      bad = invalidFields(rowForm);
    return (
      '<aside class="bk-card bk-repair"><header class="bk-hrow"><h3>修复第 ' +
      item.line +
      ' 行</h3>' +
      btn('close-row', '关闭') +
      '</header>' +
      bad.map(([, msg]) => '<p class="bk-warn">' + h(msg) + '</p>').join('') +
      (item.duplicate
        ? '<p class="bk-draft">疑似重复 · 与' +
          h(item.duplicate) +
          '相同。 ' +
          (item.exact
            ? '请修改题干，或跳过完全相同的题目。'
            : btn('allow-duplicate', item.allowDuplicate ? '取消确认' : '确认保留此行')) +
          '</p>'
        : '') +
      questionFields(rowForm, true) +
      '<div class="bk-actions">' +
      btn('skip', item.skipped ? '恢复此行' : '跳过此行') +
      btn('save-row', '保存并复检', '', 'primary') +
      '</div></aside>'
    );
  }
  function importView() {
    const titles = ['上传文件', '字段匹配', '校验与修复', '确认发布'];
    let body = '';
    if (step === 1)
      body =
        '<section class="bk-card bk-upload"><h2>选择题库文件</h2><p>XLSX、CSV 或 JSON，每次 1～100 道题。Excel 读取第一个可见工作表。</p><label class="bk-file">选择文件<input data-bank-file type="file" accept=".xlsx,.csv,.json"></label>' +
        btn('template', '下载 CSV 模板') +
        '<p>' +
        srcInfo() +
        '</p></section>';
    if (step === 2 && file)
      body =
        '<section class="bk-card"><h2>匹配字段</h2><p>从文件表头选择题干、选项、正确答案与解析对应的列。选项可合并在一列，也可分列。</p><div class="bk-map">' +
        Object.keys(fieldTitles)
          .map((k) =>
            field(
              fieldTitles[k],
              pick(
                'data-map="' + k + '"',
                Object.fromEntries([
                  [-1, '未映射'],
                  ...file.headers.map((n, i) => [i, n || '第 ' + (i + 1) + ' 列']),
                ]),
                mapping[k],
              ),
            ),
          )
          .join('') +
        '</div><small>正确答案可填 A、B 或 A、C。CSV/XLSX 数字按 1 起算；JSON 的 correct / keys 数值按 0 起算。</small></section>';
    if (step === 3) {
      body =
        '<div class="bk-metrics">' +
        [
          ['all', '导入总数'],
          ['ok', '校验通过'],
          ['error', '待修复'],
          ['duplicate', '疑似重复'],
        ]
          .map(([k, l]) => '<div><small>' + l + '</small><strong>' + count(k) + '</strong></div>')
          .join('') +
        '</div><div class="bk-import-layout"><div class="bk-card">' +
        issuesTable() +
        '</div>' +
        repair() +
        '</div>';
    }
    if (step === 4) {
      body =
        '<section class="bk-card"><h2>确认发布到本班</h2><p>' +
        h(room().title || '当前课程') +
        ' · 将导入并发布 ' +
        count('ok') +
        ' 道题，跳过 ' +
        count('skipped') +
        ' 行。</p><p>' +
        srcInfo() +
        '</p><div class="bk-scroll"><table><thead><tr><th>文件行号</th><th>题干</th><th>题型</th><th>知识模块</th></tr></thead><tbody>' +
        items
          .filter((x) => badge(x) === 'ok')
          .map(
            (x) =>
              '<tr><td>' +
              x.line +
              '</td><td>' +
              h(x.q.prompt) +
              '</td><td>' +
              h(bankKinds[x.q.type]) +
              '</td><td>' +
              h(x.q.module || '未分模块') +
              '</td></tr>',
          )
          .join('') +
        '</tbody></table></div></section>';
    }
    const invalid = count('error') + count('duplicate');
    return (
      '<div class="bk-title"><div><small>题库管理　/　导入题库</small><h1>导入题库</h1><p>' +
      srcInfo() +
      '</p></div>' +
      btn('back', '返回题库') +
      '</div><ol class="bk-steps">' +
      titles
        .map(
          (s, i) =>
            '<li class="' +
            (step === i + 1 ? 'here' : step > i + 1 ? 'done' : '') +
            '"><b>' +
            (i + 1) +
            '</b>' +
            s +
            '</li>',
        )
        .join('') +
      '</ol>' +
      body +
      '<footer class="bk-actions">' +
      btn('save-import', '保存草稿', '', '', !file) +
      (step > 1 ? btn('prev-step', '上一步') : '') +
      (step < 4
        ? btn(
            'next-step',
            step === 3 ? '校验并进入确认' : '下一步',
            '',
            'primary',
            (step === 1 && !file) || (step === 3 && (invalid > 0 || count('ok') === 0)),
          )
        : btn(
            'publish-import',
            '确认发布 ' + count('ok') + ' 道题',
            '',
            'primary',
            !!invalid || !count('ok'),
          )) +
      '</footer>'
    );
  }
  function render() {
    scope();
    return (
      '<section data-bank-studio class="bk-studio" aria-busy="' +
      busy +
      '">' +
      (view === 'list' ? list() : view === 'import' ? importView() : editorView()) +
      (ask
        ? '<dialog class="bk-confirm"><h3>' +
          h(ask.title) +
          '</h3><p>' +
          h(ask.msg) +
          '</p><div class="bk-actions">' +
          btn('dismiss', '取消') +
          ' ' +
          (ask.kind === 'leave' ? btn('save-leave', '保存后离开') : '') +
          btn('confirm', ask.kind === 'leave' ? '放弃修改' : '确认操作', '', 'primary') +
          '</div></dialog>'
        : '') +
      '<p class="bk-notice" role="status">' +
      h(feedback) +
      '</p></section>'
    );
  }
  function paint(focus = '') {
    const root = at();
    if (!root) return;
    root.outerHTML = render();
    hydrate();
    if (focus) {
      const input = at()?.querySelector(focus);
      input?.focus();
      if (input?.setSelectionRange)
        try {
          input.setSelectionRange(input.value.length, input.value.length);
        } catch {}
    }
  }
  function updatePreview() {
    const root = at();
    if (!root) return;
    const p = root.querySelector('[data-preview]'),
      checks = root.querySelector('[data-check]');
    if (p) p.innerHTML = previewPane(editor);
    if (checks) checks.innerHTML = checkList(editor);
  }
  function activeQ() {
    return view === 'import' ? rowForm : editor;
  }
  function leave() {
    view = 'list';
    feedback = '';
    ask = null;
    dirty = false;
    loadDraft();
    paint();
  }
  function beginCheckout(next) {
    if (restore) {
      ask = {
        kind: 'replace',
        title: '另开一份草稿？',
        msg: '此设备有上次保存的题库草稿。继续将以新的内容替换这份草稿。',
        next,
      };
      paint();
      return;
    }
    next();
  }
  function setEdit(q, mode) {
    editor = q;
    view = mode;
    dirty = false;
    preview = 'student';
    previewChoice = [];
    feedback = '';
    paint();
  }
  function download(name, record) {
    const blob = new Blob(['\uFEFF' + record.map((r) => r.map(csvCell).join(',')).join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      }),
      url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  async function commit(op, data, success) {
    if (busy) return;
    const who = actor;
    busy = true;
    feedback = '正在保存…';
    paint();
    try {
      await ctx.api(op, data);
      if (who !== String(ctx.token?.() || room().invite || room().title || '')) return;
      if (op !== 'bank-status') resetDraft();
      view = 'list';
      chosen.clear();
      ask = null;
      await ctx.refresh();
      feedback = success;
      ctx.notice?.(success);
    } catch (e) {
      feedback = e.message || '保存失败，可以重试。';
      if (view === 'import' || view === 'edit') {
        const error = feedback;
        storeDraft();
        feedback = error;
      }
    } finally {
      busy = false;
      paint();
    }
  }
  function manipulate(id, val) {
    const q = activeQ();
    if (!q) return;
    let keys = Array.isArray(q.correct) ? q.correct : [q.correct];
    if (id === 'add-opt' && q.options.length < 5) q.options.push('');
    if (id === 'remove-opt' && q.options.length > 2) {
      const i = +val;
      q.options.splice(i, 1);
      keys = keys.filter((k) => k >= 0 && k !== i).map((k) => (k > i ? k - 1 : k));
      q.correct = q.type === 'multi' ? keys : (keys[0] ?? -1);
    }
    if (id === 'format') {
      const a = at().querySelector('[data-q=prompt]');
      const i = a.selectionStart,
        j = a.selectionEnd;
      const left = val === 'bold' ? '**' : val === 'italic' ? '*' : '- ';
      const right = val === 'list' ? '' : left;
      const selected = a.value.slice(i, j) || '文字';
      a.setRangeText(left + selected + right, i, j, 'end');
      q.prompt = a.value;
      dirty = true;
      updatePreview();
      a.focus();
      a.setSelectionRange(i + left.length, i + left.length + selected.length);
      return;
    }
    dirty = true;
    paint();
  }
  async function goAction(id, val) {
    if (busy) return;
    if (id === 'restore') {
      resume();
      paint();
      return;
    }
    if (id === 'new' || id === 'edit') {
      const q = id === 'edit' ? questions().find((x) => x.id === val) : blankQuestion();
      if (q) beginCheckout(() => setEdit(copy(q), 'edit'));
      return;
    }
    if (id === 'peek') {
      const q = questions().find((x) => x.id === val);
      if (q) setEdit(q, 'preview');
      return;
    }
    if (id === 'back') {
      if ((view === 'edit' || view === 'import') && dirty) {
        ask = {
          kind: 'leave',
          title: '离开当前编辑？',
          msg: '可以继续编辑、保存草稿后离开，或放弃未保存的修改。',
        };
        paint();
      } else leave();
      return;
    }
    if (id === 'save-leave') {
      if (storeDraft()) leave();
      else paint();
      return;
    }
    if (id === 'confirm') {
      const a = ask;
      ask = null;
      if (a.kind === 'leave') {
        leave();
        return;
      }
      if (a.kind === 'replace') {
        resetDraft();
        a.next();
        return;
      }
      if (a.kind === 'batch') {
        await commit('bank-status', { ids: [...chosen], status: a.status }, '题目状态已更新。');
        return;
      }
    }
    if (id === 'dismiss') {
      ask = null;
      paint();
      return;
    }
    if (id === 'batch') {
      ask = {
        kind: 'batch',
        status: val,
        title: val === 'published' ? '批量发布题目' : '批量停用题目',
        msg: '将对本班选中的 ' + chosen.size + ' 道题执行此操作。已提交的答题记录应继续保留。',
      };
      paint();
      return;
    }
    if (id === 'status-tab') {
      filters.status = val;
      page = 1;
      chosen.clear();
      paint();
      return;
    }
    if (id === 'page') {
      page = +val;
      paint();
      return;
    }
    if (id === 'reset') {
      filters = {};
      query = '';
      page = 1;
      chosen.clear();
      paint();
      return;
    }
    if (id === 'preview') {
      preview = val;
      if (view === 'edit') updatePreview();
      else paint();
      return;
    }
    if (id === 'choose') {
      const i = +val;
      if (editor.type === 'multi')
        previewChoice = previewChoice.includes(i)
          ? previewChoice.filter((j) => j !== i)
          : [...previewChoice, i];
      else previewChoice = [i];
      if (view === 'edit') updatePreview();
      else paint();
      return;
    }
    if (['add-opt', 'remove-opt', 'format'].includes(id)) {
      manipulate(id, val);
      return;
    }
    if (id === 'draft') {
      const payload = clean(editor);
      payload.status = 'draft';
      if (!payload.prompt) {
        storeDraft();
        paint();
        return;
      }
      await commit('bank-save', payload, '题目已保存为草稿。');
      return;
    }
    if (id === 'publish') {
      const errors = invalidFields(editor);
      if (errors.length) {
        feedback = errors[0][1];
        paint();
        return;
      }
      await commit('bank-save', { ...clean(editor), status: 'published' }, '题目已发布到本班。');
      return;
    }
    if (id === 'import') {
      beginCheckout(() => {
        view = 'import';
        step = 1;
        file = null;
        mapping = {};
        items = [];
        row = -1;
        rowForm = null;
        group = 'all';
        scan = '';
        dirty = false;
        feedback = '';
        paint();
      });
      return;
    }
    if (id === 'save-import') {
      storeDraft();
      paint();
      return;
    }
    if (id === 'template') {
      download('马小原-题库模板.csv', [
        ['题干', '题型', '选项A', '选项B', '选项C', '正确答案', '解析', '知识模块', '难度'],
        [
          '实践有什么作用？',
          '单选题',
          '形成并检验认识',
          '代替一切认识',
          '仅表达愿望',
          'A',
          '实践提供认识的基础，也检验认识。',
          '认识论',
          '基础',
        ],
      ]);
      return;
    }
    if (id === 'next-step') {
      if (step === 2) {
        if (mapping.prompt < 0) {
          feedback = '请先指定题干对应的列。';
          paint();
          return;
        }
        items = file.rows.map((raw) => ({
          line: raw.line,
          q: mapBankRow(raw, mapping, file),
          skipped: false,
          allowDuplicate: false,
        }));
        validate();
        row = -1;
        rowForm = null;
        group = 'all';
      }
      if (step === 3) {
        if (rowForm && JSON.stringify(rowForm) !== JSON.stringify(items[row]?.q)) {
          feedback = '请先保存正在修复的这一行。';
          paint();
          return;
        }
        validate();
        if (count('error') + count('duplicate') || !count('ok')) {
          feedback = '请修复、核实或跳过所有问题行。';
          paint();
          return;
        }
      }
      step = Math.min(4, step + 1);
      dirty = true;
      feedback = '';
      paint();
      return;
    }
    if (id === 'prev-step') {
      step = Math.max(1, step - 1);
      row = -1;
      rowForm = null;
      feedback = '';
      paint();
      return;
    }
    if (id === 'group') {
      group = val;
      paint();
      return;
    }
    if (id === 'row') {
      if (rowForm && JSON.stringify(rowForm) !== JSON.stringify(items[row]?.q)) {
        feedback = '请先保存或关闭当前修复行。';
        paint();
        return;
      }
      row = +val;
      rowForm = copy(items[row].q);
      feedback = '';
      paint();
      return;
    }
    if (id === 'close-row') {
      row = -1;
      rowForm = null;
      paint();
      return;
    }
    if (id === 'save-row') {
      items[row].q = copy(rowForm);
      validate();
      dirty = true;
      feedback = items[row].problems.length
        ? '该行仍需修复：' + items[row].problems[0][1]
        : '该行已复检。';
      rowForm = copy(items[row].q);
      paint();
      return;
    }
    if (id === 'allow-duplicate') {
      items[row].allowDuplicate = !items[row].allowDuplicate;
      dirty = true;
      validate();
      paint();
      return;
    }
    if (id === 'skip') {
      items[row].skipped = !items[row].skipped;
      dirty = true;
      validate();
      row = -1;
      rowForm = null;
      paint();
      return;
    }
    if (id === 'issues') {
      download('马小原-导入问题清单.csv', [
        ['文件行', '题干', '问题'],
        ...items
          .filter((i) => badge(i) === 'error' || badge(i) === 'duplicate')
          .map((x) => [
            x.line,
            x.q.prompt,
            [
              ...x.problems.map((p) => p[1]),
              ...(x.duplicate ? ['与' + x.duplicate + '相似'] : []),
            ].join('；'),
          ]),
      ]);
      return;
    }
    if (id === 'publish-import') {
      validate();
      if (count('error') || count('duplicate') || !count('ok')) {
        step = 3;
        feedback = '仍有待处理的行。';
        paint();
        return;
      }
      await commit(
        'bank-import',
        {
          questions: items
            .filter((i) => badge(i) === 'ok')
            .map((x) => ({ ...clean(x.q), status: 'published' })),
          status: 'published',
          requestId: file.requestId,
        },
        '导入完成，题目已发布到本班。',
      );
    }
  }
  function handleInput(t) {
    if (busy) return;
    if (t.hasAttribute('data-bank-search')) {
      query = t.value;
      page = 1;
      paint('[data-bank-search]');
      return;
    }
    if (t.hasAttribute('data-row-search')) {
      scan = t.value;
      paint('[data-row-search]');
      return;
    }
    if (t.matches('[data-q]:not(select),[data-opt]')) {
      const q = activeQ();
      if (!q) return;
      if (t.hasAttribute('data-opt')) q.options[+t.dataset.opt] = t.value;
      else q[t.dataset.q] = t.value;
      dirty = true;
      if (view === 'edit') updatePreview();
    }
  }
  async function handleChange(t) {
    if (busy) return;
    if (t.hasAttribute('data-bank-file')) {
      const f = t.files[0];
      if (!f) return;
      const who = actor;
      busy = true;
      feedback = '正在读取文件…';
      paint();
      try {
        const result = await readBankFile(f);
        if (actor !== who) return;
        result.requestId = crypto.randomUUID().replaceAll('-', '');
        file = result;
        mapping = autoMap(file.headers);
        step = 2;
        dirty = true;
        feedback = '';
      } catch (e) {
        feedback = e.message;
      } finally {
        busy = false;
        paint();
      }
      return;
    }
    if (t.dataset.filter) {
      filters[t.dataset.filter] = t.value;
      page = 1;
      chosen.clear();
      paint();
      return;
    }
    if (t.hasAttribute('data-all')) {
      for (const q of tableRows().slice((page - 1) * 15, page * 15)) {
        if (t.checked) chosen.add(q.id);
        else chosen.delete(q.id);
      }
      paint();
      return;
    }
    if (t.hasAttribute('data-id')) {
      if (t.checked) chosen.add(t.dataset.id);
      else chosen.delete(t.dataset.id);
      paint();
      return;
    }
    if (t.hasAttribute('data-map')) {
      mapping[t.dataset.map] = Number(t.value);
      dirty = true;
      return;
    }
    const q = activeQ();
    if (!q) return;
    if (t.hasAttribute('data-correct')) {
      const i = +t.dataset.correct;
      let keys = Array.isArray(q.correct) ? q.correct : [];
      q.correct =
        q.type === 'multi'
          ? t.checked
            ? [...new Set([...keys, i])].sort((a, b) => a - b)
            : keys.filter((x) => x !== i)
          : i;
      dirty = true;
      if (view === 'edit') updatePreview();
      return;
    }
    if (t.tagName === 'SELECT' && t.dataset.q) {
      const k = t.dataset.q;
      q[k] = t.value;
      if (k === 'type') {
        q.correct = q.type === 'multi' ? [] : -1;
        if (q.type === 'judge') q.options = ['正确', '错误'];
      }
      dirty = true;
      paint();
    }
  }
  function hydrate() {
    const root = at();
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bk]');
      if (b) {
        e.preventDefault();
        goAction(b.dataset.bk, b.dataset.value).catch((e) => {
          feedback = e.message;
          paint();
        });
      }
    });
    root.addEventListener('input', (e) => handleInput(e.target));
    root.addEventListener('change', (e) =>
      handleChange(e.target).catch((e) => {
        feedback = e.message;
        paint();
      }),
    );
    if (ask) {
      const d = root.querySelector('dialog');
      if (d && !d.open) {
        d.showModal();
        d.addEventListener('cancel', (e) => {
          e.preventDefault();
          ask = null;
          paint();
        });
      }
    }
  }
  function open(target) {
    scope();
    if (target === 'repair') {
      if (restore?.view === 'import') resume();
      else {
        view = 'import';
        step = 1;
        file = null;
        items = [];
        rowForm = null;
        feedback = '选择文件或恢复已保存的导入草稿。';
      }
    } else if (target === 'draft') {
      view = 'list';
      filters.status = 'draft';
    } else view = 'list';
  }
  return { render, hydrate, open };
}
