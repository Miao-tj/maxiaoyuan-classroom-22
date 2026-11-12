import { esc as h, icon } from './ui.js';
import { bankModules } from './bank-file.js';

const rights = { materials: 1, questions: 2, students: 4, works: 8 };
const nouns = { materials: '资料', questions: '题目', works: '作品' };
const button = (op, text, id = '', sty = '') =>
  `<button type="button" data-dash="${op}" data-id="${h(id)}" class="${sty}">${text}</button>`;
const label = (x, sty = '') => `<span class="td-pill ${sty}">${h(x)}</span>`;
const dt = (when) => {
  const n = Number(when);
  if (!n) return '暂无时间记录';
  const d = new Date(n);
  return Number.isNaN(d.getTime())
    ? '暂无时间记录'
    : d.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
};
const note = (msg) => `<p class="td-note">${icon('lock')}${msg}</p>`;
const head = (title, act = '') => `<header class="td-head"><h2>${title}</h2>${act}</header>`;
const card = (title, body, act = '') => `<section class="td-card">${head(title, act)}${body}</section>`;
const table = (columns, body, empty = '暂无记录') =>
  `<div class="td-scroll"><table><thead><tr>${columns.map((c) => '<th>' + c + '</th>').join('')}</tr></thead><tbody>${body || '<tr><td class="td-empty" colspan="' + columns.length + '">' + empty + '</td></tr>'}</tbody></table></div>`;
const metric = (title, value, symbol) =>
  `<article class="td-card td-stat"><span class="td-ico">${icon(symbol)}</span><div><small>${h(title)}</small><strong>${h(value)}</strong></div></article>`;
const emptyState = (msg) => `<p class="td-empty">${msg}</p>`;
const statusOf = (item, page) =>
  page === 'materials'
    ? item?.visible
      ? '已发布'
      : '未发布'
    : {
        draft: '草稿',
        published: page === 'works' ? '已通过' : '已发布',
        disabled: '已停用',
        pending: '待审核',
        returned: '需修改',
        accepted: '仅教师可见',
      }[item?.status] || '状态待确认';
