import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost, makeThreadResponse } from '@get-bb/plugin-sdk/testing';
import plugin from '../server.ts';
const text = (r:any) => typeof r==='string' ? r : r.content.filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n');
test('sf_spawn_agent applies a model tier the skill names, ignores unknown ones, and the user override wins', async () => {
  const dir=mkdtempSync(join(tmpdir(),'sf-model-'));const folder=join(dir,'project');mkdirSync(folder);
  let spawnCount=0;
  const {bb,harness}=createFakePluginHost({ pluginId:'software-factory', settings:{worktreeRoot:join(dir,'worktrees')}, sdk:{
    system:{config:async()=>({primaryHostId:'host-fixture'})},
    projects:{list:async()=>[{id:'project-fixture',name:'Fixture',sources:[{path:folder,hostId:'host-fixture',isDefault:true}]}]},
    providers:{list:async()=>[{id:'claude-code',available:true}],models:async()=>({models:[
      {id:'claude-opus-5-5',displayName:'Opus 5.5',isDefault:true},
      {id:'claude-sonnet-5-5',displayName:'Sonnet 5.5'},
    ]})},
    threads:{get:async()=>makeThreadResponse({id:'parent',providerId:'claude-code'}),spawn:async()=>makeThreadResponse({id:`agent-${++spawnCount}`,providerId:'claude-code'}),list:async()=>[],send:async()=>({})},
  } as any });
  try {
    await plugin(bb);const db=bb.storage.database();
    db.prepare(`INSERT INTO airds(id,project_id,folder,slug,title,created_at,archived,work_folder) VALUES (?,?,?,?,?,0,0,?)`).run('fixture','project-fixture',folder,'demo','Fixture',folder);
    db.prepare(`INSERT INTO threads(thread_id,aird_id,role,kind,stage,title,created_at) VALUES ('parent','fixture','aird-discovery-loop','orchestrator','discovery','Parent',0)`).run();
    const tier=await harness.behavior.callAgentTool('sf_spawn_agent',{role:'general-purpose',task:'Sync the plan index',model:'sonnet'},{threadId:'parent'});
    assert.equal(tier.isError,undefined,text(tier));assert.match(JSON.stringify(harness.inspection.sdk.callsTo('threads.spawn')[0]),/"model":"claude-sonnet-5-5"/);assert.doesNotMatch(text(tier),/не применена/);
    const unknown=await harness.behavior.callAgentTool('sf_spawn_agent',{role:'general-purpose',task:'Sync the plan index',model:'gpt-x'},{threadId:'parent'});
    assert.doesNotMatch(JSON.stringify(harness.inspection.sdk.callsTo('threads.spawn')[1]),/"model":/);assert.match(text(unknown),/не применена/);
    db.prepare(`INSERT INTO agent_overrides(role,model,effort,provider) VALUES ('general-purpose','claude-opus-5-5',NULL,NULL)`).run();
    await harness.behavior.callAgentTool('sf_spawn_agent',{role:'general-purpose',task:'Sync the plan index',model:'sonnet'},{threadId:'parent'});
    assert.match(JSON.stringify(harness.inspection.sdk.callsTo('threads.spawn')[2]),/"model":"claude-opus-5-5"/);
  } finally {await harness.lifecycle.dispose();rmSync(dir,{recursive:true,force:true});}
});
