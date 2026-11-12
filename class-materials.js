import { esc as h, icon } from './ui.js';
import course from './content.js';
import { preparePDF, mountReader } from './course-pdf.js';
import { setupReaderPanel } from './reader-panel.js';

const modules = [
  '课程导论',
  '唯物论',
  '辩证法',
  '认识论',
  '历史唯物主义',
  '政治经济学',
  '科学社会主义',
];
const categories = ['教材', '课程讲义', '拓展阅读', '扫描资料'];
const stageNames = { pending: '待处理', reading: '识别中', ready: '已入库', failed: '解析失败' };
const builtins = course.chapters.map((chapter, i) => ({
  id: chapter.id,
  title: chapter.title,
  body: chapter.summary,
  chapter,
  category: '课程讲义',
  module: i === 0 ? '认识论' : '辩证法',
  version: 1,
  visible: 1,
  stage: 'ready',
  builtin: true,
}));
const action = (name, label, id = '', cls = '') =>
  '<button type="button" class="' +
  cls +
  '" data-material="' +
  name +
  '" data-value="' +
  h(id) +
  '">' +
  label +
  '</button>';
const select = (values, current, name, first) =>
  '<select aria-label="' +
  h(name) +
  '" data-material-filter="' +
  h(name) +
  '">' +
  [['', first], ...values.map((v) => (Array.isArray(v) ? v : [v, v]))]
    .map(
      ([id, text]) =>
        '<option value="' +
        h(id) +
        '" ' +
        (id === current ? 'selected' : '') +
        '>' +
        h(text) +
        '</option>',
    )
    .join('') +
  '</select>';
const options = (values, current) =>
  [...new Set([current, ...values].filter(Boolean))]
    .map((x) => '<option ' + (x === current ? 'selected' : '') + '>' + h(x) + '</option>')
    .join('');
const when = (n) =>
  n ? new Date(n).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '—';