export function createDashboard(ctx) {
  let days = 0,
    query = '',
    filter = '',
    snap = null,
    context = '',
    request = 0,
    page = 1,
    recentTab = '',
    weakModule = '';
  const room = ctx.room;
  const can = (key) => Boolean((room().rights ?? 15) & rights[key]);
  function controls(view) {
    const options = ctx
      .accounts()
      .flatMap((a, i) =>
        a.role === 'teacher'
          ? [`<option value="${i}" ${a.token === ctx.token() ? 'selected' : ''}>${h(a.title)}</option>`]
          : [],
      )
      .join('');
    const currentDays = [
      [0, '全部时间'],
      [7, '最近 7 天'],
      [30, '最近 30 天'],
      [90, '最近 90 天'],
    ];
    return `<div class="td-controls"><label>${icon('users')}<select data-dash-room aria-label="当前班级">${options}</select></label><label>${icon('notes')}<select data-dash-days aria-label="时间范围">${currentDays.map(([n, l]) => `<option value="${n}" ${days === n ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${view === 'students' ? `<label>${icon('book')}<select aria-label="数据来源"><option>在线课程首答记录</option></select></label>${button('export', '⇩ 导出汇总', '', 'outline')}` : can('questions') && can('students') ? button('create-task', '＋ 创建教学任务', '', 'primary') : ''}</div>`;
  }
  function overview(d) {
    const c = room(),
      active = d.learners.filter((x) => x.stats && x.answered > 0).length;
    const tasks = d.tasks || {};
    const sum = (tasks.drafts || 0) + (tasks.failures || 0) + (tasks.pending || 0);
    const stats = [
      ['班级数', 1, 'users'],
      ['已发布资料', can('materials') ? c.materials.filter((m) => m.visible).length : '—', 'book'],
      [
        '已发布题目',
        can('questions')
          ? c.questions.filter((q) => !q.status || q.status === 'published').length
          : '—',
        'edit',
      ],
      ['待处理事项', sum, 'notes'],
    ];
    const latest = Math.max(0, ...d.learners.filter((x) => x.stats).map((x) => Number(x.lastAt) || 0));
    const progress = table(
      ['班级', '已参与', '练习任务', '最近提交', '操作'],
      `<tr><td><b>${h(c.title)}</b></td><td>${can('students') ? active + ' 人' : '—'}</td><td>${h(c.assignments[0]?.title || '暂无已发布任务')}</td><td>${dt(latest)}</td><td>${can('students') ? button('goto', '查看', 'students', 'outline') : '—'}</td></tr>`,
    );
    const taskItems = [
      ['works', '作品待审核', tasks.pending, '去审核', 'notes'],
      ['questions', '题目待完善', tasks.drafts, '去处理', 'edit'],
      ['materials', '资料解析失败', tasks.failures, '查看原因', 'book'],
    ].filter(([k]) => can(k));
    const todo = taskItems
      .map(
        ([dest, k, n, t, ic]) =>
          `<div class="td-task">${icon(ic)}<b>${k}</b>${label(n || 0, n && dest === 'materials' ? 'warn' : '')}${button('todo', t, dest, 'outline')}</div>`,
      )
      .join('');
    const allowed = Object.keys(nouns).filter(can);
    if (!recentTab || !allowed.includes(recentTab))
      recentTab = d.recent?.find((r) => allowed.includes(r.page))?.page || allowed[0] || '';
    const tabs = `<div class="td-tabs">${allowed.map((k) => button('recent-tab', nouns[k], k, k === recentTab ? 'active' : '')).join('')}</div>`;
    const base = c[recentTab] || [];
    const since = days ? Date.now() - days * 86400000 : 0;
    const recent = (
      d.recent ||
      base
        .map((x) => ({
          title: x.title || x.prompt,
          page: recentTab,
          date: x.updated || x.created || x.submitted || 0,
        }))
        .filter((x) => x.date >= since)
    )
      .filter((r) => r.page === recentTab)
      .slice(0, 4);
    const recentRows = recent
      .map((r, i) => {
        const row = base.find((x) => (x.title || x.prompt) === r.title);
        return `<tr><td><b>${h(r.title)}</b></td><td>${row ? label(statusOf(row, recentTab)) : ''} <small>${dt(r.date)}</small></td><td>${button('recent-view', '查看', String(i), 'outline')}</td></tr>`;
      })
      .join('');
    const quick = [
      ['upload', '上传课程资料', 'folder', 'materials'],
      ['import', '导入题库', 'layers', 'questions'],
      ['create-task', '发布练习', 'edit', 'questions'],
      ['goto', '管理成果', 'notes', 'works'],
    ];
    return `<div class="td-metrics">${stats.map((x) => metric(...x)).join('')}</div><div class="td-overgrid">${card('班级学习进度', progress, can('students') ? button('goto', '查看完整学情', 'students', 'outline') : '')}${card('待办事项 ' + label(sum), todo || emptyState('当前角色没有教学待办。'))}${card('最近内容', table(['名称', '状态 / 时间', '操作'], recentRows, '所选期间暂无此类内容'), tabs)}${card(
      '快捷操作',
      '<div class="td-quick">' +
        quick
          .filter((x) => can(x[3]) && (x[0] !== 'create-task' || can('students')))
          .map(([op, t, ic, dest]) => button(op, icon(ic) + '<span>' + t + '</span>', dest))
          .join('') +
        '</div>',
    )}</div>${note('学情仅汇总学生授权的课程练习记录。私人对话与个人笔记仅本人可见。')}`;
  }
  function learning(d) {
    const c = room(),
      authorized = d.learners.filter((x) => x.stats),
      active = authorized.filter((x) => x.answered > 0);
    const stats = [
      ['班级人数', d.learners.length, 'users'],
      ['已参与练习', active.length, 'edit'],
      ['已发布练习', c.assignments.length, 'layers'],
      ['待补充记录', authorized.length - active.length, 'notes'],
    ];
    const moduleData = new Map(d.modules.map((m) => [m.module, m]));
    const modules = [...new Set([...bankModules, ...moduleData.keys()])]
      .map((name) => {
        const row = moduleData.get(name),
          n = Number(row?.n) || 0,
          pct = n ? Math.round((100 * (Number(row.correct) || 0)) / n) : 0;
        const text = !n
          ? '待评估'
          : n < 2
            ? '样本较少'
            : pct >= 80
              ? '较稳定'
              : pct >= 60
                ? '需巩固'
                : '待加强';
        return `<div class="td-module"><b>${h(name)}</b><div>${n ? `<progress aria-label="${h(name)}正确率 ${pct}%" value="${pct}" max="100"></progress><small>${pct}% · ${n} 次</small>` : '<span class="td-unrated">暂无已授权答题</span>'}</div>${label(text, n >= 2 && pct < 80 ? 'warn' : '')}</div>`;
      })
      .join('');
    const weak = d.modules
      .filter((x) => x.n > 0 && x.correct < x.n)
      .sort((a, b) => a.correct / a.n - b.correct / b.n)
      .slice(0, 4);
    if (!weak.some((m) => m.module === weakModule)) weakModule = weak[0]?.module || '';
    const weakControls = weak.length
      ? `<div class="td-weak">${weak.map((m) => button('weak-select', `<b>${h(m.module)}</b><small>${m.n - m.correct} 次首答需巩固，共 ${m.n} 次</small>`, m.module, m.module === weakModule ? 'active' : '')).join('')}</div><div class="td-actionrow">${can('questions') ? button('target', '创建巩固练习', weakModule, 'primary') + button('related', '查看相关题目', weakModule, 'outline') : ''}</div>`
      : emptyState('所选期间暂无需要巩固的模块。');
    const visible = d.learners.filter(
      (x) =>
        x.alias.toLowerCase().includes(query.trim().toLowerCase()) &&
        (!filter ||
          (filter === 'active'
            ? x.stats && x.answered > 0
            : filter === 'pending'
              ? x.stats && !x.answered
              : !x.stats)),
    );
    const pages = Math.max(1, Math.ceil(visible.length / 7));
    page = Math.max(1, Math.min(page, pages));
    const rs = visible
      .slice((page - 1) * 7, page * 7)
      .map(
        (x) =>
          `<tr><td><b>${h(x.alias)}</b></td><td>${x.stats ? x.answered + ' 题' : '—'}</td><td>${x.stats ? dt(x.lastAt) : '—'}</td><td>${label(!x.stats ? '未授权' : x.answered ? '已同步' : '待评估', x.stats && x.answered ? 'good' : '')}</td><td>${x.stats ? button('records', '查看练习', x.id, 'outline') : '—'}</td></tr>`,
      )
      .join('');
    const lookup = `<div class="td-student-filter"><input data-dash-search type="search" aria-label="搜索学生" placeholder="搜索学生" value="${h(query)}"><select data-dash-status aria-label="学习记录状态">${Object.entries(
      { '': '全部状态', active: '已同步', pending: '待评估', private: '未授权' },
    )
      .map(([v, t]) => `<option value="${v}" ${v === filter ? 'selected' : ''}>${t}</option>`)
      .join('')}</select></div>`;
    const pager = `<footer class="td-pager"><small>共 ${visible.length} 名学生</small>${page > 1 ? button('page', '上一页', String(page - 1)) : ''}<span>第 ${page} / ${pages} 页</span>${page < pages ? button('page', '下一页', String(page + 1)) : ''}</footer>`;
    return `<div class="td-metrics">${stats.map((x) => metric(...x)).join('')}</div><div class="td-overgrid td-learning">${card('知识模块概览', modules, '<small>按已授权首答记录计算</small>')}<div>${card('共性薄弱点', weakControls)}${card('数据说明', '<p>汇总所选班级和时段的在线首答。本机练习保留在学生自己的设备上。</p>')}</div></div>${card('学生练习记录', table(['学生', '已完成题目', '最近练习', '记录状态', '操作'], rs, '没有符合条件的学生') + pager, lookup)}${note('缺少授权或首答的记录列为待评估。尚未参与的学生不计入正确率。')}`;
  }
  function layout(view) {
    if (!snap) return '<div class="td-card" role="status">正在读取本班记录…</div>';
    return view === 'overview' ? overview(snap) : learning(snap);
  }
  function render(view) {
    const key = ctx.token() + ':' + days;
    if (key !== context) {
      context = key;
      snap = null;
      page = 1;
      weakModule = '';
      recentTab = '';
    }
    return `<section class="td-work"><header class="td-title"><div><h1>${view === 'overview' ? '教学概览' : '班级学情'}</h1>${view === 'overview' ? '<p>课程内容、练习进度与待办事项</p>' : ''}</div>${controls(view)}</header><div id="dash-content" data-view="${view}">${layout(view)}</div></section>`;
  }
  async function hydrate() {
    const el = document.querySelector('#dash-content');
    if (!el) return;
    const id = ++request;
    try {
      const result = await ctx.api('dashboard', { days });
      if (el.isConnected && id === request) {
        snap = result;
        el.innerHTML = layout(el.dataset.view);
      }
    } catch (e) {
      if (el.isConnected)
        el.innerHTML = '<p class="td-note">' + h(e.message) + '</p>' + button('retry', '重试');
    }
  }
  function redrawBody(restore = false) {
    const el = document.querySelector('#dash-content');
    if (!el) return;
    el.innerHTML = layout(el.dataset.view);
    if (restore) {
      const s = el.querySelector('[data-dash-search]');
      s?.focus();
      s?.setSelectionRange(query.length, query.length);
    }
  }
  function changes(t) {
    if (t.matches('[data-dash-days]')) {
      days = +t.value;
      ctx.redraw();
    } else if (t.matches('[data-dash-room]')) return ctx.switch(+t.value);
    else if (t.matches('[data-dash-search],[data-dash-status]')) {
      if (t.hasAttribute('data-dash-search')) query = t.value;
      else filter = t.value;
      page = 1;
      redrawBody(t.hasAttribute('data-dash-search'));
    }
  }
  function filterBank(key, value) {
    const s = document.querySelector(`[data-bank-studio] select[data-filter="${key}"]`);
    if (s && Array.from(s.options).some((x) => x.value === value)) {
      s.value = value;
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  async function click(b) {
    const op = b.dataset.dash,
      id = b.dataset.id;
    if (op === 'retry') return hydrate();
    if (op === 'goto' || op === 'todo') {
      if (b.closest('dialog[open]')) ctx.close();
      return ctx.todo(id, op === 'goto' ? { intent: 'list' } : {});
    }
    if (op === 'upload' || op === 'import') {
      await ctx.todo(id, { intent: 'list' });
      document.querySelector(op === 'upload' ? '[data-material=upload]' : '[data-bk=import]')?.click();
      return;
    }
    if (op === 'recent-tab') {
      recentTab = id;
      redrawBody();
      return;
    }
    if (op === 'weak-select') {
      weakModule = id;
      redrawBody();
      return;
    }
    if (op === 'page') {
      page = Number(id);
      redrawBody();
      return;
    }
    if (op === 'related') {
      await ctx.todo('questions', { intent: 'list' });
      filterBank('status', 'published');
      filterBank('module', id);
      return;
    }
    if (op === 'recent-view') {
      const base = room()[recentTab],
        since = days ? Date.now() - days * 86400000 : 0;
      const recent = (
        snap.recent ||
        base
          .map((x) => ({
            title: x.title || x.prompt,
            page: recentTab,
            date: x.updated || x.created || x.submitted || 0,
          }))
          .filter((x) => x.date >= since)
      ).filter((r) => r.page === recentTab)[Number(id)];
      if (!recent) return;
      const dest = recentTab,
        item = base.find((x) => (x.title || x.prompt) === recent.title);
      await ctx.todo(dest, { intent: 'list' });
      if (!item) return;
      if (dest === 'questions') {
        filterBank('module', '');
        filterBank('type', '');
        filterBank('status', '');
        filterBank('level', '');
        const s = document.querySelector('[data-bank-search]');
        if (s) {
          s.value = item.prompt;
          s.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      const action = {
        materials: '[data-material=focus]',
        works: '[data-project=detail]',
        questions: '[data-bk=edit]',
      }[dest];
      const control = Array.from(document.querySelectorAll(action)).find(
        (el) => el.dataset.value === item.id,
      );
      if (control) control.click();
      else ctx.pop(recent.title, '<p>' + h(statusOf(item, dest)) + ' · ' + dt(recent.date) + '</p>');
      return;
    }
    if (op === 'records') {
      const r = await ctx.api('student-records', { id, days });
      ctx.pop(
        '授权练习记录',
        r.rows
          .map(
            (x) =>
              `<article class="td-record"><b>${h(x.prompt)}</b><p>${h(x.module)} · ${x.right ? '正确' : '待复习'} · ${dt(x.answeredAt)}</p></article>`,
          )
          .join('') || emptyState('所选期间暂无首答记录。'),
      );
      return;
    }
    if (op === 'target' || op === 'create-task') {
      const list = [
        ...new Set(
          room()
            .questions.filter((q) => q.status === 'published' || !q.status)
            .map((q) => q.module || '未归类'),
        ),
      ];
      if (!list.length) {
        ctx.pop(
          '创建教学任务',
          '<p>请先发布题目，再按模块创建练习。</p>' +
            button('goto', '前往题库', 'questions', 'outline'),
        );
        return;
      }
      const pick = op === 'target' ? [id] : list;
      ctx.pop(
        '创建教学任务',
        `<p>选择知识模块，将该模块最近发布的最多 10 道题组成一次班级练习。</p><label class="field">知识模块<select data-td-task>${pick.map((x) => '<option>' + h(x) + '</option>').join('')}</select></label>${button('publish-task', '确认发布到本班', '', 'primary')}`,
      );
      return;
    }
    if (op === 'publish-task') {
      const m = document.querySelector('[data-td-task]')?.value;
      if (!m || b.disabled) return;
      b.disabled = true;
      try {
        const r = await ctx.api('target-practice', { module: m });
        ctx.close();
        await ctx.refresh();
        ctx.notice('已向本班发布 ' + r.count + ' 道练习题。');
      } finally {
        b.disabled = false;
      }
      return;
    }
    if (op === 'export' && snap) {
      const csv = (v) =>
        '"' +
        String(v)
          .replace(/^([=+@-])/, "'$1")
          .replaceAll('"', '""') +
        '"';
      const rows = [
        ['课堂称呼', '完成题目', '正确数', '最近首答'],
        ...snap.learners
          .filter((x) => x.stats)
          .map((x) => [x.alias, x.answered, x.correct, dt(x.lastAt)]),
      ];
      const a = document.createElement('a');
      a.href = URL.createObjectURL(
        new Blob(['\ufeff' + rows.map((r) => r.map(csv).join(',')).join('\r\n')], {
          type: 'text/csv;charset=utf-8',
        }),
      );
      a.download = '班级授权练习汇总.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  }
  return { render, hydrate, changes, click };
}
