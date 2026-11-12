const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,90}$/.test(id) && !['constructor','__proto__','prototype'].includes(id);
const bounded = (s, max) => typeof s === 'string' && s.length<=max;
export function restoreTurnExtras(turn) {
  const extra={};
  if(bounded(turn.modelLabel,160))extra.modelLabel=turn.modelLabel;
  const original=turn.source;
  if(validId(original?.id)&&bounded(original.title,200)){
    extra.source={id:original.id,title:original.title};
    if(bounded(original.text,9000))extra.source.text=original.text;
    if(bounded(original.module,100))extra.source.module=original.module;
    if(Number.isInteger(original.page)&&original.page>0)extra.source.page=original.page;
  }
  if(Array.isArray(turn.webSources)){
    extra.webSources=turn.webSources.slice(0,10).flatMap(item=>{
      if(!bounded(item?.url,2048))return [];
      try{
        const u=new URL(item.url);
        if(!['https:','http:'].includes(u.protocol))return [];
        return [{url:u.href,title:bounded(item.title,250)?item.title:u.hostname}];
      }catch{return [];}
    });
  }
  return extra;
}
export function restoreAnswer(question, answer) {
  const raw=Array.isArray(answer?.choices)?answer.choices:[answer?.choice];
  const opts=new Set(question.options.map(o=>o.id)); const ids=[...new Set(raw.filter(k=>opts.has(k)))];
  if(!ids.length)return null;
  const selected=question.type==='multi'?ids:ids.slice(0,1);
  return {choice:selected[0],choices:selected,correct:selected.length===question.answerKeys.length && selected.every(id=>question.answerKeys.includes(id))};
}
export function restoreNoteExtras(note) {
  const extra={};
  if(bounded(note.markdown,16000))extra.markdown=note.markdown;
  if(bounded(note.module,100))extra.module=note.module;
  if(['chat','quiz','reading'].includes(note.origin))extra.origin=note.origin;
  if(Number.isFinite(note.updated)&&note.updated>0)extra.updated=note.updated;
  if(note.starred===true)extra.starred=true;
  if(validId(note.source?.id)&&(note.source.page==null||Number.isInteger(note.source.page)&&note.source.page>0)){
    extra.source={id:note.source.id};
    if(note.source.page)extra.source.page=note.source.page;
    if(bounded(note.source.quote,4000))extra.source.quote=note.source.quote;
  }
  return extra;
}
export function restoreStudyState(raw,questions) {
  if(raw===undefined)return null;
  if(!raw || !Array.isArray(raw.runs) || raw.runs.length>10000 || (raw.legacy && typeof raw.legacy!=='object'))throw Error('练习记录格式有误。');
  const lookup=new Map(questions.map(q=>[q.id,q])), legacy={};
  for(const [id,value] of Object.entries(raw.legacy||{})){const q=lookup.get(id);if(q){const a=restoreAnswer(q,value);if(a)legacy[id]=a;}}
  function restore(run, active) {
    if(!run || !validId(run.id)||!Array.isArray(run.ids)||run.ids.length>500||!bounded(run.title,160)||!run.picks||typeof run.picks!=='object')throw Error('练习记录格式有误。');
    const ids=[...new Set(run.ids.filter(id=>lookup.has(id)))];
    if(!ids.length)return null;
    const picks={};
    for(const id of ids){const value=run.picks[id];if(Array.isArray(value)){
      const a=restoreAnswer(lookup.get(id),{choices:value});if(a)picks[id]=a.choices;
    }}
    const record={id:run.id,ids,picks,title:run.title,mode:run.mode==='exam'?'exam':'practice',
      i:Math.min(ids.length-1,Math.max(0,Number.isInteger(run.i)?run.i:0)),start:Number.isFinite(run.start)?run.start:0};
    if(!active)record.at=Number.isFinite(run.at)?run.at:0;
    return record;
  }
  const runs=raw.runs.map(x=>restore(x,false)).filter(Boolean);
  const active=raw.active?restore(raw.active,true):null;
  return {legacy,runs,active};
}
export function mergeStudyState(a,b,localAnswers={}) {
  if(!a&&!b)return undefined;
  const incoming=b||{legacy:{},runs:[],active:null},local=a||{legacy:localAnswers,runs:[],active:null};
  const known=new Set(),runs=[];
  for(const r of [...local.runs,...incoming.runs]){
    if(!known.has(r.id)){known.add(r.id);runs.push(r);}
  }
  runs.sort((x,y)=>(x.at||0)-(y.at||0));
  const active=[local.active,incoming.active].find(r=>r&&!known.has(r.id))||null;
  return {legacy:{...incoming.legacy,...local.legacy},runs,active};
}

