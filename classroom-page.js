import {createTeacherBank} from './teacher-bank.js';
import {createLogin} from './account-panel.js';
import {createDashboard} from './teacher-overview.js';
import { createProjects } from './class-projects.js';
import { createMaterials } from './class-materials.js';
import { esc as h, icon } from './ui.js';
const root = document.querySelector('#room'),
  dialog = document.querySelector('#class-dialog'),
  notice = document.querySelector('#message');
const store = 'mxy-course-credentials22';
let accounts = [],
  current,
  room,
  tab = location.hash.startsWith('#read=')
    ? 'materials'
    : ['works', 'materials', 'questions', 'students'].includes(location.hash.slice(1))
      ? location.hash.slice(1)
      : 'overview',
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
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(current?.token ? { Authorization: 'Bearer ' + current.token } : {}),
    },
    body: body instanceof FormData ? body : JSON.stringify(body),
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
let latestRead = 0;
async function refresh() {
  const request = ++latestRead;
  const owner = current?.token;
  const snapshot = await api('state');
  if (request !== latestRead || owner !== current?.token) return;
  room = snapshot;
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
    '<div class="identity-shell">'+login.panel()+'<aside class="identity-preview"><h2>当前课程</h2><div class="td-login-course"><img src="./assets/companion-awake.webp" alt="马小原"><div><h3>马克思主义基本原理</h3><span>课程学习工作台</span></div></div><nav class="td-login-links"><a href="./#library">阅读课程资料</a><a href="./#chat">与马小原讨论</a><a href="./#exercises">完成章节练习</a></nav><p>你的私人对话与笔记仅自己可见。</p></aside></div><div class="class-columns"><section class="card"><h2>加入课程</h2><form data-op="join">' +
    input('invite', '课程邀请码', shared, 16) +
    input('alias', '课堂称呼（可用昵称）', '', 32) +
    '<label class="permission"><input name="stats" type="checkbox"> 允许教师在班级学情中查看我的首答记录</label>'+submit('以学生身份加入') +
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
let assignment='';
function questionList(){
 if(isTeacher())return bank.render();
 const group=room.assignments.find(g=>g.id===assignment);
 const list=room.questions.filter(q=>!group||group.questions.includes(q.id));
 return '<header class="project-head"><h1>课堂练习</h1></header><nav class="project-tabs">'+b('assignment','全部题目','',!group?'active':'')+room.assignments.map(x=>b('assignment',h(x.title),x.id,x.id===assignment?'active':'')).join('')+'</nav>'+(!list.length?'<section class="card"><p>本班暂未发布题目。</p></section>':'')+list.map((q,i)=>{
 const answered=q.choice!=null,multi=q.type==='multi',selected=q.choices?.length?q.choices:[q.choice];
 return '<article class="card segment"><small>第 '+(i+1)+' 题 · '+(multi?'多选':q.type==='judge'?'判断':'单选')+' · '+h(q.module||'课程练习')+'</small><h2>'+h(q.prompt)+'</h2><form data-op="answer" data-id="'+h(q.id)+'">'+q.options.map((o,k)=>'<label class="option"><input type="'+(multi?'checkbox':'radio')+'" name="choice" value="'+k+'" '+(answered?'disabled ':'')+(selected.includes(k)?'checked ':'')+(!multi?'required ':'')+'>'+h(o)+'</label>').join('')+(answered?'<div class="callout"><b>'+(q.right?'回答正确':'需要复习')+'</b><p>'+h(q.why)+'</p></div>':submit('提交首答'))+'</form></article>';}).join('');
}
function switchCourse(i){remember(accounts[i]);tab='overview';assignment='';return refresh();}
const ctx = {
  room: () => room,
  token: () => current?.token,
  api,
  refresh,
  redraw: render, accounts:()=>accounts, remember, switch:switchCourse,
  reentry:()=>{if(!room)entry();},dropManaged:()=>{accounts=accounts.filter(a=>!a.managed);localStorage.setItem(store,JSON.stringify(accounts));current=null;room=null;},
  todo:async(id,options={})=>{if(!tabInfo().some(x=>x[0]===id))return show('当前课程身份未获得此权限。');tab=id;if(id==='questions')bank.open(options.intent==='list'?'list':'draft');history.replaceState(null,'','#'+tab);await refresh();},
  notice: show,
  pop,
  close: () => dialog.close(),
};
const projects = createProjects(ctx),
  library = createMaterials(ctx), login=createLogin(ctx), dashboard=createDashboard(ctx), bank=createTeacherBank(ctx);
const tabInfo = () => [
  ['overview', isTeacher() ? '教学概览' : '课程概览', 'home'],
  ['materials', isTeacher() ? '课程资料' : '课程学习', 'book'],
  ['questions', isTeacher() ? '题库管理' : '题库练习', 'edit'],
  ['works', isTeacher() ? '成果审核' : '小组成果', 'users'],
  ...(isTeacher() ? [['students', '班级学情', 'chart']] : []),
].filter(([page])=>!isTeacher()||page==='overview'||((room.rights??15)&({materials:1,questions:2,students:4,works:8}[page])));
function render() {
  if (!tabInfo().some(([id]) => id === tab)) tab = 'overview';
  root.innerHTML =
    '<div class="course-shell"><nav class="class-rail" aria-label="班级导航">' +
    tabInfo()
      .map(([id, label, name]) =>
        b('tab', icon(name) + '<span>' + label + '</span>', id, id === tab ? 'active' : ''),
      )
      .join('') +
    '<div class="rail-base">' +
    b('account', icon('settings') + ' 课程与身份') +
    '</div></nav><section class="class-main"><div class="class-context"><span>' +
    h(room.title) +
    '</span><span>' +
    (isTeacher() ? '教师' : '学生') +
    '</span>' +
    b('refresh', '刷新') +
    '</div>' +
    {
      overview:()=>isTeacher()?dashboard.render('overview'):overview(),
      materials: library.render,
      questions: questionList,
      works: projects.render,
      students:()=>dashboard.render('students'),
    }[tab]() +
    '</section></div>';
  if (isTeacher()&&['students','overview'].includes(tab))dashboard.hydrate();
  if(isTeacher()&&tab==='questions')bank.hydrate();
  if (tab === 'works') projects.hydrate();
  if (tab === 'materials') library.hydrate();
}
const actions = {
  close: () => dialog.close(),
  assignment:v=>{assignment=v;render();},
  'stats-consent':async()=>{await api('stats-consent',{allowed:!room.statsConsent});dialog.close();await refresh();show('已更新学情授权。');},
  refresh,
  tab: async (v) => {
    tab = v;
    history.replaceState(null, '', '#' + v);
    await refresh();
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
        b('entry', '账号登录与课程切换')+(!isTeacher()?' '+b('stats-consent',room.statsConsent?'关闭我的学情授权':'授权教师查看我的学情'):''),
    ),
  reveal: () =>
    pop(
      '个人访问码',
      '<p>持有此码的人可以操作你的课程身份。</p><code>' + h(current.token) + '</code>',
    ),
  entry: () => {
    dialog.close();
    room = null;
    entry();
  },

};
document.addEventListener('click', async (e) => {
  const p = e.target.closest('[data-project]'),
    m = e.target.closest('[data-material]');
  try {
    if (p) await projects.click(p.dataset.project, p.dataset.value);
    const acct=e.target.closest('[data-account]'),dash=e.target.closest('[data-dash]');if(acct)await login.click(acct);if(dash)await dashboard.click(dash);
    if (m) await library.click(m.dataset.material, m.dataset.value);
  } catch (err) {
    show(err.message);
  }
});
document.addEventListener('input', (e) => {
  if(e.target.matches('[data-dash-search]'))dashboard.changes(e.target);
  if (e.target.matches('[data-material-search]')) library.search(e.target.value);
  if (
    e.target.matches(
      '[data-search], [data-project-form=editor] input:not([type=file]):not([type=checkbox]), [data-project-form=editor] textarea',
    )
  )
    projects.edit(e).catch((err) => show(err.message));
});
document.addEventListener('change', (e) => {
  if(e.target.matches('[data-dash-days],[data-dash-room],[data-dash-status]'))Promise.resolve(dashboard.changes(e.target)).catch(err=>show(err.message));
  if (
    e.target.matches(
      '[data-sort],[data-topic],[data-filtertype],[data-project-form=editor] select,[data-project-form=editor] input[type=checkbox],[data-file]',
    )
  )
    projects.edit(e).catch((err) => show(err.message));
});
document.addEventListener('submit', (e) => {
  if(e.target.matches('[data-auth]')){e.preventDefault();const f=e.target,b=f.querySelector('button.primary,button:last-child');if(b.disabled)return;b.disabled=true;login.submit(f).catch(err=>{show(err.message);let n=f.querySelector('[role=alert]');if(!n){n=document.createElement('p');n.setAttribute('role','alert');f.append(n);}n.textContent=err.message;}).finally(()=>b.disabled=false);return;}
  if (e.target.matches('[data-project-form]'))
    projects.send(e).catch((err) => {
      show(err.message);
      const n = e.target.querySelector('[data-edit-status]');
      if (n) n.textContent = err.message;
    });
  if (e.target.matches('[data-material-form]')) library.send(e).catch((err) => show(err.message));
});
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
      if (!['materials', 'works'].includes(tab)) tab = 'overview';
      render();
      return;
    }
    if (op === 'create' || op === 'join') {
      body.stats=body.stats==='on';const a = await api(op, body);
      await login.link(a.token);
      remember(a);
      if (!['materials', 'works'].includes(tab)) tab = 'overview';
      history.replaceState({}, '', location.pathname + '#' + tab);
      await refresh();
      return;
    }
    if(op==='answer'){const values=new FormData(f).getAll('choice').map(Number);if(!values.length)throw Error('请选择答案。');body={id:f.dataset.id,choice:values[0],choices:values};}
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
if (current && !shared && location.hash!=='#login') {
  refresh().then(()=>{if(location.hash==='#permissions')actions.account();}).catch((e) => {
    entry();
    show(e.message);
  });
} else entry();

login.init();

try{document.body.classList.toggle('reduce',!!JSON.parse(localStorage.getItem('maxiaoyuan-live-22')||'{}').reduce);}catch{}
