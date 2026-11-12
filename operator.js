import { esc as h, icon } from './ui.js';

const root = document.querySelector('#ops');
const status = document.querySelector('#op-status');
const sheet = document.createElement('link');
sheet.rel = 'stylesheet';
sheet.href = new URL('./operator.css', import.meta.url).href;
document.head.append(sheet);
document.body.classList.add('operator-app');
status.setAttribute('aria-live', 'polite');

const navItems = {
  overview: ['平台概览', 'home'],
  accounts: ['账号与权限', 'users'],
  models: ['模型与接口', 'layers'],
  logs: ['用量与日志', 'chart'],
  settings: ['平台设置', 'settings'],
};
const rightsList = [
  [1, '维护课程资料', 'folder'],
  [2, '导入与发布题库', 'layers'],
  [4, '查看班级学情', 'chart'],
  [8, '审核公开作品', 'edit'],
];
const roles = { student: '学生', teacher: '教师', admin: '管理员' };
const providers = {
  auto: '跟随部署配置',
  deepseek: 'DeepSeek',
  shared: '共享推理服务',
  local: '本地推理服务',
};
const limits = {
  timeout: ['请求超时', '秒', 1],
  retries: ['最大重试', '次', 0],
  concurrent: ['并发上限', '个', 1],
  daily: ['单用户日请求上限', '次', 0],
  monthly: ['月度预算', '次', 0],
};
let token = '',
  data,
  draft,
  section = 'models',
  modelTab = 'config',
  dirty = false,
  pending = false;
let activeModel = '',
  newKey = '',
  changingKey = false,
  panel = null,
  identity = 'code',
  selected = new Set();
let filters = { search: '', role: '', enabled: '', room: '' },
  confirmation = null;
const opts = (obj, selected) =>
  Object.entries(obj)
    .map(
      ([k, v]) =>
        `<option value="${h(k)}"${String(selected) === k ? ' selected' : ''}>${h(v)}</option>`,
    )
    .join('');
const av = (name) =>
  `<span class="op-avatar" aria-hidden="true">${h(Array.from(String(name || '管'))[0])}</span>`;
const badge = (x, cls = '') => `<span class="op-pill ${cls}">${h(x)}</span>`;
const btn = (doWhat, label, cls = '', attrs = '') =>
  `<button type="button" data-action="${doWhat}" class="${cls}" ${attrs}>${label}</button>`;
const input = (label, field, control) =>
  `<label class="op-field"><span>${h(label)}</span>${control}</label>`;
const roomById = (id) => data.rooms.find((r) => String(r.id) === String(id));
const roomOptions = (value, empty = '请选择课程或班级') =>
  `<option value="">${h(empty)}</option>` +
  opts(Object.fromEntries(data.rooms.map((r) => [String(r.id), r.title])), value);
