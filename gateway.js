const cloud='https://maxiaoyuan-classroom-22.mr-beensrwr.chatgpt.site/';
const mirror=location.origin==='https://miao-tj.github.io';
export async function apiFetch(operation,options){
 const url=mirror?new URL('api/'+operation,cloud):new URL('./api/'+operation,location.href);
 try{const response=await fetch(url,options);if(mirror&&(!(response.headers.get('content-type')||'').includes('json')))throw Error('网关未连通');return response;}catch(error){if(mirror&&error.name!=='AbortError')throw Error('当前网络未连通云端，可点页首「云端课堂」继续。');throw error;}
}
if(mirror){const link=document.createElement('a');link.href=cloud+(location.pathname.endsWith('assignment-review.html')?'assignment-review.html':'');link.textContent='云端课堂 ↗';link.className='mirror-link btn';document.body.append(link);}

