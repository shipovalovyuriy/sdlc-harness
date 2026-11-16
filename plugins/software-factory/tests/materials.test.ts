import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost, makeThreadResponse } from '@get-bb/plugin-sdk/testing';
import plugin from '../server.ts';
import { listInputs, safeInputName, saveInput } from '../src/inputs.ts';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const text = (r:any) => typeof r==='string' ? r : r.content.filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n');
const firstInput = (call:any) => (call?.args?.[0] ?? call?.[0] ?? call) as any;

test('material names are shell-safe, unique and listed in upload order', () => {
  const dir=mkdtempSync(join(tmpdir(),'sf-inputs-'));
  try {
    assert.equal(safeInputName('../../etc/Скрин экрана 2026.PNG'),'Скрин-экрана-2026.png');
    assert.equal(safeInputName('$(rm -rf).pdf'),'rm-rf.pdf');
    assert.equal(safeInputName('.hidden'),'hidden');
    const a=saveInput(dir,'mock.png',PNG), b=saveInput(dir,'mock.png',PNG);
    assert.equal(a.name,'mock.png');assert.equal(b.name,'mock-2.png');assert.equal(a.image,true);
    saveInput(dir,'spec.pdf',Buffer.from('%PDF-1.4'));
    assert.deepEqual(listInputs(dir).map((f)=>f.name).sort(),['mock-2.png','mock.png','spec.pdf']);
    assert.throws(()=>saveInput(dir,'empty.txt',Buffer.alloc(0)),/пустой/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('materials reach the orchestrator natively, agents get the ones their brief names, later files are announced', async () => {
  const dir=mkdtempSync(join(tmpdir(),'sf-materials-'));const repo=join(dir,'repo');mkdirSync(repo);
  const git=(...args:string[])=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-q','-b','main');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');
  writeFileSync(join(repo,'app.txt'),'base');git('add','app.txt');git('commit','-qm','base');
  let spawnCount=0;
  const {bb,harness}=createFakePluginHost({ pluginId:'software-factory', settings:{worktreeRoot:join(dir,'worktrees')}, sdk:{
    system:{config:async()=>({primaryHostId:'host-fixture'})},
    projects:{list:async()=>[{id:'project-fixture',name:'Fixture',sources:[{path:repo,hostId:'host-fixture',isDefault:true}]}]},
    providers:{list:async()=>[{id:'claude-code',available:true}],models:async()=>({models:[]})},
    threads:{
      get:async({threadId}:any)=>makeThreadResponse({id:threadId,providerId:'claude-code',status:'active'}),
      spawn:async()=>makeThreadResponse({id:`thread-${++spawnCount}`,providerId:'claude-code'}),
      list:async()=>[],send:async()=>({}),
    },
  } as any });
  try {
    await plugin(bb);
    const created:any=await harness.behavior.callRpc('aird_create',{projectId:'project-fixture',folder:repo,title:'Dashboards',slug:'dashboards',request:'Names are clipped',start:false});
    assert.equal(spawnCount,0);
    const saved:any=await harness.behavior.callRpc('aird_attach',{id:created.id,name:'clipped names.png',dataBase64:PNG.toString('base64')});
    assert.equal(saved.name,'clipped-names.png');
    let detail:any=await harness.behavior.callRpc('aird_detail',{id:created.id});
    assert.equal(detail.inputs.length,1);assert.equal(detail.summary.exists,false,'inputs/ alone is not a package yet');
    assert.ok(existsSync(saved.path));

    await harness.behavior.callRpc('aird_start',{id:created.id,stage:'discovery'});
    const orchestrator=firstInput(harness.inspection.sdk.callsTo('threads.spawn')[0]);
    const parts=JSON.stringify(orchestrator);
    assert.match(parts,/"type":"localImage"/);assert.match(parts,/clipped-names\.png/);assert.match(parts,/Материалы пользователя/);

    const named=await harness.behavior.callAgentTool('sf_spawn_agent',{role:'general-purpose',task:'Compare the page with inputs/clipped-names.png'},{threadId:'thread-1'});
    assert.equal(named.isError,undefined,text(named));
    assert.match(JSON.stringify(harness.inspection.sdk.callsTo('threads.spawn')[1]),/"type":"localImage"/);
    await harness.behavior.callAgentTool('sf_spawn_agent',{role:'general-purpose',task:'Map the dashboards module'},{threadId:'thread-1'});
    const plain=JSON.stringify(harness.inspection.sdk.callsTo('threads.spawn')[2]);
    assert.doesNotMatch(plain,/"type":"localImage"/);assert.match(plain,/clipped-names\.png/,'unnamed materials are still listed by path');

    const later:any=await harness.behavior.callRpc('aird_attach',{id:created.id,name:'header.png',dataBase64:PNG.toString('base64')});
    const announced:any=await harness.behavior.callRpc('aird_inputs_announce',{id:created.id,names:[later.name]});
    assert.equal(announced.threadId,'thread-1');
    const sent=JSON.stringify(harness.inspection.sdk.callsTo('threads.send')[0]);
    assert.match(sent,/header\.png/);assert.match(sent,/"type":"localImage"/);assert.doesNotMatch(sent,/clipped-names/);

    await harness.behavior.callRpc('aird_input_remove',{id:created.id,name:'header.png'});
    detail=await harness.behavior.callRpc('aird_detail',{id:created.id});
    assert.deepEqual(detail.inputs.map((f:any)=>f.name),['clipped-names.png']);
    const preview:any=await harness.behavior.callRpc('aird_input_data',{id:created.id,name:'clipped-names.png'});
    assert.match(preview.dataUrl,/^data:image\/png;base64,/);
  } finally {await harness.lifecycle.dispose();rmSync(dir,{recursive:true,force:true});}
});
