import {unzipSync,strFromU8} from './vendor/fflate.js';
import {rubricReview} from './rubric.js';
import {apiFetch} from './gateway.js';
import {esc} from './ui.js';
const el=id=>document.getElementById(id);
let run=0,controller,reading=false;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function clear(){run++;controller?.abort();controller=null;el('report').hidden=true;el('report').classList.remove('presenting');el('submit').disabled=false;el('dimensions').replaceChildren();document.querySelector('.grade').hidden=true;document.querySelector('.review-summary').hidden=true;el('total').textContent='';for(const bar of document.querySelectorAll('.reading-track i'))bar.className='';}
async function fileChanged(file){if(!file)return;clear();const id=run;reading=true;el('essay').value='';el('filename').textContent=file.name;el('status').textContent='正在读取 Word 正文…';
 try{if(!/\.docx$/i.test(file.name)||file.size>6*1024*1024)throw Error('请选择不超过 6 MB 的 .docx 文件。');const bytes=new Uint8Array(await file.arrayBuffer());if(id!==run)return;
 const xml=unzipSync(bytes,{filter:entry=>{if(entry.name!=='word/document.xml')return false;if(entry.originalSize>3*1024*1024)throw Error('正文超出读取范围，请粘贴所需段落。');return true;}})['word/document.xml'];if(!xml)throw Error('未找到 Word 正文，请使用 .docx 或粘贴文字。');
 const doc=new DOMParser().parseFromString(strFromU8(xml),'application/xml');if(doc.querySelector('parsererror'))throw Error('Word 正文格式无效。');
 const text=Array.from(doc.getElementsByTagNameNS('*','p'),p=>Array.from(p.getElementsByTagNameNS('*','t'),t=>t.textContent).join('')).filter(Boolean).join('\n');
 if(!text.trim())throw Error('这份文档没有可读取的文字，请粘贴正文。');el('essay').value=text;el('status').textContent=text.length>9000?'正文超过 9000 字，请选取要评阅的部分。':'已读取 '+text.length+' 字，可调整正文后提交。';
 }catch(e){if(id===run)el('status').textContent=e.message;}finally{if(id===run)reading=false;}}
el('choose').onclick=()=>el('upload').click();el('upload').onchange=e=>{fileChanged(e.target.files[0]);e.target.value='';};const drop=el('dropzone');drop.ondragover=e=>e.preventDefault();drop.ondrop=e=>{e.preventDefault();fileChanged(e.dataTransfer.files[0]);};
el('essay').addEventListener('input',()=>{if(!el('report').hidden){clear();el('status').textContent='正文已修改，可以重新评阅。';}});
el('review-form').onsubmit=async e=>{e.preventDefault();const text=el('essay').value.trim();if(reading||text.length<40||text.length>9000){el('status').textContent='请提交 40 至 9000 字的正文。';return;}
 clear();const id=run;controller=new AbortController();el('submit').disabled=true;el('report').hidden=false;el('report').classList.add('presenting');el('reading-label').textContent='马小原正在阅读正文…';el('status').textContent=el('method').value==='model'?'已提交，等待模型评阅。':'正在准备本设备评阅。';el('report').scrollIntoView({behavior:'smooth',block:'start'});
 try{let result;if(el('method').value==='rubric'){result=rubricReview(text);}else if(el('method').value==='device'){const {deviceReview}=await import('./device-model.js');result=await deviceReview(text,{signal:controller.signal,status:s=>{if(id===run)el('status').textContent=s;}});}else{const response=await apiFetch('review',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});result=await response.json();if(!response.ok)throw Error(result.error||'评阅失败，请重试。');}if(id!==run)return;
 el('status').textContent='评语已返回，正在逐项展示。';for(const [i,d] of result.dimensions.entries()){await pause(i===0?400:1050);if(id!==run)return;const section=document.createElement('section');section.className='dimension';section.innerHTML='<div class="dim-head"><h3>'+esc(d.name)+'</h3><span class="dim-score">'+d.score+' / '+d.max+'</span></div><p>'+esc(d.comment)+'</p>';el('dimensions').append(section);document.querySelectorAll('.reading-track i')[i].className='shown';el('reading-label').textContent='已评阅 '+(i+1)+' / 4　'+d.name;}
 await pause(1000);if(id!==run)return;el('total').textContent=result.total;document.querySelector('.grade').hidden=false;document.querySelector('.review-summary p').textContent=result.summary;document.querySelector('.review-summary').hidden=false;el('reading-label').textContent='四项评阅完成';el('status').textContent=(result.method||'大模型')+'建议评分，供教师复核。';el('report').classList.remove('presenting');
 }catch(error){if(id===run){el('status').textContent=error.message+' 可选课程量规初评，或稍后重试模型。';el('report').hidden=true;}}finally{if(id===run)el('submit').disabled=false;}};
let modelInfo='云端模型';function methodHint(){el('provider').textContent=el('method').value==='rubric'?'按十二项量规识别文字特征，全文留在本设备。':el('method').value==='device'?'首次从魔搭下载约 429 MB 模型；正文留在本设备。':'提交后，正文由 '+modelInfo+' 处理。原始 Word 文件保留在本设备。';}el('method').onchange=()=>{clear();methodHint();el('status').textContent='';};
apiFetch('status').then(r=>r.json()).then(p=>{modelInfo=p.host+' 的 '+p.label;methodHint();}).catch(()=>{});


