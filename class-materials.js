import { esc as h, icon } from './ui.js';
import { preparePDF, mountReader } from './course-pdf.js';
export function createMaterials(ctx) {
  let query = '',
    kind = '',
    selected = '',
    lastAccount = '';
  const get = () => ctx.room(),
    teacher = () => get().role === 'teacher';
  const button = (action, label, id = '', cls = '') =>
    '<button type="button" class="' +
    cls +
    '" data-material="' +
    action +
    '" data-value="' +
    h(id) +
    '">' +
    label +
    '</button>';
  const page = (m) => Math.max(0, Number(localStorage.getItem('mxy-reading-' + m.id)) || 0);
  function render() {
    if (lastAccount !== ctx.token()) {
      lastAccount = ctx.token();
      selected = '';
      query = '';
      kind = '';
      const dest = new URLSearchParams(location.hash.slice(1));
      const id = dest.get('read'),
        p = Number(dest.get('page'));
      if (id && get().materials.some((x) => x.id === id)) {
        selected = id;
        if (Number.isInteger(p) && p > 0) localStorage.setItem('mxy-reading-' + id, String(p));
      }
    }
    const items = get().materials,
      record = items.find((x) => x.id === selected);
    if (record)
      return (
        '<div class="project-head"><div><small>课程学习　/　原文阅读</small><h1>' +
        h(record.title) +
        '</h1></div>' +
        button('back', '← 返回资料') +
        '</div>' +
        (record.files?.length
          ? '<div class="class-reader" data-pdf-record="' +
            h(record.id) +
            '"><p>正在打开原文…</p></div>'
          : '<article class="card work-paper"><h2>' +
            h(record.title) +
            '</h2><p class="answer-text">' +
            h(record.body) +
            '</p></article>')
      );
    const last = items.find(
      (x) => x.id === localStorage.getItem('mxy-last-material-' + ctx.token()),
    );
    const filtered = items.filter(
      (x) =>
        (x.title + ' ' + x.body).includes(query) &&
        (!kind || kind === (x.files?.length ? 'PDF' : '讲义')),
    );
    return (
      '<div class="project-head"><div><small>' +
      (teacher() ? '教师工作台　/　课程资料' : '课程学习') +
      '</small><h1>' +
      (teacher() ? '课程知识库' : '课程资料') +
      '</h1><p>' +
      (teacher() ? '管理本班讲义与 PDF 原文。' : '从原文开始理解，随时提问和记录。') +
      '</p></div><div>' +
      (teacher()
        ? '<button data-cmd="new-material">发布文字讲义</button> ' +
          button('upload', '↑ 上传资料', '', 'primary')
        : '') +
      '</div></div>' +
      (last
        ? '<section class="resume-card">' +
          icon('book') +
          '<div><strong>' +
          h(last.title) +
          '</strong><small>' +
          (last.files?.[0]
            ? '第 ' + (page(last) || 1) + ' / ' + last.files[0].pages + ' 页'
            : '上次阅读的讲义') +
          '</small></div>' +
          button('open', '继续阅读', last.id, 'primary') +
          '</section>'
        : '') +
      '<div class="materials-grid"><section class="card"><div class="project-filters"><input type="search" data-material-search placeholder="搜索资料名称或关键词" aria-label="搜索资料" value="' +
      h(query) +
      '"></div><nav class="project-tabs">' +
      ['', 'PDF', '讲义']
        .map((x) => button('kind', x || '全部资料', x, x === kind ? 'active' : ''))
        .join('') +
      '</nav><div class="table-scroll"><table><thead><tr><th>资料名称</th><th>类型</th><th>阅读进度</th><th>操作</th></tr></thead><tbody>' +
      filtered
        .map(
          (m) =>
            '<tr><td><b>' +
            h(m.title) +
            '</b></td><td><span class="tag">' +
            (m.files?.length ? 'PDF' : '文字讲义') +
            '</span></td><td>' +
            (m.files?.length
              ? (page(m) || 0) + ' / ' + m.files[0].pages + ' 页'
              : page(m)
                ? '已打开'
                : '未开始') +
            '</td><td>' +
            button('open', '打开阅读', m.id, 'outline') +
            '</td></tr>',
        )
        .join('') +
      '</tbody></table></div>' +
      (!filtered.length ? '<p class="project-empty">没有符合条件的课程资料。</p>' : '') +
      '<small>共 ' +
      filtered.length +
      ' 份资料</small></section><aside class="card"><h3>按类型浏览</h3>' +
      ['PDF', '讲义']
        .map((x) =>
          button(
            'kind',
            icon('book') + '　' + (x === 'PDF' ? 'PDF 原文' : '文字讲义') + '　›',
            x,
            'side-filter',
          ),
        )
        .join('') +
      '</aside></div>'
    );
  }
  async function hydrate() {
    const target = document.querySelector('[data-pdf-record]');
    if (!target) return;
    const rec = get().materials.find((x) => x.id === target.dataset.pdfRecord);
    const f = rec?.files?.[0];
    if (!f) return;
    try {
      const r = await fetch('./api/class/file/' + f.id + '?mode=read', {
        headers: { Authorization: 'Bearer ' + ctx.token() },
      });
      if (!r.ok) throw Error((await r.json()).error || '原文读取失败');
      const blob = await r.blob();
      if (target.isConnected) await mountReader(target, blob, rec);
    } catch (e) {
      if (target.isConnected) target.textContent = '原文读取失败：' + e.message;
    }
  }
  function click(op, id) {
    if (op === 'upload') {
      ctx.pop(
        '上传课程资料',
        '<form data-material-form><label class="field">资料名称<input name="title" maxlength="100" required></label><label class="field">PDF 原文件<input type="file" name="file" accept=".pdf,application/pdf" required></label><label class="field">资料简介<textarea name="body" maxlength="7000" rows="3"></textarea></label><p role="status"></p><button class="primary">上传到本课程</button></form>',
      );
      return;
    }
    if (op === 'open') {
      selected = id;
      localStorage.setItem('mxy-last-material-' + ctx.token(), id);
      if (!get().materials.find((m) => m.id === id)?.files?.length)
        localStorage.setItem('mxy-reading-' + id, '1');
    }
    if (op === 'back') selected = '';
    if (op === 'kind') kind = id;
    ctx.redraw();
  }
  function search(v) {
    query = v;
    ctx.redraw();
    document.querySelector('[data-material-search]')?.focus();
  }
  async function send(e) {
    const f = e.target;
    e.preventDefault();
    const submit = f.querySelector('button');
    if (submit.disabled) return;
    submit.disabled = true;
    const status = (s) => (f.querySelector('[role=status]').textContent = s);
    try {
      const file = f.elements.file.files[0];
      if (!file || file.size > 20 * 1024 * 1024) throw Error('请选择 20 MB 以内的 PDF。');
      const pdf = await preparePDF(file, false, status);
      const body = f.elements.body.value.trim() || pdf.text || '扫描版 PDF，打开原文阅读。';
      const data = new FormData();
      data.set('pdf', file);
      data.set(
        'record',
        JSON.stringify({
          requestId: (f.dataset.requestId ||= crypto.randomUUID().replaceAll('-', '')),
          title: f.elements.title.value,
          body,
          pages: pdf.pages,
        }),
      );
      status('正在上传…');
      await ctx.api('material', data);
      ctx.close();
      await ctx.refresh();
      ctx.notice('资料已发布，本班学生可以打开原文。');
    } catch (err) {
      status(err.message);
    } finally {
      submit.disabled = false;
    }
  }
  return { render, hydrate, click, search, send };
}
