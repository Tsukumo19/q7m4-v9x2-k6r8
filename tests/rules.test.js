import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {settle} from '../site/rules.js';
import {initial} from '../site/seed.js';
test('equal stakes, tie, half coin and zero sum',()=>{assert.deepEqual(settle(60,18,2.5),[2.5,-2.5]);assert.deepEqual(settle(1,20,4),[-4,4]);assert.deepEqual(settle(20,20,8),[0,0]);for(let a=0;a<61;a++)for(let b=0;b<61;b++){const d=settle(a,b,1.5);assert.equal(d[0]+d[1],0);}});
test('invalid amounts and dice rejected',()=>{for(const args of [[-1,2,1],[1.5,2,1],[1,2,.1],[1,2,-1],[NaN,2,1],[1000001,2,1],[1,2,Infinity]])assert.throws(()=>settle(...args));});
test('opening snapshot preserves balances and unknown history',()=>{assert.equal(initial.players.reduce((s,p)=>s+p.net_gp,0),0);assert.equal(initial.players.find(p=>p.id==='griggo').max_score,60);assert.equal(initial.matches.length,0);assert(initial.players.every(p=>p.appearances===null&&p.gambles===null));});
test('public files contain no real-score history or credentials',async()=>{for(const f of await readdir(new URL('../site/',import.meta.url))){const text=await readFile(new URL('../site/'+f,import.meta.url),'utf8');assert(!/真实点数\s*22|service_role\s*[:=]\s*['"][^'"]+|sb_secret_|eyJ[a-zA-Z0-9_-]{30}/.test(text),f);}});
