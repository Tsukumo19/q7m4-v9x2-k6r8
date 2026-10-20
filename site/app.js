import {initial} from './seed.js';
import {settle,money} from './rules.js';
const $=s=>document.querySelector(s), cfg=window.TAVERN_CONFIG;
let state=initial, token=null, requestId=crypto.randomUUID(), selectedPlayerId=null;
const configured=Boolean(cfg?.url&&cfg?.publishableKey);
function el(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;}
function count(n,complete){return n===null?'待补录':`${n}${complete?'':'+'}`;}
function record(p){return `${p.wins??0}胜 / ${p.losses??0}负`;}
function render(){
  const list=$('#ranking');list.replaceChildren();
  [...state.players].sort((a,b)=>b.net_gp-a.net_gp||a.id.localeCompare(b.id)).forEach((p,i)=>{
    const row=el('article','','player');row.append(el('span',String(i+1).padStart(2,'0'),'rank'));
    const name=el('button',p.name,'name profile-link');name.type='button';name.dataset.playerId=p.id;name.setAttribute('aria-label',`查看 ${p.name} 的选手档案${p.is_cheater?'，作弊者':''}`);if(p.is_cheater)name.append(el('span','作弊者','cheater-badge'));row.append(name);
    [['净盈亏 / GP',money(p.net_gp),p.net_gp>=0?'positive':'negative'],['最高点数',p.max_score??'待补录',''],['出场次数',count(p.appearances,p.history_complete),''],['胜负场次（已录）',record(p),'']].forEach(([label,value,cls])=>{const m=el('div','','metric');m.append(el('strong',String(value),cls),el('small',label));row.append(m);});list.append(row);
  });
  const history=$('#history');history.replaceChildren();
  for(const n of state.notices||[])history.append(el('p',n,'muted'));
  for(const m of state.matches){const row=el('article','','record');const name=id=>state.players.find(p=>p.id===id)?.name||id;const historical=m.settles_balance===false;const [da,db]=settle(m.score_a,m.score_b,Number(m.stake));row.append(el('strong',`${name(m.a)} ${m.score_a} : ${m.score_b} ${name(m.b)}`),el('p',historical?'历史赛程 · 不重复结算':`胜负净额 ${m.stake} GP · ${name(m.a)} ${money(da)} / ${name(m.b)} ${money(db)} GP`),el('small',m.played_on||new Date(m.created_at).toLocaleString('zh-CN')));history.append(row);}
  for(const sel of document.querySelectorAll('select')){const old=sel.value;sel.replaceChildren();for(const p of state.players){const o=el('option',p.name);o.value=p.id;sel.append(o);}if(old)sel.value=old;}
  renderProfile();
  if(!$('#result select[name=b]').dataset.ready){$('#result select[name=b]').selectedIndex=6;$('#result select[name=a]').selectedIndex=4;$('#result select[name=b]').dataset.ready='1';}
}
function renderProfile(){
  const dialog=$('#match-dialog');if(dialog.open)dialog.close();
  const panel=$('#player-profile');panel.replaceChildren();
  const player=state.players.find(p=>p.id===selectedPlayerId);
  panel.hidden=!player;
  if(!player)return;
  const title=el('div','','section-title');const heading=el('h2',`${player.name} · 选手档案`);if(player.is_cheater)heading.append(el('span','作弊者','cheater-badge'));title.append(heading);
  const close=el('button','收起档案','profile-close');close.type='button';close.onclick=()=>{selectedPlayerId=null;renderProfile();};title.append(close);panel.append(title);
  const metrics=el('div','','profile-metrics');
  [['净盈亏 / GP',money(player.net_gp),player.net_gp>=0?'positive':'negative'],['最高点数',player.max_score??'待补录',''],['出场次数',count(player.appearances,player.history_complete),''],['胜负场次（已录）',record(player),'']].forEach(([label,value,cls])=>{const m=el('div','','metric');m.append(el('strong',String(value),cls),el('small',label));metrics.append(m);});
  panel.append(metrics);
  const matches=state.matches.filter(m=>m.a===player.id||m.b===player.id).sort((a,b)=>new Date(b.played_on||b.created_at)-new Date(a.played_on||a.created_at));
  const trigger=el('button',`查看个人对局 · ${matches.length} 场`,'profile-matches-trigger');trigger.type='button';trigger.onclick=()=>showProfileMatches(player,matches);panel.append(trigger);
}
function showProfileMatches(player,matches){
  const dialog=$('#match-dialog'),list=$('#match-dialog-list');list.replaceChildren();
  $('#match-dialog-title').textContent=`${player.name} · 个人对局`;
  $('#match-dialog-summary').textContent=`已录战绩 ${record(player)} · ${matches.length} 场公开记录`;
  if(!matches.length)list.append(el('p','暂无公开对局。','muted'));
  for(const m of matches){
    const isA=m.a===player.id,opponentId=isA?m.b:m.a,opponent=state.players.find(p=>p.id===opponentId)?.name||opponentId;
    const ownScore=isA?m.score_a:m.score_b,otherScore=isA?m.score_b:m.score_a;
    const ownResult=ownScore>otherScore?'win':ownScore<otherScore?'loss':'draw';
    const opponentResult=ownResult==='win'?'loss':ownResult==='loss'?'win':'draw';
    const row=el('article','','profile-match');
    const pair=el('div','','profile-match-pair');
    for(const [name,score,result] of [[player.name,ownScore,ownResult],[opponent,otherScore,opponentResult]]){
      const side=el('div','','profile-match-side');const crest=el('span',name.slice(0,2),'player-crest');crest.setAttribute('aria-hidden','true');
      side.append(crest,el('span',name,'profile-match-name'),el('strong',String(score),`profile-score ${result}`));pair.append(side);
    }
    pair.children[1].classList.add('opponent');row.append(pair);
    const meta=el('div','','profile-match-meta');meta.append(el('span',ownResult==='win'?'胜':ownResult==='loss'?'负':'平',`match-outcome ${ownResult}`),el('span',m.settles_balance===false?'历史赛程':`${m.stake} GP 净额`),el('time',m.played_on||new Date(m.created_at).toLocaleDateString('zh-CN')));row.append(meta);list.append(row);
  }
  dialog.showModal();
}
async function api(path,body,method='POST',auth=token){
  const r=await fetch(`${cfg.url.replace(/\/$/,'')}${path}`,{method,headers:{apikey:cfg.publishableKey,'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)})});
  let data;try{data=await r.json();}catch{throw new Error('服务器未返回有效数据。');}if(!r.ok)throw new Error(data.msg||data.message||data.error_description||'请求失败，请检查连接或权限。');return data;
}
async function refresh(){
  $('#refresh').disabled=true;
  try{if(configured){state=await api('/rest/v1/rpc/scoreboard',{});$('#connection').textContent=`账簿已同步 · ${new Date().toLocaleTimeString('zh-CN')}`;}else{$('#connection').textContent='当前为初始快照预览 · 尚未连接数据库，不能录入';}render();}
  catch(e){$('#connection').textContent=`同步失败，保留上次数据：${e.message}`;render();}finally{$('#refresh').disabled=false;}
}
async function secrets(){const data=await api('/rest/v1/rpc/admin_records',{});$('#secrets').replaceChildren();for(const r of data){const item=el('div','','record');item.append(el('strong',r.label),el('p',r.detail));$('#secrets').append(item);}if(!data.length)$('#secrets').append(el('p','暂无私密记录。'));}
$('#refresh').onclick=refresh;
$('#match-dialog-close').onclick=()=>$('#match-dialog').close();
$('#ranking').onclick=e=>{const button=e.target.closest('button[data-player-id]');if(!button)return;selectedPlayerId=button.dataset.playerId;renderProfile();$('#player-profile').scrollIntoView({behavior:'smooth',block:'start'});};
$('#login').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;$('#admin-message').textContent='正在核验管理员权限…';try{if(!configured)throw new Error('先连接 Supabase，预览不能登录。');const f=new FormData(e.target);const result=await api('/auth/v1/token?grant_type=password',{email:f.get('email'),password:f.get('password')},'POST',null);token=result.access_token;await secrets();$('#desk').hidden=false;$('#login').hidden=true;e.target.reset();$('#admin-message').textContent='已登录。登录仅在当前页面有效。';}catch(err){token=null;$('#admin-message').textContent=err.message;}finally{b.disabled=false;}};
$('#logout').onclick=async()=>{try{if(token)await api('/auth/v1/logout',{});}catch{}finally{token=null;$('#desk').hidden=true;$('#login').hidden=false;$('#secrets').replaceChildren();$('#result').reset();$('#admin-message').textContent='已退出，私密记录已清除。';}};
$('#result').oninput=()=>{const f=new FormData($('#result'));try{if(f.get('score_a')===''||f.get('score_b')==='')return;const [a,b]=settle(Number(f.get('score_a')),Number(f.get('score_b')),Number(f.get('stake')));$('#calculation').textContent=`甲 ${money(a)} GP / 乙 ${money(b)} GP${a===0&&b===0?'（平局或无赌注）':''}`;}catch(e){$('#calculation').textContent=e.message;}};
$('#result').onsubmit=async e=>{
  e.preventDefault();$('#save').disabled=true;$('#admin-message').textContent='正在保存…';
  try{const f=new FormData(e.target);if(f.get('a')===f.get('b'))throw new Error('两位选手不能相同。');settle(Number(f.get('score_a')),Number(f.get('score_b')),Number(f.get('stake')));
    const payload={p_request:requestId,p_a:f.get('a'),p_b:f.get('b'),p_score_a:Number(f.get('score_a')),p_score_b:Number(f.get('score_b')),p_stake:Number(f.get('stake')),p_real_a:f.get('real_a')===''?null:Number(f.get('real_a')),p_real_b:f.get('real_b')===''?null:Number(f.get('real_b')),p_secret:f.get('secret')};
    await api('/rest/v1/rpc/record_match',payload);requestId=crypto.randomUUID();e.target.reset();$('#admin-message').textContent='比赛已保存，正在刷新账簿。';await refresh();await secrets();$('#admin-message').textContent='已保存。公开账簿只显示公布点数。';
  }catch(err){$('#admin-message').textContent=`${err.message} 若网络中断，可直接重试；同一提交不会重复记账。`;}finally{$('#save').disabled=false;}
};
await refresh();
