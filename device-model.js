import {Wllama} from './vendor/wllama.js';
import {sha256} from './vendor/sha256.js';
const modelURL='https://modelscope.cn/models/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/master/qwen2.5-0.5b-instruct-q4_0.gguf';
const size=428730208,chunkSize=8*1024*1024,digest='7671c0c304e6ce5a7fc577bcb12aba01e2c155cc2efd29b2213c95b18edaf6ed';
let loading,engine;
async function initialise(status,signal){
 let cache;try{cache=await caches.open('mxy-qwen-'+digest.slice(0,12));}catch{}
 const chunks=Array(Math.ceil(size/chunkSize));let next=0,loaded=0;
 async function reader(){while(next<chunks.length){const index=next++,start=index*chunkSize,end=Math.min(size,start+chunkSize)-1,expected=end-start+1;
  signal?.throwIfAborted();const key=new URL('./.model-cache/'+digest+'/'+index,location.href).href;
  let response=await cache?.match(key);let chunk=response?await response.blob():null;
  if(chunk?.size!==expected){response=await fetch(modelURL+'?part='+index,{headers:{Range:'bytes='+start+'-'+end},signal});if(response.status!==206)throw Error('模型文件下载未完成，请在 Wi-Fi 下重试。');chunk=await response.blob();if(chunk.size!==expected)throw Error('模型分片长度不符，请重试。');if(cache){try{await cache.put(key,new Response(chunk));}catch{cache=null;}}}
  chunks[index]=chunk;loaded+=expected;status('准备通义千问 · '+Math.floor(loaded/size*100)+'%');
 }}
 await Promise.all([reader(),reader(),reader()]);status('正在校验模型…');const hash=sha256.create();
 for(const chunk of chunks){signal?.throwIfAborted();hash.update(new Uint8Array(await chunk.arrayBuffer()));}
 const actual=Array.from(hash.digest(),v=>v.toString(16).padStart(2,'0')).join('');if(actual!==digest)throw Error('模型校验未通过，请清理该站点的模型缓存后重试。');
 const instance=new Wllama({'single-thread/wllama.wasm':new URL('./vendor/wllama.wasm',import.meta.url).href});
 try{await instance.loadModel([new Blob(chunks)],{n_ctx:3072,n_batch:128,n_threads:1});}catch{throw Error('这台设备未能载入模型，可改用云端或电脑验收版。');}return instance;
}
async function ready(status,signal){if(engine)return engine;if(!loading)loading=initialise(status,signal).then(e=>engine=e).finally(()=>{loading=null;});return loading;}
const prompt=(system,text)=>'<|im_start|>system\n'+system+'<|im_end|>\n<|im_start|>user\n'+text.replaceAll('<|','＜｜')+'<|im_end|>\n<|im_start|>assistant\n';
export async function deviceChat(text,source,history,{signal,status,update}){
 const llm=await ready(status,signal);signal?.throwIfAborted();status('通义千问正在回答…');const content=[...history.slice(-2).map(x=>'上次提问：'+x.q.slice(0,150)+'\n上次回答：'+x.a.slice(0,220)),source&&'参考讲义：'+source,'问题：'+text].filter(Boolean).join('\n');
 return llm.createCompletion(prompt('你是马小原课程助教。请用中文解释概念并给一个例子，不编造引文。',content),{nPredict:300,abortSignal:signal,sampling:{temp:0.3},onNewToken:(_id,_p,s)=>update(s)});
}
const labels=['理论理解','文本依据','联系实际','结构与表达'],maxima=[30,25,25,20];
const grammar=String.raw`root ::= "{" ws "\"dimensions\"" ws ":" ws "[" ws first ws "," ws second ws "," ws second ws "," ws fourth ws "]" ws "," ws "\"summary\"" ws ":" ws str ws "}"
first ::= open ("30" | [12] [0-9] | [0-9]) comment
second ::= open ("2" [0-5] | "1" [0-9] | [0-9]) comment
fourth ::= open ("20" | "1" [0-9] | [0-9]) comment
open ::= "{" ws "\"score\"" ws ":" ws
comment ::= ws "," ws "\"comment\"" ws ":" ws str ws "}"
str ::= "\"" [^"\\\x00-\x1f]+ "\""
ws ::= [ \t\n\r]*`;
export async function deviceReview(text,{signal,status}){
 if(text.length>2200)throw Error('设备模型单次可评 40～2200 字。请选取段落，或使用云端模型。');
 const llm=await ready(status,signal);signal?.throwIfAborted();status('通义千问正在阅读正文…');
 const result=await llm.createCompletion(prompt('你是一位严谨的课程教师。按理论理解30分、文本依据25分、联系实际25分、结构表达20分评阅。四项各写一句具体中文评语，说明扣分理由。缺乏引文的文章不得给文本依据满分。最后写一句总评。输出JSON。',text),{abortSignal:signal,nPredict:560,sampling:{temp:.2,grammar}});
 let data;try{data=JSON.parse(result.trim());}catch{throw Error('设备模型未完成全部评语，请缩短正文再试。');}
 if(data.dimensions?.length!==4||!data.summary)throw Error('评阅结果不完整，请重试。');const dimensions=data.dimensions.map((d,i)=>({...d,name:labels[i],max:maxima[i]}));
 return {dimensions,total:dimensions.reduce((sum,d)=>sum+d.score,0),summary:data.summary,method:'设备模型'};
}
