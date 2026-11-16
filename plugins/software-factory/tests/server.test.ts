import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost, makeThreadResponse } from '@get-bb/plugin-sdk/testing';
import plugin from '../server.ts';
const text = (r:any) => typeof r==='string' ? r : r.content.filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n');
test('SDK tools, stored runs and acceptance RPC agree about wave scope and missing evidence', async () => {
  const dir=mkdtempSync(join(tmpdir(),'sf-server-'));const repo=join(dir,'repo');mkdirSync(repo);
  const git=(...args:string[])=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-q','-b','main');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');
  writeFileSync(join(repo,'behavior.txt'),'base');git('add','behavior.txt');git('commit','-qm','base');git('checkout','-q','-b','aird/demo');
  const pkg=join(repo,'.agent','aird','demo');mkdirSync(join(pkg,'workorders'),{recursive:true});
  writeFileSync(join(pkg,'STATE.md'),'---\nstatus: in_delivery\nactive_wave: W1\n---\n');
  for(const [id,wave,dod] of [['WO-01','W1','DOD-01'],['WO-02','W2','DOD-02']]) {
    writeFileSync(join(pkg,'workorders',`${id}.md`),`---\nid: ${id}\nkind: implementation\nstatus: ready\nwave: ${wave}\ndod_ids: [${dod}]\n---\n# ${id}\n`);
  }
  writeFileSync(join(pkg,'09-dod.md'),'### Acceptance Scenarios\n\n| ID | DoD | Boundary | Given | When | Then (expected) | Approved |\n|---|---|---|---|---|---|---|\n| AS-01 | DOD-01 | CLI | base | run | implemented | user |\n| AS-02 | DOD-02 | CLI | later | run | later | agent |\n');
  let spawnCount=0;
  const {bb,harness}=createFakePluginHost({ pluginId:'software-factory', settings:{worktreeRoot:join(dir,'worktrees')}, sdk:{
    system:{config:async()=>({primaryHostId:'host-fixture'})},
    projects:{list:async()=>[{id:'project-fixture',name:'Fixture',sources:[{path:repo,hostId:'host-fixture',isDefault:true}]}]},
    providers:{list:async()=>[{id:'claude-code',available:true},{id:'codex',available:true}],models:async()=>({models:[]})},
    threads:{get:async()=>makeThreadResponse({id:'parent',providerId:'claude-code'}),spawn:async()=>makeThreadResponse({id:`agent-${++spawnCount}`,providerId:'codex'}),list:async()=>[],send:async()=>({})},
  } as any });
  try {
    await plugin(bb);const db=bb.storage.database();
    db.prepare(`INSERT INTO airds(id,project_id,folder,slug,title,created_at,archived,work_folder,worktree,branch) VALUES (?,?,?,?,?,0,0,?,?,?)`).run('fixture','project-fixture',repo,'demo','Fixture',repo,repo,'aird/demo');
    db.prepare(`INSERT INTO threads(thread_id,aird_id,role,kind,stage,title,created_at) VALUES ('parent','fixture','aird-delivery-loop','orchestrator','delivery','Parent',0)`).run();
    const spawned=await harness.behavior.callAgentTool('sf_spawn_agent',{role:'test-author',task:'Write only AS-01 from the contract',label:'acceptance'},{threadId:'parent'});
    assert.equal(spawned.isError,undefined,text(spawned));assert.equal(spawnCount,1);
    const call=harness.inspection.sdk.callsTo('threads.spawn')[0] as any;
    const serialized=JSON.stringify(call);assert.match(serialized,/codex/);assert.match(serialized,/workorders\//);assert.match(serialized,/не открывай/);
    const row=db.prepare(`SELECT * FROM airds WHERE id='fixture'`).get() as any;
    const suite=join(row.acceptance_folder,'acceptance','demo');mkdirSync(suite,{recursive:true});
    writeFileSync(join(suite,'run.sh'),`status=failed\ncode=1\nif [ "$(cat "$1/behavior.txt")" = implemented ]; then status=passed; code=0; fi\nprintf '[{"id":"AS-01","status":"%s","expected":"implemented","actual":"base"}]' "$status" > results.json\nexit "$code"\n`);
    const commitSuite=()=>{execFileSync('git',['-C',row.acceptance_folder,'add',`acceptance/demo/run.sh`]);execFileSync('git',['-C',row.acceptance_folder,'commit','-qm','suite revision']);};
    commitSuite();
    // The suite exists on disk but nobody registered it: a launch problem, not "0 of N".
    const unregistered=await harness.behavior.callAgentTool('sf_run_acceptance',{baseline:true,waitSeconds:10},{threadId:'parent'});
    assert.equal(unregistered.isError,true);assert.match(text(unregistered),/проблема запуска/);assert.match(text(unregistered),/не зарегистрирован/);assert.doesNotMatch(text(unregistered),/0\/1/);
    const wrongCaller=await harness.behavior.callAgentTool('sf_register_suite',{runScript:join(suite,'run.sh')},{threadId:'parent'});assert.equal(wrongCaller.isError,true);
    const register=()=>harness.behavior.callAgentTool('sf_register_suite',{runScript:join(suite,'run.sh')},{threadId:'agent-1'});
    const registered=await register();assert.equal(registered.isError,undefined,text(registered));assert.match(text(registered),/зарегистрирован/);
    const missingBase=await harness.behavior.callAgentTool('sf_run_acceptance',{waitSeconds:10},{threadId:'parent'});assert.equal(missingBase.isError,true);assert.match(text(missingBase),/Red-first/);
    const baseline=await harness.behavior.callAgentTool('sf_run_acceptance',{baseline:true,waitSeconds:10},{threadId:'parent'});assert.match(text(baseline),/Red-first: pass/);
    writeFileSync(join(repo,'behavior.txt'),'implemented');git('add','behavior.txt');git('commit','-qm','implemented');
    const green=await harness.behavior.callAgentTool('sf_run_acceptance',{waitSeconds:10},{threadId:'parent'});assert.match(text(green),/Blind acceptance: pass/);assert.doesNotMatch(text(green),/AS-02/);
    let view:any=await harness.behavior.callRpc('acceptance',{id:'fixture'});assert.equal(view.gate,'passed');assert.equal(view.scenarios[1].applicable,false);assert.equal(view.scenarios[1].last,null);
    writeFileSync(join(repo,'behavior.txt'),'changed after verification');view=await harness.behavior.callRpc('acceptance',{id:'fixture'});assert.equal(view.gate,'untested');writeFileSync(join(repo,'behavior.txt'),'implemented');
    writeFileSync(join(suite,'run.sh'),"printf '[{\"id\":\"AS-01\",\"status\":\"skipped\"}]' > results.json\nexit 1\n");
    const dirty=await harness.behavior.callAgentTool('sf_run_acceptance',{waitSeconds:10},{threadId:'parent'});assert.equal(dirty.isError,true);assert.match(text(dirty),/Набор изменён/);
    commitSuite();
    const stillOld=await harness.behavior.callAgentTool('sf_run_acceptance',{baseline:true,waitSeconds:10},{threadId:'parent'});assert.match(text(stillOld),/изменён после регистрации/);
    await register();
    const stale=await harness.behavior.callAgentTool('sf_run_acceptance',{waitSeconds:10},{threadId:'parent'});assert.equal(stale.isError,true);assert.match(text(stale),/Red-first/);
    const skipped=await harness.behavior.callAgentTool('sf_run_acceptance',{baseline:true,waitSeconds:10},{threadId:'parent'});assert.equal(skipped.isError,true);assert.match(text(skipped),/blocked-no-evidence/);
    view=await harness.behavior.callRpc('acceptance',{id:'fixture'});assert.equal(view.gate,'blocked');assert.equal(view.runs[0].status,'error');
    writeFileSync(join(pkg,'STATE.md'),'---\nstatus: in_delivery\nactive_wave: W2\n---\n');
    view=await harness.behavior.callRpc('acceptance',{id:'fixture'});assert.equal(view.gate,'untested');assert.equal(view.scenarios[1].applicable,true);assert.equal(view.scenarios[0].current,false);
    const noPreflight=await harness.behavior.callAgentTool('sf_run_acceptance',{baseline:true,waitSeconds:10},{threadId:'parent'});assert.equal(noPreflight.isError,true);assert.match(text(noPreflight),/База волны W2 не зафиксирована/);assert.match(text(noPreflight),/проблема запуска/);
    await harness.behavior.callRpc('aird_continue',{id:'fixture',threadId:'parent'});assert.equal(harness.inspection.sdk.callsTo('threads.send').length,1);assert.equal(spawnCount,1);
    writeFileSync(join(pkg,'.continue-here.md'),'---\ncheckpoint_kind: proactive_handoff\n---\n');
    await harness.behavior.callRpc('aird_continue',{id:'fixture',threadId:'parent'});assert.equal(spawnCount,2);assert.equal(harness.inspection.sdk.callsTo('threads.send').length,1);
  } finally {await harness.lifecycle.dispose();rmSync(dir,{recursive:true,force:true});}
});
