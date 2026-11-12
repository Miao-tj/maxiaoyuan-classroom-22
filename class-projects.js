import { esc as h, icon } from './ui.js';
import { preparePDF } from './course-pdf.js';
const labels = {
  pending: '待审核',
  published: '已通过',
  accepted: '仅教师可见',
  returned: '已退回',
};
const uid = () => crypto.randomUUID().replaceAll('-', '');
const btn = (op, text, arg = '', cls = '') =>
  '<button type="button" class="' +
  cls +
  '" data-project="' +
  op +
  '" data-value="' +
  h(arg) +
  '">' +
  text +
  '</button>';
const field = (title, control) => '<label class="field">' + title + control + '</label>';
const check = (name, title, val) =>
  '<label class="permission"><input type="checkbox" name="' +
  name +
  '" ' +
  (val ? 'checked' : '') +
  '><span>' +
  title +
  '</span></label>';
const typeLabel = (w) =>
  w.files?.some((f) => f.mime === 'application/pdf') ? 'PDF' : w.files?.length ? '视频' : '文字';
const frame = (w, n) =>
  '<div class="project-cover c' +
  (n % 3) +
  '"><span>' +
  h(w.title) +
  '</span><small>' +
  h(w.topic || '马克思主义基本原理') +
  ' · ' +
  h(w.team || '课程作品') +
  '</small></div>';
const seen = new Map();
const covers = new Map(),
  draftCovers = new WeakMap();
