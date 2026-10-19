const cfg=window.TAVERN_CONFIG,$=s=>document.querySelector(s);
const fragment=new URLSearchParams(location.hash.slice(1));
// Recovery credentials remain only in memory; remove the fragment before any API calls.
let token=fragment.get('type')==='recovery'?fragment.get('access_token'):null;
const linkError=fragment.has('error')||fragment.has('error_code');
history.replaceState(null,'',location.pathname);
const say=t=>{$('#status').textContent=t;};
async function api(path,method,body,bearer){
 const r=await fetch(cfg.url+'/auth/v1'+path,{method,headers:{apikey:cfg.publishableKey,'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 if(!r.ok){const d=await r.json().catch(()=>({}));if(r.status===429)throw Error('邮件或登录请求过多，请稍后再试。');if(d.error_code==='same_password')throw Error('新密码与旧密码相同，请换一个新密码。');if(d.error_code==='weak_password')throw Error('密码强度不足，请使用更长、更复杂的密码。');throw Error(path==='/user'?'重置链接已失效或密码未被接受。请重新申请重置邮件。':'重置邮件请求失败，请稍后重试。');}
 return r.status===204?null:r.json();
}
$('#request').onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');b.disabled=true;try{await api('/recover?redirect_to='+encodeURIComponent(location.origin+location.pathname),'POST',{email:e.currentTarget.elements.email.value});say('重置邮件已请求发送。请查看收件箱及垃圾邮件，打开最新邮件里的链接。不要把链接或验证码发到聊天。');}catch(e){say(e.message);b.disabled=false;}};
$('#change').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');if(f.elements.password.value!==f.elements.confirm.value){say('两次输入的密码不一致。');return;}if(!token){say('请重新申请重置邮件。');return;}b.disabled=true;try{await api('/user','PUT',{password:f.elements.password.value},token);token=null;f.reset();f.hidden=true;say('密码已更新。请回到账簿或 ChatGPT 的 Tavern 插件，使用新密码重新登录。');}catch(e){say(e.message);b.disabled=false;}};
if(token){api('/user','GET',null,token).then(()=>{$('#change').hidden=false;say('重置链接有效。请自行设置新密码，不要把密码发到聊天。');}).catch(e=>{token=null;$('#request').hidden=false;say(e.message);});}
else{$('#request').hidden=false;say(linkError?'重置链接已过期。请申请一封新邮件。':'输入账簿管理员邮箱，获取密码重置邮件。');}

