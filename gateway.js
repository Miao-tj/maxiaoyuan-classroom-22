export const cloud='https://maxiaoyuan-classroom-22.mr-beensrwr.chatgpt.site/';
export const mirror=location.origin==='https://miao-tj.github.io';
export async function apiFetch(operation,options){
 const url=mirror?new URL('api/'+operation,cloud):new URL('./api/'+operation,location.href);
 try{const response=await fetch(url,options);if(mirror&&(!(response.headers.get('content-type')||'').includes('json')))throw Error('网关未连通');return response;}catch(error){if(mirror&&error.name!=='AbortError')throw Error('当前网络未连通云端，可打开云端课堂重试。');throw error;}
}