let database;
async function draftDB() {
  if (!database)
    database = new Promise((ok, fail) => {
      const r = indexedDB.open('mxy-project-drafts', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('drafts');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
  return database;
}
async function draftRecord(key, mode, value) {
  const db = await draftDB();
  return new Promise((ok, fail) => {
    const tx = db.transaction('drafts', mode === 'get' ? 'readonly' : 'readwrite');
    const st = tx.objectStore('drafts');
    const r = mode === 'get' ? st.get(key) : mode === 'put' ? st.put(value, key) : st.delete(key);
    tx.oncomplete = () => ok(r.result);
    tx.onerror = () => fail(tx.error);
  });
}
export function createProjects(ctx) {
  let active = '',
    view = 'gallery',
    filter = 'all',
    q = '',
    type = '',
    sort = 'new',
    page = 1,
    step = 1,
    draft,
    sourceFiles = {},
    draftKey = '',
    saving = false,
    roster=[],scopeTopic='', revision = '',
    mediaTab = '',
    member = '',
    lastDraftWrite = Promise.resolve();
  const room = () => ctx.room(),
    teacher = () => room().role === 'teacher',
    me = () => ctx.token(),
    own = (w) => teacher() || w.mine,
    stars = () => JSON.parse(localStorage.getItem('mxy-work-stars-' + me()) || '[]');
  const value = (id) => room().works.find((x) => x.id === id);
  const fresh = () => ({
    requestId: uid(),
    title: '',
    body: '',
    topic: '',
    team: '',
    share: false,scope:'course',members:[],
    attributed: false,
    downloadable: false,
  });
  function syncScope() {
    if (member !== me()) {
      member = me();
      view = 'gallery';
      filter = 'all';
      active = '';
      draft = undefined;
      sourceFiles = {};
      q = '';
      page = 1;
      revision = '';
    }
  }
  function header(title, right = '') {
    return (
      '<div class="project-head"><div><small>小组成果　/　' +
      (teacher() ? '成果审核' : '作品广场') +
      '</small><h1>' +
      title +
      '</h1></div><div>' +
      right +
      '</div></div>'
    );
  }
  function render() {
    syncScope();
    if (view === 'submit' && !teacher()) return editor();
    if (view === 'detail' && value(active)) return detail(value(active));
    return teacher() ? queue() : gallery();
  }
  function match(rows) {
    return rows.filter(
      (w) =>
        (w.title + ' ' + w.team + ' ' + w.topic).toLowerCase().includes(q.toLowerCase()) &&
        (!type || type === typeLabel(w)) && (!scopeTopic || w.topic===scopeTopic),
    );
  }
  function card(w, i) {
    const saved = stars().includes(w.id);
    return (
      '<article class="project-card" data-cover-id="' +
      h(w.files?.find((f) => f.mime === 'application/pdf')?.id || '') +
      '">' +
      frame(w, i) +
      '<div><h3>' +
      h(w.title) +
      '</h3><span class="tag">' +
      typeLabel(w) +
      '</span> <small>' +
      h(w.team || '课程作品') +
      '　' +
      h(w.topic) +
      '</small><p>' +
      h(w.body.slice(0, 75)) +
      '</p><footer><small>' +
      labels[w.status] +
      '</small>' +
      btn('star', saved ? '♥' : '♡', w.id, 'heart') +
      btn('detail', '查看详情 →', w.id, 'text-link') +
      '</footer></div></article>'
    );
  }
  function gallery() {
    const filtered = match(
      room().works.filter((w) =>
        filter === 'mine'
          ? w.mine || w.members?.some(m=>m.mine)
          : filter === 'featured'?w.featured && w.status==='published': filter === 'requests'?w.members?.some(m=>m.mine && m.approved!==1):filter === 'saved'
            ? stars().includes(w.id)
            : w.status === 'published',
      ),
    );
    filtered.sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title, 'zh-CN')
        : (b.submitted || 0) - (a.submitted || 0),
    );
    const pages = Math.max(1, Math.ceil(filtered.length / 6));
    page = Math.min(page, pages);
    return (
      header(
        '小组成果',
        '<a class="btn" href="./showcase.html">公开广场</a> '+btn('mine', '我的作品') + ' ' + btn('submit', '＋ 提交作品', '', 'primary'),
      ) +
      '<div class="project-filters"><input type="search" data-search aria-label="搜索作品" placeholder="搜索作品、主题或小组" value="' +
      h(q) +
      '"><select data-filtertype aria-label="作品类型">' +
      ['', 'PDF', '视频', '文字']
        .map(
          (t) =>
            '<option ' +
            (type === t ? 'selected' : '') +
            ' value="' +
            t +
            '">' +
            (t || '全部类型') +
            '</option>',
        )
        .join('') +
      '</select><select data-topic aria-label="主题筛选"><option value="">全部主题</option>'+[...new Set(room().works.map(w=>w.topic).filter(Boolean))].map(x=>'<option '+(scopeTopic===x?'selected':'')+'>'+h(x)+'</option>').join('')+'</select><select data-sort aria-label="排序"><option value="new">最新发布</option><option value="title" ' +
      (sort === 'title' ? 'selected' : '') +
      '>按标题</option></select></div><nav class="project-tabs">' +
      [
        ['all', '全部作品'],['featured','精选作品'],['requests','待我授权'],
        ['mine', '我的作品'],
        ['saved', '我收藏的'],
      ]
        .map(([id, name]) => btn('filter', name, id, filter === id ? 'active' : ''))
        .join('') +
      '</nav><div class="scope-strip">' +
      icon('lock') +
      ' 当前范围：本课程可见 · 仅展示已审核且已获授权的作品</div><div class="project-cards">' +
      filtered
        .slice((page - 1) * 6, page * 6)
        .map(card)
        .join('') +
      '</div>' +
      (!filtered.length ? '<div class="project-empty">目前没有符合条件的作品。</div>' : '') +
      '<footer class="project-pager"><span>共 ' +
      filtered.length +
      ' 个作品</span>' +
      btn('page', '‹', Math.max(1, page - 1)) +
      page +
      ' / ' +
      pages +
      btn('page', '›', Math.min(pages, page + 1)) +
      '</footer>'
    );
  }
  function preview(w) {
    const files = w.files || [],
      chosen =
        files.find((f) => f.id === mediaTab) ||
        files.find((f) => f.mime === 'application/pdf') ||
        files[0];
    return (
      '<div class="asset-view"><nav class="project-tabs">' +
      files
        .map((f) =>
          btn(
            'filetab',
            f.mime === 'video/mp4' ? '讲解视频' : '演示文稿',
            f.id,
            chosen?.id === f.id && mediaTab !== 'about' ? 'active' : '',
          ),
        )
        .join('') +
      (teacher()||w.mine?btn('work-history','提交与审阅记录','',mediaTab==='history'?'active':''):'')+
      btn('about', '作品介绍', '', mediaTab === 'about' || !files.length ? 'active' : '') +
      '</nav>' +
      (mediaTab==='history'?'<article class="work-paper"><h3>提交与审阅记录</h3><p>最近提交 · '+(w.submitted?new Date(w.submitted).toLocaleString():'早期记录')+'</p>'+(w.history||[]).map(t=>'<p><b>'+h(labels[t.status])+'</b> · '+new Date(t.date).toLocaleString()+'<br>'+h(t.feedback)+'</p>').join('')+'</article>':mediaTab === 'about' || !chosen
        ? '<article class="work-paper"><small>' +
          h(w.topic || '课程作品') +
          '</small><h2>' +
          h(w.title) +
          '</h2><p>' +
          h(w.body) +
          '</p></article>'
        : '<div class="asset-stage" data-show-file="' +
          h(chosen.id) +
          '"><p>正在准备预览…</p></div>') +
      '</div>'
    );
  }
  function signatures(w){
    const members=w.members||[],mine=members.find(m=>m.mine);
    const sharing=w.scope==='public'?'全站公开':w.consent?'本课程':'仅教师收阅';
    return '<section class="card"><h3>成员展示授权</h3><p>申请范围 · '+sharing+'</p>'+(!members.length?'<small>由作品提交人独立授权。</small>':members.map(m=>'<p>'+h(m.alias)+'　<span class="tag">'+(m.approved===1?'已同意':m.approved<0?'已拒绝':'待确认')+'</span> '+(m.attributed?'署名':'匿名')+'</p>').join(''))+
      (mine&&['pending','returned','published'].includes(w.status)?'<form data-project-form="sign">'+check('attributed','展示我的课堂称呼',mine.attributed)+check('download','允许作品原件下载',mine.download)+'<button value="decline">拒绝展示</button> <button class="primary" value="approve">同意上述范围</button></form>':'')+'</section>';
  }
  function rights(w) {
    return (
      '<section class="card rights"><h3>作品信息</h3><p>' +
      h(w.body) +
      '</p><dl><dt>课程主题</dt><dd>' +
      h(w.topic || '未填写') +
      '</dd><dt>小组</dt><dd>' +
      h(w.team || '个人提交') +
      '</dd><dt>提交人</dt><dd>' +
      h(w.alias || '匿名') +
      '</dd></dl><hr><h3>可见与下载</h3><p>' +
      icon('lock') +
      ' ' +
      (w.scope==='public'?'审核后向公众展示':w.consent?'本课程可见（审核通过后）':'仅提交者与教师可见') +
      '</p><p>' +
      (w.attributed ? '允许展示课堂称呼' : '匿名展示') +
      '</p><p>' +
      (w.effectiveDownload ? '允许下载原文件' : '原文件下载已关闭') +
      '</p>' +
      (w.files || [])
        .map((f) => (w.effectiveDownload || own(w) ? btn('download', '下载 ' + h(f.name), f.id) : ''))
        .join(' ') +
      '</section>'
    );
  }
  function detail(w) {
    return (
      header('作品详情', btn('back', '← 返回作品广场')) +
      '<div class="project-head small"><div><h2>' +
      h(w.title) +
      '</h2><small>' +
      h(w.team || '课程作品') +
      '　·　' +
      labels[w.status] +
      '</small></div>' +
      btn('star', stars().includes(w.id) ? '♥ 已收藏' : '♡ 收藏作品', w.id) +
      '</div><div class="work-detail"><div>' +
      preview(w) +
      '<section class="card"><h3>作品简介</h3><p>' +
      h(w.body) +
      '</p>' +
      (w.feedback ? '<h3>教师评语</h3><p>' + h(w.feedback) + '</p>' : '') +
      '</section><div class="row">'+btn('learn-note','记学习笔记',w.id)+' '+btn('learn-ask','问马小原',w.id)+'</div></div><div>' +
      signatures(w)+rights(w) +
      (w.mine && w.status === 'returned' ? btn('revise', '修改后重新提交', w.id, 'primary') : '') +
      '</div></div>'
    );
  }
  function group(w) {
    return w.status === 'accepted' || w.status === 'published' ? 'passed' : w.status;
  }
  function queue() {
    if (!['pending', 'passed', 'returned'].includes(filter)) filter = 'pending';
    const rows = match(room().works.filter((w) => group(w) === filter));
    const w = rows.find((x) => x.id === active) || rows[0];
    if (w && active !== w.id) {
      active = w.id;
      mediaTab = '';
    }
    return (
      header('成果审核') +
      '<nav class="project-tabs">' +
      [
        ['pending', '待审核'],
        ['passed', '已通过'],
        ['returned', '已退回'],
      ]
        .map(([id, name]) =>
          btn(
            'filter',
            name + ' ' + room().works.filter((x) => group(x) === id).length,
            id,
            filter === id ? 'active' : '',
          ),
        )
        .join('') +
      '</nav><div class="review-layout"><div class="review-queue"><input data-search type="search" aria-label="搜索作品" placeholder="搜索作品" value="' +
      h(q) +
      '">' +
      rows
        .map((x) =>
          btn(
            'pick',
            '<b>' + h(x.title) + '</b><small>' + h(x.team || x.alias || '课程作品') + '</small>',
            x.id,
            x.id === active ? 'active' : '',
          ),
        )
        .join('') +
      (!rows.length ? '<p>这一栏暂时没有作品。</p>' : '') +
      '</div>' +
      (w
        ? '<section><h2>' +
          h(w.title) +
          '</h2><small>' +
          h(w.team || '个人提交') +
          '　·　' +
          typeLabel(w) +
          '</small>' +
          preview(w) +
          '<div class="card"><h3>作品摘要</h3><p>' +
          h(w.body) +
          '</p></div></section><aside>' +
          signatures(w)+rights(w) +
          '<form class="card" data-project-form="moderate"><h3>审核与展示</h3>' +
          field(
            '审核意见',
            '<textarea name="feedback" maxlength="1200" rows="4">' + h(w.feedback) + '</textarea>',
          ) +
          '<div class="review-buttons"><button value="returned">退回修改</button><button value="accepted">仅收阅</button>' +
          (w.consent ? '<button class="primary" value="published" '+(w.members?.some(m=>m.approved!==1)?'disabled':'')+'>通过审核并展示</button>' : '')+(w.status==='published'?btn('feature',w.featured?'取消精选':'设为精选',w.id):'') +
          '</div></form></aside>'
        : '') +
      '</div>'
    );
  }
  async function begin(w) {
    if (saving) return;
    roster=(await ctx.api('members')).members;revision = w?.id || '';
    draftKey = me() + '-' + (revision || 'new');
    await lastDraftWrite;
    let local;
    try {
      local = await draftRecord(draftKey, 'get');
    } catch {}
    draft =
      local?.record ||
      (w
        ? {
            ...fresh(),
            ...w,
            share: !!w.consent,members:(w.members||[]).map(m=>m.id),
            attributed: !!w.attributed,
            downloadable: !!w.downloadable,
          }
        : fresh());
    sourceFiles = local?.files || {};
    step = local?.step || 1;
    view = 'submit';
    ctx.redraw();
  }
  function draftSave() {
    if (!draft) return Promise.resolve();
    const key = draftKey,
      v = { record: { ...draft }, files: { ...sourceFiles }, step };
    lastDraftWrite = lastDraftWrite.catch(() => {}).then(() => draftRecord(key, 'put', v));
    return lastDraftWrite;
  }
  function editor() {
    const attached = Object.values(sourceFiles).filter(Boolean);
    const personal =
      field(
        '作品标题',
        '<input name="title" required maxlength="90" value="' + h(draft.title) + '">',
      ) +
      '<div class="project-pair">' +
      field(
        '课程主题',
        '<input name="topic" maxlength="50" value="' +
          h(draft.topic) +
          '" placeholder="例如：认识论">',
      ) +
      field(
        '小组',
        '<input name="team" maxlength="50" value="' +
          h(draft.team) +
          '" placeholder="个人或小组名称">',
      ) +
      '</div>' +
      field(
        '作品简介',
        '<textarea name="body" required maxlength="6500" rows="5">' + h(draft.body) + '</textarea>',
      );
    const upload = (revision?'<p>上一轮教师评语：'+h(value(revision)?.feedback||'无')+'</p><small>选取新文件将替换同类型原附件。</small>':'')+'<h3>上传文件</h3>'+
        field('PDF 演示文稿', '<input type="file" accept="application/pdf,.pdf" data-file="pdf">') +
        field('讲解视频（MP4）', '<input type="file" accept="video/mp4,.mp4" data-file="video">') +
        attached
          .map(
            (f) =>
              '<p class="file-label">' + h(f.name) + ' · ' + Math.ceil(f.size / 1024) + ' KB</p>',
          )
          .join('') +
        '<small>单个文件限 20 MB，提交总量限 24 MB。PDF 将生成前 16 页预览。</small>';
    const permission =
      '<h3>展示与授权</h3>' +
      (revision?'': '<fieldset><legend>共同作者</legend>'+roster.filter(m=>m.id!==room().viewerId).map(m=>'<label><input type="checkbox" data-member="'+h(m.id)+'" '+((draft.members||[]).includes(m.id)?'checked':'')+'> '+h(m.alias)+'</label>').join(' ')+'</fieldset>')+
      field('同意展示后的可见范围','<select name="scope"><option value="course">仅本课程</option><option value="public" '+(draft.scope==='public'?'selected':'')+'>公开作品广场（无需登录）</option></select>')+
      check('share', '允许审核通过后在所选范围展示', draft.share) +
      check('attributed', '允许展示我的课堂称呼', draft.attributed) +
      check('downloadable', '允许其他学生下载原文件', draft.downloadable);
    return (
      header(
        revision ? '修改作品' : '提交作品',
        btn('leave', '返回我的作品') + ' ' + btn('draft', '保存草稿'),
      ) +
      '<ol class="project-steps">' +
      ['作品资料', '展示权限', '预览与提交']
        .map(
          (name, i) =>
            '<li class="' +
            (i + 1 === step ? 'active' : '') +
            '"><b>' +
            (i + 1) +
            '</b>' +
            name +
            '</li>',
        )
        .join('') +
      '</ol><div class="work-detail"><form data-project-form="editor" class="card"><h2>' +
      ['作品资料', '展示与授权', '预览与提交'][step - 1] +
      '</h2>' +
      (step === 1
        ? personal + upload
        : step === 2
          ? '<div class="work-summary"><b>'+h(draft.title)+'</b><p>'+h(draft.team)+' · '+h(draft.topic)+'</p>'+attached.map(f=>'<p>'+h(f.name)+'</p>').join('')+'</div>'+permission
          : '<h3>' +
            h(draft.title) +
            '</h3><p class="answer-text">' +
            h(draft.body) +
            '</p><p>' +
            attached.map((f) => h(f.name)).join(' · ') +
            '</p>') +
      '<p data-edit-status role="status"></p><div class="work-actions">' +
      (step > 1 ? btn('previous', '上一步') : '') +
      '<button class="primary">' +
      (step === 3 ? '提交审核' : '下一步') +
      '</button></div></form><aside><section class="card"><h3>预览效果</h3>' +
      '<div data-draft-cover>' +
      frame(draft, 0) +
      '</div>' +
      '<p data-scope>' +
      (draft.share ? (draft.scope==='public'?'通过审核和全员授权后公开':'通过审核和全员授权后本课程可见') : '仅提交者与教师可见') +
      '</p><p>' +
      (draft.attributed ? '显示课堂称呼' : '匿名展示') +
      '　·　' +
      (draft.downloadable ? '允许下载' : '关闭原文件下载') +
      '</p></section><section class="card"><h3>审核流程</h3><p>提交作品　→　教师审核　→　按授权范围展示</p></section></aside></div>'
    );
  }
  async function readFile(f, mode) {
    const r = await fetch('./api/class/file/' + f.id + '?mode=' + mode, {
      headers: { Authorization: 'Bearer ' + me() },
    });
    if (!r.ok) throw Error((await r.json()).error || '文件读取失败');
    return (mode === 'preview' || mode === 'cover') && f.mime === 'application/pdf'
      ? r.json()
      : r.blob();
  }
  async function hydrate() {
    function paint(box, src) {
      if (!box?.isConnected || !src) return;
      const img = document.createElement('img');
      img.className = 'uploaded-cover';
      img.alt = '作品首页';
      img.src = src;
      box.replaceChildren(img);
      box.classList.add('has-cover');
    }
    for (const card of document.querySelectorAll('.project-card[data-cover-id]')) {
      const id = card.dataset.coverId;
      if (!id) continue;
      const key = me() + id;
      if (!covers.has(key)) {
        if (covers.size > 35) covers.delete(covers.keys().next().value);
        covers.set(
          key,
          readFile({ id, mime: 'application/pdf' }, 'cover').catch(() => {
            covers.delete(key);
            return null;
          }),
        );
      }
      covers.get(key).then((src) => paint(card.querySelector('.project-cover'), src));
    }
    const draftCover = document.querySelector('[data-draft-cover] .project-cover');
    if (draftCover && sourceFiles.pdf) {
      const file = sourceFiles.pdf;
      if (!draftCovers.has(file))
        draftCovers.set(
          file,
          preparePDF(file, 1, () => {})
            .then((x) => x.previews[0])
            .catch(() => null),
        );
      draftCovers.get(file).then((src) => paint(draftCover, src));
    }
    const host = document.querySelector('[data-show-file]');
    if (!host) return;
    const w = value(active);
    const f = w?.files?.find((x) => x.id === host.dataset.showFile);
    if (!f) return;
    try {
      if (f.mime === 'video/mp4') {
        const blob = await readFile(f, 'preview');
        if (!host.isConnected) return;
        const url = URL.createObjectURL(blob);
        host.innerHTML = '<video controls controlslist="nodownload" playsinline></video>';
        host.firstChild.src = url;
        const ob = new MutationObserver(() => {
          if (!host.isConnected) {
            URL.revokeObjectURL(url);
            ob.disconnect();
          }
        });
        ob.observe(document.body, { childList: true, subtree: true });
        return;
      }
      const cacheKey = me() + f.id;
      let pages = seen.get(cacheKey);
      if (!pages) {
        pages = await readFile(f, 'preview');
        if (seen.size >= 4) seen.delete(seen.keys().next().value);
        seen.set(cacheKey, pages);
      }
      if (!host.isConnected) return;
      let n = Math.max(0,Math.min(pages.length-1,Number(sessionStorage.getItem("page:"+cacheKey))||0)),
        zoom = 1;
      host.innerHTML =
        '<div class="thumbs"></div><div class="slides"><div class="slide-main"><img alt="作品原页预览"></div><div class="slide-tools"><button data-slide="-1" aria-label="上一页">‹</button><span></span><button data-slide="1" aria-label="下一页">›</button><button data-size="-.2" aria-label="缩小">−</button><output></output><button data-size=".2" aria-label="放大">＋</button></div></div>';
      const thumbs = host.querySelector('.thumbs');
      thumbs.innerHTML = pages
        .map(
          (_, i) =>
            '<button data-thumb="' +
            i +
            '"><img alt="第 ' +
            (i + 1) +
            ' 页"><small>' +
            (i + 1) +
            '</small></button>',
        )
        .join('');
      for (let i = 0; i < pages.length; i++) thumbs.children[i].firstChild.src = pages[i];
      const draw = () => {
        host.querySelector('.slide-main img').src = pages[n];
        host.querySelector('.slide-main img').style.width = zoom * 100 + '%';
        host.querySelector('.slide-tools span').textContent =
          n +
          1 +
          ' / ' +
          pages.length +
          (f.pages > pages.length ? '（原件 ' + f.pages + ' 页）' : '');
        host.querySelector('output').textContent = Math.round(zoom * 100) + '%';
        Array.from(thumbs.children).forEach((b, i) => b.classList.toggle('active', i === n));
      };
      const tools=host.querySelector('.slide-tools');tools.insertAdjacentHTML('beforeend','<button data-fit>适合页面</button><button data-full>全屏</button>');
      draw();
      host.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-thumb')) n = +b.dataset.thumb;
        if (b.dataset.slide)
          n = Math.min(pages.length - 1, Math.max(0, n + Number(b.dataset.slide)));
        if (b.dataset.size) zoom = Math.max(0.6, Math.min(2, zoom + Number(b.dataset.size)));
        if(b.hasAttribute('data-fit'))zoom=1;
        if(b.hasAttribute('data-full')){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else host.requestFullscreen?.().catch(()=>ctx.notice('此浏览器暂不支持全屏。'));}
        sessionStorage.setItem('page:'+cacheKey,String(n));draw();
      };
    } catch (e) {
      if (host.isConnected) host.textContent = e.message;
    }
  }
  async function click(op, id) {
    if (saving) return;
    if(op==='feature'){const w=value(id);await ctx.api('featured',{id,featured:!w.featured});await ctx.refresh();return;}
    if (op === 'submit' || op === 'revise') {
      await begin(op === 'revise' ? value(id) : null);
      return;
    }
    if (op === 'draft') {
      await draftSave();
      ctx.notice('草稿已保存到此设备。');
      return;
    }
    if (op === 'mine' || op === 'leave') {
      if (view === 'submit') await draftSave();
      filter = 'mine';
      view = 'gallery';
    }
    if(op==='work-history')mediaTab='history';
    if(op==='learn-note'||op==='learn-ask'){
      const w=value(id);if(!w)return;const key='maxiaoyuan-live-22',d=JSON.parse(localStorage.getItem(key)||'null')||{threads:[{id:uid(),draft:'',turns:[]}],notes:[],answers:{},read:{},favorites:[]};
      if(op==='learn-note'){const n={id:uid(),title:w.title,text:w.body,origin:'小组成果',tags:w.topic||'',updated:Date.now()};d.notes=[n,...d.notes||[]];}
      else{const t={id:uid(),draft:'请结合课程原理解释这份作品的论证：'+w.title+'。'+w.body.slice(0,800),turns:[]};d.threads=[t,...d.threads||[]];d.chatThreadId=t.id;}
      localStorage.setItem(key,JSON.stringify(d));location.href='./#'+(op==='learn-note'?'notes':'chat');return;
    }
    if (op === 'back') view = 'gallery';
    if (op === 'detail' || op === 'pick') {
      active = id;
      mediaTab = '';
      if (op === 'detail') view = 'detail';
    }
    if (op === 'filter') {
      filter = id;
      page = 1;
      active = '';
      mediaTab = '';
    }
    if (op === 'star') {
      const s = stars();
      localStorage.setItem(
        'mxy-work-stars-' + me(),
        JSON.stringify(s.includes(id) ? s.filter((x) => x !== id) : [...s, id]),
      );
    }
    if (op === 'page') page = +id;
    if (op === 'previous') {
      step--;
      await draftSave();
    }
    if (op === 'filetab' || op === 'about') mediaTab = op === 'about' ? 'about' : id;
    if (op === 'download') {
      const f = value(active)?.files?.find((x) => x.id === id);
      if (f) {
        const blob = await readFile(f, 'download');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = f.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
      return;
    }
    ctx.redraw();
  }
  async function edit(e) {
    const t = e.target;
    if (t.matches('[data-search]')) {
      q = t.value;
      page = 1;
      ctx.redraw();
      const box = document.querySelector('[data-search]');
      box?.focus();
      return;
    }
    if (t.matches('[data-sort],[data-filtertype],[data-topic]')) {
      if (t.hasAttribute('data-sort')) sort = t.value;
      else if(t.hasAttribute('data-topic'))scopeTopic=t.value;else type = t.value;
      page = 1;
      ctx.redraw();
      return;
    }
    if (!t.closest('[data-project-form=editor]')) return;
    if(t.dataset.member){const ids=new Set(draft.members||[]);if(t.checked)ids.add(t.dataset.member);else ids.delete(t.dataset.member);draft.members=[...ids];}
    else if (t.dataset.file) {
      if (t.files[0]?.size > 20 * 1024 * 1024) {
        t.value = '';
        ctx.notice('单个文件最多 20 MB。');
        return;
      }
      if (t.files[0]) sourceFiles[t.dataset.file] = t.files[0];
    } else if (t.name) draft[t.name] = t.type === 'checkbox' ? t.checked : t.value;
    if (t.type === 'checkbox' || t.type === 'file') ctx.redraw();
    await draftSave();
  }
  async function send(e) {
    const f = e.target;
    if (!f.dataset.projectForm) return;
    e.preventDefault();
    if (saving) return;
    if (f.dataset.projectForm === 'editor' && step < 3) {
      step++;
      await draftSave();
      ctx.redraw();
      return;
    }
    saving = true;
    for (const el of f.querySelectorAll('button')) el.disabled = true;
    try {
      if(f.dataset.projectForm==='sign'){await ctx.api('sign',{id:active,decision:e.submitter.value,attributed:f.elements.attributed.checked,download:f.elements.download.checked});}
      else if (f.dataset.projectForm === 'moderate') {
        await ctx.api('moderate', {
          id: active,
          status: e.submitter.value,
          feedback: f.elements.feedback.value,
        });
      } else {
        const state = f.querySelector('[data-edit-status]'),
          status = (s) => (state.textContent = s);
        if (sourceFiles.pdf || sourceFiles.video) {
          const form = new FormData(),
            record = { ...draft, ...(revision?{id:revision}:{}) };
          if (sourceFiles.pdf) {
            const data = await preparePDF(sourceFiles.pdf, true, status);
            record.pages = data.pages;
            form.set('previews', JSON.stringify(data.previews));
            form.set('pdf', sourceFiles.pdf);
          }
          if (sourceFiles.video) form.set('video', sourceFiles.video);
          form.set('record', JSON.stringify(record));
          status('正在上传至班级课堂…');
          await ctx.api(revision?'revise-files':'submit', form);
        } else if(revision)await ctx.api('revise',{...draft,id:revision});else await ctx.api('submit',draft);
        await lastDraftWrite.catch(() => {});
        await draftRecord(draftKey, 'delete').catch(() => {});
        sourceFiles = {};
        draft = undefined;
        view = 'gallery';
        filter = 'mine';
      }
      await ctx.refresh();
      ctx.notice('已保存到班级课堂。');
    } finally {
      saving = false;
      for (const el of f.querySelectorAll('button')) el.disabled = false;
    }
  }
  return { render, hydrate, click, edit, send };
}
