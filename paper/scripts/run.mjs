import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { benchmark, run } from '../../dist/index.js';
import { mockAdapter } from 'benchmark-core';
import { mean, wilson, bootstrap } from '../template/stats.mjs';
const hash = x => createHash('sha256').update(x).digest('hex');
const config = JSON.parse(await readFile('paper/config.json')), tasks = await benchmark.listTasks();
const options = { seed: 1, concurrency: 1, retries: 0, maxTurns: 12, maxToolCalls: 12, budgetUsd: 0 };
const policies = ['packaged-good','packaged-bad','recovery','empty','constant','echo','refuse','first-tool','no-wait','no-read','no-report','redundant-write'];
const faults = [...new Set(tasks.map(t => t.metadata.fault))], taskMap = new Map(tasks.map(t => [t.id,t]));
await mkdir('paper/data', { recursive: true });
const save = (n,x) => writeFile(`paper/data/${n}.generated.json`, JSON.stringify(x,null,2)+'\n');
const call = (name,args) => ({content:'',toolCalls:[{id:'call',name,args}]});
function adapter(policy, probability=0, seed=1) {
  if (['packaged-good','packaged-bad','no-wait','no-read','no-report','redundant-write','population'].includes(policy)) {
    const script = task => {
      let turns = structuredClone(benchmark.definition.mockPolicies[policy === 'packaged-bad' ? 'bad' : 'good'](task));
      const removed = {'no-wait':'wait','no-read':'read_status','no-report':'report_outcome'}[policy];
      if (removed) turns = turns.filter(t => t.toolCalls[0].name !== removed);
      if (policy === 'population') turns = turns.filter((t,i) => t.toolCalls[0].name !== 'read_status' || parseInt(hash(`${seed}:${task.id}:${i}`).slice(0,8),16)/2**32 >= probability);
      if (policy === 'redundant-write') { const last = turns.findLast(t => !['read_status','wait','report_outcome'].includes(t.toolCalls[0].name)); turns.splice(turns.length-1,0,last); }
      return [...turns,{content:"",toolCalls:[]}];
    };
    return mockAdapter({seed:1,policies:{good:script,bad:script}});
  }
  return {id:`script:${policy}`,complete:async()=>{throw Error('Episode expected');},async chat({messages,tools}) {
    const reply = content => ({content,toolCalls:[]});
    if (policy === 'empty') return reply('');
    if (policy === 'constant') return reply('OK');
    if (policy === 'echo') return reply(messages.find(m=>m.role==='user').content);
    if (policy === 'refuse') return reply('I cannot perform this operation.');
    if (policy === 'first-tool') return call(tools[0].name,{});
    const system = messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
    const match = system.match(/Use operationKey (\S+) as the idempotency key and payload (.+)\. APIs can fail\./);
    assert.ok(match,'Visible system request changed');
    const key = match[1], value = JSON.parse(match[2]), obs = messages.filter(m=>m.role==='tool');
    const last = obs.length ? JSON.parse(obs.at(-1).content) : null;
    const result = last?.result ?? last;
    const field = Object.keys(tools[0].parameters.properties).find(k=>k!=='operationKey');
    const write = f => call(tools[0].name,{operationKey:key,[f??field]:value});
    const read = () => call('read_status',{operationKey:key});
    const report = status => call('report_outcome',{status,message:status==='failed'?'Service unavailable; no change was made.':'Operation completed and verified.'});
    if (!last) return write();
    if (last.error?.code === 'RATE_LIMITED') return call('wait',{seconds:result?.retryAfter ?? Number(last.error.message.match(/[0-9]+/)[0])});
    if (last.error?.code === 'INTERNAL') return write();
    if (last.error?.code === 'SERVICE_UNAVAILABLE') return report('failed');
    if (last.error?.code === 'SCHEMA_CHANGED') return write(last.error.message.match(/renamed to (\w+)/)[1]);
    if (last.error?.code === 'TIMEOUT') return read();
    if (result?.now !== undefined) return write();
    if (result?.found) return result.status === 'complete' ? report('succeeded') : write();
    if (['partial','complete'].includes(result?.status)) return read();
    throw Error('Unhandled observation: '+JSON.stringify(last));
  }};
}
const semantic = r => r.rows.map(({taskId,submission,episode,score,reason})=>({taskId,submission,episode,score,reason}));
async function execute(a) { const r=await run(a,options); assert.deepEqual(r.rows.map(x=>x.taskId),tasks.map(t=>t.id)); assert.ok(r.rows.every(x=>!x.error),JSON.stringify(r.rows.filter(x=>x.error).slice(0,1))); assert.equal(r.totals.costUsd??0,0); return r; }
const runs=[], repeats=[];
for (const policy of policies) { const report=await execute(adapter(policy)), repeat=await execute(adapter(policy)); const sha256=hash(JSON.stringify(semantic(report))), repeatSha256=hash(JSON.stringify(semantic(repeat))); assert.equal(sha256,repeatSha256); runs.push({policy,report}); repeats.push({policy,sha256,repeatSha256,report:repeat}); }
const strata = rows => faults.map(f=>rows.filter(r=>taskMap.get(r.taskId).metadata.fault===f));
const describe = rows => ({mean:bootstrap(strata(rows),gs=>mean(gs.flat().map(r=>r.score))),full:wilson(rows.filter(r=>r.score===1).length,rows.length),components:Object.fromEntries(['endState','sideEffectSafety','retryDiscipline','honestReport'].map(k=>[k,wilson(rows.filter(r=>r.details.components[k]===1).length,rows.length)])),byFault:Object.fromEntries(faults.map(f=>{const rs=rows.filter(r=>taskMap.get(r.taskId).metadata.fault===f);return [f,wilson(rs.filter(r=>r.score===1).length,rs.length)];})),violations:Object.fromEntries([...new Set(rows.flatMap(r=>r.details.policyViolations))].map(v=>[v,rows.filter(r=>r.details.policyViolations.includes(v)).length]))});
const stats=runs.map(({policy,report})=>({policy,...describe(report.rows),difference:bootstrap(strata(report.rows.map((r,i)=>({...r,score:r.score-runs[0].report.rows[i].score}))),gs=>mean(gs.flat().map(r=>r.score)))}));
const population=[], sweep=[];
for (const probability of [0,.25,.5,.75,1]) { const seedStats=[]; for (let seed=1;seed<=20;seed++) { const report=await execute(adapter('population',probability,seed)); population.push({kind:'simulated',probability,seed,report}); seedStats.push({seed,score:mean(report.rows.map(r=>r.score)),full:mean(report.rows.map(r=>+(r.score===1)))}); } sweep.push({kind:'simulated',probability,seedStats,score:bootstrap([seedStats],gs=>mean(gs[0].map(x=>x.score))),full:bootstrap([seedStats],gs=>mean(gs[0].map(x=>x.full)))}); }
const summary={kind:'scripted-controls-and-simulated-ablation',options,tasks:tasks.length,conditions:policies.length,episodes:tasks.length*(policies.length*2+population.length),costUsd:0,ciLevel:95,coverage:faults.map(f=>({fault:f,domains:Object.fromEntries([...new Set(tasks.map(t=>t.metadata.domain))].map(d=>[d,tasks.filter(t=>t.metadata.fault===f&&t.metadata.domain===d).length]))})),stats,sweep,freeModels:{status:'not-run',reason:'No free-only inference route configured for this study; provider availability was not tested.'}};
await save('runs',runs); await save('repeat',repeats); await save('population',population); await save('summary',summary);
const sources=['data/tasks.jsonl','package-lock.json','src/benchmark.ts','src/index.ts','paper/PREREG.md','paper/scripts/run.mjs','paper/template/stats.mjs'];
for (const p of sources.slice(0,4)) assert.equal(hash(await readFile(p)),hash(execFileSync('git',['show',`${config.source_commit}:${p}`])));
await save('provenance',{source_commit:config.source_commit,prereg_commit:execFileSync('git',['log','--reverse','--format=%H','--','paper/PREREG.md'],{encoding:'utf8'}).trim().split('\n')[0],node:process.version,files:Object.fromEntries(await Promise.all(sources.map(async p=>[p,hash(await readFile(p))]))),run_hash:hash(await readFile('paper/data/runs.generated.json'))});
console.log(`Completed ${summary.episodes} episodes; repeated conditions agree; API cost USD 0`);
