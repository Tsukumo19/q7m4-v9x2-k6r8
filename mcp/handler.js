// Stateless Streamable HTTP MCP. No database/admin credential is used here.
const playerIdPattern='^[a-zA-Z0-9_-]{1,64}$';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const playerIdSchema={type:'string',pattern:playerIdPattern,maxLength:64,description:'Registered player ID. Use tavern_list_players to discover the current roster.'};
const properties = {
  request_id:{type:'string',format:'uuid',description:'Stable UUID for this match. Reuse unchanged after timeout or retry; never mint a replacement to retry.'},
  player_a:playerIdSchema,player_b:playerIdSchema,
  score_a:{type:'integer',minimum:0,maximum:1000000},score_b:{type:'integer',minimum:0,maximum:1000000},
  net_gp:{type:'number',minimum:0,maximum:1000000,multipleOf:0.5,description:'Net amount won/lost, NOT the original wager. Do not infer a conversion rule.'}
};
const historicalProperties = {
  request_id:{type:'string',format:'uuid',description:'Stable UUID for this archive row. Reuse unchanged after timeout or retry.'},
  player_a:playerIdSchema,player_b:playerIdSchema,
  score_a:{type:'integer',minimum:0,maximum:1000000},score_b:{type:'integer',minimum:0,maximum:1000000},
  played_on:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$',description:'Original match date in YYYY-MM-DD.'},
  was_gamble:{type:'boolean',description:'Omit if historical wager status is unknown.'},
  real_a:{type:'integer',minimum:0,maximum:1000000},real_b:{type:'integer',minimum:0,maximum:1000000},
  secret:{type:'string',maxLength:2000,description:'Private administrator-only archival note. This text remains in this ChatGPT conversation.'}
};
const baselineProperties = {
  player_id:playerIdSchema,
  opening_max:{type:'integer',minimum:0,maximum:1000000},
  opening_appearances:{type:'integer',minimum:0,maximum:1000000},
  opening_gambles:{type:'integer',minimum:0,maximum:1000000},
  mark_complete:{type:'boolean',description:'Set true only when these opening statistics are complete and all archived match gamble status is known.'}
};
const privateProperties = {
  record_id:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,100}$'},
  label:{type:'string',minLength:1,maxLength:200},detail:{type:'string',minLength:1,maxLength:4000}
};
const profileProperties={player_id:playerIdSchema};
export const tools = [
  {name:'tavern_scoreboard',description:'Read the existing public Tavern ledger. Never returns true dice or secret notes.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false},securitySchemes:[{type:'noauth'}]},
  {name:'tavern_list_players',description:'List every currently registered player and public career totals from the existing ledger. The roster is loaded dynamically, not fixed to the original eight. Never returns private dice or notes.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false},securitySchemes:[{type:'noauth'}]},
  {name:'tavern_get_player_profile',description:'Read one registered player’s public totals and match history. The current scoreboard exposes at most the latest 100 overall matches. Never returns true dice or private notes.',inputSchema:{type:'object',properties:profileProperties,required:['player_id'],additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false},securitySchemes:[{type:'noauth'}]},
  {name:'tavern_record_match',description:'Submit one explicitly confirmed new match to the existing ledger as the signed-in administrator. Use announced scores and net_gp. Preserve request_id on every retry. Private historical evidence must use the dedicated archive tool.',inputSchema:{type:'object',properties,required:Object.keys(properties),additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[]}]},
  {name:'tavern_record_historical_match',description:'Archive one confirmed historical match in the existing ledger without changing balances. Public scores and date are recorded; real dice and secret go only to the private admin area. This private text remains in this ChatGPT conversation. Omit was_gamble if unknown. Reuse request_id unchanged on retries.',inputSchema:{type:'object',properties:historicalProperties,required:['request_id','player_a','player_b','score_a','score_b','played_on'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[]}]},
  {name:'tavern_update_history_baseline',description:'Fill missing historical statistics for one player. Values describe the baseline before archived match rows; opening GP is never accepted. Existing known values cannot be overwritten. Mark complete only when the submitted baseline is complete and gamble status is known for every archived match.',inputSchema:{type:'object',properties:baselineProperties,required:['player_id'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[]}]},
  {name:'tavern_record_private_archive',description:'Store a confirmed private historical cheat record in the existing administrator-only private archive. Never returned by public scoreboard or this tool. Its text remains in this ChatGPT conversation. Reuse record_id unchanged on retries.',inputSchema:{type:'object',properties:privateProperties,required:Object.keys(privateProperties),additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[]}]}
];
function validPlayerId(v){return typeof v==='string'&&v.length<=64&&/^[a-zA-Z0-9_-]{1,64}$/.test(v);}
function exactObject(a, props, required) {
  if(!a || typeof a!=='object' || Array.isArray(a) || Object.keys(a).some(k=>!Object.hasOwn(props,k)) || required.some(k=>!Object.hasOwn(a,k))) throw Error('Invalid fields');
}
function validScore(v){return Number.isInteger(v)&&v>=0&&v<=1000000;}
function validString(v,min,max){return typeof v==='string'&&v.trim().length>=min&&v.length<=max;}
export function validateMatch(a) {
  if(!a || typeof a!=='object' || Array.isArray(a) || Object.keys(a).length!==6 || Object.keys(a).some(k=>!Object.hasOwn(properties,k))) throw Error('Invalid match fields');
  if(!uuid.test(a.request_id) || !validPlayerId(a.player_a) || !validPlayerId(a.player_b) || a.player_a===a.player_b) throw Error('Invalid request or players');
  if(![a.score_a,a.score_b].every(v=>Number.isInteger(v)&&v>=0&&v<=1000000) || typeof a.net_gp!=='number' || !Number.isFinite(a.net_gp) || a.net_gp<0 || a.net_gp>1000000 || !Number.isInteger(a.net_gp*2)) throw Error('Invalid scores or net amount');
  return {p_request:a.request_id,p_a:a.player_a,p_b:a.player_b,p_score_a:a.score_a,p_score_b:a.score_b,p_stake:a.net_gp,p_real_a:null,p_real_b:null,p_secret:''};
}
export function validateHistorical(a) {
  exactObject(a,historicalProperties,['request_id','player_a','player_b','score_a','score_b','played_on']);
  if(!uuid.test(a.request_id)||!validPlayerId(a.player_a)||!validPlayerId(a.player_b)||a.player_a===a.player_b||!validScore(a.score_a)||!validScore(a.score_b)||!/^\d{4}-\d{2}-\d{2}$/.test(a.played_on)||Number.isNaN(Date.parse(a.played_on+'T00:00:00Z'))||new Date(a.played_on+'T00:00:00Z').toISOString().slice(0,10)!==a.played_on) throw Error('Invalid historical match');
  if(a.was_gamble!==undefined&&typeof a.was_gamble!=='boolean') throw Error('Invalid gamble status');
  if((a.real_a!==undefined&&!validScore(a.real_a))||(a.real_b!==undefined&&!validScore(a.real_b))||(a.secret!==undefined&&(!validString(a.secret,0,2000)))) throw Error('Invalid private details');
  return {p_request:a.request_id,p_a:a.player_a,p_b:a.player_b,p_score_a:a.score_a,p_score_b:a.score_b,p_played_on:a.played_on,p_was_gamble:a.was_gamble??null,p_real_a:a.real_a??null,p_real_b:a.real_b??null,p_secret:a.secret??''};
}
export function validateBaseline(a) {
  exactObject(a,baselineProperties,['player_id']);
  if(!validPlayerId(a.player_id)||Object.entries(a).some(([k,v])=>k!=='player_id'&&k!=='mark_complete'&&(!Number.isInteger(v)||v<0||v>1000000))||(a.mark_complete!==undefined&&typeof a.mark_complete!=='boolean')||Object.keys(a).length===1) throw Error('Invalid baseline fields');
  return {p_player:a.player_id,p_opening_max:a.opening_max??null,p_opening_appearances:a.opening_appearances??null,p_opening_gambles:a.opening_gambles??null,p_mark_complete:a.mark_complete??false};
}
export function validatePrivate(a) {
  exactObject(a,privateProperties,Object.keys(privateProperties));
  if(!validString(a.record_id,1,100)||!validString(a.label,1,200)||!validString(a.detail,1,4000)) throw Error('Invalid private archive record');
  return {p_record_id:a.record_id,p_label:a.label.trim(),p_detail:a.detail};
}
export function createHandler({baseUrl,publishableKey,resource,allowedClientIds=[],fetcher=fetch}) {
  const issuer=baseUrl+'/auth/v1';
  const metadata=resource+'/.well-known/oauth-protected-resource';
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const json=(v,status=200,extra={})=>new Response(JSON.stringify(v),{status,headers:{...headers,...extra}});
  const challenge=()=>json({error:'OAuth authorization required'},401,{'WWW-Authenticate':`Bearer resource_metadata="${metadata}"`});
  async function rpc(name,args,token) {
    const r=await fetcher(baseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
    if(!r.ok) throw Error(r.status===401||r.status===403?'Administrator authorization required':'Ledger rejected request; keep the same UUID and payload for retries');
    return r.json();
  }
  async function authorized(token) {
    // Auth server validates the signature and current user; never trust decode alone.
    if(!token || token.length>16000 || !allowedClientIds.length) return false;
    try {
      const r=await fetcher(issuer+'/user',{headers:{apikey:publishableKey,Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
      if(!r.ok) return false;
      const user=await r.json();
      const parts=token.split('.'); if(parts.length!==3) return false;
      const c=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
      const audiences=Array.isArray(c.aud)?c.aud:[c.aud];
      return typeof c.sub==='string' && c.sub===user.id && c.iss===issuer && audiences.includes('authenticated') && c.role==='authenticated' && Number.isFinite(c.exp) && c.exp>Date.now()/1000 && (!c.nbf||c.nbf<=Date.now()/1000) && allowedClientIds.includes(c.client_id) && !user.is_anonymous;
    } catch { return false; }
  }
  return async req=>{
    const url=new URL(req.url);
    if(url.pathname.endsWith('/.well-known/oauth-protected-resource')) return json({resource,authorization_servers:[issuer],bearer_methods_supported:['header']});
    // Supabase's gateway removes /functions/v1 before invoking the runtime.
    const pathname=url.pathname.replace(/\/$/,'');
    if(![new URL(resource).pathname,'/'+new URL(resource).pathname.split('/').pop()].includes(pathname)) return json({error:'Not found'},404);
    // Browser requests are limited to the ledger site; native MCP has no Origin.
    const origin=req.headers.get('Origin');
    if(origin && origin!=='https://chatgpt.com') return json({error:'Origin denied'},403);
    if(req.method==='GET') return new Response(null,{status:405,headers:{Allow:'POST'}});
    if(req.method!=='POST') return json({error:'Method not allowed'},405);
    if(!req.headers.get('content-type')?.includes('application/json')) return json({error:'JSON required'},415);
    const raw=await req.text(); if(new TextEncoder().encode(raw).length>16384) return json({error:'Request too large'},413);
    let m;try{m=JSON.parse(raw);}catch{return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}},400);}
    if(!m || Array.isArray(m) || m.jsonrpc!=='2.0' || typeof m.method!=='string') return json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}},400);
    const ok=result=>json({jsonrpc:'2.0',id:m.id,result});
    const fail=(code,message)=>json({jsonrpc:'2.0',id:m.id??null,error:{code,message}});
    if(m.method.startsWith('notifications/')) return new Response(null,{status:202});
    if(m.id===undefined) return fail(-32600,'Request ID required');
    if(m.method==='initialize') return ok({protocolVersion:['2025-03-26','2025-06-18','2025-11-25'].includes(m.params?.protocolVersion)?m.params.protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'Tavern',version:'1.2.0'},instructions:'Use tavern_list_players to discover the live registered roster. Match rows are associated with player profiles by ID. Confirm archival facts with the user. Historical matches never settle balances. Preserve stable IDs on retries. Baseline statistics describe the time before archived match rows; opening GP cannot be changed. Private archive text remains in this ChatGPT conversation and is administrator-only in the ledger.'});
    if(m.method==='ping') return ok({});
    if(m.method==='tools/list') return ok({tools});
    if(m.method!=='tools/call') return fail(-32601,'Method not found');
    const name=m.params?.name,args=m.params?.arguments??{};
    if(!tools.some(t=>t.name===name)) return fail(-32602,'Unknown tool');
    let payload;
    try { if(name==='tavern_record_match') payload=validateMatch(args); else if(name==='tavern_record_historical_match') payload=validateHistorical(args); else if(name==='tavern_update_history_baseline') payload=validateBaseline(args); else if(name==='tavern_record_private_archive') payload=validatePrivate(args); else if(name==='tavern_get_player_profile') {exactObject(args,profileProperties,['player_id']);if(!validPlayerId(args.player_id))throw Error('Invalid player ID');payload={};} else if(Object.keys(args).length) throw Error('Unexpected arguments'); }
    catch(e){return fail(-32602,e.message);}
    const token=req.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    const publicRead=['tavern_scoreboard','tavern_list_players','tavern_get_player_profile'].includes(name);
    if(!publicRead && !await authorized(token)) return challenge();
    try {
      const rpcName={tavern_scoreboard:'scoreboard',tavern_list_players:'scoreboard',tavern_get_player_profile:'scoreboard',tavern_record_match:'record_match',tavern_record_historical_match:'record_historical_match',tavern_update_history_baseline:'update_history_baseline',tavern_record_private_archive:'record_private_archive'}[name];
      const data=await rpc(rpcName,payload??{},publicRead?undefined:token);
      if(!publicRead && data!==(name==='tavern_update_history_baseline'?args.player_id:name==='tavern_record_private_archive'?args.record_id:args.request_id)) throw Error('Receipt mismatch; verify ledger before retrying');
      let result=data;
      if(name==='tavern_list_players') result={players:(data.players||[]).map(({id,name,net_gp,max_score,appearances,gambles,history_complete})=>({id,name,net_gp,max_score,appearances,gambles,history_complete}))};
      if(name==='tavern_get_player_profile') {
        const player=(data.players||[]).find(p=>p.id===args.player_id);
        if(!player) throw Error('Player not found in the public ledger. List registered players and retry.');
        result={player:{id:player.id,name:player.name,net_gp:player.net_gp,max_score:player.max_score,appearances:player.appearances,gambles:player.gambles,history_complete:player.history_complete},matches:(data.matches||[]).filter(m=>m.a===player.id||m.b===player.id).map(({id,a,b,score_a,score_b,stake,settles_balance,played_on,created_at})=>({id,a,b,score_a,score_b,stake,settles_balance,played_on,created_at}))};
      }
      if(name==='tavern_record_match') result={match_id:data,status:'recorded',player_a:args.player_a,player_b:args.player_b,delta_a:args.score_a===args.score_b?0:args.score_a>args.score_b?args.net_gp:-args.net_gp,delta_b:args.score_a===args.score_b?0:args.score_a>args.score_b?-args.net_gp:args.net_gp};
      if(name==='tavern_record_historical_match') result={match_id:data,status:'archived_without_settlement',player_a:args.player_a,player_b:args.player_b};
      if(name==='tavern_update_history_baseline') result={player_id:data,status:'baseline_updated'};
      if(name==='tavern_record_private_archive') result={record_id:data,status:'stored_privately'};
      return ok({content:[{type:'text',text:JSON.stringify(result)}],isError:false});
    } catch(e) { return ok({content:[{type:'text',text:e.name==='TimeoutError'?'Outcome unknown. Check the ledger and retry with the SAME UUID and payload.':e.message}],isError:true}); }
  };
}
