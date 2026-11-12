import {esc as h, icon} from './ui.js';
import {studyModules} from './study-data.js';
import {formatNote,plainNote,richToolbarMarkup,bindRichToolbar} from './reader-rich.js';

const kinds={single:'单选题',multi:'多选题',judge:'判断题'};
const allModules=studyModules.map(m=>m[0]);
const key='mxy-course-credentials22';
const b=(act,label,value='',classes='',extra='')=>'<button type="button" data-study="'+act+'" data-value="'+h(value)+'" class="'+classes+'" '+extra+'>'+label+'</button>';
const link=(route,text,cl='')=>'<a class="btn '+cl+'" href="#'+route+'">'+text+'</a>';
const pick=(name,value,opts,label)=>'<select data-study-field="'+name+'" aria-label="'+label+'">'+opts.map(([k,t])=>'<option value="'+h(k)+'" '+(String(value)===String(k)?'selected':'')+'>'+h(t)+'</option>').join('')+'</select>';
const date=v=>Number.isFinite(v)&&v>0?new Date(v).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'}):'日期未记录';
const score=(q,choices)=>choices.length===q.answerKeys.length&&q.answerKeys.every(k=>choices.includes(k));
const choices=a=>Array.isArray(a?.choices)?a.choices:(a?.choice?[a.choice]:[]);
const answered=(r,id)=>!!r?.picks?.[id]?.length;
const asTime=v=>v?((typeof v==='number'&&v<100000000000? v*1000:typeof v==='number'?v:Date.parse(v))||0):0;
const pill=t=>'<span class="s-tag">'+h(t)+'</span>';
const sep=(cls,txt)=>'<div class="s-'+cls+'">'+txt+'</div>';
const heading=(title,actions='',crumb='')=>'<header class="s-heading"><div>'+(crumb?'<small>'+crumb+'</small>':'')+'<h1>'+title+'</h1></div><div class="s-head-actions">'+actions+'</div></header>';
const card=(title,body,cls='')=>'<section class="s-card '+cls+'">'+(title?'<h2>'+title+'</h2>':'')+body+'</section>';
const shell=(title,body)=>'<div class="study-page" aria-label="'+title+'">'+body+'</div>';
const row=(...args)=>'<div class="s-row">'+args.join('')+'</div>';
const shuffle=xs=>{const a=xs.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const empty=(text)=>'<p class="s-empty">'+h(text)+'</p>';
const safeTags=n=>(n.tags||'').split(/[,，、]/).map(s=>s.trim()).filter(Boolean);
const accountUrl='./classroom.html';
export function createStudentStudy(ctx){
  const {course,go,render,save,toast,modal}=ctx;
  const questions=course.chapters.flatMap(c=>c.questions.map(q=>({...q,module:c.module,chapter:c.title,chapterId:c.id})));
  const byId=new Map(questions.map(q=>[q.id,q]));
  const concept=new Map(course.chapters.flatMap(c=>c.concepts.map(k=>[k.id,k.label])));
  const concepts=q=>(q.conceptIds||[]).map(id=>concept.get(id)||id);
  const current=()=>ctx.data();
  function state(){
    const d=current();
    if(!d.study24)d.study24={legacy:{...d.answers},runs:[],active:null};
    return d.study24;
  }
  const home={tab:'module',module:'',point:'',count:5,scope:'all',types:new Set(Object.keys(kinds)),mode:'practice'};
  const wrong={tab:'wrong',query:'',module:'',kind:'',status:'',sort:'new',page:1,pageSize:5,selected:new Set(),open:new Set()};
  const notes={filter:'all',query:'',sort:'new',current:'',mobileEdit:false};
  const analytics={source:'local',range:'all',online:null,loading:false,error:'',account:''};
  let revealPhase=-1, revealTimer;
  function stopReveal(){
    clearTimeout(revealTimer);revealPhase=-1;
  }
  function reveal(){
    stopReveal();
    if(current().reduce||matchMedia('(prefers-reduced-motion: reduce)').matches){render();return;}
    const next=()=>{
      if(route()!=='progress'){stopReveal();return;}
      revealPhase++;if(revealPhase>2)stopReveal();
      render();
      if(revealPhase>=0)revealTimer=setTimeout(next,520);
    };
    next();
  }
  let gradeId='',reviewIndex=0,onlyWrong=false,cardOpen=false,request=0,disposeToolbar;
  const route=()=>location.hash.slice(1).split('/')[0]||'chat';
  function jump(to){if(route()===to)render();else go(to);}
  function localRecords(){
    const s=state(), records=[];
    for(const [id,a] of Object.entries(s.legacy||{})){
      const q=byId.get(id);if(q&&choices(a).length)records.push({id,module:q.module,correct:score(q,choices(a)),at:0});
    }
    for(const run of s.runs){
      for(const id of run.ids){const q=byId.get(id);if(q&&answered(run,id))records.push({id,module:q.module,correct:score(q,run.picks[id]),at:run.at});}
    }
    return records;
  }
  function historyByQuestion(){
    const map=new Map();
    for(const rec of localRecords()){
      const stats=map.get(rec.id)||{errors:0,latest:0,lastIncorrect:0,correct:false};
      stats.latest=Math.max(stats.latest,rec.at||0);stats.correct=rec.correct;
      if(!rec.correct){stats.errors++;stats.lastIncorrect=rec.at||0;}
      map.set(rec.id,stats);
    }return map;
  }
  const stage=r=>r||state().active;
  function begin(ids,title,mode='practice',force=false){
    const list=[...new Set(ids)].filter(id=>byId.has(id));if(!list.length){toast('当前条件下没有题目。');return;}
    if(state().active&&!force){pendingStart={ids:list,title,mode};modal('替换当前练习？','<p>这一份尚未交卷。可继续当前练习，或从新题组开始。</p>'+b('resume','继续当前练习')+' '+b('replace','开始新练习','','primary'));return;}
    state().active={id:crypto.randomUUID(),ids:list,picks:{},i:0,title,mode,start:Date.now()};cardOpen=false;save();jump('practice');
  }
  let pendingStart;
  function pool(module=home.module,point=home.point){
    const stats=historyByQuestion();
    return questions.filter(q=>(!module||q.module===module)&&(!point||q.conceptIds.includes(point))&&home.types.has(q.type)&&
      (home.scope==='all'||home.scope==='new'&&!stats.has(q.id)||home.scope==='wrong'&&stats.get(q.id)?.errors||home.scope==='star'&&current().favorites.includes(q.id)));
  }
  function startHome(module,point){
    const p=pool(module,point),list=(home.tab==='random'?shuffle(p):p).slice(0,home.count);
    begin(list.map(q=>q.id),point?concept.get(point):module||'综合练习',home.mode);
  }
  const randLabel=()=>home.mode==='exam'?'考试模拟':'练习模式';
  function center(){
    const d=current(),s=state(),stats=historyByQuestion(),resume=s.active,countWrong=[...stats.values()].filter(x=>x.errors).length;
    const groupCards=home.tab==='point'?course.chapters.flatMap(c=>c.concepts.filter(p=>questions.some(q=>q.conceptIds.includes(p.id))).map(p=>[p.id,p.label,c.module,p.definition,'layers'])):
      studyModules.map(([m,ic,desc])=>[m,m,m,desc,ic]);
    const groups=groupCards.map(([id,title,m,desc,ic])=>{
      const pt=home.tab==='point'?id:'',qs=questions.filter(q=>pt?q.conceptIds.includes(pt):q.module===m);
      const done=qs.filter(q=>stats.has(q.id)).length;const selected=(pt?home.point===pt:home.module===m);
      return '<article class="s-module '+(selected?'selected':'')+'"><div class="s-module-start"><span class="s-tile">'+icon(ic)+'</span><div><h3>'+h(title)+'</h3><p>'+h(desc)+'</p></div></div><footer><div><small>'+done+' / '+qs.length+' 题已作答</small><progress value="'+done+'" max="'+qs.length+'"></progress></div>'+b(pt?'point-start':'module-start','开始练习',id,'s-outline')+'</footer></article>';
    }).join('');
    const main=heading('练习中心',b('wrong-tab',icon('notes')+' 我的错题 '+countWrong,'wrong')+' '+b('wrong-tab',icon('star')+' 收藏题目 '+d.favorites.length,'star'))+
      (resume?'<div class="s-resume">'+icon('edit')+'<div>继续上次练习 · '+h(resume.title)+'<small>已答 '+resume.ids.filter(id=>answered(resume,id)).length+' / '+resume.ids.length+' 题</small></div>'+b('resume','继续练习　›','','primary')+'</div>':'')+
      '<div class="s-tabs">'+[['module','章节练习'],['point','知识点练习'],['random','随机练习']].map(([id,label])=>b('center-tab',label,id,home.tab===id?'is-active':'')).join('')+'</div>'+
      (home.tab==='random'?card('随机练习','<p>按照右侧条件抽取题目，同一份练习中的题目不会重复。</p>'+b('start','随机组卷','','primary')):'<div class="s-modules">'+groups+'</div>');
    const recent=s.runs.length?'<div class="s-previous">'+b('last-result','查看最近一次的结果与解析')+'</div>':'';
    const candidates=pool().length;
    const setup=card('本次练习','<label>知识模块'+pick('module',home.module,[['','全部模块'],...allModules.map(m=>[m,m])],'知识模块')+'</label><fieldset><legend>题目数量</legend>'+row(...[5,10,20].map(n=>b('count',n+'题',n,home.count===n?'is-active':'')))+'</fieldset><label>题目范围'+pick('scope',home.scope,[['all','全部题目'],['new','尚未作答'],['wrong','我的错题'],['star','收藏题目']],'题目范围')+'</label><fieldset><legend>题型（可多选）</legend><div class="s-checks">'+Object.entries(kinds).map(([k,t])=>'<label><input type="checkbox" data-kind="'+k+'" '+(home.types.has(k)?'checked':'')+'>'+t+'</label>').join('')+'</div></fieldset><fieldset><legend>练习模式</legend>'+row(b('mode','练习模式','practice',home.mode==='practice'?'is-active':''),b('mode','考试模拟','exam',home.mode==='exam'?'is-active':''))+'</fieldset><p class="s-hint">当前可选 '+candidates+' 题。本次抽取 '+Math.min(home.count,candidates)+' 题。'+(home.mode==='exam'?'交卷前关闭提示。':'交卷后查看解析。')+'</p>'+b('start','开始练习','','primary s-full',candidates?'':'disabled'),'s-setup');
    return shell('练习中心','<div class="s-home-grid"><section>'+main+recent+'</section><aside>'+setup+'</aside></div>');
  }
  function practice(){
    const r=stage();if(!r)return shell('题库练习',heading('题库练习')+empty('还没有进行中的练习。')+link('exercises','返回练习中心','primary'));
    const q=byId.get(r.ids[r.i]);if(!q)return center();const n=r.ids.length,done=r.ids.filter(id=>answered(r,id)).length;
    const favorite=current().favorites.includes(q.id),vals=r.picks[q.id]||[];
    const nums=r.ids.map((id,i)=>b('question',String(i+1),i,(i===r.i?'current ':'')+(answered(r,id)?'filled':''),'aria-label="第 '+(i+1)+' 题"')).join('');
    const answerCard=card('答题卡','<div class="s-hint"><b>'+h(r.title)+'</b><small>已答 '+done+' / '+n+'</small></div><div class="s-nums">'+nums+'</div><p class="s-muted">实线边框为当前题，紫色底为已答。</p><p>'+ (r.mode==='exam'?'考试模拟':'练习模式')+' · 交卷后查看解析</p>'+b('submit','提交练习','','s-outline s-full'),'s-answer-card');
    return shell('练习答题',sep('crumb',link('exercises','题库练习')+'　›　'+h(r.title)+' · '+n+'题练习')+
      '<div class="s-split"><section><div class="s-bar"><b>第 '+(r.i+1)+' / '+n+' 题</b><progress value="'+done+'" max="'+n+'"></progress><small>已保存进度</small>'+b('pause','暂存退出')+'</div>'+
      card('',row(pill(kinds[q.type]),pill(q.chapter),'<i class="s-spacer"></i>',b('star',favorite?'★ 已收藏':'☆ 收藏',q.id))+'<h2 class="s-prompt">'+h(q.prompt)+'</h2><div class="s-options">'+q.options.map(o=>'<label class="s-option '+(vals.includes(o.id)?'chosen':'')+'"><input data-pick="'+h(o.id)+'" type="'+(q.type==='multi'?'checkbox':'radio')+'" name="study-choice" '+(vals.includes(o.id)?'checked':'')+'><b>'+h(o.label)+'.</b><span>'+h(o.text)+'</span></label>').join('')+'</div><div class="s-under">'+(r.mode==='exam'?'<small>考试模拟中，交卷后可查看解析。</small>':b('hint','问马小原 · 获取提示',q.id,'s-outline'))+'</div><div class="s-switch">'+b('question','‹　上一题',r.i-1,'',r.i===0?'disabled':'')+b(r.i===n-1?'submit':'question',r.i===n-1?'提交本次练习':'下一题　›',r.i+1,'primary')+'</div>','s-question')+
      '<div class="s-mobile-card">'+b('card-toggle','题号导航 · '+done+' / '+n)+' '+b('submit','交卷')+(cardOpen?'<div class="s-nums">'+nums+'</div>':'')+'</div></section><aside>'+answerCard+'</aside></div>');
  }
  function finish(){
    const s=state(),r=s.active;if(!r)return;
    const record={...r,at:Date.now()};s.runs.push(record);gradeId=r.id;reviewIndex=0;onlyWrong=false;
    for(const id of r.ids){const vals=r.picks[id];if(!vals?.length)continue;const q=byId.get(id);current().answers[id]={choice:vals[0],choices:vals.slice(),correct:score(q,vals)};}
    s.active=null;document.querySelector('#menu')?.close();save();jump('results');
  }
  function results(){
    const r=state().runs.find(x=>x.id===gradeId)||state().runs.at(-1);
    if(!r)return shell('练习结果',heading('练习结果')+empty('完成一份练习后可在这里回顾。')+link('exercises','前往练习中心'));
    const status=id=>!answered(r,id)?'blank':score(byId.get(id),r.picks[id])?'right':'wrong';
    const right=r.ids.filter(id=>status(id)==='right'),bad=r.ids.filter(id=>status(id)==='wrong'),blank=r.ids.filter(id=>status(id)==='blank');
    const eligible=onlyWrong?bad:r.ids;
    if(!eligible.includes(r.ids[reviewIndex]))reviewIndex=Math.max(0,r.ids.indexOf(eligible[0]));
    const id=r.ids[reviewIndex],q=byId.get(id),result=status(id),vals=r.picks[id]||[];
    const choiceText=ids=>ids.map(id=>q.options.find(o=>o.id===id)?.label).filter(Boolean).join('、')||'未作答';
    return shell('练习结果',sep('crumb',link('exercises','题库练习')+'　›　'+h(r.title)+'　›　练习结果')+
      '<div class="s-summary"><b>✓　完成本次练习</b><span>'+r.ids.length+' 道题</span><span>答对 <b>'+right.length+'</b></span><span>答错 <b>'+bad.length+'</b></span><span>未答 <b>'+blank.length+'</b></span><span>正确率 <b>'+Math.round(right.length*100/r.ids.length)+'%</b></span>'+b('redo','重练错题',r.id,'s-outline',bad.length?'':'disabled')+link('exercises','返回题库')+'</div>'+
      '<div class="s-split"><section>'+card('',row(b('grade-step','‹',-1,'',eligible.indexOf(id)<=0?'disabled':''),'<strong>第 '+(reviewIndex+1)+' 题 · '+kinds[q.type]+'</strong>',pill({right:'答对',wrong:'答错',blank:'未答'}[result]),'<i class="s-spacer"></i>',b('grade-step','›',1,'',eligible.indexOf(id)===eligible.length-1?'disabled':''))+
      '<h2 class="s-prompt">'+h(q.prompt)+'</h2><div class="s-options">'+q.options.map(o=>{const selected=vals.includes(o.id),correct=q.answerKeys.includes(o.id);return '<div class="s-option '+(correct?'right':selected?'wrong':'')+'"><b>'+h(o.label)+'.</b><span>'+h(o.text)+'</span><small>'+[selected?'我的答案':'',correct?'正确答案':''].filter(Boolean).join(' · ')+'</small></div>';}).join('')+'</div><div class="s-hint"><b>解析　</b>'+h(q.explanation)+'</div>'+row(b('explain','问马小原 · 带上题目与作答',id,'primary'),b('star',current().favorites.includes(id)?'★ 已收藏':'☆ 收藏题目',id),b('read','阅读相关原文',id)),'s-question')+'</section><aside>'+
      card('答题回顾','<div class="s-nums">'+eligible.map(id=>b('grade-q',r.ids.indexOf(id)+1,r.ids.indexOf(id),status(id)+(r.ids[reviewIndex]===id?' current':''))).join('')+'</div>'+row(b('grade-filter','全部','all',!onlyWrong?'is-active':''),b('grade-filter','只看错题','wrong',onlyWrong?'is-active':'',bad.length?'':'disabled'))+'<hr><p>我的答案　'+h(choiceText(vals))+'</p><p>正确答案　'+h(choiceText(q.answerKeys))+'</p>'+b('similar','练习同类题',q.id,'s-outline s-full'))+'</aside></div>');
  }
  function bank(){
    const stats=historyByQuestion(),wrongCount=[...stats.values()].filter(s=>s.errors).length,stars=current().favorites;
    let records=questions.filter(q=>(wrong.tab==='star'?stars.includes(q.id):stats.get(q.id)?.errors)
      &&(!wrong.module||q.module===wrong.module)&&(!wrong.kind||q.type===wrong.kind)&&
      (!wrong.query||(q.prompt+q.chapter+concepts(q).join()).includes(wrong.query))&&(!wrong.status||(wrong.status==='needs'?!stats.get(q.id)?.correct:stats.get(q.id)?.correct)));
    records.sort((a,b)=>wrong.sort==='errors'?(stats.get(b.id)?.errors||0)-(stats.get(a.id)?.errors||0):(stats.get(b.id)?.latest||0)-(stats.get(a.id)?.latest||0));
    const pages=Math.max(1,Math.ceil(records.length/wrong.pageSize));wrong.page=Math.min(pages,Math.max(1,wrong.page));
    const slice=records.slice((wrong.page-1)*wrong.pageSize,wrong.page*wrong.pageSize),selected=records.filter(q=>wrong.selected.has(q.id));
    const list=slice.map(q=>{const rec=stats.get(q.id);return '<article class="s-bank-item '+(wrong.selected.has(q.id)?'checked':'')+'"><div><input type="checkbox" aria-label="选中题目" data-bank-id="'+h(q.id)+'" '+(wrong.selected.has(q.id)?'checked':'')+'>'+pill(kinds[q.type])+'<div class="s-bank-title"><b>'+h(q.prompt)+'</b><small>'+h(q.module)+' · '+h(q.chapter)+'</small></div><small>最近作答 '+(rec?date(rec.latest):'—')+'<br>错题次数 '+(rec?.errors||0)+'</small>'+pill(rec?.correct?'已答对':'待巩固')+b('star',stars.includes(q.id)?'★':'☆',q.id,'s-icon','aria-label="收藏题目"')+b('bank-open',wrong.open.has(q.id)?'收起':'展开',q.id,'s-icon')+'</div>'+(wrong.open.has(q.id)?'<div class="s-hint">'+h(q.explanation)+b('explain','问马小原',q.id)+'</div>':'')+'</article>';}).join('');
    return shell('错题与收藏',heading('错题与收藏',pill('仅自己可见'))+'<nav class="s-tabs">'+link('exercises','练习中心')+b('wrong-tab','错题本 '+wrongCount,'wrong',wrong.tab==='wrong'?'is-active':'')+b('wrong-tab','我的收藏 '+stars.length,'star',wrong.tab==='star'?'is-active':'')+'</nav><div class="s-split"><section><div class="s-filters"><input data-study-field="wrong-query" type="search" value="'+h(wrong.query)+'" placeholder="搜索题目或知识点" aria-label="搜索题目或知识点">'+pick('wrong-module',wrong.module,[['','全部模块'],...allModules.map(m=>[m,m])],'模块')+pick('wrong-kind',wrong.kind,[['','全部题型'],...Object.entries(kinds)],'题型')+pick('wrong-status',wrong.status,[['','全部状态'],['needs','待巩固'],['passed','已答对']],'复习状态')+b('bank-reset','重置')+'</div>'+card('',row('<label><input type="checkbox" data-bank-all '+(slice.length&&slice.every(q=>wrong.selected.has(q.id))?'checked':'')+'> 选中本页</label><small>共 '+records.length+' 道</small><i class="s-spacer"></i>',pick('wrong-sort',wrong.sort,[['new','最近作答'],['errors','错误次数']],'排序'))+(list||empty('当前条件下没有题目。'))+row(b('bank-page','‹',-1,'',wrong.page<=1?'disabled':''),wrong.page+' / '+pages,b('bank-page','›',1,'',wrong.page===pages?'disabled':''),pick('page-size',wrong.pageSize,[['5','每页5条'],['10','每页10条'],['20','每页20条']],'每页条数')))+'</section><aside>'+card('本次复习','<p>已选择 <b>'+selected.length+'</b> 道题</p>'+row(...[...new Set(selected.map(q=>q.module))].map(pill))+'<ol><li>重新作答</li><li>查看解析</li><li>总结错因</li></ol>'+b('bank-start','练习所选题目','','primary s-full',selected.length?'':'disabled')+b('bank-clear','取消选择','','s-full'))+'</aside></div>');
  }



  function activeNote(){return current().notes.find(n=>n.id===notes.current);}
  function openNote(title='',text='',id='',meta={}){
    let n=id?current().notes.find(n=>n.id===id):null;
    if(!n){n={id:crypto.randomUUID(),title:title||'无标题笔记',text:text||'',updated:Date.now(),...meta};current().notes.unshift(n);save();}
    notes.current=n.id;notes.query='';notes.filter='all';notes.mobileEdit=true;notes.preview=false;jump('notes');
  }
  const sourceName=n=>n.origin==='chat'?'AI 对话':n.origin==='quiz'?'题目解析':n.source||n.origin==='reading'?'原文阅读':'个人记录';
  function notePanel(n){
    if(!n)return card('',empty('从左侧选择一条笔记，或新建自己的记录。'));
    const title=h(n.title),raw=n.markdown??n.text;
    const localSource=n.source&&course.chapters.some(c=>c.paragraphs.some(p=>p.id===n.source.id));
    const source=n.source?'<div class="s-cite">'+pill('原文摘录')+(n.source.page?'<small>第 '+Number(n.source.page)+' 页</small>':'')+
      (localSource?b('note-read','返回讲义原文 ↗',n.source.id):'<a href="./classroom.html#read='+encodeURIComponent(n.source.id)+'&amp;page='+Number(n.source.page||1)+'">返回原文 ↗</a>')+(n.source.quote?'<blockquote>'+h(n.source.quote)+'</blockquote>':'')+'</div>':'';
    return '<section class="s-note-detail" data-note-id="'+h(n.id)+'"><header>'+b('notes-list','‹ 笔记列表','','s-on-phone')+'<small>个人笔记　/　'+title+'</small><i class="s-spacer"></i><small>'+icon('lock')+' 仅自己可见</small></header><div class="s-note-tools"><span data-note-save role="status">已保存'+(n.updated?' · '+date(n.updated):'')+'</span>'+
      b('note-star',n.starred?'★ 已收藏':'☆ 收藏笔记',n.id)+b('note-delete','删除',n.id)+'</div><div class="s-note-edit">'+
      (notes.preview?'':richToolbarMarkup())+row(b('note-preview',notes.preview?'继续编辑':'查看排版'))+
      '<label class="s-visually-hidden" for="s-note-title">笔记标题</label><input id="s-note-title" data-note-field="title" maxlength="140" class="s-note-title" value="'+title+'">'+
      row('<label>知识模块 '+pick('note-module',n.module||'',[['','未归类'],...allModules.map(m=>[m,m])],'笔记知识模块')+'</label>','<label>标签 <input data-note-field="tags" value="'+h(n.tags||'')+'" placeholder="用逗号分隔" maxlength="120"></label>')+source+
      (notes.preview?'<article class="s-formatted">'+(raw?formatNote(raw):'<p>尚无正文。</p>')+'</article>':'<label class="s-visually-hidden" for="s-note-text">笔记正文</label><textarea id="s-note-text" data-note-field="body" maxlength="14000" placeholder="记下你的理解，或粘贴原文摘录。">'+h(raw)+'</textarea>')+
      '<footer><span data-note-length>'+[...(n.text||'')].length+' 字</span><span>'+h(sourceName(n))+'</span></footer></div></section>';
  }
  function notebook(){
    const all=current().notes,now=Date.now(),filter=notes.filter;
    const filtered=all.filter(n=>(!notes.query||(n.title+n.text+(n.tags||'')).toLowerCase().includes(notes.query.toLowerCase()))&&
      (filter==='all'||filter==='recent'&&n.updated>=now-7*864e5||filter==='starred'&&n.starred||filter==='module:'+n.module||filter==='source:'+sourceName(n)));
    filtered.sort((a,b)=>notes.sort==='title'?a.title.localeCompare(b.title,'zh-CN'):(b.updated||0)-(a.updated||0));
    if(!filtered.some(n=>n.id===notes.current))notes.current=filtered[0]?.id||'';
    const chosen=activeNote();
    const filterBtn=(id,label,count)=>b('note-filter',h(label)+(count!==undefined?'<small>'+count+'</small>':''),id,filter===id?'is-active':'');
    const list=filtered.map(n=>b('note-select','<b>'+h(n.title)+'</b><p>'+h((n.text||'').slice(0,62))+'</p><small>'+h(sourceName(n))+'　'+(n.updated?date(n.updated):'')+'</small>',n.id,'s-note-item '+(n.id===notes.current?'is-active':''))).join('');
    queueMicrotask(()=>{
      disposeToolbar?.abort();disposeToolbar=null;const target=document.querySelector('.s-note-detail');const input=target?.querySelector('[data-note-field=body]');
      if(input){disposeToolbar=new AbortController();bindRichToolbar(target,input,{signal:disposeToolbar.signal});}
    });
    return shell('个人笔记','<div class="s-notebook '+(notes.mobileEdit?'mobile-edit':'')+'"><header class="s-note-heading"><h1>个人笔记</h1><input type="search" aria-label="搜索笔记" data-study-field="note-query" placeholder="搜索笔记" value="'+h(notes.query)+'">'+b('new-note','＋ 新建笔记','','primary')+'</header><div class="s-note-browser"><nav class="s-note-filters">'+filterBtn('all','全部笔记',all.length)+filterBtn('recent','最近编辑')+filterBtn('starred','我的收藏',all.filter(n=>n.starred).length)+'<h3>课程章节</h3>'+allModules.map(m=>filterBtn('module:'+m,m,all.filter(n=>n.module===m).length)).join('')+'<h3>来源分类</h3>'+['原文阅读','AI 对话','题目解析','个人记录'].map(t=>filterBtn('source:'+t,t)).join('')+'</nav><div class="s-note-list"><div class="s-list-tools"><b>'+filtered.length+' 篇</b>'+pick('note-sort',notes.sort,[['new','最近编辑'],['title','按标题']],'笔记排序')+'</div>'+(list||empty('暂无符合条件的笔记。'))+'</div></div>'+notePanel(chosen)+'</div>');
  }
  const valRange=()=>analytics.range==='all'?0:Date.now()-Number(analytics.range)*864e5;
  function radar(groups){
    const cx=207,cy=124,r=88,point=(i,rr)=>[cx+rr*Math.cos(-Math.PI/2+i*Math.PI/3),cy+rr*Math.sin(-Math.PI/2+i*Math.PI/3)];
    const points=rr=>allModules.map((_,i)=>point(i,rr).join(',')).join(' ');
    const values=allModules.map(m=>groups[m]?.count?groups[m].correct/groups[m].count:null);
    let graphic=[0.25,.5,.75,1].map(k=>'<polygon points="'+points(k*r)+'" stroke="#ddd6ec" fill="none"/>').join('');
    if(values.every(v=>v!==null))graphic+='<polygon points="'+values.map((v,i)=>point(i,r*v).join(',')).join(' ')+'" fill="#896ad82d"/>';
    values.forEach((val,i)=>{
      const [x,y]=point(i,r),[tx,ty]=point(i,r+17),name=allModules[i],anchor=i===0||i===3?'middle':i<3?'start':'end';
      graphic+='<path d="M'+cx+' '+cy+' L'+x+' '+y+'" stroke="#e2dcef"/>';
      if(val!==null){const [px,py]=point(i,r*val),next=values[(i+1)%6];if(next!==null){const [nx,ny]=point((i+1)%6,r*next);graphic+='<path d="M'+px+' '+py+' L'+nx+' '+ny+'" stroke="#7956cb" stroke-width="2"/>';}graphic+='<circle cx="'+px+'" cy="'+py+'" r="4" fill="#7956cb" stroke="white" stroke-width="1.5"/>';}
      graphic+='<text x="'+tx+'" y="'+(ty+(i===3?9:0))+'" text-anchor="'+anchor+'" fill="#40374d" font-size="12">'+h(name)+'</text>'+(val===null?'<text x="'+tx+'" y="'+(ty+(i===3?22:13))+'" text-anchor="'+anchor+'" fill="#867d92" font-size="10">待评估</text>':'');
    });
    return '<svg class="s-radar" viewBox="0 0 414 267" role="img" aria-label="六个课程模块的作答正确率，未作答的模块标记为待评估">'+graphic+'</svg>';
  }
  async function fetchOnline(){
    let saved;try{saved=JSON.parse(localStorage.getItem(key)||'[]')[0];}catch{}
    if(!saved?.token){analytics.error='请先进入班级课堂。';analytics.online=null;render();return;}
    if(analytics.loading)return;
    const tag=++request;analytics.loading=true;analytics.error='';analytics.account=saved.token;render();
    try{
      const url=new URL('./api/class/state',location.href);
      const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+saved.token,'Content-Type':'application/json'},body:'{}'});
      if(!response.ok)throw Error('课程身份已失效或服务未连通。');
      const d=await response.json();if(d.role!=='student')throw Error('当前是教师身份，请在班级课堂查看班级学情，或切换学生身份。');
      if(tag!==request)return;
      const records=d.questions.filter(q=>q.choice!=null).map(q=>({id:q.id,module:allModules.includes(q.module)?q.module:'',at:asTime(q.answeredAt),correct:!!q.right}));
      analytics.online={records,title:d.title};
    }catch(e){analytics.online=null;analytics.error=e.message;}finally{if(tag===request){analytics.loading=false;if(route()==='progress')render();}}
  }
  function progress(){
    const fromHash=location.hash.split('/')[1];if(fromHash==='online'&&analytics.source!=='online'){analytics.source='online';queueMicrotask(fetchOnline);}
    const online=analytics.source==='online',data=online?(analytics.online?.records||[]):localRecords(),start=valRange();
    const records=data.filter(x=>!start||x.at>=start),groups=Object.fromEntries(allModules.map(m=>[m,{count:0,correct:0}]));
    for(const a of records){if(groups[a.module]){groups[a.module].count++;groups[a.module].correct+=Number(a.correct);}}
    const rated=allModules.filter(m=>groups[m].count),missing=allModules.filter(m=>!groups[m].count);
    const weakest=rated.sort((a,b)=>groups[a].correct/groups[a].count-groups[b].correct/groups[b].count)[0];
    const sessions=online?null:state().runs.filter(r=>!start||r.at>=start).length;
    const right=records.filter(r=>r.correct).length,unknown=records.filter(r=>!r.module).length,timeless=data.filter(r=>!r.at).length;
    const metrics=[[online?'已答课堂题':'完成练习',online?records.length:sessions,online?'题':'次'],[online?'首答正确率':'作答题目',online?(records.length?Math.round(right*100/records.length)+'%':'待评估'):records.length,online?'':'题'],['覆盖模块',rated.length,'/ 6']];
    return shell('学情分析',heading('学情分析',pick('range',analytics.range,[['all','全部记录'],['7','最近7天'],['30','最近30天'],['90','最近90天']],'分析时段')+' '+b('refresh-stats','更新分析')+' '+b('motion',current().reduce?'减少动态　开':'减少动态　关'))+
      row(b('stat-source','在线课程记录','online',online?'is-active':''),b('stat-source','本机练习记录','local',!online?'is-active':''),'<small class="s-muted">'+h(online?(analytics.online?.title||'本班首答记录'):'当前设备的个人练习')+'</small>')+
      (online&&!analytics.online?'<div class="s-hint">'+h(analytics.loading?'正在读取在线课程记录…':analytics.error||'进入课程后可查看本班作答。')+' <a href="'+accountUrl+'">进入班级课堂 ↗</a>'+(location.hostname==='miao-tj.github.io'?' <a href="https://maxiaoyuan-classroom-22.mr-beensrwr.chatgpt.site/#progress/online">打开云端学情 ↗</a>':'')+'</div>':'')+
      (revealPhase>=0?'<section class="s-reveal" aria-label="学情展示动画"><div>'+['读取记录','整理模块','准备展示'].map((v,i)=>'<span class="'+(i===revealPhase?'active':i<revealPhase?'done':'')+'"><i></i>'+v+'</span>').join('')+'</div>'+b('skip-reveal','▷ 跳过动画')+'</section>':'')+
      (!records.length&&(!online||analytics.online)?'<div class="s-no-records">'+icon('notes')+'<div><b>练习记录不足，暂不生成掌握度</b><p>完成一次练习后，可查看对应模块的真实记录。</p></div><a href="#exercises">去练习 ↗</a></div>':'')+
      '<div class="s-metrics">'+metrics.map(([t,v,u])=>'<article class="s-card">'+icon('chart')+'<div><small>'+t+'</small><b>'+v+' <em>'+u+'</em></b></div></article>').join('')+'</div>'+
      (start&&timeless?'<p class="s-muted">有 '+timeless+' 条旧记录没有作答日期，可切换至全部记录查看。</p>':'')+
      '<div class="s-analytics-grid">'+card('知识掌握雷达',radar(groups)+'<div class="s-legend">● 已练习模块　　◌ 待评估模块</div><table><thead><tr><th>模块</th><th>作答量</th><th>正确率</th></tr></thead><tbody>'+allModules.map(m=>'<tr><td>'+m+'</td><td>'+groups[m].count+' 题</td><td>'+(groups[m].count?Math.round(groups[m].correct*100/groups[m].count)+'%':'待评估')+'</td></tr>').join('')+'</tbody></table>')+
      card('马小原的复习建议',(weakest?'<div class="s-recommend"><small>优先巩固</small><h3>'+weakest+'</h3><p>这部分共作答 '+groups[weakest].count+' 题，答对 '+groups[weakest].correct+' 题。</p>'+b('module-practice','练习相关题目',weakest,'primary s-full')+b('module-read','阅读对应资料',weakest,'s-full')+b('module-hint','请马小原讲解',weakest,'s-full')+'</div>':'<p>提交本机练习或班级题目后，可查看对应模块的复习建议。</p>')+(missing.length?'<div class="s-hint"><small>尚待评估</small><h3>'+missing[0]+'</h3>'+b('module-practice','开始本模块练习',missing[0],'s-outline')+'</div>':'')+(unknown?'<small>'+unknown+' 条在线作答尚未归入知识模块。</small>':''))+'</div>');
  }



  function setField(name,val){
    const map={'wrong-query':'query','wrong-module':'module','wrong-kind':'kind','wrong-sort':'sort','wrong-status':'status','page-size':'pageSize'};
    if(map[name]){wrong[map[name]]=name==='page-size'?+val:val;wrong.page=1;}
    if(name==='module'){home.module=val;home.point='';}
    if(name==='scope')home.scope=val;
    if(name==='range')analytics.range=val;
    if(name==='note-query')notes.query=val;
    if(name==='note-sort')notes.sort=val;
    if(name==='note-module'&&activeNote()){activeNote().module=val;activeNote().updated=Date.now();save();}
  }
  function showBank(which){if(wrong.tab!==which){wrong.selected.clear();wrong.page=1;}wrong.tab=which==='star'?'star':'wrong';jump('review');}
  function sendQuestion(id,withAnswer){
    const q=byId.get(id);if(!q)return;
    let prompt='请给我一个解题思路，先别揭示答案。\n'+q.prompt+'\n'+q.options.map(o=>o.label+'. '+o.text).join('\n');
    if(withAnswer){
      const r=state().runs.find(x=>x.id===gradeId)||state().runs.at(-1);
      const vals=r?.ids.includes(id)?r.picks[id]||[]:choices(current().answers[id]);
      prompt='请结合我的作答解释这道题，说明正确思路和可能的误区。\n'+q.prompt+'\n'+q.options.map(o=>o.label+'. '+o.text).join('\n')+
      '\n我的作答：'+(q.options.filter(o=>vals.includes(o.id)).map(o=>o.label).join('、')||'未作答')+'；正确答案：'+q.options.filter(o=>q.answerKeys.includes(o.id)).map(o=>o.label).join('、');
    }
    ctx.ask(prompt);
  }
  const handle={
    'center-tab':v=>{home.tab=v;home.point='';render();},
    count:v=>{home.count=+v;render();},
    mode:v=>{home.mode=v;render();},
    start:()=>startHome(home.module,home.point),
    'module-start':v=>{home.module=v;home.point='';startHome(v,'');},
    'point-start':v=>{home.point=v;home.module='';startHome('',v);},
    'module-practice':v=>begin(questions.filter(q=>q.module===v).slice(0,5).map(q=>q.id),v),
    'note-read':v=>ctx.read(v),
    'module-read':v=>{const q=questions.find(q=>q.module===v);if(q)ctx.read(q.snippetIds[0]);},
    'module-hint':v=>ctx.ask('请用一个实际案例说明'+v+'中的关键概念，再给我一个自检问题。'),
    'wrong-tab':showBank,
    resume:()=>{document.querySelector('#menu')?.close();jump('practice');},
    replace:()=>{document.querySelector('#menu')?.close();if(pendingStart){const p=pendingStart;pendingStart=null;begin(p.ids,p.title,p.mode,true);}},
    'card-toggle':()=>{cardOpen=!cardOpen;render();},
    pause:()=>{save();jump('exercises');toast('已保存练习，可从练习中心继续。');},
    question:v=>{const r=stage();if(!r)return;r.i=Math.max(0,Math.min(r.ids.length-1,+v));cardOpen=false;save();render();focusPrompt();},
    star:id=>{if(!byId.has(id))return;const d=current();d.favorites=d.favorites.includes(id)?d.favorites.filter(i=>i!==id):[...d.favorites,id];save();render();},
    submit:()=>{const r=stage();if(!r)return;const un=r.ids.filter(id=>!answered(r,id)).length;
      modal('提交本次练习', '<p>'+r.ids.length+' 道题，已答 '+(r.ids.length-un)+' 道'+(un?'，还有 '+un+' 道未答。未答题将在结果中单列。':'，可以查看逐题解析。')+'</p>'+b('resume','返回检查')+' '+b('confirm-grade','确认交卷','','primary'));},
    'confirm-grade':finish,
    'last-result':()=>{const r=state().runs.at(-1);if(r){gradeId=r.id;onlyWrong=false;reviewIndex=0;jump('results');}},
    'grade-q':v=>{reviewIndex=+v;render();},
    'grade-step':v=>{const r=state().runs.find(x=>x.id===gradeId)||state().runs.at(-1);if(!r)return;const ids=onlyWrong?r.ids.filter(id=>answered(r,id)&&!score(byId.get(id),r.picks[id])):r.ids;
      const next=ids[ids.indexOf(r.ids[reviewIndex])+(+v)];if(next)reviewIndex=r.ids.indexOf(next);render();},
    'grade-filter':v=>{onlyWrong=v==='wrong';render();},
    redo:v=>{const r=state().runs.find(x=>x.id===v);if(r)begin(r.ids.filter(id=>answered(r,id)&&!score(byId.get(id),r.picks[id])),'错题重练');},
    similar:id=>{const q=byId.get(id);if(!q)return;let ids=questions.filter(x=>x.id!==id&&x.module===q.module).map(x=>x.id).slice(0,home.count);begin(ids,q.module+' · 同类题');},
    read:id=>{const q=byId.get(id);if(q)ctx.read(q.snippetIds[0]);},
    hint:id=>sendQuestion(id,false),explain:id=>sendQuestion(id,true),
    'bank-open':v=>{wrong.open.has(v)?wrong.open.delete(v):wrong.open.add(v);render();},
    'bank-start':()=>{const stats=historyByQuestion();const filtered=questions.filter(q=>wrong.selected.has(q.id)&&(wrong.tab==='star'?current().favorites.includes(q.id):stats.get(q.id)?.errors)&&(!wrong.module||q.module===wrong.module)&&(!wrong.kind||q.type===wrong.kind)&&(!wrong.query||(q.prompt+q.chapter+concepts(q).join()).includes(wrong.query))&&(!wrong.status||(wrong.status==='needs'?!stats.get(q.id)?.correct:stats.get(q.id)?.correct)));begin(filtered.map(q=>q.id),wrong.tab==='star'?'收藏重练':'错题重练');},
    'bank-clear':()=>{wrong.selected.clear();render();},
    'bank-reset':()=>{Object.assign(wrong,{query:'',module:'',kind:'',status:'',sort:'new',page:1});wrong.selected.clear();render();},
    'bank-page':v=>{wrong.page+=+v;render();},
    'note-filter':v=>{notes.filter=v;notes.mobileEdit=false;render();},
    'note-select':v=>{notes.current=v;notes.preview=false;notes.mobileEdit=true;render();},
    'notes-list':()=>{notes.mobileEdit=false;render();},
    'new-note':()=>openNote(),
    'note-star':v=>{const n=current().notes.find(n=>n.id===v);if(n){n.starred=!n.starred;save();render();}},
    'note-delete':v=>{const n=current().notes.find(n=>n.id===v);if(n)modal('删除这条笔记？','<p>'+h(n.title)+'</p>'+b('close','取消')+' '+b('delete-confirm','删除笔记',v));},
    'delete-confirm':v=>{current().notes=current().notes.filter(n=>n.id!==v);notes.current='';notes.mobileEdit=false;save();document.querySelector('#menu')?.close();render();},
    'note-preview':()=>{notes.preview=!notes.preview;render();},
    close:()=>document.querySelector('#menu')?.close(),
    'stat-source':v=>{stopReveal();analytics.source=v;history.replaceState(null,'','#progress/'+v);render();if(v==='online')fetchOnline();},
    'refresh-stats':()=>{if(analytics.source==='online'){fetchOnline();}reveal();},
    'skip-reveal':()=>{stopReveal();render();},
    motion:()=>{current().reduce=!current().reduce;stopReveal();save();render();}
  };
  function focusPrompt(){queueMicrotask(()=>{const x=document.querySelector('.s-prompt');if(x){x.tabIndex=-1;x.focus({preventScroll:true});}});}
  document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-study]');if(!btn||btn.disabled)return;const fn=handle[btn.dataset.study];if(fn)fn(btn.dataset.value);});
  document.addEventListener('change',e=>{
    const t=e.target;
    if(t.dataset.kind){t.checked?home.types.add(t.dataset.kind):home.types.delete(t.dataset.kind);render();return;}
    if(t.dataset.pick){
      const r=stage();if(!r)return;const q=byId.get(r.ids[r.i]),opt=q.options.find(o=>o.id===t.dataset.pick);if(!opt)return;
      const vals=q.type==='multi'?[...document.querySelectorAll('.s-options [data-pick]:checked')].map(x=>x.dataset.pick):[opt.id];
      r.picks[q.id]=vals;save();render();const next=document.querySelector('.s-options [data-pick="'+CSS.escape(opt.id)+'"]');next?.focus({preventScroll:true});return;
    }
    if(t.dataset.bankId){t.checked?wrong.selected.add(t.dataset.bankId):wrong.selected.delete(t.dataset.bankId);render();return;}
    if(t.hasAttribute('data-bank-all')){for(const c of document.querySelectorAll('[data-bank-id]'))t.checked?wrong.selected.add(c.dataset.bankId):wrong.selected.delete(c.dataset.bankId);render();return;}
    if(t.dataset.studyField&&!t.matches('input[type=search]')){setField(t.dataset.studyField,t.value);render();}
  });
  document.addEventListener('input',e=>{
    const t=e.target;
    if(t.matches('input[type=search][data-study-field]')){setField(t.dataset.studyField,t.value);const i=t.selectionStart;render();const a=document.querySelector('[data-study-field="'+t.dataset.studyField+'"]');a?.focus();a?.setSelectionRange(i,i);return;}
    if(t.dataset.noteField){
      const n=current().notes.find(n=>n.id===t.closest('[data-note-id]')?.dataset.noteId);if(!n)return;
      if(t.dataset.noteField==='title')n.title=t.value||'无标题笔记';
      if(t.dataset.noteField==='tags')n.tags=t.value;
      if(t.dataset.noteField==='body'){n.markdown=t.value;n.text=plainNote(t.value);}
      n.updated=Date.now();save();
      const status=document.querySelector('[data-note-save]');if(status){status.textContent='已自动保存';}
      const count=document.querySelector('[data-note-length]');if(count)count.textContent=[...(n.text||'')].length+' 字';
      const entry=document.querySelector('.s-note-item.is-active');if(entry){entry.querySelector('b').textContent=n.title;entry.querySelector('p').textContent=(n.text||'').slice(0,62);}
    }
  });
  return {views:{exercises:center,practice,results,review:bank,notes:notebook,progress},openNote,
    openQuestion(index){const q=questions[index];if(q)begin([q.id],q.chapter);},
    currentResults(){const r=state().runs.at(-1);if(r){gradeId=r.id;jump('results');}},
    questions};
}