const key = 'mxy-reading-';
const pg = (m) => Number(localStorage.getItem(key + m.id)) || 0;
const family = (m) => m.family || m.id;
const pdfOf = (m) => m?.files?.find((f) => f.mime === 'application/pdf');
function currentVersions(rows) {
  const latest = new Map();
  for (const m of rows) {
    const old = latest.get(family(m));
    if (!old || Number(m.version || 1) > Number(old.version || 1)) latest.set(family(m), m);
  }
  return [...latest.values()];
}
function normalizedStage(m) {
  return m.stage || (pdfOf(m) ? 'pending' : 'ready');
}
export function createMaterials(ctx) {
  const get = () => ctx.room(),
    token = () => ctx.token(),
    teacher = () => get().role === 'teacher' && ((get().rights ?? 15) & 1) !== 0;
  let selected = '',
    focus = '',
    tab = 'snippet',
    query = '',
    kind = '',
    module = '',
    scope = '',
    stage = '',
    account = '',
    p = 1,
    lookup = '',
    hits = null,
    searching = false,
    searchId = 0,
    snippetPage = 1;
  const jobs = new Map(),
    results = new Map();
  const rows = () => (teacher() ? get().materials : [...get().materials, ...builtins]);
  const mat = (id) => rows().find((m) => m.id === id);
  const liveStage = (m) =>
    jobs.has(m.id) ? 'reading' : results.get(m.id)?.stage || normalizedStage(m);
  const count = (m) => results.get(m.id)?.indexed ?? m.indexedPages ?? 0;
  const group = (m) =>
    get()
      .materials.filter((x) => family(x) === family(m))
      .sort((a, b) => (b.version || 1) - (a.version || 1));
  function syncAccount() {
    if (account === token()) return;
    for (const job of jobs.values()) job.controller.abort();
    jobs.clear();
    results.clear();
    account = token();
    selected = '';
    focus = '';
    tab = 'snippet';
    query = kind = module = scope = stage = lookup = '';
    hits = null;
    p = snippetPage = 1;
    searching = false;
    searchId++;
    const hash = new URLSearchParams(location.hash.slice(1)),
      id = hash.get('read'),
      page = Number(hash.get('page'));
    if (id && mat(id)) {
      selected = id;
      if (Number.isInteger(page) && page > 0) localStorage.setItem(key + id, String(page));
    }
  }
  function visibleRows() {
    const list = [
      ...(teacher() ? get().materials : currentVersions(get().materials)),
      ...(teacher() ? [] : builtins),
    ];
    return list.filter(
      (m) =>
        (m.title + ' ' + m.body + ' ' + (m.module || ''))
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (!kind ||
          (kind === 'PDF' ? !!pdfOf(m) : kind === '讲义' ? !pdfOf(m) : m.category === kind)) &&
        (!module || m.module === module) &&
        (!scope || (scope === 'course' ? !!m.visible : !m.visible)) &&
        (!stage ||
          (stage === 'processing'
            ? ['pending', 'reading'].includes(liveStage(m))
            : liveStage(m) === stage)),
    );
  }
  function filters() {
    const foundModules = [
      ...new Set([
        ...modules,
        ...rows()
          .map((x) => x.module)
          .filter(Boolean),
      ]),
    ];
    return (
      '<div class="material-find"><input type="search" data-material-search aria-label="搜索资料" placeholder="搜索资料名称或关键词" value="' +
      h(query) +
      '">' +
      select(foundModules, module, '知识模块', '全部模块') +
      (teacher()
        ? select(
            [
              ['course', '本课程'],
              ['teacher', '教师可见'],
            ],
            scope,
            '可见范围',
            '全部范围',
          )
        : '') +
      '</div>'
    );
  }
  function studentCard() {
    const id = localStorage.getItem('mxy-last-material-' + token()),
      m = mat(id);
    if (!m) return '';
    const total = pdfOf(m)?.pages || 1,
      at = Math.min(total, pg(m) || 1);
    return (
      '<section class="resume-card">' +
      icon('book') +
      '<div><strong>' +
      h(m.title) +
      '</strong><div class="material-resume-progress"><small>第 ' +
      at +
      ' / ' +
      total +
      ' 页</small><progress value="' +
      at +
      '" max="' +
      total +
      '"></progress></div></div>' +
      action('continue', '继续阅读', id, 'primary') +
      '</section>'
    );
  }
  function stageBadge(m) {
    const job = jobs.get(m.id);
    return (
      '<span class="material-badge ' +
      h(liveStage(m)) +
      '" data-status-id="' +
      h(m.id) +
      '">' +
      h(job?.caption || stageNames[liveStage(m)] || '待处理') +
      '</span>'
    );
  }
  function table() {
    const list = visibleRows(),
      size = 10,
      total = Math.max(1, Math.ceil(list.length / size));
    p = Math.min(p, total);
    const fields = teacher()
      ? ['资料名称', '版本', '处理状态', '可见范围', '操作']
      : ['资料名称', '类型', '知识模块', '阅读进度', '最近更新', '操作'];
    return (
      '<div class="table-scroll"><table class="material-table"><thead><tr>' +
      fields.map((x) => '<th>' + x + '</th>').join('') +
      '</tr></thead><tbody>' +
      list
        .slice((p - 1) * size, p * size)
        .map((m) => {
          const f = pdfOf(m),
            first =
              '<td>' +
              action(
                teacher() ? 'focus' : 'title-open',
                '<i class="material-doc">' +
                  (f ? 'PDF' : '文') +
                  '</i><span>' +
                  h(m.title) +
                  '</span>',
                m.id,
                'material-file',
              ) +
              '</td>';
          const at = Math.min(f?.pages || 1, pg(m)),
            status = teacher()
              ? '<td>v' +
                (m.version || 1) +
                '</td><td>' +
                stageBadge(m) +
                '</td><td>' +
                (m.visible ? '本课程' : '教师可见') +
                '</td>'
              : '<td><span class="tag">' +
                h(m.category || '课程讲义') +
                '</span></td><td>' +
                h(m.module || '未归类') +
                '</td><td>' +
                (at ? (f ? at + '/' + f.pages + ' 页' : '已打开') : '未开始') +
                '</td><td>' +
                when(m.updated) +
                '</td>';
          return (
            '<tr ' +
            (focus === m.id && teacher() ? 'class="selected-material"' : '') +
            '>' +
            first +
            status +
            '<td>' +
            action(
              teacher() ? 'focus' : m.builtin ? 'lesson' : 'open',
              teacher() ? '详情' : '打开阅读',
              m.id,
              'text-link',
            ) +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>' +
      (!list.length ? '<p class="project-empty">没有符合条件的资料。</p>' : '') +
      '<footer class="project-pager"><span>共 ' +
      list.length +
      ' 份资料</span>' +
      action('page', '‹', String(Math.max(1, p - 1))) +
      '<b>' +
      p +
      ' / ' +
      total +
      '</b>' +
      action('page', '›', String(Math.min(total, p + 1))) +
      '</footer>'
    );
  }
  function teacherTabs() {
    const list = get().materials;
    return (
      '<nav class="project-tabs">' +
      [
        ['', '全部资料'],
        ['ready', '已入库'],
        ['processing', '处理中'],
        ['failed', '异常'],
      ]
        .map(([id, label]) =>
          action(
            'stage',
            label +
              ' ' +
              list.filter(
                (m) =>
                  !id ||
                  (id === 'processing'
                    ? ['pending', 'reading'].includes(liveStage(m))
                    : liveStage(m) === id),
              ).length,
            id,
            id === stage ? 'active' : '',
          ),
        )
        .join('') +
      '</nav>'
    );
  }
  function studentTabs() {
    return (
      '<nav class="project-tabs">' +
      [
        ['', '全部资料'],
        ['教材', '教材'],
        ['课程讲义', '课程讲义'],
        ['拓展阅读', '拓展阅读'],
        ['PDF', 'PDF'],
      ]
        .map(([id, t]) => action('kind', t, id, kind === id ? 'active' : ''))
        .join('') +
      '</nav>'
    );
  }
  function detail(m) {
    if (!m) return '';
    const f = pdfOf(m),
      job = jobs.get(m.id),
      state = liveStage(m);
    return (
      '<section class="card material-detail"><div class="material-heading"><div><h2>' +
      h(m.title) +
      '</h2><small>' +
      h(m.module || '未归类') +
      '　·　v' +
      (m.version || 1) +
      '　·　' +
      (f ? f.pages + ' 页' : '文字讲义') +
      '</small></div>' +
      action('open', '阅读原文', m.id, 'outline') +
      '</div>' +
      '<div class="material-track"><span class="done">✓ 上传完成</span><span class="' +
      (state === 'ready' ? 'done' : '') +
      '">' +
      (state === 'ready' ? '✓ ' : '') +
      '文本解析</span><span class="' +
      (state === 'ready' ? 'done' : '') +
      '">' +
      (state === 'ready' ? '✓ ' : '') +
      '建立索引</span><span class="' +
      (state === 'ready' ? 'done' : '') +
      '">可供检索</span></div>' +
      '<div class="material-index-actions">' +
      stageBadge(m) +
      '<span data-job-progress="' +
      h(m.id) +
      '">' +
      h(job?.details || '已索引 ' + count(m) + ' 页') +
      '</span>' +
      (f
        ? job
          ? action('cancel-index', '停止处理', m.id)
          : action(
              'retry-index',
              state === 'failed'
                ? '重试识别'
                : state === 'reading'
                  ? '重新接手处理'
                  : state === 'ready'
                    ? '重新建立索引'
                    : '开始识别与入库',
              m.id,
            )
        : '') +
      '</div>' +
      (results.get(m.id)?.error || m.issue
        ? '<p class="material-warning">' + h(results.get(m.id)?.error || m.issue) + '</p>'
        : '') +
      '<nav class="project-tabs">' +
      [
        ['snippet', '原文片段'],
        ['versions', '版本记录'],
        ['range', '使用范围'],
      ]
        .map(([v, title]) => action('detail-tab', title, v, v === tab ? 'active' : ''))
        .join('') +
      '</nav>' +
      (tab === 'versions'
        ? group(m)
            .map(
              (x) =>
                '<div class="material-version"><b>v' +
                (x.version || 1) +
                '　' +
                h(x.title) +
                '</b><small>' +
                when(x.updated) +
                '</small>' +
                action('open', '打开此版本', x.id) +
                '</div>',
            )
            .join('') + action('new-version', '上传新版本', m.id, 'outline')
        : tab === 'range'
          ? '<div><p>' +
            icon('lock') +
            '　' +
            (m.visible ? '本课程学生可查阅本版本' : '仅有资料管理权限的教师可见') +
            '</p>' +
            action('meta', '编辑资料信息与范围', m.id, 'outline') +
            '</div>'
          : '<div class="material-snippet" data-snippet="' +
            h(m.id) +
            '"><b>第 ' +
            snippetPage +
            ' 页</b><p>' +
            h(f ? '读取原文片段…' : m.body) +
            '</p><footer>' +
            action('snippet-page', '‹', String(Math.max(1, snippetPage - 1))) +
            action('snippet-page', '›', String(Math.min(f?.pages || 1, snippetPage + 1))) +
            action('locate', '定位原文', m.id + '|' + snippetPage, 'text-link') +
            '</footer></div>') +
      '</section>'
    );
  }
  function findPanel() {
    return (
      '<aside class="card material-lookup"><h3>检索预览</h3><form data-material-form="lookup"><label class="field">检索问题或关键词<textarea name="term" maxlength="90" rows="3" placeholder="例如：实践与认识" required>' +
      h(lookup) +
      '</textarea></label><button class="primary" ' +
      (searching ? 'disabled' : '') +
      '>' +
      (searching ? '正在检索…' : '测试检索') +
      '</button></form>' +
      (hits !== null
        ? '<h3>命中片段 · ' +
          hits.length +
          '</h3>' +
          hits
            .map(
              (x) =>
                '<article><b>' +
                h(x.title) +
                '</b><small>v' +
                (x.version || 1) +
                '　·　第 ' +
                x.page +
                ' 页' +
                (x.method === 'ocr' ? '　·　OCR' : '') +
                '</small><p>' +
                h(x.excerpt) +
                '</p>' +
                action('locate', '定位原文', x.id + '|' + x.page, 'text-link') +
                '</article>',
            )
            .join('') +
          (!hits.length ? '<p>没有命中片段。可缩短关键词，或检查索引状态。</p>' : '')
        : '<p>在当前课程已入库的文字与识别片段中检索。</p>') +
      '</aside>'
    );
  }
  function textReader(rec) {
    const paragraphs = rec.chapter?.paragraphs || [{ title: '正文', text: rec.body }];
    return (
      '<section class="class-reader material-text-reader" data-text-record="' +
      h(rec.id) +
      '"><div class="pdf-grid"><article class="work-paper">' +
      paragraphs
        .map(
          (x, i) =>
            '<section><small>第 ' +
            (i + 1) +
            ' 段</small><h3>' +
            h(x.title) +
            '</h3><p data-lecture-text>' +
            h(x.text) +
            '</p><div><button data-lecture-ask="' +
            i +
            '">问马小原</button> <button data-lecture-note="' +
            i +
            '">记笔记</button></div></section>',
        )
        .join('') +
      '</article><aside class="pdf-panel" hidden></aside></div><p class="reader-status" role="status"></p></section>'
    );
  }
  function render() {
    syncAccount();
    const rec = mat(selected);
    if (rec)
      return (
        '<div class="project-head"><div><small>课程学习　/　原文阅读</small><h1>' +
        h(rec.title) +
        '</h1></div><div class="material-heading">' +
        (group(rec).length > 1
          ? action('history', '版本记录 · v' + (rec.version || 1), rec.id)
          : '') +
        action('back', '← 返回资料') +
        '</div></div>' +
        (pdfOf(rec)
          ? '<div class="class-reader" data-pdf-record="' +
            h(rec.id) +
            '"><p>正在打开原文…</p></div>'
          : textReader(rec))
      );
    const all = get().materials;
    if (!all.find((x) => x.id === focus)) focus = all[0]?.id || '';
    const m = all.find((x) => x.id === focus);
    return (
      '<div class="project-head"><div><small>' +
      (teacher() ? '教师工作台　/　课程资料' : '课程学习') +
      '</small><h1>' +
      (teacher() ? '课程知识库' : '课程资料') +
      '</h1><p>' +
      (teacher() ? '管理资料版本，验证检索来源。' : '从原文开始理解，随时提问和记录。') +
      '</p></div>' +
      (teacher()
        ? '<div>' +
          action('instructions', '获取导入说明') +
          ' ' +
          action('upload', '↑ 上传资料', '', 'primary') +
          '</div>'
        : '') +
      '</div>' +
      (!teacher() ? studentCard() : '') +
      '<div class="materials-grid kb-layout"><div><section class="card">' +
      (teacher() ? teacherTabs() + filters() : filters() + studentTabs()) +
      table() +
      '</section>' +
      (teacher() ? detail(m) : '') +
      '</div>' +
      (teacher()
        ? findPanel()
        : '<aside class="card"><h3>按模块浏览</h3>' +
          [
            ...new Set([
              ...modules,
              ...rows()
                .map((x) => x.module)
                .filter(Boolean),
            ]),
          ]
            .map((x) =>
              action(
                'module',
                icon('book') + '　' + h(x) + '　›',
                x,
                'side-filter' + (x === module ? ' active' : ''),
              ),
            )
            .join('') +
          '</aside>') +
      '</div>'
    );
  }
  async function fileFor(rec, owner, signal) {
    const f = pdfOf(rec);
    if (!f) throw Error('此资料没有 PDF 原件。');
    const r = await fetch('./api/class/file/' + encodeURIComponent(f.id) + '?mode=read', {
      headers: { Authorization: 'Bearer ' + owner },
      signal,
    });
    if (!r.ok) throw Error((await r.json()).error || '原文读取失败。');
    return r.blob();
  }
  function showReader(id, n) {
    const m = mat(id);
    if (!m) return;
    selected = id;
    localStorage.setItem('mxy-last-material-' + token(), id);
    if (Number(n) > 0) localStorage.setItem(key + id, String(n));
    else if (!pdfOf(m)) localStorage.setItem(key + id, '1');
    ctx.redraw();
  }
  function uploadDialog(previous) {
    const m = previous && mat(previous);
    ctx.pop(
      m ? '上传新版本' : '上传课程资料',
      '<form data-material-form="upload" data-previous="' +
        h(previous || '') +
        '">' +
        '<label class="field">资料名称<input name="title" maxlength="100" required value="' +
        h(m?.title || '') +
        '"></label><label class="field">PDF 原文件<input type="file" name="file" accept=".pdf,application/pdf"></label><small>可上传 PDF，也可直接填写文字讲义。</small>' +
        '<div class="material-form-grid"><label class="field">资料类型<select name="category">' +
        options(categories, m?.category || '课程讲义') +
        '</select></label><label class="field">知识模块<select name="module">' +
        options([...modules, '未归类'], m?.module || '未归类') +
        '</select></label></div>' +
        '<label class="field">资料简介或讲义正文<textarea name="body" rows="3" maxlength="7000">' +
        h(m?.body || '') +
        '</textarea></label>' +
        '<label class="permission"><input type="checkbox" name="visible" ' +
        (m && !m.visible ? '' : 'checked') +
        '> 允许本课程学生查阅本版本</label>' +
        '<p role="status"></p><button class="primary">上传到本课程</button></form>',
    );
  }
  async function index(rec, file) {
    if (jobs.has(rec.id)) return;
    const owner = token(),
      controller = new AbortController(),
      job = { controller, caption: '准备处理', details: '正在打开原件' };
    jobs.set(rec.id, job);
    const call = async (op, body) => {
      if (token() === owner) return ctx.api(op, body);
      const r = await fetch('./api/class/' + op, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + owner, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || '索引操作失败');
      return d;
    };
    const paint = () => {
      for (const el of document.querySelectorAll('[data-status-id]'))
        if (el.dataset.statusId === rec.id) el.textContent = job.caption;
      const el = document.querySelector('[data-job-progress="' + CSS.escape(rec.id) + '"]');
      if (el) el.textContent = job.details;
    };
    if (!selected && token() === owner) ctx.redraw();
    let ticket;
    try {
      const start = await call('index-start', { id: rec.id });
      ticket = start.job;
      const source = file || (await fileFor(rec, owner, controller.signal));
      const { indexCoursePDF } = await import('./course-index.js');
      await indexCoursePDF(source, {
        signal: controller.signal,
        onProgress: ({ page, pages, stage, progress }) => {
          job.caption =
            stage === 'prepare-ocr'
              ? '载入识别模型'
              : stage === 'ocr'
                ? '识别中 ' + Math.round(progress * 100) + '%'
                : '建立索引';
          job.details = '第 ' + page + ' / ' + pages + ' 页';
          paint();
        },
        onPage: (row) =>
          call('index-page', {
            id: rec.id,
            job: ticket,
            page: row.page,
            text: row.text.slice(0, 12000),
            method: row.method,
          }),
      });
      const ended = await call('index-end', { id: rec.id, job: ticket });
      results.set(rec.id, { stage: ended.stage, indexed: ended.indexed });
      job.caption = stageNames[ended.stage];
      if (token() === owner)
        ctx.notice(
          ended.stage === 'ready'
            ? '资料已入库，可按原文检索。'
            : '原图可读，识别结果不足，可重试。',
        );
    } catch (error) {
      const message = controller.signal.aborted ? '处理已停止，可重新开始。' : error.message;
      if (ticket) {
        try {
          await call('index-end', { id: rec.id, job: ticket, error: message });
        } catch {}
      }
      results.set(rec.id, { stage: 'failed', error: message });
      job.caption = '处理未完成';
      if (token() === owner) ctx.notice(message);
    } finally {
      paint();
      jobs.delete(rec.id);
      if (token() === owner && !selected) {
        try {
          await ctx.refresh();
          results.delete(rec.id);
        } catch {}
      }
    }
  }
  async function hydrate() {
    for (const filter of document.querySelectorAll('[data-material-filter]'))
      filter.onchange = () => {
        if (filter.dataset.materialFilter === '知识模块') module = filter.value;
        else scope = filter.value;
        p = 1;
        ctx.redraw();
      };
    const text = document.querySelector('[data-text-record]');
    if (text) {
      const rec = mat(text.dataset.textRecord),
        ctl = new AbortController();
      const obs = new MutationObserver(() => {
        if (!text.isConnected) {
          obs.disconnect();
          ctl.abort();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      const pane = setupReaderPanel(text, rec, {
        signal: ctl.signal,
        status: (t) => (text.querySelector('.reader-status').textContent = t),
        locate: async (c) => {
          Array.from(text.querySelectorAll('[data-lecture-text]'))
            .find((n) => n.innerText.includes(c.text))
            ?.scrollIntoView({ block: 'center' });
        },
      });
      text.addEventListener(
        'click',
        async (e) => {
          const b = e.target.closest('[data-lecture-ask],[data-lecture-note]');
          if (!b) return;
          const el = b.closest('section').querySelector('[data-lecture-text]'),
            s = getSelection();
          const quote =
            s?.toString().trim() && el.contains(s.anchorNode)
              ? s.toString().trim()
              : el.textContent;
          await pane.open(b.hasAttribute('data-lecture-ask') ? 'ask' : 'note', {
            text: quote.slice(0, 2500),
            page: 1,
          });
        },
        { signal: ctl.signal },
      );
    }
    const target = document.querySelector('[data-pdf-record]');
    if (target) {
      const rec = mat(target.dataset.pdfRecord);
      if (!rec) return;
      try {
        const original = await fileFor(rec, token());
        if (target.isConnected)
          await mountReader(target, original, {
            ...rec,
            getPageText: (page) => ctx.api('page-text', { id: rec.id, page }),
          });
      } catch (e) {
        if (target.isConnected) target.textContent = '原文读取失败：' + e.message;
      }
      return;
    }
    const s = document.querySelector('[data-snippet]');
    if (s && pdfOf(mat(s.dataset.snippet))) {
      try {
        const d = await ctx.api('page-text', { id: s.dataset.snippet, page: snippetPage });
        if (s.isConnected)
          s.querySelector('p').textContent =
            d.text?.slice(0, 400) || '本页尚无原文片段，请建立索引或查看原图。';
      } catch (e) {
        if (s.isConnected) s.querySelector('p').textContent = e.message;
      }
    }
  }
  async function click(op, id) {
    if (op === 'upload' || op === 'new-version') {
      uploadDialog(op === 'new-version' ? id : '');
      return;
    }
    if (op === 'instructions') {
      ctx.pop(
        '导入说明',
        '<p>上传 20 MB 以内的 PDF，或直接填写文字讲义。可检索 PDF 会提取原生文字，扫描页会在当前浏览器进行中文识别。请保持课堂标签页打开，直到处理结束。</p><p>同一份资料可保留多个版本，每个版本独立设置可见范围。已识别的片段可以在右侧检索预览中按页定位。</p>',
      );
      return;
    }
    if (op === 'open' || op === 'continue' || op === 'lesson' || op === 'title-open') {
      showReader(id);
      return;
    }
    if (op === 'history') {
      const rec = mat(id);
      if (rec)
        ctx.pop(
          '版本记录',
          group(rec)
            .map(
              (item) =>
                '<div class="material-version"><b>v' +
                Number(item.version || 1) +
                '　' +
                h(item.title) +
                '</b><small>' +
                when(item.updated || item.created) +
                '</small>' +
                (item.id === selected
                  ? '<span>当前阅读</span>'
                  : action('open-version', '阅读此版', item.id)) +
                '</div>',
            )
            .join(''),
        );
      return;
    }
    if (op === 'open-version') {
      ctx.close();
      showReader(id);
      return;
    }
    if (op === 'locate') {
      const [record, n] = id.split('|');
      showReader(record, n);
      return;
    }
    if (op === 'meta') {
      const m = mat(id);
      ctx.pop(
        '资料信息与使用范围',
        '<form data-material-form="meta" data-id="' +
          h(id) +
          '"><label class="field">资料类型<select name="category">' +
          options(categories, m.category || '课程讲义') +
          '</select></label><label class="field">知识模块<select name="module">' +
          options(modules, m.module || '未归类') +
          '</select></label><label class="permission"><input type="checkbox" name="visible" ' +
          (m.visible ? 'checked' : '') +
          '> 本课程学生可见</label><p role="status"></p><button class="primary">保存设置</button></form>',
      );
      return;
    }
    if (op === 'cancel-index') {
      jobs.get(id)?.controller.abort();
      return;
    }
    if (op === 'retry-index') {
      await index(mat(id));
      return;
    }
    if (op === 'focus') {
      focus = id;
      snippetPage = 1;
      tab = 'snippet';
    }
    if (op === 'detail-tab') tab = id;
    if (op === 'snippet-page') snippetPage = Number(id) || 1;
    if (op === 'back') {
      selected = '';
      history.replaceState(null, '', '#materials');
    }
    if (op === 'kind') {
      kind = id;
      p = 1;
    }
    if (op === 'module') {
      module = module === id ? '' : id;
      p = 1;
    }
    if (op === 'stage') {
      stage = id;
      p = 1;
    }
    if (op === 'page') p = Number(id) || 1;
    ctx.redraw();
  }
  function search(value) {
    query = value;
    p = 1;
    ctx.redraw();
    const el = document.querySelector('[data-material-search]');
    el?.focus();
    if (el) el.setSelectionRange(value.length, value.length);
  }
  async function send(e) {
    const form = e.target;
    e.preventDefault();
    const submit = form.querySelector('button');
    if (!submit || submit.disabled) return;
    submit.disabled = true;
    const mode = form.dataset.materialForm;
    const status = (t) => {
      const el = form.querySelector('[role=status]');
      if (el) el.textContent = t;
      else ctx.notice(t);
    };
    try {
      if (mode === 'lookup') {
        lookup = form.elements.term.value.trim();
        if (!lookup) return;
        const id = ++searchId,
          owner = token();
        searching = true;
        ctx.redraw();
        try {
          const d = await ctx.api('material-search', { term: lookup });
          if (id === searchId && owner === token()) hits = d.hits;
        } finally {
          if (id === searchId && owner === token()) {
            searching = false;
            ctx.redraw();
          }
        }
        return;
      }
      const values = {
        module: form.elements.module.value,
        category: form.elements.category.value,
        visible: form.elements.visible.checked,
      };
      if (mode === 'meta') {
        await ctx.api('material-meta', { ...values, id: form.dataset.id });
        ctx.close();
        await ctx.refresh();
        ctx.notice('资料设置已保存。');
        return;
      }
      const file = form.elements.file.files[0];
      if (file?.size > 20 * 1024 * 1024) throw Error('请选择 20 MB 以内的 PDF。');
      const previous = form.dataset.previous,
        title = form.elements.title.value.trim(),
        body = form.elements.body.value.trim();
      let payload;
      const record = {
        ...values,
        previous,
        title,
        body,
        requestId: (form.dataset.requestId ||= crypto.randomUUID().replaceAll('-', '')),
      };
      if (file) {
        const pdf = await preparePDF(file, false, status);
        record.body = body || pdf.text || '扫描版 PDF，可打开原文并进行文字识别。';
        record.pages = pdf.pages;
        payload = new FormData();
        payload.set('pdf', file);
        payload.set('record', JSON.stringify(record));
      } else {
        if (!body) throw Error('请选择 PDF，或填写文字讲义正文。');
        payload = record;
      }
      status('正在上传…');
      const result = await ctx.api('material', payload);
      focus = result.id;
      snippetPage = 1;
      tab = 'snippet';
      stage = kind = query = module = scope = '';
      ctx.close();
      await ctx.refresh();
      const saved = mat(result.id);
      if (file && saved) {
        void index(saved, file).catch((err) => ctx.notice(err.message));
      } else ctx.notice('文字讲义已发布并入库。');
    } catch (err) {
      status(err.message);
    } finally {
      submit.disabled = false;
    }
  }
  return { render, hydrate, click, search, send };
}
