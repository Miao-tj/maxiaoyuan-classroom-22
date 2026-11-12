import { esc as h } from './ui.js';
const el = document.querySelector('#ops'),
  status = document.querySelector('#op-status');
let token = '',
  state,
  tab = 'models';
function entry() {
  el.innerHTML =
    '<h1>平台管理</h1><form id="auth" class="card"><label class="field">管理员访问码<input type="password" autocomplete="off" name="code" required></label><button class="primary">进入平台管理</button></form>';
}
async function call(op, body = {}) {
  const r = await fetch('./api/operator/' + op, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || '操作未完成');
  return j;
}
function draw() {
  const model =
    '<div class="card"><div class="row"><h2>' +
    h(state.provider.label) +
    '</h2><span class="tag">' +
    h(state.provider.host) +
    '</span></div><p>服务端密钥配置　' +
    (state.configured ? '已配置独立服务' : '采用当前部署的默认推理服务') +
    '</p><p>连接测试会实际生成一条简短回答。</p><button id="probe" class="outline">测试模型连接</button></div>';
  const members =
    '<div class="card"><h2>课程与角色</h2><p>' +
    state.rooms.length +
    ' 个列出的课程，各由创建者管理本班讲义、题库与作品。学生只能提交本班学习记录。</p><div class="tablewrap"><table><thead><tr><th>课堂称呼</th><th>课程</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
    state.students
      .map(
        (a) =>
          '<tr><td>' +
          h(a.alias) +
          '</td><td>' +
          h(a.title) +
          '</td><td>学生</td><td>' +
          (a.enabled ? '可访问' : '已停用') +
          '</td><td><button data-member="' +
          h(a.id) +
          '" data-enable="' +
          (a.enabled ? '0' : '1') +
          '">' +
          (a.enabled ? '停用' : '恢复') +
          '</button></td></tr>',
      )
      .join('') +
    '</tbody></table></div></div>';
  el.innerHTML =
    '<div class="head"><h1>' +
    (tab === 'models' ? '模型与接口' : '账号与权限') +
    '</h1><i class="spacer"></i><button id="signout">退出管理</button></div><nav class="tabs"><button data-tab="models" class="' +
    (tab === 'models' ? 'active' : '') +
    '">模型与接口</button><button data-tab="accounts" class="' +
    (tab === 'accounts' ? 'active' : '') +
    '">账号与权限</button></nav>' +
    (tab === 'models' ? model : members);
}
el.addEventListener('submit', async (e) => {
  e.preventDefault();
  token = new FormData(e.target).get('code').trim();
  try {
    state = await call('state');
    status.textContent = '';
    draw();
  } catch (err) {
    token = '';
    status.textContent = err.message;
  }
});
el.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.tab) {
      tab = b.dataset.tab;
      status.textContent = '';
      draw();
    } else if (b.id === 'signout') {
      token = '';
      state = null;
      entry();
      status.textContent = '';
    } else if (b.dataset.member) {
      const enabled = b.dataset.enable === '1';
      if (!confirm(enabled ? '恢复此学生的课程访问？' : '停用此学生的课程访问？学习记录将保留。'))
        return;
      b.disabled = true;
      await call('access', { id: b.dataset.member, enabled });
      state = await call('state');
      draw();
      status.textContent = '成员状态已更新。';
    } else if (b.id === 'probe') {
      b.disabled = true;
      status.textContent = '正在连接模型…';
      const start = performance.now();
      const r = await fetch('./api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '仅用一句简体中文说明实践的含义。' }),
      });
      if (!r.ok) throw Error((await r.json()).error);
      const frames = (await r.text())
        .trim()
        .split('\n')
        .map((x) => JSON.parse(x));
      const err = frames.find((x) => x.type === 'error');
      if (err) throw Error(err.message);
      const reply = frames.filter((x) => x.type === 'answer').at(-1)?.text;
      if (!reply || !frames.some((x) => x.type === 'done')) throw Error('没有收到完整回答');
      status.textContent =
        '模型已回答（' + ((performance.now() - start) / 1000).toFixed(1) + ' 秒）　' + reply;
    }
  } catch (err) {
    status.textContent = err.message;
  } finally {
    b.disabled = false;
  }
});
entry();
