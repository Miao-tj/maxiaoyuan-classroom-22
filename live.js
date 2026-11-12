import {apiFetch} from './gateway.js';
import course from './content.js';
import {avatar,esc as h,icon} from './ui.js';
import {createWorkspaceIntro} from './workspace-intro.js';
const root=document.querySelector('#app'),dialog=document.querySelector('#menu'),notification=document.querySelector('#feedback');
const key='maxiaoyuan-live-22';
const model={label:'连接中',host:''};
const blank=()=>({id:crypto.randomUUID(),draft:'',turns:[]});
let data;try{data=JSON.parse(localStorage.getItem(key));}catch{}
if(!data||!Array.isArray(data.threads)||!data.threads.length)data={threads:[blank()],notes:[],answers:{},read:{},favorites:[],reduce:false};
let threadId=data.threads[0].id,chapterIndex=0,selected='',busy=null,activeQuiz=0,studySources=true,search='',timer;
const chapter=()=>course.chapters[chapterIndex]||course.chapters[0], thread=()=>data.threads.find(t=>t.id===threadId);
const questions=course.chapters.flatMap(c=>c.questions.map(q=>({...q,chapter:c.title})));
const nav=[['chat','AI 咨询室','chat'],['library','课程学习','book'],['practice','题库练习','edit'],['notes','个人笔记','notes'],['progress','学情分析','chart']];
const route=()=>location.hash.slice(1).split('/')[0]||'chat';
const action=(id,label,v='',cls='')=>'<button type="button" class="'+cls+'" data-action="'+id+'" data-value="'+h(v)+'">'+label+'</button>';
const link=(url,label,cls='')=>'<a class="'+cls+'" href="#'+url+'">'+label+'</a>';
function toast(t){notification.textContent=t;clearTimeout(timer);timer=setTimeout(()=>notification.textContent='',2600);}
function save(){try{localStorage.setItem(key,JSON.stringify(data));}catch{toast('设备存储空间不足，本次记录未保存');}}
function go(page){if(route()===page)render();else location.hash=page;}
function modal(title,contents){dialog.innerHTML='<header class="head"><h2>'+h(title)+'</h2><i class="spacer"></i>'+action('close','关闭')+'</header>'+contents;if(!dialog.open)dialog.showModal();}
function layout(){
 const navLinks=nav.map(([id,name,i])=>link(id,icon(i)+'<span>'+name+'</span>',route()===id||(route()==='reader'&&id==='library')?'on':'')).join('');
 return '<header class="top"><a class="brand" href="#chat"><span class="book"></span><span><b>马小原</b><small>课程学习工作台</small></span></a><span class="course">马克思主义基本原理</span><i class="spacer"></i><a href="./classroom.html" class="btn mobile-only">班级</a><a href="./assignment-review.html" class="btn outline">作业评阅</a>'+action('share','扫码进入','','bare')+'</header><div class="shell"><nav class="rail" aria-label="主导航">'+navLinks+'<a href="./classroom.html">'+icon('users')+' 班级课堂</a><div class="rail-foot">'+action('settings',icon('settings')+' 设置与隐私')+'</div></nav><main class="workspace" id="main"></main></div><nav class="live-mobile" aria-label="移动导航">'+navLinks+'</nav>';
}
function turnView(t,i){return '<div class="user-turn"><div class="bubble">'+h(t.q)+'</div></div><article class="response">'+avatar+'<div class="answer"><strong>马小原</strong><p class="answer-text">'+h(t.a||'正在连接模型…')+'</p>'+(t.error?'<p class="error">'+h(t.error)+'</p>':'')+(t.source?'<div>'+action('open-source',icon('book')+' '+h(t.source.title),t.source.id,'tag')+'</div>':'')+'<div class="actions">'+(t.a?action('save-answer','收藏到笔记',i):'')+action('retry','编辑并重发',i)+'</div></div></article>';}
function chat(){
 const current=thread(),waiting=busy?.thread===current.id;
 const history='<aside class="history">'+action('new','＋ 新建对话','','outline stretch')+'<h3>最近对话</h3>'+data.threads.map(t=>action('switch',icon('chat')+'　'+h(t.turns[0]?.q.slice(0,16)||'新对话'),t.id,'entry '+(t.id===current.id?'selected':''))).join('')+'</aside>';
 const quick=['用生活中的例子解释实践与认识','比较矛盾的普遍性和特殊性','如何用实践检验学习方法？','帮我安排今天的课程复习'];
 const welcome='<div class="welcome"><div class="welcome-mascot">'+avatar+'</div><h1>今天想聊点什么？</h1><p>读原文、辨概念，或把刚才没听懂的问题带进来。</p><div class="prompt-grid">'+quick.map((q,i)=>action('prompt',icon(['book','layers','edit','notes'][i])+'　'+h(q)+'　›',q)).join('')+'</div></div>';
 return '<div class="room">'+history+'<div class="chat"><div class="bar"><span class="crumb">AI 咨询室　›　<b>'+h(current.turns[0]?.q.slice(0,14)||'新对话')+'</b></span><select aria-label="选择回答模型" id="chat-engine"><option value="cloud" '+(data.engine!=='device'?'selected':'')+' id="model-label">'+h(model.label)+'</option><option value="device" '+(data.engine==='device'?'selected':'')+'>通义千问 · 设备模型</option></select>'+action('sessions','历史','','mobile-only')+'</div><div class="stream">'+(current.turns.length?current.turns.map(turnView).join(''):welcome)+'</div><form class="composer" id="chat-form"><textarea aria-label="输入问题" id="question" maxlength="1800" placeholder="发消息给马小原…">'+h(current.draft)+'</textarea><div class="row"><label class="switch-chip"><input id="use-source" type="checkbox" '+(studySources?'checked':'')+'> 课程资料</label><small class="composer-help">'+(data.engine==='device'?'首次下载约 429 MB，此后在本设备推理。':'问题与最近对话将发往 '+h(model.host||'云端模型'))+'</small><i class="spacer"></i>'+(waiting?action('stop','停止','','outline'):'<button class="primary" type="submit">发送 ↑</button>')+'</div></form></div></div>';
}
function contentPage(title,body){return '<div class="page"><div class="head"><h1>'+title+'</h1></div>'+body+'</div>';}
function library(){return contentPage('课程资料','<p>马克思主义基本原理 · 原创课程讲义</p><div class="card"><label class="field">搜索讲义<input type="search" id="find-doc" value="'+h(search)+'" placeholder="输入标题或概念"></label><div id="chapter-list">'+chapterList()+'</div></div>');}
function chapterList(){return course.chapters.map((c,i)=>({c,i})).filter(({c})=>(c.title+c.summary+c.paragraphs.map(p=>p.text).join('')).includes(search)).map(({c,i})=>'<article class="resource"><img src="./assets/course-art/cover-'+(i+1)+'.webp" alt=""><div><strong>'+h(c.title)+'</strong><p>'+h(c.summary)+'</p><small>'+c.paragraphs.length+' 段 · '+(data.read[c.id]?'已打开':'未开始')+'</small></div><i class="spacer"></i>'+action('read','打开阅读',i,'outline')+'</article>').join('')||'<p class="muted">没有找到匹配的讲义。</p>';}
function reader(){const c=chapter();return contentPage(h(c.title),'<div class="row">'+link('library','‹ 课程资料','btn')+'<span class="tag">课程讲义</span></div><article class="card reader-text"><p>'+h(c.summary)+'</p>'+c.paragraphs.map((p,i)=>'<section id="'+h(p.id)+'"><small>第 '+(i+1)+' 段</small><h2>'+h(p.title)+'</h2><p>'+h(p.text)+'</p>'+action('ask-para','问马小原',p.id,'outline')+' '+action('note-para','记笔记',p.id)+'</section>').join('')+'</article>');}
function practice(){const q=questions[activeQuiz],answer=data.answers[q.id];return contentPage('题库练习','<div class="tabs">'+questions.map((_,i)=>action('quiz','第 '+(i+1)+' 题',i,i===activeQuiz?'active':'')).join('')+'</div><article class="card quiz-card"><div class="row"><span class="tag">单选题</span><small>'+h(q.chapter)+'</small><i class="spacer"></i>'+action('fav',data.favorites.includes(q.id)?'★ 已收藏':'☆ 收藏')+'</div><h2>'+h(q.prompt)+'</h2><form id="quiz-form">'+q.options.map(o=>'<label class="option"><input name="answer" type="radio" value="'+h(o.id)+'" '+(answer?.choice===o.id?'checked':'')+(answer?' disabled':'')+'><b>'+h(o.label)+'</b> '+h(o.text)+'</label>').join('')+(answer?'<div class="callout"><strong>'+(answer.correct?'回答正确':'再想一想')+'</strong><p>'+h(q.explanation)+'</p></div>'+action('again','重新作答')+' '+action('quiz','下一题',(activeQuiz+1)%questions.length,'primary'):'<button class="primary">提交答案</button>')+'</form></article>');}
function progress(){const a=Object.values(data.answers),correct=a.filter(x=>x.correct).length;return contentPage('学情分析','<p>根据这台设备的实际答题记录统计。</p><div class="grid3">'+[['已答题目',a.length+' / '+questions.length],['正确率',a.length?Math.round(correct*100/a.length)+'%':'待评估'],['阅读讲义',Object.keys(data.read).length+' 篇']].map(([k,v])=>'<div class="card"><small>'+k+'</small><h2>'+v+'</h2></div>').join('')+'</div><section class="card segment"><h2>章节掌握情况</h2>'+questions.map((q,i)=>'<div class="resource"><strong>'+h(q.chapter)+'</strong><i class="spacer"></i><span>'+(!data.answers[q.id]?'待评估':data.answers[q.id].correct?'已答对':'需复习')+'</span>'+action('quiz',data.answers[q.id]?'回顾':'去练习',i,'outline')+'</div>').join('')+'</section><section class="card segment"><h2>错题与收藏</h2>'+questions.map((q,i)=>data.answers[q.id]?.correct===false||data.favorites.includes(q.id)?action('quiz',h(q.chapter)+' · '+(data.answers[q.id]?.correct===false?'错题':'收藏'),i):'').join('')+(!questions.some(q=>data.answers[q.id]?.correct===false||data.favorites.includes(q.id))?'<p>目前没有错题或收藏。</p>':'')+'</section>');}
function notebook(){return contentPage('个人笔记',action('note','＋ 新建笔记','','primary')+'<section class="note-list">'+(data.notes.length?data.notes.map(n=>'<article class="card"><h2>'+h(n.title)+'</h2><p class="answer-text">'+h(n.text)+'</p>'+action('edit-note','编辑',n.id)+'</article>').join(''):'<p>可以从讲义划词、收藏回答，或写下第一条笔记。</p>')+'</section>');}
function editor(title='',text='',id=''){modal('编辑笔记','<form id="note-form" data-id="'+h(id)+'"><label class="field">标题<input id="note-title" required maxlength="100" value="'+h(title)+'"></label><label class="field">正文<textarea id="note-text" required rows="8" maxlength="9000">'+h(text)+'</textarea></label><button class="primary">保存笔记</button></form>');}
function render(){root.innerHTML=layout();const views={chat,library,reader,practice,notes:notebook,progress};root.querySelector('main').innerHTML=(views[route()]||chat)();document.body.classList.toggle('reduce',!!data.reduce);}
function reference(question){
 if(!studySources)return null;
 if(selected){const ref=course.chapters.flatMap(c=>c.paragraphs).find(p=>p.id===selected);if(ref)return ref;}
 const tokens=[...new Set(question.match(/[\u3400-\u9fff]{2,}/g)?.flatMap(w=>Array.from({length:w.length-1},(_,i)=>w.slice(i,i+2)))||[])];
 const rows=course.chapters.flatMap(c=>c.paragraphs).map(p=>({p,score:tokens.reduce((s,t)=>s+(p.title.includes(t)?3:p.text.includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score);
 return rows[0]?.score>=2?rows[0].p:null;
}
async function send(){
 const t=thread(),q=t.draft.trim();if(!q)return;if(busy){toast('请等待当前回答完成，或在原对话中停止生成。');return;}
 const ref=reference(q),history=t.turns.filter(x=>x.a&&!x.error).slice(-4).map(({q,a})=>({q,a}));
 const turn={q,a:'',source:ref?{id:ref.id,title:ref.title}:null};t.turns.push(turn);t.draft='';selected='';const controller=new AbortController();busy={thread:t.id,controller};save();render();
 const update=()=>{if(threadId!==t.id||route()!=='chat')return;const box=root.querySelector('.stream'),p=box?.querySelector('.response:last-child .answer-text');if(p){const follow=box.scrollHeight-box.scrollTop-box.clientHeight<130;p.textContent=turn.a||turn.status||'正在连接模型…';if(follow)box.scrollTop=box.scrollHeight;}};
 try{if(data.engine==='device'){const {deviceChat}=await import('./device-model.js');turn.a=await deviceChat(q,ref?.text||'',history,{signal:controller.signal,status:s=>{turn.status=s;update();},update:s=>{turn.a=s;update();}});return;}const response=await apiFetch('chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:q,history,source:ref?ref.title+'\n'+ref.text:''}),signal:controller.signal});if(!response.ok)throw Error((await response.json()).error||'发送失败');
 const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',done=false;
 for(;;){const packet=await reader.read();pending+=decoder.decode(packet.value,{stream:!packet.done});const lines=pending.split('\n');pending=lines.pop();for(const line of lines.filter(Boolean)){const e=JSON.parse(line);if(e.type==='error')throw Error(e.message);if(e.type==='answer'){turn.a=e.text;update();}if(e.type==='done')done=true;}if(packet.done)break;}
 if(!done)throw Error('连接中断，可编辑并重发。');
 }catch(e){turn.error=controller.signal.aborted?'已停止生成':e.message;if(!t.draft)t.draft=q;}finally{busy=null;save();render();if(route()==='chat')root.querySelector('.stream')?.lastElementChild?.scrollIntoView({block:'nearest'});}
}
function openRef(id){const k=course.chapters.findIndex(c=>c.paragraphs.some(p=>p.id===id));if(k<0)return;chapterIndex=k;data.read[chapter().id]=true;save();go('reader');setTimeout(()=>document.getElementById(id)?.scrollIntoView({block:'center'}),40);}
const actions={
 close:()=>dialog.close(),new:()=>{if(thread().turns.length||thread().draft){const t=blank();data.threads.unshift(t);threadId=t.id;save();}dialog.close();go('chat');},
 switch:v=>{threadId=v;dialog.close();go('chat');},sessions:()=>modal('最近对话',action('new','＋ 新建对话')+data.threads.map(t=>action('switch',h(t.turns[0]?.q||'新对话'),t.id,'entry')).join('')),
 prompt:v=>{thread().draft=v;save();render();root.querySelector('#question')?.focus();},stop:()=>busy?.controller.abort(),retry:v=>actions.prompt(thread().turns[+v].q),
 'save-answer':v=>{const t=thread().turns[+v];editor(t.q.slice(0,60),t.a);},'open-source':openRef,
 read:v=>{chapterIndex=+v;data.read[chapter().id]=true;save();go('reader');},
 'ask-para':v=>{const p=chapter().paragraphs.find(p=>p.id===v);selected=v;thread().draft='请解释这段话，并举一个例子：'+(window.getSelection()?.toString().trim()||p.text);save();go('chat');},
 'note-para':v=>{const p=chapter().paragraphs.find(p=>p.id===v);editor(p.title,window.getSelection()?.toString().trim()||p.text);},
 note:()=>editor(),'edit-note':v=>{const n=data.notes.find(n=>n.id===v);editor(n.title,n.text,n.id);},
 quiz:v=>{activeQuiz=+v;go('practice');},again:()=>{delete data.answers[questions[activeQuiz].id];save();render();},fav:()=>{const id=questions[activeQuiz].id;data.favorites=data.favorites.includes(id)?data.favorites.filter(x=>x!==id):[...data.favorites,id];save();render();},
 settings:()=>modal('设置与隐私','<p>笔记、对话和答题记录保存在当前浏览器中。咨询时会发送本次问题、最近四轮对话以及启用的讲义片段。</p>'+action('motion',data.reduce?'恢复动效':'减少动态')+' '+action('intro','重播开场动画')),
 motion:()=>{data.reduce=!data.reduce;save();render();actions.settings();},intro:()=>{dialog.close();intro.open();},
 share:()=>modal('手机扫码进入','<img class="qr" src="./assets/entry-qr.png" alt="课程入口二维码"><p>用微信或手机浏览器扫码打开课程。</p>')};
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)actions[b.dataset.action]?.(b.dataset.value);});
document.addEventListener('input',e=>{if(e.target.id==='question'){thread().draft=e.target.value;save();}if(e.target.id==='find-doc'){search=e.target.value;document.querySelector('#chapter-list').innerHTML=chapterList();}});
document.addEventListener('change',e=>{if(e.target.id==='use-source')studySources=e.target.checked;if(e.target.id==='chat-engine'){data.engine=e.target.value;save();render();}});
document.addEventListener('submit',e=>{e.preventDefault();if(e.target.id==='chat-form'){send();}if(e.target.id==='quiz-form'){const q=questions[activeQuiz],choice=new FormData(e.target).get('answer');if(!choice)return toast('请先选择一个答案');data.answers[q.id]={choice,correct:q.answerKeys.includes(choice)};save();render();}if(e.target.id==='note-form'){const id=e.target.dataset.id||crypto.randomUUID(),title=document.querySelector('#note-title').value.trim(),text=document.querySelector('#note-text').value.trim();if(!title||!text)return;data.notes=[{id,title,text},...data.notes.filter(n=>n.id!==id)];save();dialog.close();render();toast('笔记已保存');}});
document.addEventListener('keydown',e=>{if(e.target.id==='question'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}});
window.addEventListener('hashchange',()=>{dialog.close();render();});
const intro=createWorkspaceIntro({reducedMotion:()=>!!data.reduce});render();
try{if(!sessionStorage.getItem('mxy-live-intro')){intro.open();sessionStorage.setItem('mxy-live-intro','1');}}catch{}
apiFetch('status').then(r=>r.json()).then(x=>{Object.assign(model,x);if(route()==='chat'&&!busy) {const label=document.querySelector('#model-label'),hint=document.querySelector('.composer-help');if(label)label.textContent=model.label;if(hint&&data.engine!=='device')hint.textContent='问题与最近对话将发往 '+model.host;}}).catch(()=>{model.label='暂未连接';const l=document.querySelector('#model-label');if(l)l.textContent=model.label;});

