export function settle(a,b,stake){
  if(![a,b,stake].every(Number.isFinite)||!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a>1000000||b>1000000||stake<0||stake>1000000||!Number.isInteger(stake*2)) throw new Error('点数须为非负整数，赌注须为 0.5 GP 的倍数，最大均为 1000000。');
  return a===b?[0,0]:a>b?[stake,-stake]:[-stake,stake];
}
export const money=n=>`${n>0?'+':''}${Number(n).toLocaleString('zh-CN',{maximumFractionDigits:1})}`;
