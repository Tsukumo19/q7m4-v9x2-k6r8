// Stateless Streamable HTTP MCP. No database/admin credential is used here.
export const playerIds = ['griggo','bernardo','elias','isabel','hector','rosa','toby','martin'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const properties = {
  request_id:{type:'string',format:'uuid',description:'Stable UUID for this match. Reuse unchanged after timeout or retry; never mint a replacement to retry.'},
  player_a:{type:'string',enum:playerIds},player_b:{type:'string',enum:playerIds},
  score_a:{type:'integer',minimum:0,maximum:1000000},score_b:{type:'integer',minimum:0,maximum:1000000},
  net_gp:{type:'number',minimum:0,maximum:1000000,multipleOf:0.5,description:'Net amount won/lost, NOT the original wager. Do not infer a conversion rule.'}
};
export const tools = [
  {name:'tavern_scoreboard',description:'Read the existing public Tavern ledger. Never returns true dice or secret notes.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false},securitySchemes:[{type:'noauth'}]},
  {name:'tavern_record_match',description:'Submit one explicitly confirmed match to the existing ledger as the signed-in administrator. Use announced scores and net_gp. Preserve request_id on every retry. Secret dice and notes must be entered on the administrator website, never through this tool.',inputSchema:{type:'object',properties,required:Object.keys(properties),additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[]}]}
];
export function validateMatch(a) {
  if(!a || typeof a!=='object' || Array.isArray(a) || Object.keys(a).length!==6 || Object.keys(a).some(k=>!Object.hasOwn(properties,k))) throw Error('Invalid match fields');
  if(!uuid.test(a.request_id) || !playerIds.includes(a.player_a) || !playerIds.includes(a.player_b) || a.player_a===a.player_b) throw Error('Invalid request or players');
  if(![a.score_a,a.score_b].every(v=>Number.isInteger(v)&&v>=0&&v<=1000000) || typeof a.net_gp!=='number' || !Number.isFinite(a.net_gp) || a.net_gp<0 || a.net_gp>1000000 || !Number.isInteger(a.net_gp*2)) throw Error('Invalid scores or net amount');
  return {p_request:a.request_id,p_a:a.player_a,p_b:a.player_b,p_score_a:a.score_a,p_score_b:a.score_b,p_stake:a.net_gp,p_real_a:null,p_real_b:null,p_secret:''};
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
    if(m.method==='initialize') return ok({protocolVersion:['2025-03-26','2025-06-18','2025-11-25'].includes(m.params?.protocolVersion)?m.params.protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'Tavern',version:'1.0.0'},instructions:'Use the existing ledger only. A match requires user confirmation. Preserve its UUID and exact payload on retries. net_gp means net profit/loss, not original wager. Never claim success without a match receipt. Never submit legacy snapshots.'});
    if(m.method==='ping') return ok({});
    if(m.method==='tools/list') return ok({tools});
    if(m.method!=='tools/call') return fail(-32601,'Method not found');
    const name=m.params?.name,args=m.params?.arguments??{};
    if(!tools.some(t=>t.name===name)) return fail(-32602,'Unknown tool');
    let payload;
    try { if(name==='tavern_record_match') payload=validateMatch(args); else if(Object.keys(args).length) throw Error('Unexpected arguments'); }
    catch(e){return fail(-32602,e.message);}
    const token=req.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if(name==='tavern_record_match' && !await authorized(token)) return challenge();
    try {
      const data=await rpc(name==='tavern_scoreboard'?'scoreboard':'record_match',payload??{},name==='tavern_record_match'?token:undefined);
      if(name==='tavern_record_match' && data!==args.request_id) throw Error('Receipt mismatch; verify ledger before retrying');
      const result=name==='tavern_record_match'?{match_id:data,status:'recorded',player_a:args.player_a,player_b:args.player_b,delta_a:args.score_a===args.score_b?0:args.score_a>args.score_b?args.net_gp:-args.net_gp,delta_b:args.score_a===args.score_b?0:args.score_a>args.score_b?-args.net_gp:args.net_gp}:data;
      return ok({content:[{type:'text',text:JSON.stringify(result)}],isError:false});
    } catch(e) { return ok({content:[{type:'text',text:e.name==='TimeoutError'?'Outcome unknown. Check the ledger and retry with the SAME UUID and payload.':e.message}],isError:true}); }
  };
}