const checked = (v) => (v ? ' checked' : '');
const enabled = (v) => v === true || v === 1 || v === '1';
function message(s = '') {
  status.textContent = s;
  status.hidden = !s;
}
async function api(op, body = {}) {
  const response = await fetch('./api/operator/' + op, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Error(typeof result.error === 'string' ? result.error : '请求未完成，请重试。');
  return result;
}
function readState(raw, loadModels = false) {
  data = {
    ...raw,
    accounts: raw.accounts || [],
    memberships: raw.memberships || [],
    rooms: raw.rooms || [],
    students: raw.students || [],
    probes: raw.probes || [],
  };
  if (loadModels || !draft) {
    draft = structuredClone(
      raw.models || {
        mappings: [],
        defaultId: '',
        timeout: 60,
        retries: 1,
        concurrent: 5,
        daily: 100,
        monthly: 0,
      },
    );
    draft.mappings ??= [];
    activeModel =
      draft.mappings.find((m) => m.id === activeModel)?.id ||
      draft.defaultId ||
      draft.mappings[0]?.id ||
      '';
    dirty = false;
    newKey = '';
    changingKey = false;
  }
}
function entry() {
  document.body.classList.remove('op-in');
  root.innerHTML = `<div class="op-entry"><div class="op-entry-icon">${icon('lock')}</div><h1>平台管理</h1><p>管理模型连接与课程账号权限</p><div class="op-tabs" aria-label="进入方式">${['code', 'session'].map((v, i) => btn('identity', i ? '账号会话' : '管理员访问码', identity === v ? 'active' : '', `data-value="${v}"`)).join('')}</div><form id="auth">${identity === 'code' ? '<label class="op-field">管理员访问码<input type="password" name="code" autocomplete="off" required placeholder="输入管理员访问码"></label>' : `<p>${sessionToken() ? '使用当前账号会话进入平台管理。' : '请先在班级课堂登录管理员账号。'}</p><a href="./classroom.html">前往班级课堂</a>`}<button class="op-primary" ${identity === 'session' && !sessionToken() ? 'disabled' : ''}>进入平台管理</button></form><a href="./">返回课程工作台</a></div>`;
}
function sessionToken() {
  try {
    for (const storage of [sessionStorage, localStorage]) {
      const raw = storage.getItem('mxy-login24');
      if (!raw) continue;
      let saved;
      try {
        saved = JSON.parse(raw);
      } catch {
        saved = raw;
      }
      const found = typeof saved === 'string' ? saved : saved?.token || saved?.session?.token;
      if (typeof found === 'string' && found) return found;
    }
  } catch {}
  return '';
}
function overview() {
  return `<div class="op-stats">${[
    ['课程与班级', data.rooms.length],
    ['平台账号', data.accounts.length],
    ['课堂身份', data.students.length],
    ['已配置模型', draft.mappings.length],
  ]
    .map(([label, n]) => `<div class="op-card"><p>${label}</p><strong>${n}</strong></div>`)
    .join(
      '',
    )}</div><div class="op-card"><h2>管理入口</h2><div class="op-row">${btn('nav', '管理账号与权限', 'op-outline', 'data-value="accounts"')}${btn('nav', '配置模型连接', 'op-outline', 'data-value="models"')}</div></div>`;
}
function notes() {
  return `<div class="op-card"><h2>账号与数据边界</h2><p>教学权限按课程或班级分配。私人对话和个人笔记仅本人可见。</p><p>模型密钥由服务器保存。账号状态与权限变更需要管理员确认。</p>${btn('signout', '退出平台管理', 'op-outline')}</div>`;
}
function chrome(content, actions = '') {
  const [title, symbol] = navItems[section];
  const subs = {
    models: '配置模型映射、连接与用量规则',
    accounts: '为账号分配角色、课程与数据访问范围。',
    overview: '查看课程、账号与模型概况。',
    settings: '管理会话与数据访问范围。',
    logs: '查看已保存的模型连接测试记录。',
  };
  const sidebar = `<aside class="op-side"><nav aria-label="平台导航">${Object.entries(navItems)
    .map(([k, [v, g]]) =>
      btn('nav', icon(g) + '<span>' + v + '</span>', section === k ? 'on' : '', `data-value="${k}"`),
    )
    .join(
      '',
    )}</nav><div class="op-side-bottom">${btn('nav', icon('settings') + ' 设置与帮助', '', 'data-value="settings"')}${btn('signout', av('管') + ' 退出管理')}</div></aside>`;
  return `<div class="op-layout">${sidebar}<main class="op-work ${panel ? 'has-panel' : ''}"><div class="op-crumb">平台管理 <span>›</span> <b>${title}</b></div><div class="op-heading">${section === 'accounts' ? '<span class="op-feature">' + icon(symbol) + '</span>' : ''}<div><h1>${title}</h1><p>${subs[section]}</p></div><div class="op-head-actions">${actions}</div></div>${content}</main>${panel ? panelHTML() : ''}</div>${confirmation ? confirmHTML() : ''}`;
}
function lastProbe(m) {
  return data.probes.find((p) => [m.id, m.model, m.label].filter(Boolean).includes(p.model));
}
const probeStatus = (p) =>
  p ? badge(p.ok ? '已连接' : '测试失败', p.ok ? 'good' : 'bad') : badge('待测试');
function providerForm() {
  const m = draft.mappings.find((m) => m.id === activeModel);
  const p = m && lastProbe(m);
  return `<section class="op-card"><h2>服务商连接</h2>${m ? '<p>当前映射 · ' + h(m.label || m.model || '新模型') + '</p>' : ''}${input('服务商', 'provider', `<select data-map="provider" data-id="${h(activeModel)}" ${m ? '' : 'disabled'}>${opts(providers, m?.provider || 'auto')}</select>`)}${input('Base URL', 'host', `<output class="op-output">${h(data.provider?.host || '由服务端部署提供')}</output>`)}${input('API Key', 'key', `<div class="op-key">${changingKey ? '<input type="password" autocomplete="new-password" id="op-new-key" placeholder="输入新的服务端密钥">' : `<output class="op-output">${draft.hasKey || data.configured ? '••••••••••••••••' : '尚未配置独立密钥'}</output>`}${btn('key', changingKey ? '取消' : '更换密钥', 'op-outline')}</div>`)}<small class="op-hint">密钥仅在服务端保存，前端不返回明文。</small><div class="op-test-line"><b>测试结果</b> ${probeStatus(p)}${btn('probe', '测试连接', 'op-outline')}</div><div class="op-note">连接状态以已保存配置的实际测试为准。</div></section>`;
}
function limitCard(keys, title) {
  return `<section class="op-card"><h2>${title}</h2>${keys
    .map((k) => {
      const [label, unit, min] = limits[k];
      return input(
        label,
        k,
        `<div class="op-unit"><input data-limit="${k}" type="number" min="${min}" step="1" value="${h(draft[k] ?? '')}"><span>${unit}</span></div>`,
      );
    })
    .join(
      '',
    )}${keys.includes('daily') ? '<div class="op-note">额度达到上限后暂停请求。月度预算填 0 表示不设限。</div>' : ''}</section>`;
}
function safetyCard() {
  return `<section class="op-card"><h2>安全与日志</h2><ul class="op-safe"><li>服务端保存密钥</li><li>测试记录保留连接状态与耗时</li><li>前端仅显示掩码</li></ul></section>`;
}
function mapCard() {
  return `<section class="op-card"><h2>模型映射</h2><p>展示名称与真实接口名称可分别设置。</p><div class="op-table-scroll"><table class="op-modeltable"><thead><tr><th>展示名称</th><th>接口模型 ID</th><th>状态</th><th>默认</th><th>操作</th></tr></thead><tbody>${draft.mappings.map((m) => `<tr class="${m.id === activeModel ? 'op-map-current' : ''}"><td><input data-map="label" aria-label="展示名称" data-id="${h(m.id)}" value="${h(m.label)}"></td><td><input data-map="model" aria-label="接口模型 ID" data-id="${h(m.id)}" value="${h(m.model)}" placeholder="接口模型 ID"></td><td>${probeStatus(lastProbe(m))}</td><td><input aria-label="默认模型 ${h(m.label)}" type="radio" name="op-default" data-default="${h(m.id)}"${checked(draft.defaultId === m.id)}></td><td>${btn('map-edit', '设置服务商', 'op-link', `data-id="${h(m.id)}"`)}${btn('map-remove', '移除', 'op-link', `data-id="${h(m.id)}"`)}</td></tr>`).join('') || '<tr><td colspan="5" class="op-empty">尚未添加模型映射</td></tr>'}</tbody></table></div>${btn('map-add', '＋ 添加模型', 'op-outline')}</section>`;
}
function probesCard() {
  return `<section class="op-card"><div class="op-card-title"><h2>连接测试记录</h2>${btn('refresh', '刷新记录', 'op-outline')}</div><div class="op-table-scroll"><table><thead><tr><th>测试时间</th><th>模型</th><th>状态</th><th>耗时</th><th>测试结果</th></tr></thead><tbody>${data.probes.map((p) => `<tr><td>${h(Number(p.date) > 0 ? new Date(Number(p.date)).toLocaleString('zh-CN') : p.date || '—')}</td><td>${h(p.model)}</td><td>${probeStatus(p)}</td><td>${Number.isFinite(Number(p.ms)) ? h(p.ms) + ' ms' : '—'}</td><td class="op-proberesult">${h(p.result)}</td></tr>`).join('') || '<tr><td colspan="5" class="op-empty">还没有连接测试记录</td></tr>'}</tbody></table></div></section>`;
}
function modelView() {
  const left = mapCard() + providerForm();
  const right =
    limitCard(['timeout', 'retries', 'concurrent'], '请求控制') +
    limitCard(['daily', 'monthly'], '用量限制') +
    safetyCard();
  const tabs = `<div class="op-tabs">${Object.entries({
    config: '模型配置',
    probe: '连接测试',
    limits: '用量限制',
  })
    .map(([v, t]) => btn('model-tab', t, v === modelTab ? 'active' : '', `data-value="${v}"`))
    .join('')}</div>`;
  const p = data.probes.find((x) => x.model === draft.defaultId) || data.probes[0];
  const actions =
    (dirty ? badge('有未保存的更改') : probeStatus(p)) +
    btn('probe', '测试连接', 'op-outline') +
    btn('model-save', '✓ 保存配置', 'op-primary');
  return chrome(
    tabs +
      (modelTab === 'config'
        ? `<div class="op-model-grid"><div>${left}</div><div>${right}</div></div>`
        : modelTab === 'probe'
          ? providerForm() + probesCard()
          : limitCard(['daily', 'monthly'], '用量限制')) +
      '<p class="op-footnote">' +
      (dirty ? '变更尚未保存。' : '配置已同步。') +
      '</p>',
    actions,
  );
}
function members() {
  const managed = data.accounts.map((a) => {
    const links = data.memberships.filter((m) => String(m.account) === String(a.id));
    const kinds = [
      ...new Set([...(enabled(a.admin) ? ['admin'] : []), ...links.map((m) => m.role)].filter(Boolean)),
    ];
    return {
      id: a.id,
      key: 'account/' + a.id,
      name: a.name,
      active: enabled(a.enabled),
      admin: enabled(a.admin),
      links,
      kinds: kinds.length ? kinds : ['student'],
      scope: links
        .map((m) => roomById(m.room)?.title || m.room)
        .filter(Boolean)
        .join('、'),
    };
  });
  return managed.concat(
    data.students.map((s) => ({
      id: s.id,
      key: 'student/' + s.id,
      name: s.alias || s.name,
      active: enabled(s.enabled),
      legacy: true,
      links: [],
      kinds: ['student'],
      scope: s.title || roomById(s.room)?.title || '',
      room: s.room,
    })),
  );
}
function matches(x) {
  const selectedRoom = roomById(filters.room);
  return (
    (!filters.role || x.kinds.includes(filters.role)) &&
    (!filters.search ||
      String(x.name + ' ' + x.id)
        .toLowerCase()
        .includes(filters.search.trim().toLowerCase())) &&
    (!filters.enabled || (filters.enabled === 'enabled') === x.active) &&
    (!filters.room ||
      x.links.some((m) => String(m.room) === filters.room) ||
      (x.legacy && (String(x.room) === filters.room || x.scope === selectedRoom?.title)))
  );
}
function rowsHTML(list) {
  return (
    list
      .map(
        (x) =>
          `<tr class="${panel?.member === x.key ? 'op-highlight' : ''}"><td><input type="checkbox" aria-label="选择 ${h(x.name)}" data-select="${h(x.key)}"${checked(selected.has(x.key))}></td><td><div class="op-account-name">${av(x.name)}<b>${h(x.name)}</b></div></td><td>${x.kinds.map((k) => badge(roles[k] || k)).join(' ')}</td><td>${h(x.scope || (x.admin ? '平台' : '尚无班级'))}</td><td><span class="op-dot ${x.active ? '' : 'off'}"></span>${x.active ? '正常' : '已停用'}</td><td>${btn('edit-account', icon('edit') + '编辑', 'op-link', `data-key="${h(x.key)}"`)}</td></tr>`,
      )
      .join('') || '<tr><td colspan="6" class="op-empty">没有符合条件的账号</td></tr>'
  );
}
function accountView() {
  const matchesList = members().filter(matches);
  return chrome(
    `<div class="op-row op-createbar">${btn('account-add', '＋ 添加账号', 'op-primary')}${btn('account-import', '⇩ 批量导入', 'op-outline')}<span class="op-batch" id="op-batch"></span></div><div class="op-filters"><label class="op-search">${icon('eye')}<input type="search" aria-label="搜索姓名或账号" data-filter="search" placeholder="搜索姓名或账号" value="${h(filters.search)}"></label><select aria-label="按角色筛选" data-filter="role">${opts({ '': '全部角色', ...roles }, filters.role)}</select><select aria-label="按状态筛选" data-filter="enabled">${opts({ '': '全部状态', enabled: '正常', disabled: '已停用' }, filters.enabled)}</select><select aria-label="按课程或班级筛选" data-filter="room">${roomOptions(filters.room, '全部课程与班级')}</select></div><div class="op-account-table op-table-scroll"><table><thead><tr><th><input aria-label="选中当前结果" type="checkbox" id="op-select-all"></th><th>账号</th><th>角色</th><th>所属范围</th><th>状态</th><th>操作</th></tr></thead><tbody id="op-account-rows">${rowsHTML(matchesList)}</tbody></table></div>`,
  );
}
function updateSelection() {
  const n = selected.size;
  const b = document.querySelector('#op-batch');
  if (b)
    b.innerHTML = n
      ? `已选 ${n} 项 ${btn('batch-enable', '恢复', 'op-link')}${btn('batch-disable', '停用', 'op-link')}`
      : '';
  const all = document.querySelector('#op-select-all');
  const visible = members().filter(matches),
    marked = visible.filter((x) => selected.has(x.key)).length;
  if (all) {
    all.checked = visible.length > 0 && marked === visible.length;
    all.indeterminate = marked > 0 && marked < visible.length;
  }
}
const rightBits = (bits, readOnly = false) =>
  `<div class="op-rights">${rightsList.map(([b, n, ic]) => `<label>${icon(ic)}<span>${n}</span><input aria-label="${n}" role="switch" type="checkbox" data-right="${b}"${checked(!!(bits & b))}${readOnly ? ' disabled' : ''}></label>`).join('')}</div>`;
function accountFields() {
  const p = panel,
    legacy = p.item?.legacy;
  const label = legacy ? '课堂身份' : p.mode === 'create' ? '新账号' : '平台账号';
  const base =
    p.mode === 'create'
      ? `${input('账号名称', 'name', '<input id="op-account-name" name="name" autocomplete="off" required maxlength="80">')}${input('初始密码', 'password', '<input id="op-account-password" type="password" name="password" autocomplete="new-password" required>')}`
      : `<div class="op-person">${av(p.item.name)}<div><b>${h(p.item.name)}</b><small>${label}</small></div></div>`;
  if (legacy)
    return (
      base +
      `<h3>课程访问</h3><p>${h(p.item.scope || '课程学习成员')}</p><p>${p.item.active ? '当前可访问班级课堂。' : '此课堂身份已停用。'}</p><div class="op-note">此账号通过原课堂入口加入。学习记录保留在原班级。</div>`
    );
  return (
    base +
    `${input('角色', 'role', `<select name="role" data-panel-field="role">${opts(roles, p.role)}</select>`)}${input('课程与班级', 'room', `<select name="room" data-panel-field="room">${roomOptions(p.room, p.role === 'admin' ? '平台权限' : '选择课程或班级')}</select>`)}${p.item?.links?.length ? `<div class="op-scopes">${p.item.links.map((m) => btn('scope', h(roomById(m.room)?.title || m.room), 'op-chip ' + (String(p.room) === String(m.room) ? 'selected' : ''), `data-id="${h(m.room)}"`)).join('')}</div>` : ''}<h3>教学权限</h3>${rightBits(p.role === 'teacher' ? p.rights : 0, p.role !== 'teacher')}<h3>隐私边界</h3><div class="op-note">${icon('lock')} 私人对话和个人笔记仅本人可见。</div><h3>平台权限</h3><div class="op-perm ${p.role === 'admin' ? 'granted' : ''}">${icon('settings')} 模型与接口配置<br>${icon('users')} 账号与角色管理</div>`
  );
}
function importPanel() {
  const p = panel;
  return `<p>导入包含账号、初始密码、角色、班级与教学权限的 CSV 或 JSON 文件。</p><div class="op-note">教学权限可使用 0～15 的权限值。管理员拥有平台管理权限。</div><label class="op-upload">选择文件<input type="file" id="op-import-file" accept=".csv,.json,application/json,text/csv"></label>${btn('template', '下载 CSV 模板', 'op-link')}${p.uploadName ? `<h3>${h(p.uploadName)}</h3><p>${p.rows.length} 个账号待添加</p>` : ''}${p.importErrors?.length ? `<div class="op-errors">${p.importErrors.map(h).join('<br>')}</div>` : ''}${p.rows.length ? `<div class="op-table-scroll"><table><thead><tr><th>账号</th><th>角色</th><th>班级</th></tr></thead><tbody>${p.rows.map((r) => `<tr><td>${h(r.name)}</td><td>${h(roles[r.role])}</td><td>${h(roomById(r.room)?.title || '平台')}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
}
function panelHTML() {
  const p = panel,
    title = { edit: '编辑权限', create: '添加账号', import: '批量导入账号' }[p.mode];
  const bottom = p.item
    ? btn(
        'status-account',
        p.item.active ? '停用账号' : '恢复账号',
        'op-link ' + (p.item.active ? 'danger' : ''),
      )
    : '';
  const save =
    p.mode === 'import'
      ? btn(
          'import-save',
          '确认导入',
          'op-primary',
          p.rows.length && !p.importErrors.length ? '' : 'disabled',
        )
      : p.item?.legacy
        ? ''
        : btn('account-save', p.mode === 'create' ? '添加账号' : '保存权限', 'op-primary');
  return `<aside class="op-panel" role="region" aria-label="${title}" tabindex="-1"><div class="op-panel-title"><h2>${title}</h2>${btn('close-panel', '×', 'op-close', 'aria-label="关闭面板"')}</div><div class="op-panel-body">${p.mode === 'import' ? importPanel() : accountFields()}</div><div class="op-panel-actions">${bottom}${btn('close-panel', '取消', 'op-outline')}${save}</div></aside>`;
}
function confirmHTML() {
  return `<div class="op-scrim"><section class="op-dialog" role="alertdialog" aria-modal="true" aria-labelledby="op-confirm-title"><h2 id="op-confirm-title">${h(confirmation.title)}</h2><p>${h(confirmation.text)}</p><div class="op-row">${btn('cancel-confirm', '取消', 'op-outline')}${btn('confirm', confirmation.button || '确认', 'op-primary')}</div></section></div>`;
}
function draw() {
  if (!data) return entry();
  document.body.classList.add('op-in');
  root.innerHTML =
    section === 'models'
      ? modelView()
      : section === 'accounts'
        ? accountView()
        : chrome(section === 'overview' ? overview() : section === 'logs' ? probesCard() : notes());
  const k = document.querySelector('#op-new-key');
  if (k) k.value = newKey;
  if (panel?.mode === 'create') {
    const n = document.querySelector('#op-account-name'),
      pw = document.querySelector('#op-account-password');
    if (n) n.value = panel.name;
    if (pw) pw.value = panel.password;
  }
  if (section === 'accounts') updateSelection();
  if (confirmation) root.querySelector('[data-action="cancel-confirm"]')?.focus();
}
function editMember(x) {
  const l = x.links[0];
  panel = {
    mode: 'edit',
    member: x.key,
    item: x,
    room: l?.room || '',
    role: x.admin ? 'admin' : l?.role || 'student',
    rights: Number(l?.rights) || 0,
    modified: false,
  };
  draw();
  root.querySelector('.op-panel')?.focus();
}
function pickRoom(id) {
  const m = panel.item?.links?.find((m) => String(m.room) === String(id));
  panel.room = id;
  if (m && panel.role !== 'admin') {
    panel.role = m.role;
    panel.rights = Number(m.rights) || 0;
  }
  panel.modified = true;
  draw();
}
function ask(title, text, run, button) {
  const previous = document.activeElement;
  const action = previous?.dataset.action;
  confirmation = { title, text, run, button, action, key: previous?.dataset.key };
  draw();
}
function cancelConfirm() {
  const old = confirmation;
  confirmation = null;
  draw();
  if (old?.action)
    Array.from(root.querySelectorAll('[data-action]'))
      .find((b) => b.dataset.action === old.action && (!old.key || old.key === b.dataset.key))
      ?.focus();
}
async function exclusive(fn, b) {
  if (pending) return;
  pending = true;
  if (b) b.disabled = true;
  root.setAttribute('aria-busy', 'true');
  try {
    await fn();
  } catch (err) {
    message(err.message || '操作失败，请重试。');
  } finally {
    pending = false;
    root.removeAttribute('aria-busy');
    if (b?.isConnected) b.disabled = false;
  }
}
function csvRows(text) {
  const out = [];
  let row = [],
    field = '',
    quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      out.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (quoted) throw Error('CSV 中的双引号未闭合。');
  row.push(field);
  out.push(row);
  return out.filter((r) => r.some((x) => String(x).trim()));
}
function importRows(text, json) {
  let records;
  if (json) {
    let j;
    try {
      j = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch {
      throw Error('JSON 格式有误。');
    }
    records = Array.isArray(j) ? j : j?.rows;
  } else {
    const [headers, ...rows] = csvRows(text);
    if (!headers) throw Error('CSV 文件为空。');
    records = rows.map((a) => Object.fromEntries(headers.map((k, i) => [k.trim(), a[i] ?? ''])));
  }
  if (!Array.isArray(records) || !records.length || records.length > 100)
    throw Error('每次可导入 1～100 个账号。');
  const seen = new Set(data.accounts.map((a) => a.name.toLowerCase())),
    errors = [],
    rows = [];
  records.forEach((x, i) => {
    if (!x || typeof x !== 'object') {
      errors.push('第 ' + (i + 1) + ' 条格式有误。');
      return;
    }
    const name = String(x.name ?? x.账号 ?? x.账号名称 ?? '').trim(),
      pw = String(x.password ?? x.初始密码 ?? ''),
      r = String(x.role ?? x.角色 ?? '').trim();
    const role = Object.keys(roles).find((k) => k === r || roles[k] === r);
    const room = String(x.room ?? x.班级 ?? x.课程 ?? '').trim(),
      roomMatches = data.rooms.filter((v) => String(v.id) === room || v.title === room);
    const bits = Number(x.rights ?? x.教学权限 ?? 0),
      prefix = '第 ' + (i + 1) + ' 条';
    const issues = [];
    if (!name || !pw) issues.push('需要账号与初始密码');
    if (seen.has(name.toLowerCase())) issues.push('账号名称重复');
    if (!role) issues.push('角色无效');
    if ((room || role !== 'admin') && roomMatches.length !== 1)
      issues.push('请填写唯一的课程或班级 ID');
    if (!Number.isInteger(bits) || bits < 0 || bits > 15 || (role !== 'teacher' && bits !== 0))
      issues.push('教学权限无效');
    seen.add(name.toLowerCase());
    if (issues.length) {
      errors.push(prefix + '：' + issues.join('、'));
      return;
    }
    rows.push({
      name,
      password: pw,
      role,
      room: roomMatches[0]?.id || '',
      rights: role === 'teacher' ? bits : 0,
    });
  });
  return { rows, errors };
}
async function loadImport(file) {
  const p = panel;
  if (!file || p?.mode !== 'import') return;
  p.rows = [];
  p.importErrors = [];
  p.uploadName = file.name;
  try {
    if (!/\.(csv|json)$/i.test(file.name) || file.size > 1048576)
      throw Error('请选择 1 MB 以内的 CSV 或 JSON 文件。');
    const raw = new Uint8Array(await file.arrayBuffer());
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    } catch {
      text = new TextDecoder('gb18030').decode(raw);
    }
    const result = importRows(text, /\.json$/i.test(file.name));
    p.rows = result.rows;
    p.importErrors = result.errors;
  } catch (err) {
    p.importErrors = [err.message];
  }
  if (panel === p) {
    draw();
    message(p.importErrors.length ? '请修正文件后重新选择。' : '文件已读取，请核对账号后确认导入。');
  }
}
function signout() {
  token = '';
  data = null;
  draft = null;
  newKey = '';
  changingKey = false;
  dirty = false;
  panel = null;
  confirmation = null;
  activeModel = '';
  selected.clear();
  section = 'models';
  modelTab = 'config';
  filters = { search: '', role: '', enabled: '', room: '' };
  entry();
  message();
}
function draftChanged() {
  if (dirty) return;
  dirty = true;
  const heading = root.querySelector('.op-head-actions .op-pill'),
    foot = root.querySelector('.op-footnote');
  if (heading) {
    heading.textContent = '有未保存的更改';
    heading.className = 'op-pill';
  }
  if (foot) foot.textContent = '变更尚未保存。';
}
function normalizeModels() {
  const models = {
    mappings: draft.mappings.map((m) => ({
      id: m.id,
      label: m.label.trim(),
      model: m.model.trim(),
      provider: m.provider,
    })),
    defaultId: draft.defaultId,
  };
  if (!models.mappings.length || !models.mappings.some((m) => m.id === models.defaultId))
    throw Error('请添加模型并选择默认模型。');
  if (models.mappings.some((m) => !m.label || !m.model || !Object.hasOwn(providers, m.provider)))
    throw Error('每项映射都需要展示名称、接口模型 ID 与服务商。');
  const labels = models.mappings.map((m) => m.label.toLowerCase());
  if (new Set(labels).size !== labels.length) throw Error('请为各模型使用不同的展示名称。');
  for (const [name, [label, , min]] of Object.entries(limits)) {
    const v = Number(draft[name]);
    if (draft[name] === '' || !Number.isSafeInteger(v) || v < min)
      throw Error(label + '需要填写大于等于 ' + min + ' 的整数。');
    models[name] = v;
  }
  return models;
}
async function refreshed(loadModels = false) {
  readState(await api('state'), loadModels);
  draw();
}
async function setEnabled(items, next) {
  const targets = items.filter((x) => x.active !== next);
  if (!targets.length) {
    message('选定账号均已处于目标状态。');
    return;
  }
  ask(
    next ? '恢复账号访问？' : '停用账号访问？',
    (targets.length === 1 ? targets[0].name : targets.length + ' 个账号') +
      (next ? '将恢复原有访问权限。' : '将停止访问已授权的课程，已有学习记录会保留。'),
    async () => {
      let completed = 0,
        failed;
      for (const x of targets) {
        try {
          await api(
            x.legacy ? 'access' : 'account-update',
            x.legacy ? { id: x.id, enabled: next } : { id: x.id, enabled: next, admin: x.admin },
          );
          completed++;
          selected.delete(x.key);
        } catch (err) {
          failed = err;
          break;
        }
      }
      panel = null;
      await refreshed();
      message(
        failed
          ? '已更新 ' + completed + ' 项，后续操作停止。' + failed.message
          : '已' + (next ? '恢复' : '停用') + ' ' + completed + ' 个账号。',
      );
    },
    next ? '确认恢复' : '确认停用',
  );
}
function buildAccount() {
  const p = panel,
    isNew = p.mode === 'create';
  if (isNew && (!p.name.trim() || !p.password)) throw Error('请填写账号名称和初始密码。');
  if (p.role !== 'admin' && !p.room) throw Error('请为此角色选择课程或班级。');
  const access = { role: p.role, room: p.room, rights: p.role === 'teacher' ? p.rights : 0 };
  if (isNew) return { name: p.name.trim(), password: p.password, ...access };
  return {
    id: p.item.id,
    enabled: p.item.active,
    admin: p.role === 'admin',
    ...(p.room
      ? {
          room: p.room,
          role:
            p.role === 'teacher'
              ? 'teacher'
              : p.role === 'student'
                ? 'student'
                : p.item.links.find((m) => String(m.room) === String(p.room))?.role || 'student',
          rights:
            p.role === 'admin'
              ? Number(p.item.links.find((m) => String(m.room) === String(p.room))?.rights) || 0
              : access.rights,
        }
      : {}),
  };
}
function openNew(mode) {
  panel =
    mode === 'create'
      ? { mode, role: 'student', room: '', rights: 0, name: '', password: '', modified: false }
      : { mode, rows: [], uploadName: '', importErrors: [], modified: false };
  message();
  draw();
  root.querySelector('.op-panel')?.focus();
}
function closePanel() {
  const close = () => {
    panel = null;
    draw();
    message();
  };
  if (panel?.modified || (panel?.mode === 'import' && panel.uploadName))
    ask('放弃未保存的编辑？', '关闭后将丢弃本次输入。', close, '放弃编辑');
  else close();
}
root.addEventListener('submit', async (event) => {
  if (event.target.id !== 'auth') return;
  event.preventDefault();
  await exclusive(async () => {
    token =
      identity === 'session'
        ? sessionToken()
        : String(new FormData(event.target).get('code') || '').trim();
    if (!token) throw Error(identity === 'session' ? '请先登录管理员账号。' : '请填写管理员访问码。');
    try {
      readState(await api('state'), true);
      message();
      draw();
    } catch (err) {
      token = '';
      throw err;
    }
  }, event.submitter);
});
root.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.filter === 'search') {
    filters.search = t.value;
    root.querySelector('#op-account-rows').innerHTML = rowsHTML(members().filter(matches));
    updateSelection();
    return;
  }
  if (t.dataset.map && t.tagName === 'INPUT') {
    const m = draft.mappings.find((m) => m.id === t.dataset.id);
    if (m) {
      m[t.dataset.map] = t.value;
      draftChanged();
    }
    return;
  }
  if (t.dataset.limit) {
    draft[t.dataset.limit] = t.value;
    draftChanged();
    return;
  }
  if (t.id === 'op-new-key') {
    newKey = t.value;
    draftChanged();
    return;
  }
  if (t.id === 'op-account-name' || t.id === 'op-account-password') {
    panel[t.name] = t.value;
    panel.modified = true;
  }
});
root.addEventListener('change', (e) => {
  const t = e.target;
  if (pending) return;
  if (t.dataset.filter && t.dataset.filter !== 'search') {
    filters[t.dataset.filter] = t.value;
    draw();
    return;
  }
  if (t.dataset.select) {
    if (t.checked) selected.add(t.dataset.select);
    else selected.delete(t.dataset.select);
    updateSelection();
    return;
  }
  if (t.id === 'op-select-all') {
    members()
      .filter(matches)
      .forEach((x) => {
        if (t.checked) selected.add(x.key);
        else selected.delete(x.key);
      });
    draw();
    return;
  }
  if (t.dataset.default) {
    draft.defaultId = t.dataset.default;
    draftChanged();
    draw();
    return;
  }
  if (t.dataset.map === 'provider') {
    const m = draft.mappings.find((m) => m.id === t.dataset.id);
    if (m) {
      m.provider = t.value;
      draftChanged();
      draw();
    }
    return;
  }
  if (t.dataset.panelField === 'room') {
    pickRoom(t.value);
    return;
  }
  if (t.dataset.panelField === 'role') {
    panel.role = t.value;
    panel.modified = true;
    if (t.value === 'admin' && panel.mode === 'create') panel.room = '';
    draw();
    return;
  }
  if (t.dataset.right) {
    panel.rights = t.checked
      ? panel.rights | Number(t.dataset.right)
      : panel.rights & ~Number(t.dataset.right);
    panel.modified = true;
    return;
  }
  if (t.id === 'op-import-file') void loadImport(t.files[0]);
});
root.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-action]');
  if (!b || b.disabled || pending) return;
  const action = b.dataset.action;
  if (confirmation && !['cancel-confirm', 'confirm'].includes(action)) return;
  try {
    if (action === 'identity') {
      identity = b.dataset.value;
      message();
      entry();
      return;
    }
    if (action === 'cancel-confirm') {
      cancelConfirm();
      return;
    }
    if (action === 'confirm') {
      const task = confirmation.run;
      confirmation = null;
      draw();
      await exclusive(task);
      return;
    }
    if (action === 'signout') {
      if (dirty || panel?.modified) ask('退出平台管理？', '未保存的更改将丢弃。', signout, '退出');
      else signout();
      return;
    }
    if (action === 'nav') {
      const target = b.dataset.value,
        move = () => {
          section = target;
          panel = null;
          selected.clear();
          message();
          draw();
        };
      if (panel?.modified || panel?.uploadName)
        ask('离开编辑？', '当前账号修改尚未保存。', move, '离开');
      else move();
      return;
    }
    if (action === 'model-tab') {
      modelTab = b.dataset.value;
      message();
      draw();
      return;
    }
    if (action === 'key') {
      changingKey = !changingKey;
      newKey = '';
      draw();
      root.querySelector('#op-new-key')?.focus();
      return;
    }
    if (action === 'map-add') {
      const id = 'm-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)).slice(0, 12);
      draft.mappings.push({ id, label: '', model: '', provider: 'auto' });
      activeModel = id;
      if (!draft.defaultId) draft.defaultId = id;
      draftChanged();
      draw();
      Array.from(root.querySelectorAll('[data-map="label"]')).at(-1)?.focus();
      return;
    }
    if (action === 'map-edit') {
      activeModel = b.dataset.id;
      draw();
      root.querySelector('select[data-map="provider"]')?.focus();
      return;
    }
    if (action === 'map-remove') {
      const id = b.dataset.id,
        row = draft.mappings.find((m) => m.id === id);
      ask(
        '移除模型映射？',
        (row.label || '该映射') + '将在保存配置后移除。',
        () => {
          draft.mappings = draft.mappings.filter((m) => m.id !== id);
          if (draft.defaultId === id) draft.defaultId = draft.mappings[0]?.id || '';
          if (activeModel === id) activeModel = draft.defaultId;
          draftChanged();
          draw();
        },
        '移除',
      );
      return;
    }
    if (action === 'model-save') {
      const models = normalizeModels();
      if (changingKey && !newKey.trim()) throw Error('请填写新密钥，或取消更换密钥。');
      await exclusive(async () => {
        await api('model-save', { models, ...(changingKey ? { key: newKey.trim() } : {}) });
        newKey = '';
        changingKey = false;
        await refreshed(true);
        message('模型配置已保存。');
      }, b);
      return;
    }
    if (action === 'probe') {
      const id = activeModel || data.models?.defaultId;
      if (id && !data.models?.mappings?.find((m) => m.id === id))
        throw Error('请先保存新增的模型映射，再进行连接测试。');
      await exclusive(async () => {
        message('正在测试已保存的模型连接…');
        const result = await api('probe', id ? { id } : {});
        await refreshed();
        message(
          (result.ok ? '连接成功' : '连接失败') +
            ' · ' +
            String(result.ms ?? '—') +
            ' ms　' +
            String(result.result || ''),
        );
      }, b);
      return;
    }
    if (action === 'refresh') {
      await exclusive(async () => {
        await refreshed();
        message('测试记录已更新。');
      }, b);
      return;
    }
    if (action === 'account-add' || action === 'account-import' || action === 'edit-account') {
      const go = () => {
        if (action === 'edit-account') {
          const x = members().find((x) => x.key === b.dataset.key);
          if (x) editMember(x);
        } else openNew(action === 'account-add' ? 'create' : 'import');
      };
      if (panel?.modified || panel?.uploadName) ask('切换编辑对象？', '当前输入尚未保存。', go, '切换');
      else go();
      return;
    }
    if (action === 'scope') {
      pickRoom(b.dataset.id);
      return;
    }
    if (action === 'close-panel') {
      closePanel();
      return;
    }
    if (action === 'batch-enable' || action === 'batch-disable') {
      await setEnabled(
        members().filter((x) => selected.has(x.key)),
        action === 'batch-enable',
      );
      return;
    }
    if (action === 'status-account') {
      await setEnabled([panel.item], !panel.item.active);
      return;
    }
    if (action === 'account-save') {
      const payload = buildAccount(),
        creating = panel.mode === 'create';
      ask(
        creating ? '添加账号？' : '保存权限变更？',
        creating
          ? payload.name + ' 将获得' + roles[payload.role] + '角色。'
          : panel.item.name + ' 的新权限将在保存后生效。',
        async () => {
          await api(
            creating ? 'account-create' : 'account-update',
            creating ? { rows: [payload] } : payload,
          );
          panel = null;
          await refreshed();
          message(creating ? '账号已创建。' : '账号权限已保存。');
        },
        creating ? '确认添加' : '保存权限',
      );
      return;
    }
    if (action === 'import-save') {
      if (!panel.rows.length || panel.importErrors.length) return;
      const rows = panel.rows;
      ask(
        '确认导入账号？',
        '本次将创建 ' + rows.length + ' 个账号并授予所选权限。',
        async () => {
          await api('account-create', { rows });
          panel = null;
          await refreshed();
          message('已导入 ' + rows.length + ' 个账号。');
        },
        '确认导入',
      );
      return;
    }
    if (action === 'template') {
      const contents = '\uFEFF账号,初始密码,角色,班级,教学权限\r\n';
      const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = '平台账号导入模板.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
    }
  } catch (err) {
    message(err.message || '操作未完成。');
  }
});
document.addEventListener('keydown', (e) => {
  if (pending) return;
  if (confirmation && e.key === 'Tab') {
    const bb = root.querySelectorAll('.op-dialog button');
    if (e.shiftKey && document.activeElement === bb[0]) {
      e.preventDefault();
      bb[1].focus();
    } else if (!e.shiftKey && document.activeElement === bb[1]) {
      e.preventDefault();
      bb[0].focus();
    }
  }
  if (e.key !== 'Escape') return;
  if (confirmation) cancelConfirm();
  else if (panel) closePanel();
});
message();
entry();
