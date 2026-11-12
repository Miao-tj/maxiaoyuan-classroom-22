import {esc as h, icon} from './ui.js';
const sessionKey='mxy-login24',storage=()=>localStorage.getItem(sessionKey)?localStorage:sessionStorage;
let auth=storage().getItem(sessionKey)||'',mode='login',profile=null,school=false,remember=false;
const cb=new URLSearchParams(location.hash.slice(1)).get('session');
if(cb&&/^[a-f0-9]{32}$/.test(cb)){auth=cb;sessionStorage.setItem(sessionKey,cb);history.replaceState(null,'',location.pathname);}
const act=(id,label,cls='')=>'<button type="button" class="'+cls+'" data-account="'+id+'">'+label+'</button>';
const field=(title,name,type='text',length=100)=>'<label class="field">'+title+'<input name="'+name+'" type="'+type+'" maxlength="'+length+'" required autocomplete="'+(name==='password'?(mode==='login'?'current-password':'new-password'):name==='name'?'username':'off')+'"></label>';
export function createLogin(ctx){
 async function request(op,body={}){const r=await fetch('./api/account/'+op,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error||'操作未完成');return j;}
 function panel(){
  if(auth&&profile)return '<section class="card identity-card"><h2>选择课程</h2><p>已登录 · '+h(profile.name.startsWith('sso:')?'学校账号':profile.name)+'</p>'+profile.memberships.map(m=>'<button data-account="choose" data-id="'+h(m.id)+'">'+h(m.title)+' · '+(m.role==='teacher'?'教师':'学生')+'　→</button>').join(' ')+
   (!profile.memberships.length?'<p>可使用下方的邀请码加入课程，或绑定已有课程访问码。</p>':'')+
   '<form data-auth="link">'+field('绑定已有课程身份','credential','password',32)+'<button>绑定访问码</button></form>'+act('otp-setup','绑定动态验证码')+' '+act('logout','退出账号')+'</section>';
  return '<section class="card identity-card"><h2>'+({login:'登录马小原',register:'创建账号',recover:'找回密码','otp-login':'动态验证码登录'}[mode])+'</h2><nav class="project-tabs">'+act('login','密码登录',mode==='login'?'active':'')+act('otp-login','验证码登录',mode==='otp-login'?'active':'')+'</nav><form data-auth="'+mode+'">'+field('账号','name','text',60)+(mode==='recover'?field('注册时保存的恢复码','recovery','text',64):'')+(mode==='otp-login'?field('身份验证器六位验证码','otp','text',6):field(mode==='recover'?'新密码':'密码','password','password',180)+act('show-password','显示密码','password-eye'))+
   '<label class="permission"><input name="remember" type="checkbox"> 在这台设备记住登录状态</label><button class="primary">'+(mode==='register'?'注册并进入':mode==='recover'?'重设密码':'登录')+'</button></form><nav>'+act('register','注册账号')+' '+act('recover','忘记密码')+' '+act('sso','学校统一认证')+'</nav><small>新账号可以通过课程邀请码加入。<a href="./#settings">查看隐私与数据</a></small></section>';
 }
 async function init(){try{school=(await (await fetch('./api/account/methods')).json()).school;if(auth){profile=await request('me');ctx.reentry();}}catch{if(auth){storage().removeItem(sessionKey);auth='';profile=null;ctx.reentry();}}}
 async function link(credential){if(!auth)return;await request('link',{credential});profile=await request('me');}
 async function click(btn){
  const op=btn.dataset.account;
  if(op==='show-password'){const input=btn.closest('form').elements.password;input.type=input.type==='password'?'text':'password';btn.textContent=input.type==='password'?'显示密码':'隐藏密码';return;}
  if(op==='sso'){if(school)location.assign('./api/account/sso');else ctx.pop('学校统一认证','<p>此站点尚未绑定学校身份提供者。可以使用课程账号或邀请码进入。</p>');return;}
  if(op==='choose'){const member=await request('choose',{id:btn.dataset.id});ctx.remember(member);await ctx.refresh();return;}
  if(op==='logout'){await request('logout');localStorage.removeItem(sessionKey);sessionStorage.removeItem(sessionKey);auth='';profile=null;ctx.dropManaged();ctx.reentry();return;}
  if(op==='otp-setup'){const r=await request('totp-start');ctx.pop('绑定身份验证器','<p>在身份验证器中新建基于时间的账号，输入这串密钥，再填写生成的六位验证码。</p><code>'+h(r.secret)+'</code><form data-auth="totp-confirm">'+field('当前验证码','otp','text',6)+'<button class="primary">验证并启用</button></form>');return;}
  if(['login','register','recover','otp-login'].includes(op)){mode=op;ctx.reentry();}
 }
 async function submit(form){const data=Object.fromEntries(new FormData(form)),op=form.dataset.auth;
  if(op==='link'){await link(data.credential);ctx.reentry();return;}
  if(op==='totp-confirm'){await request(op,data);ctx.close();ctx.notice('已启用动态码登录。');return;}
  remember=data.remember==='on';const result=await request(op,{...data,remember});auth=result.session;localStorage.removeItem(sessionKey);sessionStorage.removeItem(sessionKey);(remember?localStorage:sessionStorage).setItem(sessionKey,auth);profile=result;ctx.reentry();
  if(result.recovery)ctx.pop('保存账号恢复码','<p>忘记密码时可用此码重设。请妥善保存。</p><code>'+h(result.recovery)+'</code>');
 }
 return {panel,init,click,submit,link,logged:()=>!!profile};
}

