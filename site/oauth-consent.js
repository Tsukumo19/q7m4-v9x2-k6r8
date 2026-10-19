import {authErrorMessage} from './oauth-errors.js';
const $=s=>document.querySelector(s),cfg=window.TAVERN_CONFIG;
const id=new URL(location.href).searchParams.get('authorization_id');
let token=null,details=null;
const message=t=>{$('#message').textContent=t;};
async function api(path,body){
  const r=await fetch(cfg.url+'/auth/v1'+path,{method:body?'POST':'GET',headers:{apikey:cfg.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const d=await r.json();if(!r.ok)throw Error(authErrorMessage(path,r.status,d.error_code??d.code));return d;
}
function redirect(url){const u=new URL(url);if(u.origin!=='https://chatgpt.com')throw Error('授权回调地址不受信任。');location.assign(u.href);}
async function load(){
  // Supabase authorization IDs are opaque strings, distinct from match UUIDs.
  if(!id || !/^[A-Za-z0-9_-]{16,256}$/.test(id))throw Error('缺少有效授权编号。请从 ChatGPT 的 Tavern 插件发起连接。');
  if(!window.TAVERN_OAUTH_CLIENT_IDS?.length)throw Error('Tavern 连接尚未配置完成，暂不接受授权。');
  if(!token){$('#oauth-login').hidden=false;message('在此页面登录。不要把密码、验证码或令牌发到聊天。');return;}
  details=await api('/oauth/authorizations/'+encodeURIComponent(id));
  // Previously approved requests can redirect without a second consent screen.
  if(details.redirect_url){redirect(details.redirect_url);return;}
  const client=details.client;
  if(!client || !window.TAVERN_OAUTH_CLIENT_IDS.includes(client.id??client.client_id))throw Error('这个应用不在 Tavern 允许连接的名单中。');
  const u=new URL(details.redirect_uri);if(u.origin!=='https://chatgpt.com')throw Error('授权回调地址不受信任。');
  $('#client-name').textContent=client.name??client.client_name??'Tavern';
  $('#scopes').textContent='请求的身份范围：'+(details.scope||'基础身份授权');
  $('#redirect').textContent='授权后返回：'+u.origin+u.pathname;
  $('#oauth-login').hidden=true;$('#consent').hidden=false;message('核对应用后选择是否授权。');
}
$('#oauth-login').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;try{const d=await api('/token?grant_type=password',{email:f.elements.email.value,password:f.elements.password.value});f.elements.password.value='';token=d.access_token;await load();}catch(e){message(e.message);}finally{b.disabled=false;}};
async function decide(action){$('#approve').disabled=true;$('#deny').disabled=true;try{const d=await api('/oauth/authorizations/'+encodeURIComponent(id)+'/consent',{action});token=null;redirect(d.redirect_url);}catch(e){message(e.message);$('#approve').disabled=false;$('#deny').disabled=false;}}
$('#approve').onclick=()=>decide('approve');$('#deny').onclick=()=>decide('deny');
load().catch(e=>message(e.message));

