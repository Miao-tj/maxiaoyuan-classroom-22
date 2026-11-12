import { avatar, esc as h, icon } from './ui.js';

const templates = [
  ['layers', '用例子讲讲实践与认识', '请用一个生活例子讲讲实践与认识的关系。'],
  ['grid', '比较两个容易混淆的概念', '请比较矛盾的普遍性和特殊性，并给出一个生活中的例子。'],
  ['book', '带我练习这一章', '请带我练习实践与认识这一章。'],
  ['edit', '帮我安排今天的复习', '请帮我安排今天的课程复习。'],
];
function control(key, label, value = '', cls = '', more = '') {
  return '<button type="button" class="' + cls + '" data-cw="' + key + '" data-value="' + h(value) + '" ' + more + '>' + label + '</button>';
}
function original(key, label, value = '', cls = '') {
  return '<button type="button" data-action="' + key + '" data-value="' + h(value) + '" class="' + cls + '">' + label + '</button>';
}
function webUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
  }
  const field = document.createElement('textarea');
  field.value = text; field.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0';
  document.body.append(field); field.select();
  try { return document.execCommand('copy'); } finally { field.remove(); }
}

export function createChatWidgets(ctx) {
  const { data, thread, model, busy, save, go, read, study, toast, render, modal } = ctx;
  const snippets = new Map(ctx.course.chapters.flatMap(chapter => chapter.paragraphs.map((p, i) => [p.id, { ...p, module: chapter.module, chapter: chapter.title, ordinal: i + 1 }])));
  const closed = new Set(), drawer = new Map(), positions = new Map();
  let query = '', lastThread = '', menuOpen = false, webOn = false, focusMenu = false;

  const modelRows = () => {
    const status = model(), rows = Array.isArray(status.models) ? status.models.filter(x => x && typeof x.id === 'string' && x.id && typeof x.label === 'string') : [];
    return rows.length ? rows : [{ id: '', label: status.label || '课程模型' }];
  };
  const selectedModel = () => {
    const rows = modelRows();
    return rows.find(x => x.id === data().modelId) || rows.find(x => x.id === model().defaultId) || rows[0];
  };
  const webAvailable = () => data().engine !== 'device' && !!(model().capabilities?.webSearch || model().webSearch === true);
  const caption = () => data().engine === 'device' ? '通义千问 · 设备模型' : selectedModel().label;
  const modelId = () => data().engine === 'device' ? undefined : selectedModel().id || undefined;
  function picker() {
    const rows = [...modelRows().map(row => ({ ...row, kind: 'cloud' })), { id:'device', label:'通义千问 · 设备模型', kind:'device' }];
    return '<div class="cw-picker">' + control('models', '<span>✦</span> ' + h(caption()) + ' ﹀', '', 'cw-model', 'aria-expanded="'+menuOpen+'" aria-haspopup="menu"') +
      (menuOpen ? '<div class="cw-menu" role="menu" aria-label="选择模型"><strong>选择模型</strong>' +
        rows.map((row, i) => {
          const active = row.kind === 'device' ? data().engine === 'device' : data().engine !== 'device' && row.id === selectedModel().id;
          return control('choose-model', '<b>✦</b><span>' + h(row.label) + '<small>' + h(row.kind === 'device' ? '由本设备运行，首次使用需下载模型' : row.description || model().host || '服务端模型') + '</small></span>' + (active ? '✓' : ''), i, 'cw-model-row' + (active ? ' current' : ''), 'role="menuitemradio" aria-checked="'+active+'"');
        }).join('') + '</div>' : '') + '</div>';
  }
  function historyRows() {
    const words = query.trim().toLocaleLowerCase();
    const hits = data().threads.filter(t => !words || [t.draft, ...t.turns.flatMap(x => [x.q,x.a])].some(x => String(x || '').toLocaleLowerCase().includes(words)));
    return hits.map(t => original('switch', icon('chat') + '<span>' + h(t.turns[0]?.q || t.draft || '新对话') + '</span>', t.id, 'cw-entry' + (t.id === thread().id ? ' active' : ''))).join('') ||
      '<p class="cw-empty">没有找到相关对话</p>';
  }
  function history() {
    return '<label class="cw-search">⌕ <input data-cw-search aria-label="搜索历史" placeholder="搜索历史" value="' + h(query) + '"></label><h3>最近对话</h3><div class="cw-history-list">' + historyRows() + '</div>';
  }
  function sourceFor(t) {
    if (!t?.source?.id) return null;
    const p = snippets.get(t.source.id);
    if (!p && !t.source.text && !t.source.quote) return null;
    return { ...p, ...t.source, text: t.source.quote || t.source.text || p?.text || '', title: t.source.title || p?.title || '课程资料' };
  }
  function sourceLabel(s) {
    return s.page ? '第 ' + Number(s.page) + ' 页' : s.ordinal ? '片段 ' + s.ordinal : '引用段落';
  }
  function sourcePanel(t, i) {
    const s = sourceFor(t), links = (Array.isArray(t?.webSources) ? t.webSources : []).filter(x => webUrl(x?.url));
    if (!s && !links.length) return '';
    const checked = txt => '<li><span>✓</span>' + txt + '</li>';
    return '<div class="cw-shade" data-cw="close-source"></div><aside class="cw-source" aria-label="参考资料"><header><h2>参考资料</h2>' +
      control('close-source','×','','cw-x','aria-label="关闭参考资料"') + '</header>' +
      (s ? '<section><small>本轮引用</small><div class="cw-document"><div class="cw-file">' + icon('book') + '<div><b>' + h(s.chapter || s.title) + '</b><span>' +
        h(s.title) + ' · ' + h(sourceLabel(s)) + '</span></div></div><blockquote>' + h(s.text) + '</blockquote>' +
        (snippets.has(s.id) || ctx.canReadSource?.(s) ? control('read', icon('book') + ' 打开原文 ↗',i,'cw-outline') : '') + '</div></section>' : '') +
      (links.length ? '<section><h3>网络资料</h3>' + links.map((link,i) => '<a class="cw-web-ref" target="_blank" rel="noopener noreferrer" href="' + h(webUrl(link.url)) + '">' + (i+1) + '. ' + h(link.title || new URL(link.url).hostname) + ' ↗</a>').join('') + '</section>' : '') +
      '<section><h3>本轮回答依据</h3><ul>' + (s ? checked('检索课程资料') + checked('对齐相关段落') + (snippets.has(s.id) || ctx.canReadSource?.(s) ? checked('返回原文位置') : '') : '') +
      (links.length ? checked('已检索网络资料') : '') + '</ul></section></aside>';
  }
  function findPractice(t, i) {
    const prev = thread().turns.slice(0,i).reverse().find(x => sourceFor(x));
    const s = sourceFor(t) || sourceFor(prev);
    if (!s) return -1;
    return study.questions.findIndex(q => q.snippetIds?.includes(s.id));
  }
  function turnView(t, i) {
    const s = sourceFor(t), web = t.webSources?.some?.(x => webUrl(x?.url)), pending = !t.error && !t.a && busy()?.thread === thread().id && i === thread().turns.length - 1;
    const practiceIntent = /练习|做题|刷题|出题|测验/.test(t.q || '');
    const jump = t.a && !t.error && practiceIntent ? '<div class="cw-jump">' + control('practice', '去练习相关题目 ↗', i, 'primary') + (s ? control('read',icon('book') + ' 阅读相关原文',i,'cw-outline') : '') + '</div>' : '';
    return '<div class="user-turn"><span class="cw-person" aria-hidden="true">' + icon('users') + '</span><div class="bubble">' + h(t.q) + '</div></div>' +
      '<article class="response' + (pending ? ' cw-wait' : '') + '">' + avatar + '<div class="answer"><strong>马小原</strong><p class="answer-text">' +
      h(t.a || (pending ? '正在思考…' : t.error ? '' : '本次回答未完成。')) + '</p>' +
      (t.error ? '<div class="cw-error"><span>'+h(/Failed to fetch|network|fetch failed|连接|未连通/i.test(t.error)?'网络中断，问题已保留':t.error)+'</span>' + control('regenerate','⟳ 重试',i) + (ctx.cloudUrl ? ' <a target="_blank" rel="noopener" href="' + h(ctx.cloudUrl) + '">打开云端课堂 ↗</a>' : '') + '</div>' : '') + jump +
      ((s || web) && !pending && !t.error ? control('source', icon('book') + ' ' + h(s ? (s.chapter || s.title) + ' · ' + sourceLabel(s) : '网络资料'),i,'cw-citation','aria-label="查看本轮参考资料"') : '') +
      (!pending ? '<div class="cw-actions">' + (t.a ? control('copy','▢ 复制',i) : '') + control('regenerate','⟳ 重新生成',i) + (t.a ? control('save-note',icon('star') + ' 收藏到笔记',i) : '') + '</div>' : '') +
      '</div></article>';
  }
  function welcome() {
    return '<div class="cw-welcome">' + avatar + '<h1>今天想聊点什么？</h1><p>课程问题、学习安排，或日常想法，都可以聊聊。</p><div>' +
      templates.map(([glyph,label,q]) => original('prompt',icon(glyph) + '<strong>' + h(label) + '</strong><span>›</span>',q)).join('') + '</div></div>';
  }
  function compose(t) {
    const waiting = busy()?.thread === t.id;
    return '<form id="chat-form" class="cw-composer composer"><div class="cw-input-wrap"><textarea id="question" maxlength="1800" aria-label="输入问题" placeholder="输入你的问题，也可以聊聊日常…">' + h(t.draft || '') +
      '</textarea><small data-cw-draft' + (t.draft && data().keepDraft !== false ? '' : ' hidden') + '>✎ 草稿已保留</small></div><div class="cw-compose-tools"><label class="cw-toggle">' + icon('book') + ' 课程资料 <input id="use-source" type="checkbox" ' +
      (ctx.useSources() ? ' checked' : '') + '><i></i></label><label class="cw-toggle cw-web" title="' + (webAvailable() ? '检索公开网络资料' : '当前模型未配置联网检索') + '">◎ 联网<input data-cw-web type="checkbox"' +
      (webAvailable() && webOn ? ' checked' : '') + (webAvailable() ? '' : ' disabled') + '><i></i></label><span class="cw-key">Enter 发送 · Shift + Enter 换行</span>' +
      (waiting ? original('stop', '■ 停止', '', 'cw-send') : '<button type="submit" class="cw-send" title="发送问题" aria-label="发送问题">➤</button>') + '</div></form>';
  }
  function activePanel(current) {
    let i = drawer.get(current.id);
    if (i === undefined && !closed.has(current.id) && !matchMedia('(max-width:1000px)').matches) {
      i = current.turns.findLastIndex(t => !t.error && t.a && (sourceFor(t) || t.webSources?.length));
    }
    return i >= 0 ? sourcePanel(current.turns[i],i) : '';
  }
  function view() {
    const t = thread(), panel = activePanel(t);
    if (lastThread !== t.id) {lastThread = t.id; menuOpen = false;}
    return '<div class="cw-room room' + (panel ? ' with-source' : '') + '"><aside class="cw-history history">' + original('new','＋ 新建对话','','cw-outline') + history() + '</aside>' +
      '<div class="cw-chat chat"><header class="cw-phone-head">'+control('history',icon('chat'),'','','aria-label="打开历史和课堂菜单"')+'<b><i class="book"></i> 马小原</b>'+original('new',icon('edit'),'','cw-phone-new')+'</header><div class="cw-phone-title">AI 咨询室</div><header class="cw-bar"><span class="cw-crumb">AI 咨询室 <i>›</i> <b>' + h(t.turns[0]?.q || '新对话') + '</b></span>' +
      control('history',icon('chat'),'','cw-history-mobile','aria-label="搜索对话历史"') + '<div data-cw-picker>' + picker() + '</div><span class="cw-lock" title="本机保存对话。发送消息时，所选模型将处理问题与上下文。">' + icon('lock') + ' 本机对话</span>' +
      original('new','＋','','cw-new-mobile') + '</header><div class="cw-stream stream" tabindex="0" aria-label="对话记录">' + (t.turns.length ? t.turns.map(turnView).join('') : welcome()) + '</div>' + compose(t) + '</div>' + panel + '</div>';
  }
  function refreshModel() {
    const el = document.querySelector('[data-cw-picker]'); if (el) el.innerHTML = picker();
    const web = document.querySelector('[data-cw-web]');
    if (web) {web.disabled = !webAvailable(); web.checked = webAvailable() && webOn; web.parentElement.title = webAvailable() ? '检索公开网络资料' : '当前模型未配置联网检索';}
  }
  function mount() {
    const el = document.querySelector('.cw-stream');
    if (!el) {document.body.classList.remove('cw-keyboard');return;}
    const t = thread(), old = positions.get(t.id);
    el.scrollTop = old && old.fromEnd > 90 && old.length === t.turns.length ? old.top : el.scrollHeight;
    const record = () => positions.set(t.id,{top:el.scrollTop,fromEnd:el.scrollHeight-el.scrollTop-el.clientHeight,length:t.turns.length});
    el.addEventListener('scroll',record,{passive:true});
    if (focusMenu) { focusMenu = false; document.querySelector('.cw-menu .current, .cw-menu button')?.focus(); }
  }
  function historySearch(e) {
    query = e.target.value;
    document.querySelectorAll('.cw-history-list').forEach(list => { list.innerHTML = historyRows(); });
  }
  document.addEventListener('input',e => {
    if (e.target.matches('[data-cw-search]')) historySearch(e);
    if (e.target.id === 'question') {
      const chip = document.querySelector('[data-cw-draft]'); if (chip) chip.hidden = !e.target.value || data().keepDraft === false;
    }
  });
  document.addEventListener('change',e => { if (e.target.matches('[data-cw-web]')) webOn = webAvailable() && e.target.checked; });
  document.addEventListener('click',async e => {
    if (menuOpen && !e.target.closest('.cw-picker')) {menuOpen=false;refreshModel();}
    const b=e.target.closest('[data-cw]'); if(!b) return;
    const id=b.dataset.cw, i=Number(b.dataset.value), t=thread(), turn=t.turns[i];
    if(id==='models') {menuOpen=!menuOpen;refreshModel();if(menuOpen)document.querySelector('.cw-menu .current, .cw-menu button')?.focus();else document.querySelector('.cw-model')?.focus();return;}
    if(id==='choose-model') {
      const rows=modelRows(); if(i<0||i>rows.length)return;
      data().engine=i===rows.length?'device':'cloud';
      if(i<rows.length)data().modelId=rows[i].id;
      menuOpen=false;save();refreshModel();document.querySelector('.cw-model')?.focus();return;
    }
    if(id==='history') {modal('历史对话', '<div class="cw-modal-history">'+original('new','＋ 新建对话','','cw-outline')+history()+'<footer><a href="./classroom.html">班级课堂</a>　<a href="./assignment-review.html">作业评阅</a>　'+original('share','扫码进入')+'</footer></div>');document.querySelector('dialog [data-cw-search]')?.focus();return;}
    if(id==='close-source') {drawer.delete(t.id);closed.add(t.id);render();document.querySelector('.cw-citation')?.focus();return;}
    if(!turn) return;
    const s=sourceFor(turn);
    if(id==='source') {drawer.set(t.id,i);closed.delete(t.id);render();document.querySelector('.cw-source .cw-x')?.focus();return;}
    if(id==='read' && s) {if(ctx.canReadSource?.(s))ctx.readSource(s);else read(s.id);return;}
    if(id==='practice') {const idx=findPractice(turn,i);if(idx>=0)study.openQuestion(idx);else go('exercises');return;}
    if(id==='copy') {try {toast(await copyText(turn.a)?'回答已复制':'复制未完成，请选中回答复制。');}catch{toast('请选中回答复制。');}return;}
    if(id==='regenerate') {if(busy())return toast('请先停止正在生成的回答。');ctx.regenerate(i);return;}
    if(id==='save-note') study.openNote((turn.q||'对话笔记').slice(0,60),turn.a,'',{origin:'chat',module:s?.module,source:s?{id:s.id,page:s.page,quote:s.text}:undefined});
  });
  document.addEventListener('keydown',e => {
    if(e.key==='Escape' && menuOpen){menuOpen=false;refreshModel();document.querySelector('.cw-model')?.focus();return;}
    if(e.key==='Escape' && document.querySelector('.cw-source')){document.querySelector('.cw-source .cw-x')?.click();return;}
    if(e.target.closest('.cw-menu') && ['ArrowUp','ArrowDown','Home','End'].includes(e.key)){
      const items=Array.from(document.querySelectorAll('.cw-menu [role=menuitemradio]')),idx=items.indexOf(e.target);
      e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(idx+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
    }
  });
  function sizeKeyboard() {
    const v=window.visualViewport;
    const raised=!!v && matchMedia('(max-width:760px)').matches && document.activeElement?.id==='question' && Math.max(window.innerHeight,document.documentElement.clientHeight)-v.height>120;
    document.body.classList.toggle('cw-keyboard',raised);
    document.documentElement.style.setProperty('--cw-viewport',(v?.height || innerHeight)+'px');
  }
  window.visualViewport?.addEventListener('resize',sizeKeyboard,{passive:true});
  window.addEventListener('focusin',sizeKeyboard);window.addEventListener('focusout',sizeKeyboard);
  return {view,mount,refreshModel,modelId,webSearch:()=>webAvailable()&&webOn,caption};
}

