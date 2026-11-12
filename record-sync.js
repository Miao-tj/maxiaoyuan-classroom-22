import {esc as h} from './ui.js';
import {mirror,cloud} from './gateway.js';
export function setupRecordSync({data,save,render,modal,toast,action,learningBackup,inspectBackup,mergeBackup,questions,chapterIds}){
 let incoming=null,before=null;
 const summary=v=>Object.keys(v.answers||{}).length+' 道已答题 · '+(v.study24?.runs?.length||0)+' 次练习 · '+Object.keys(v.read||{}).length+' 份阅读记录';
 async function request(op,body={}){
 const session=localStorage.getItem('mxy-login24')||sessionStorage.getItem('mxy-login24');if(!session)throw Error('请先登录课程账号。');
 const r=await fetch('./api/account/'+op,{method:'POST',headers:{Authorization:'Bearer '+session,'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error||'操作失败。');return j;
 }
 const clean=v=>({...v,threads:[],notes:[]});
 function intro(x){modal('账号学习记录','<p>请选择要合并的学习记录。只同步练习、阅读进度和收藏。</p><div class="privacy-sources"><p><b>此设备</b><br>'+summary(data())+'</p><p><b>当前账号</b><br>'+summary(x.value||{})+'</p></div>'+action('record-push','将本机记录合并到账号')+' '+(x.value?action('record-pull','将账号记录合并到此设备'):'')+'<p><small>同一题保留目标位置已有的答案。此操作不计入班级首答。</small></p>');}
 const check=v=>inspectBackup(JSON.stringify(v),questions,chapterIds);
 const ops={
 'record-sync':async()=>{if(mirror){modal('账号学习记录','<p>扫码入口和云端分别保存本机记录。可从此处导出，在云端的「预览并导入」选择文件，再合并至账号。</p>'+action('backup','导出本机记录')+' <a class="btn primary" href="'+cloud+'#settings">打开云端设置</a>');return;}
 try{const x=await request('record-get');before=x;intro(x);}catch(e){modal('账号学习记录','<p>'+h(e.message)+'</p><a class="btn" href="./classroom.html#login">登录或切换账号</a>');}},
 'record-push':async()=>{if(!before)return;const local=check(clean(learningBackup(data())));const base=before.value?check(before.value):{notes:[],threads:[],answers:{},favorites:[],read:{}};const merged=mergeBackup(base,local);const value=clean(learningBackup(merged));const r=await request('record-save',{value,revision:before.revision});before={value,revision:r.revision};intro(before);toast('已合并到当前账号。');},
 'record-pull':()=>{if(!before?.value)return;incoming=check(before.value);modal('确认导入此设备','<p>'+summary(incoming)+'</p>'+action('record-apply','确认合并')+' '+action('close','取消'));},
 'record-apply':()=>{if(!incoming)return;Object.assign(data(),mergeBackup(data(),incoming));incoming=null;save();document.querySelector('#menu').close();render();toast('已合并到此设备。');}
 };return Object.fromEntries(Object.entries(ops).map(([key,fn])=>[key,async()=>{try{await fn();}catch(e){toast(e.message);}}]));
}

