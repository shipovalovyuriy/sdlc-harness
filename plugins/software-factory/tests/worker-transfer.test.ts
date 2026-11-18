import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createFakePluginHost,makeThreadResponse} from '@get-bb/plugin-sdk/testing';
import plugin from '../server.ts';
const text=(r:any)=>typeof r==='string'?r:r.content?.map((x:any)=>x.text??'').join('\n');
test('replacement refuses active owner, requires complete checkpoint, and recovers ambiguous spawn without duplicate',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sf-transfer-'));const pkg=join(dir,'.agent/aird/demo');mkdirSync(join(pkg,'evidence'),{recursive:true});
 let active=true,spawns=0,ambiguous=true;let meta:any={};let candidate:any=null;
 const {bb,harness}=createFakePluginHost({pluginId:'software-factory',settings:{worktreeRoot:join(dir,'trees')},sdk:{
  system:{config:async()=>({primaryHostId:'host-fixture'})},
  projects:{list:async()=>[{id:'p',name:'P',sources:[{path:dir,hostId:'host-fixture',isDefault:true}]}],machineEnvironment:async()=>({variables:[],inheritedVariables:[]})},
  providers:{list:async()=>[{id:'claude-code',available:true}],models:async()=>({models:[]})},
  threads:{get:async({threadId}:any)=>makeThreadResponse({id:threadId,providerId:'claude-code',status:threadId==='old'&&active?'active':'idle'}),list:async()=>candidate?[candidate]:[],getPluginMetadata:async()=>meta,
   spawn:async(args:any)=>{spawns++;meta=args.pluginMetadata;candidate=makeThreadResponse({id:'new',providerId:'claude-code',parentThreadId:'root'});if(ambiguous)throw new Error('connection lost after accepted spawn');return candidate;},
  },
 } as any});
 try{
  await plugin(bb);const db=bb.storage.database();
  db.prepare(`INSERT INTO airds(id,project_id,folder,slug,title,created_at,work_folder) VALUES('a','p',?,'demo','Demo',0,?)`).run(dir,dir);
  db.prepare(`INSERT INTO threads(thread_id,aird_id,role,kind,stage,title,created_at,provider,refs,budget_signal_at) VALUES('root','a','aird-delivery-loop','orchestrator','delivery','Root',0,'claude-code','[]',NULL),('old','a','backend-worker','agent','delivery','Old',0,'claude-code','["WO-01"]',1)`).run();
  db.prepare(`INSERT INTO worker_execution(thread_id,state) VALUES('old','checkpoint_requested')`).run();
  const call=()=>harness.behavior.callAgentTool('sf_spawn_agent',{role:'backend-worker',task:'Finish WO-01',workorders:['WO-01'],freshReason:'Budget exhausted'},{threadId:'root'});
  let result=await call();assert.equal(result.isError,true);assert.match(text(result),/занята/);assert.equal(spawns,0);
  active=false;result=await call();assert.match(text(result),/checkpoint/);assert.equal(spawns,0);
  writeFileSync(join(pkg,'evidence/WO-01-progress.md'),'---\ncheckpoint_source: old\ncheckpoint_revision: abc\ncheckpoint_dirty_paths: []\ncheckpoint_completed: [implemented]\ncheckpoint_remaining: [verify]\ncheckpoint_checks: ["not run: unavailable"]\n---\nSaved partial work.\n');
  result=await call();assert.equal(result.isError,true);assert.equal(spawns,1);
  assert.equal((db.prepare(`SELECT state FROM worker_execution WHERE thread_id='old'`).get() as any).state,'transferring');
  result=await call();assert.equal(result.isError,undefined,text(result));assert.equal(spawns,1,'lost acknowledgement must not launch another agent');
  assert.equal((db.prepare(`SELECT successor FROM worker_execution WHERE thread_id='old'`).get() as any).successor,'new');
 }finally{await harness.lifecycle.dispose();rmSync(dir,{recursive:true,force:true});}
});
