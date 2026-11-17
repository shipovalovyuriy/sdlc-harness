import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost, makeThreadResponse } from '@get-bb/plugin-sdk/testing';
import plugin from '../server.ts';

const text = (r: any) => typeof r === 'string' ? r : r.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');

test('an agent can be continued in its own thread; waiting returns its new answer, never the old one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-continue-')); const folder = join(dir, 'project'); mkdirSync(folder);
  const status = new Map<string, string>();
  const usage = new Map<string, any>();
  const outputs = new Map<string, string>();
  let spawned = 0;
  const { bb, harness } = createFakePluginHost({ pluginId: 'software-factory', settings: { worktreeRoot: join(dir, 'worktrees') }, sdk: {
    system: { config: async () => ({ primaryHostId: 'host-fixture' }) },
    projects: { list: async () => [{ id: 'project-fixture', name: 'Fixture', sources: [{ path: folder, hostId: 'host-fixture', isDefault: true }] }], machineEnvironment: async () => ({ variables: [], inheritedVariables: [] }) },
    providers: { list: async () => [{ id: 'claude-code', available: true }], models: async () => ({ models: [] }) },
    threads: {
      get: async ({ threadId }: any) => ({ ...makeThreadResponse({ id: threadId, providerId: 'claude-code', status: (status.get(threadId) ?? 'idle') as any }), ...(usage.has(threadId) ? { contextWindowUsage: usage.get(threadId) } : {}) }),
      spawn: async () => { const id = `agent-${++spawned}`; status.set(id, 'idle'); return makeThreadResponse({ id, providerId: 'claude-code' }); },
      output: async ({ threadId }: any) => ({ output: outputs.get(threadId) ?? null }),
      list: async () => [], send: async () => ({}),
    },
  } as any });
  const thread = (id: string, s: string) => makeThreadResponse({ id, providerId: 'claude-code', status: s as any });
  try {
    await plugin(bb);
    const db = bb.storage.database();
    db.prepare(`INSERT INTO airds(id,project_id,folder,slug,title,created_at,archived,work_folder,acceptance_folder) VALUES ('fixture','project-fixture',?,?,?,0,0,?,?)`).run(folder, 'demo', 'Demo', folder, join(dir, 'acceptance-copy'));
    db.prepare(`INSERT INTO airds(id,project_id,folder,slug,title,created_at,archived,work_folder) VALUES ('other','project-fixture',?,?,?,0,0,?)`).run(folder, 'other', 'Other', folder);
    db.prepare(`INSERT INTO threads(thread_id,aird_id,role,kind,stage,title,created_at) VALUES ('orch-1','fixture','aird-discovery-loop','orchestrator','discovery','Discovery',0)`).run();
    db.prepare(`INSERT INTO threads(thread_id,aird_id,role,kind,stage,title,created_at) VALUES ('foreign','other','debugger','agent','discovery','debugger · чужой',0)`).run();
    const call = (name: string, input: any) => harness.behavior.callAgentTool(name, input, { threadId: 'orch-1' });

    const first = await call('sf_spawn_agent', { role: 'debugger', task: 'Проба R-01: запусти пробный клиент API', label: 'пробы' });
    assert.equal(first.isError, undefined, text(first));
    outputs.set('agent-1', 'R-01 proven (старый ответ)');
    usage.set('agent-1', { usedTokens: 120_000, modelContextWindow: 475_000, estimated: false });

    const next = await call('sf_continue_agent', { threadId: 'agent-1', task: 'Проба R-05: тем же клиентом отправь портрет', workorders: ['WO-02'] });
    assert.equal(next.isError, undefined, text(next));
    assert.match(text(next), /в том же треде @thread:agent-1/); assert.match(text(next), /120 тыс\. токенов \(25%\)/);
    const sent = JSON.stringify(harness.inspection.sdk.callsTo('threads.send').at(-1));
    assert.match(sent, /agent-1/); assert.match(sent, /Продолжение от оркестратора/); assert.match(sent, /Проба R-05/);
    assert.equal(spawned, 1, 'no new thread');
    const row = db.prepare(`SELECT refs, task FROM threads WHERE thread_id='agent-1'`).get() as any;
    assert.deepEqual(JSON.parse(row.refs), ['WO-02']); assert.match(row.task, /Проба R-01[\s\S]*продолжение[\s\S]*Проба R-05/);

    // The follow-up has not started yet: the old answer is not the result.
    const notYet = await call('sf_wait_agents', { threadIds: ['agent-1'], timeoutSeconds: 10 });
    assert.match(text(notYet), /Продолжение ещё не началось/); assert.doesNotMatch(text(notYet), /старый ответ/);
    // While it runs it cannot be continued again.
    status.set('agent-1', 'active');
    await harness.behavior.emitThreadEvent('thread.active', { thread: thread('agent-1', 'active') });
    const busy = await call('sf_continue_agent', { threadId: 'agent-1', task: 'ещё' });
    assert.equal(busy.isError, true); assert.match(text(busy), /ещё работает/);
    // Its new answer arrives.
    status.set('agent-1', 'idle'); outputs.set('agent-1', 'R-05 refuted (новый ответ)');
    await harness.behavior.emitThreadEvent('thread.idle', { thread: thread('agent-1', 'idle'), lastAssistantText: 'R-05 refuted (новый ответ)' });
    const done = await call('sf_wait_agents', { threadIds: ['agent-1'], timeoutSeconds: 10 });
    assert.match(text(done), /новый ответ/);

    // Refusals: large context, another AIRD's agent, the acceptance suite path.
    usage.set('agent-1', { usedTokens: 320_000, modelContextWindow: 475_000, estimated: false });
    const big = await call('sf_continue_agent', { threadId: 'agent-1', task: 'дальше' });
    assert.equal(big.isError, true); assert.match(text(big), /дороже, чем начать заново/);
    usage.set('agent-1', { usedTokens: 50_000, modelContextWindow: 475_000, estimated: false });
    const foreign = await call('sf_continue_agent', { threadId: 'foreign', task: 'дальше' });
    assert.equal(foreign.isError, true); assert.match(text(foreign), /не агент этого AIRD/);
    const leak = await call('sf_continue_agent', { threadId: 'agent-1', task: `посмотри ${join(dir, 'acceptance-copy')}/acceptance` });
    assert.equal(leak.isError, true); assert.match(text(leak), /приёмочным тестам/);

    // A new agent of a role that already has an idle, small one: the answer names it and the continuation.
    const second = await call('sf_spawn_agent', { role: 'debugger', task: 'Проба R-06: повтори код отказа', label: 'R-06' });
    assert.equal(second.isError, undefined, text(second));
    assert.match(text(second), /свободный агент той же роли: @thread:agent-1 \(«debugger · пробы», 50 тыс\. токенов\)/);
    assert.match(text(second), /sf_continue_agent/);
    // Busy or too large agents are not offered; another role gets no hint.
    usage.set('agent-1', { usedTokens: 320_000, modelContextWindow: 475_000, estimated: false });
    status.set('agent-2', 'active');
    const third = await call('sf_spawn_agent', { role: 'debugger', task: 'Проба R-07', label: 'R-07' });
    assert.doesNotMatch(text(third), /свободный агент/);
    const explorer = await call('sf_spawn_agent', { role: 'explorer', task: 'разведка кода' });
    assert.doesNotMatch(text(explorer), /свободный агент/);

    // «Где мы» counts new agents and continuations of this AIRD.
    const detail: any = await harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    assert.deepEqual(detail.session.agents, { started: 4, continued: 1 });
  } finally { await harness.lifecycle.dispose(); rmSync(dir, { recursive: true, force: true }); }
});
