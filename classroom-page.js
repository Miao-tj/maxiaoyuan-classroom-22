import { esc as h, icon } from './ui.js';
const root = document.querySelector('#room'),
  dialog = document.querySelector('#class-dialog'),
  notice = document.querySelector('#message');
const store = 'mxy-course-credentials22';
let accounts = [],
  current,
  room,
  tab = 'overview',
  working = false;
try {
  accounts = JSON.parse(localStorage.getItem(store) || '[]');
} catch {}
current = accounts[0];
const shared = new URLSearchParams(location.hash.slice(1)).get('join') || '';
const b = (action, text, id = '', cls = '') =>
  '<button type="button" data-cmd="' +
  action +
  '" data-id="' +
  h(id) +
  '" class="' +
  cls +
  '">' +
  text +
  '</button>';
const input = (name, label, value = '', max = 100) =>
  '<label class="field">' +
  label +
  '<input name="' +
  name +
  '" value="' +
  h(value) +
  '" maxlength="' +
  max +
  '" required></label>';
const area = (name, label, value = '', max = 6500) =>
  '<label class="field">' +
  label +
  '<textarea rows="4" name="' +
  name +
  '" maxlength="' +
  max +
  '" required>' +
  h(value) +
  '</textarea></label>';
const submit = (label) => '<button class="primary">' + label + '</button>';
const isTeacher = () => room?.role === 'teacher';
function show(s) {
  notice.textContent = s;
}
async function api(op, body = {}) {
  const res = await fetch('./api/class/' + op, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(current?.token ? { Authorization: 'Bearer ' + current.token } : {}),
    },
    body: JSON.stringify(body),
  });
  let d;
  try {
    d = await res.json();
  } catch {
    throw Error('班级服务未连通，请刷新后再试。');
  }
  if (!res.ok) throw Error(d.error || '操作未完成。');
  return d;
}
function remember(a) {
  accounts = [a, ...accounts.filter((x) => x.token !== a.token)];
  current = a;
  localStorage.setItem(store, JSON.stringify(accounts));
}
async function refresh() {
  room = await api('state');
  render();
}
function pop(title, s) {
  dialog.innerHTML =
    '<header class="head"><h2>' +
    h(title) +
    '</h2><i class="spacer"></i>' +
    b('close', '关闭') +
    '</header>' +
    s;
  if (!dialog.open) dialog.showModal();
}
function entry() {
  root.innerHTML =
    '<h1>进入班级课堂</h1><p>教师创建课程后，将邀请码发给本班学生。</p><div class="class-columns"><section class="card"><h2>加入课程</h2><form data-op="join">' +
    input('invite', '课程邀请码', shared, 16) +
    input('alias', '课堂称呼（可用昵称）', '', 32) +
    submit('以学生身份加入') +
    '</form></section><section class="card"><h2>创建课程</h2><form data-op="create">' +
    input('title', '课程名称', '', '70') +
    submit('创建教师工作台') +
    '</form></section></div>' +
    (!accounts.length
      ? ''
      : '<section class="card segment"><h2>已加入的课程</h2>' +
        accounts
          .map((a, i) =>
            b('switch', h(a.title) + ' · ' + (a.role === 'teacher' ? '创建者' : '学生'), i),
          )
          .join(' ') +
        '</section>') +
    '<details class="card segment"><summary>用课程访问码恢复身份</summary><form data-op="restore">' +
    input('token', '个人访问码', '', 32) +
    submit('恢复') +
    '</form></details>';
}
function overview() {
  const q = room.questions.length,
    w = room.works.length,
    m = room.materials.length;
  return (
    '<div class="grid3">' +
    [
      ['课程讲义', m],
      ['课堂题目', q],
      [isTeacher() ? '提交作品' : '可见作品', w],
    ]
      .map(([l, n]) => '<div class="card"><small>' + l + '</small><h2>' + n + '</h2></div>')
      .join('') +
    '</div><section class="card segment"><h2>' +
    (isTeacher() ? '邀请学生加入' : '课堂学习') +
    '</h2>' +
    (isTeacher()
      ? '<p>课程邀请码　<strong>' +
        h(room.invite) +
        '</strong></p>' +
        b('invite', '复制学生入口', '', 'outline')
      : '<p>在「课程资料」打开教师发布的讲义，练习提交后可以查看解析。</p>') +
    '</section>'
  );
}
function materials() {
  return (
    (isTeacher() ? b('new-material', '＋ 发布讲义', '', 'primary') : '') +
    (!room.materials.length ? '<p>目前还没有发布的讲义。</p>' : '') +
    room.materials
      .map(
        (x) =>
          '<details class="card segment"><summary><b>' +
          h(x.title) +
          '</b></summary><p class="answer-text">' +
          h(x.body) +
          '</p></details>',
      )
      .join('')
  );
}
const sample = [
  {
    prompt: '检验认识真理性的唯一标准是什么？',
    options: ['实践', '多数人的意见', '现有理论'],
    correct: 0,
    why: '认识是否符合实际，要通过实践及其结果来检验。',
  },
];
function questionForm(q) {
  return (
    '<form data-op="' +
    (q ? 'edit' : 'question') +
    '" data-id="' +
    h(q?.id || '') +
    '">' +
    area('prompt', '题干', q?.prompt || '', 700) +
    area('options', '选项（每行一个）', q?.options.join('\n') || '', 1300) +
    input('answer', '正确选项序号（从 1 开始）', q ? String(q.correct + 1) : '1', 1) +
    area('why', '解析', q?.why || '', 900) +
    submit('保存题目') +
    '</form>'
  );
}
function questionList() {
  return (
    (isTeacher()
      ? '<div class="row">' +
        b('new-question', '＋ 新建题目', '', 'primary') +
        b('import', '批量导入') +
        '</div>'
      : '') +
    (!room.questions.length ? '<p>题库中还没有题目。</p>' : '') +
    room.questions
      .map(
        (q, i) =>
          '<article class="card segment"><small>第 ' +
          (i + 1) +
          ' 题 · 单选</small><h2>' +
          h(q.prompt) +
          '</h2>' +
          (isTeacher()
            ? q.options
                .map((o, i) => '<p>' + (i === q.correct ? '✓　' : '　　') + h(o) + '</p>')
                .join('') +
              '<p>' +
              h(q.why) +
              '</p>' +
              b('edit', '编辑题目', q.id)
            : '<form data-op="answer" data-id="' +
              h(q.id) +
              '">' +
              q.options
                .map(
                  (o, i) =>
                    '<label class="option"><input type="radio" name="choice" value="' +
                    i +
                    '" ' +
                    (q.choice === i ? 'checked' : '') +
                    (q.choice != null ? ' disabled' : '') +
                    ' required>' +
                    h(o) +
                    '</label>',
                )
                .join('') +
              (q.choice != null
                ? '<div class="callout"><b>' +
                  (q.right ? '回答正确' : '需要复习') +
                  '</b><p>' +
                  h(q.why) +
                  '</p></div>'
                : submit('提交首答')) +
              '</form>') +
          '</article>',
      )
      .join('')
  );
}
function students() {
  return (
    '<div class="card"><h2>班级学情</h2><p>按每道课堂题目的首次提交统计。</p><table><thead><tr><th>课堂称呼</th><th>已答</th><th>答对</th><th>正确率</th></tr></thead><tbody>' +
    room.students
      .map(
        (s) =>
          '<tr><td>' +
          h(s.alias) +
          '</td><td>' +
          s.answered +
          '</td><td>' +
          s.correct +
          '</td><td>' +
          (s.answered ? Math.round((100 * s.correct) / s.answered) + '%' : '待评估') +
          '</td></tr>',
      )
      .join('') +
    '</tbody></table>' +
    (!room.students.length ? '<p>尚无学生加入。</p>' : '') +
    '</div>'
  );
}
const status = { pending: '待审核', published: '已在班内展示', accepted: '已收阅', returned: '已退回' };
function works() {
  return (
    (isTeacher() ? '' : b('submit-work', '＋ 提交作品', '', 'primary')) +
    (!room.works.length ? '<p>目前没有可查看的作品。</p>' : '') +
    room.works
      .map(
        (w) =>
          '<article class="card segment"><div class="row"><h2>' +
          h(w.title) +
          '</h2><span class="tag">' +
          status[w.status] +
          '</span></div>' +
          (w.alias ? '<small>' + h(w.alias) + '</small>' : '') +
          '<p class="answer-text">' +
          h(w.body) +
          '</p>' +
          (w.feedback ? '<p>教师评语　' + h(w.feedback) + '</p>' : '') +
          (isTeacher() ? b('review', '审核并写评语', w.id, 'outline') : '') +
          '</article>',
      )
      .join('')
  );
}
function render() {
  const tabs = [
    ['overview', isTeacher() ? '教学概览' : '课程概览'],
    ['materials', '课程资料'],
    ['questions', isTeacher() ? '题库管理' : '章节练习'],
    ['works', isTeacher() ? '作品审核' : '小组成果'],
    ...(isTeacher() ? [['students', '班级学情']] : []),
  ];
  root.innerHTML =
    '<div class="head"><h1>' +
    h(room.title) +
    '</h1><span class="tag">' +
    (isTeacher() ? '课程创建者' : '学生') +
    '</span><i class="spacer"></i>' +
    b('account', '课程与身份') +
    '</div><nav class="tabs">' +
    tabs.map(([id, l]) => b('tab', l, id, tab === id ? 'active' : '')).join('') +
    '</nav>' +
    ({ overview, materials, questions: questionList, works, students }[tab] || overview)();
}
const actions = {
  close: () => dialog.close(),
  tab: (v) => {
    tab = v;
    render();
  },
  invite: async () => {
    const url = new URL('classroom.html', location.href);
    url.hash = 'join=' + room.invite;
    try {
      await navigator.clipboard.writeText(url.href);
      show('学生入口已复制。');
    } catch {
      pop('学生入口', '<p>' + h(url.href) + '</p>');
    }
  },
  switch: async (i) => {
    remember(accounts[Number(i)]);
    tab = 'overview';
    await refresh();
  },
  account: () =>
    pop(
      '课程与身份',
      '<p>将个人访问码保存在自己的设备上，可在另一台设备恢复同一身份。</p>' +
        b('reveal', '查看我的访问码') +
        ' ' +
        b('entry', '切换或加入其他班级'),
    ),
  reveal: () =>
    pop('个人访问码', '<p>持有此码的人可以操作你的课程身份。</p><code>' + h(current.token) + '</code>'),
  entry: () => {
    dialog.close();
    room = null;
    entry();
  },
  'new-material': () =>
    pop(
      '发布讲义',
      '<form data-op="material">' +
        input('title', '讲义名称') +
        area('body', '讲义正文', '', 7000) +
        submit('发布到本班') +
        '</form>',
    ),
  'new-question': () => pop('新建题目', questionForm()),
  edit: (id) => pop('编辑题目', questionForm(room.questions.find((q) => q.id === id))),
  import: () =>
    pop(
      '导入题目',
      '<form data-op="import"><p>使用 JSON 数组，correct 从 0 开始。全部题目通过校验后统一写入。</p>' +
        area('json', '题目 JSON', JSON.stringify(sample, null, 2), 18000) +
        submit('校验并导入') +
        '</form>',
    ),
  'submit-work': () =>
    pop(
      '提交作品',
      '<form data-op="submit">' +
        input('title', '作品名称') +
        area('body', '作品正文') +
        '<label class="field"><input type="checkbox" name="share"> 允许教师审核后向本班展示</label>' +
        submit('提交给教师') +
        '</form>',
    ),
  review: (id) => {
    const w = room.works.find((w) => w.id === id);
    pop(
      '作品审核',
      '<form data-op="moderate" data-id="' +
        h(id) +
        '"><label class="field">审核决定<select name="status"><option value="accepted">仅收阅</option><option value="returned">退回修改</option>' +
        (w.consent ? '<option value="published">在班内展示</option>' : '') +
        '</select></label><label class="field">评语<textarea name="feedback" maxlength="1200">' +
        h(w.feedback) +
        '</textarea></label>' +
        submit('保存审核结果') +
        '</form>',
    );
  },
};
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-cmd]');
  if (!el) return;
  try {
    await actions[el.dataset.cmd]?.(el.dataset.id);
  } catch (e) {
    show(e.message);
  }
});
document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (!f.dataset.op) return;
  e.preventDefault();
  if (working) return;
  working = true;
  const button = f.querySelector('button:last-child');
  button.disabled = true;
  show('');
  let op = f.dataset.op,
    body = Object.fromEntries(new FormData(f));
  try {
    if (op === 'restore') {
      const prev = current;
      current = { token: body.token.trim() };
      try {
        room = await api('state');
        remember({ ...current, role: room.role, title: room.title });
      } catch (err) {
        current = prev;
        throw err;
      }
      tab = 'overview';
      render();
      return;
    }
    if (op === 'create' || op === 'join') {
      const a = await api(op, body);
      remember(a);
      tab = 'overview';
      history.replaceState({}, '', location.pathname);
      await refresh();
      return;
    }
    if (op === 'question' || op === 'edit') {
      const q = {
        prompt: body.prompt,
        options: body.options
          .split(/\r?\n/)
          .map((v) => v.trim())
          .filter(Boolean),
        why: body.why,
        correct: Number(body.answer) - 1,
      };
      if (op === 'edit') body = { ...q, id: f.dataset.id };
      else {
        op = 'import';
        body = { questions: [q] };
      }
    } else if (op === 'import') {
      try {
        body = { questions: JSON.parse(body.json) };
      } catch {
        throw Error('JSON 格式有误，请检查括号和引号。');
      }
    } else if (op === 'answer') body = { id: f.dataset.id, choice: Number(body.choice) };
    else if (op === 'submit') body.share = body.share === 'on';
    else if (op === 'moderate') body.id = f.dataset.id;
    await api(op, body);
    dialog.close();
    await refresh();
    show('已保存到班级课堂。');
  } catch (err) {
    show(err.message);
    if (dialog.open) {
      let p = dialog.querySelector('.error');
      if (!p) {
        p = document.createElement('p');
        p.className = 'error';
        dialog.append(p);
      }
      p.textContent = err.message;
    }
  } finally {
    working = false;
    button.disabled = false;
  }
});
if (current && !shared) {
  refresh().catch((e) => {
    entry();
    show(e.message);
  });
} else entry();
