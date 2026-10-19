export function authErrorMessage(path,status,code){
  if(path.startsWith('/token')){
    if(code==='invalid_credentials')return '账簿管理员邮箱或密码不匹配。请使用账簿网页的登录密码，不是 Supabase 控制台或 ChatGPT 的密码。';
    if(code==='email_not_confirmed')return '账簿账号的邮箱尚未确认，请先完成邮箱确认。';
    if(status===429)return '登录尝试过多，请稍后再试。';
    return '账簿登录失败，请检查账号状态后重试。';
  }
  if(status===401)return '管理员登录已失效，请重新登录。';
  if(status===404||code==='flow_state_expired'||code==='flow_state_not_found')return '这次授权请求已过期或不存在。请返回 ChatGPT 的 Tavern 插件，重新点“继续连接应用”。';
  if(status===429)return '授权请求过于频繁，请稍后重试。';
  return '授权请求未完成。请从 ChatGPT 的 Tavern 插件重新发起连接。';
}

