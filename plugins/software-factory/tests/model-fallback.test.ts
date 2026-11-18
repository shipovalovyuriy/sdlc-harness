import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost, makeThreadResponse, makeTurnFailedEvent } from '@get-bb/plugin-sdk/testing';
import plugin from '../server.ts';
import { failureKind } from '../src/model-fallback.ts';

const text = (r: any) => typeof r === 'string' ? r : r.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
const reserveA = { provider: 'claude-code', model: 'a-reserve', effort: 'high' };
const reserveB = { provider: 'codex', model: 'b-reserve', effort: 'medium' };

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'sf-fallback-'));
  const folder = join(dir, 'project'); mkdirSync(folder);
  const states = new Map<string, any>();
  const records = new Map<string, any[]>();
  const metadata = new Map<string, any>();
  const outputs = new Map<string, string>();
  const operations: string[] = [];
  let spawned = 0;
  let finishTransferImmediately = false;
  const request = (id: string, requestId: string, input: any) => {
    const row = { type: 'client/turn/requested', seq: (records.get(id)?.length ?? 0) + 1, data: { requestId, input, execution: { permissionMode: 'auto' } } };
    records.set(id, [...records.get(id) ?? [], row]);
    return row;
  };
  let { bb, harness } = createFakePluginHost({ pluginId: 'software-factory', settings: { worktreeRoot: join(dir, 'worktrees') }, sdk: {
    system: { config: async () => ({ primaryHostId: 'host-fixture' }) },
    projects: { list: async () => [{ id: 'project-fixture', name: 'Fixture', sources: [{ path: folder, hostId: 'host-fixture', isDefault: true }] }], machineEnvironment: async () => ({ variables: [], inheritedVariables: [] }) },
    providers: {
      list: async () => [{ id: 'claude-code', available: true }, { id: 'codex', available: true }],
      models: async ({ providerId }: any) => ({ models: (providerId === 'codex' ? ['b-reserve'] : ['a-primary', 'a-reserve']).map((id) => ({ id, displayName: id, supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'high' }] })) }),
    },
    threads: {
      get: async ({ threadId }: any) => states.get(threadId) ?? makeThreadResponse({ id: threadId, projectId: 'project-fixture', providerId: 'claude-code', environmentId: 'env-fixture' }),
      spawn: async (args: any) => {
        const id = `agent-${++spawned}`;
        operations.push(`spawn:${id}`);
        const state = makeThreadResponse({ id, projectId: args.projectId, providerId: args.providerId, environmentId: 'env-fixture', status: 'active', parentThreadId: args.parentThreadId });
        states.set(id, state); metadata.set(id, args.pluginMetadata);
        request(id, `request-${id}`, args.input ?? [{ type: 'text', text: args.prompt, mentions: [] }]);
        if (finishTransferImmediately && args.pluginMetadata?.fallbackRequestId) {
          states.set(id, { ...state, status: 'idle' }); outputs.set(id, 'Быстрый финальный ответ');
          await harness.behavior.emitThreadEvent('thread.idle', { thread: states.get(id), lastAssistantText: 'Быстрый финальный ответ' });
        }
        return states.get(id);
      },
      send: async (args: any) => {
        operations.push(`send:${args.threadId}`);
        request(args.threadId, `sent-${records.get(args.threadId)?.length}`, args.input);
        states.set(args.threadId, { ...states.get(args.threadId), status: 'active' });
        await harness.behavior.emitThreadEvent('thread.active', { thread: states.get(args.threadId) });
        return { ok: true, delivery: 'sent' };
      },
      update: async ({ threadId, ...args }: any) => { states.set(threadId, { ...states.get(threadId), ...args }); return states.get(threadId); },
      stop: async ({ threadId }: any) => {
        operations.push(`stop:${threadId}`); states.set(threadId, { ...states.get(threadId), status: 'idle' });
        await harness.behavior.emitThreadEvent('thread.idle', { thread: states.get(threadId), lastAssistantText: 'старый частичный ответ' });
        return states.get(threadId);
      },
      output: async ({ threadId }: any) => ({ output: outputs.get(threadId) ?? null }),
      list: async ({ threadIds, originPluginId }: any) => originPluginId ? [...states.values()] : [...states.values()].filter((state) => threadIds?.includes(state.id)),
      getPluginMetadata: async ({ threadId }: any) => metadata.get(threadId) ?? {},
      events: { list: async ({ threadId, types, order, limit, afterSeq }: any) => {
        const rows = (records.get(threadId) ?? []).filter((row) => types.includes(row.type) && (!afterSeq || row.seq > Number(afterSeq)));
        return (order === 'asc' ? rows : [...rows].reverse()).slice(0, Number(limit));
      } },
      queuedMessages: { list: async () => [], delete: async () => ({}) },
    },
  } as any });
  await plugin(bb);
  let db = bb.storage.database();
  db.prepare(`INSERT INTO airds(id,project_id,folder,slug,title,created_at,archived,work_folder) VALUES ('fixture','project-fixture',?,'demo','Demo',0,0,?)`).run(folder, folder);
  db.prepare(`INSERT INTO threads(thread_id,aird_id,role,kind,stage,title,created_at,provider,model) VALUES ('orch','fixture','aird-discovery-loop','orchestrator','discovery','Discovery',0,'claude-code','a-primary')`).run();
  const configure = async (reserve: any, role = 'debugger') => harness.behavior.callRpc('agent_override_set', { role, provider: 'claude-code', model: 'a-primary', effort: 'medium', reserve });
  const spawn = async (task = 'Исходная задача WO-01', role = 'debugger') => {
    const result = await harness.behavior.callAgentTool('sf_spawn_agent', { role, task, workorders: ['WO-01'] }, { threadId: 'orch' });
    assert.equal(result.isError, undefined, text(result));
    return `agent-${spawned}`;
  };
  const fail = async (id: string, category: any = 'rate-limit', inputAccepted = true, requestId?: string) => {
    states.set(id, { ...states.get(id), status: 'error' });
    const event = makeTurnFailedEvent({ threadId: id, requestId: requestId ?? records.get(id)!.filter((row) => row.type === 'client/turn/requested').at(-1).data.requestId, errorInfo: { category, httpStatusCode: category === 'rate-limit' ? 429 : 503, providerCode: null }, inputAccepted, originPluginId: 'software-factory' });
    await harness.behavior.emitThreadEvent('turn.failed', event);
    await processReady({ db, harness }, false);
    return event;
  };
  const done = async (id: string, answer: string) => {
    states.set(id, { ...states.get(id), status: 'idle' }); outputs.set(id, answer);
    await harness.behavior.emitThreadEvent('thread.idle', { thread: states.get(id), lastAssistantText: answer });
  };
  return { get bb() { return bb; }, get harness() { return harness; }, get db() { return db; }, folder, states, records, metadata, outputs, operations, request, configure, spawn, fail, done,
    reload: async () => { const next = await harness.lifecycle.reload(plugin); bb = next.bb; harness = next.harness; db = bb.storage.database(); },
    finishTransfer: () => { finishTransferImmediately = true; },
    close: async () => { await harness.lifecycle.dispose(); rmSync(dir, { recursive: true, force: true }); } };
}

const processPending = (f: Awaited<ReturnType<typeof fixture>>) => processReady(f, true);

async function processReady(f: { db: any; harness: any }, forceDue: boolean) {
  if (forceDue) f.db.prepare("UPDATE fallback_jobs SET due_at=0 WHERE status='pending'").run();
  const worker = f.harness.behavior.runService('model-fallback');
  try {
    for (let i = 0; i < 100; i++) {
      if (!(f.db.prepare("SELECT count(*) AS n FROM fallback_jobs WHERE (status='pending' AND due_at <= ?) OR status='dispatching'").get(Date.now()) as any).n) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.fail('recovery worker did not finish');
  } finally { worker.controller.abort(); await worker.done; }
}

test('reserve settings round trip, preserve omitted values and reject unsupported execution choices', async () => {
  const f = await fixture();
  try {
    await f.configure(reserveB);
    const catalog: any = await f.harness.behavior.callRpc('agents_catalog', null);
    assert.deepEqual(catalog.roles.find((r: any) => r.name === 'debugger').reserve, reserveB);
    await f.harness.behavior.callRpc('agent_override_set', { role: 'debugger', provider: null, model: null, effort: null });
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM fallback_reserves').get().n, 1);
    for (const reserve of [{ ...reserveB, model: 'missing' }, { ...reserveB, provider: 'missing' }, { ...reserveB, effort: 'ultra' }]) {
      await assert.rejects(f.configure(reserve));
    }
    await f.harness.behavior.callRpc('orchestrator_set', { stage: 'delivery', provider: null, model: null, effort: null, reserve: reserveA });
    const next: any = await f.harness.behavior.callRpc('agents_catalog', null);
    assert.deepEqual(next.orchestrators.find((r: any) => r.stage === 'delivery').reserve, reserveA);
    await f.configure(null); assert.equal(f.db.prepare("SELECT count(*) AS n FROM fallback_reserves WHERE kind='agent'").get().n, 0);
  } finally { await f.close(); }
});

test('an accepted partial task switches model in its own thread once, and returns one final result', async () => {
  const f = await fixture();
  try {
    await f.configure(reserveA); const id = await f.spawn();
    const event = await f.fail(id);
    const sent: any = f.harness.inspection.sdk.callsTo('threads.send').at(-1)?.[0];
    assert.equal(sent?.model, 'a-reserve', JSON.stringify(f.db.prepare('SELECT * FROM fallback_jobs').all())); assert.equal(sent.reasoningLevel, 'high'); assert.equal(sent.permissionMode, 'auto');
    assert.doesNotMatch(JSON.stringify(sent.input), /Исходная задача/);
    assert.equal(f.harness.inspection.sdk.callsTo('threads.spawn').length, 1);
    await f.harness.behavior.emitThreadEvent('turn.failed', event);
    assert.equal(f.harness.inspection.sdk.callsTo('threads.send').length, 1);
    await f.done(id, 'WO-01 завершён на запасной');
    const result = await f.harness.behavior.callAgentTool('sf_wait_agents', { threadIds: [id], timeoutSeconds: 10 }, { threadId: 'orch' });
    assert.match(text(result), /WO-01 завершён на запасной/);
    const detail: any = await f.harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    const agent = detail.threads.find((row: any) => row.threadId === id);
    assert.equal(agent.model, 'a-reserve'); assert.equal(agent.sessions.length, 2); assert.equal(detail.session.agents.started, 1);
    const consent = await f.harness.behavior.callRpc('provider-retry.v1.consent', { threadId: id, requestId: event.requestId, reason: 'Rate limited', sendAt: Date.now() });
    assert.equal(consent.kind, 'decline');
  } finally { await f.close(); }
});

test('a rejected input is re-sent verbatim with attachments, rather than replaced by a continuation nudge', async () => {
  const f = await fixture();
  try {
    await f.configure(reserveA); const id = await f.spawn();
    const input = [{ type: 'text', text: 'Новый запрос', mentions: [] }, { type: 'localImage', path: '/fixture/layout.png' }];
    f.request(id, 'rejected', input); await f.fail(id, 'rate-limit', false, 'rejected');
    const sent: any = f.harness.inspection.sdk.callsTo('threads.send').at(-1)?.[0];
    assert.deepEqual(sent.input.slice(0, 2), input);
  } finally { await f.close(); }
});

test('cross-provider transfer preserves full brief and worktree, stops the source, and wait/continue follow the new session', async () => {
  const f = await fixture();
  try {
    await f.configure(reserveB); const id = await f.spawn('Начало ' + 'x'.repeat(6000) + ' КОНЕЦ БРИФА');
    f.records.get(id)!.push({ type: 'item/completed', seq: 2, data: { item: { type: 'commandExecution', command: 'probe', output: 'already written file.ts' } } });
    await f.fail(id);
    assert.deepEqual(f.operations, ['spawn:agent-1', 'stop:agent-1', 'spawn:agent-2'], JSON.stringify(f.db.prepare('SELECT * FROM fallback_jobs').all()));
    const transfer: any = f.harness.inspection.sdk.callsTo('threads.spawn').at(-1)?.[0];
    assert.equal(transfer.providerId, 'codex'); assert.equal(transfer.model, 'b-reserve'); assert.equal(transfer.permissionMode, 'auto');
    assert.deepEqual(transfer.environment, { type: 'reuse', environmentId: 'env-fixture' });
    assert.match(JSON.stringify(transfer.input), /КОНЕЦ БРИФА/); assert.match(JSON.stringify(transfer.input), /already written file.ts/);
    assert.equal(transfer.pluginMetadata.kind, 'agent'); assert.equal(transfer.pluginMetadata.role, 'debugger');
    assert.equal(transfer.parentThreadId, 'orch');
    await f.done('agent-2', 'Новый итог');
    const result = await f.harness.behavior.callAgentTool('sf_wait_agents', { threadIds: [id], timeoutSeconds: 10 }, { threadId: 'orch' });
    assert.match(text(result), /Новый итог/); assert.doesNotMatch(text(result), /старый частичный ответ/);
    for (const [threadId, value] of [[id, 100], ['agent-2', 200]] as const) {
      f.records.get(threadId)!.push({ seq: 1000, type: 'thread/tokenUsage/updated', data: { tokenUsage: { total: { totalTokens: value } } } });
    }
    const detail: any = await f.harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    assert.equal(detail.threads.filter((row: any) => row.kind === 'agent').length, 1);
    assert.equal(detail.session.agents.started, 1);
    assert.equal(detail.session.tokens.total, 300, 'accounting includes the hidden fallback source as well as its replacement');
    assert.deepEqual(detail.session.tokens.byProvider, [{ provider: 'codex', tokens: 200 }, { provider: 'claude-code', tokens: 100 }]);
    const continued = await f.harness.behavior.callAgentTool('sf_continue_agent', { threadId: id, task: 'Продолжи исследование' }, { threadId: 'orch' });
    assert.equal(continued.isError, undefined, text(continued));
    assert.equal((f.harness.inspection.sdk.callsTo('threads.send').at(-1)?.[0] as any).threadId, 'agent-2');
  } finally { await f.close(); }
});

test('a failed reserve blocks in the inbox and never starts a third session', async () => {
  const f = await fixture();
  try {
    await f.configure(reserveB); await f.spawn(); await f.fail('agent-1'); await f.fail('agent-2');
    assert.equal(f.harness.inspection.sdk.callsTo('threads.spawn').length, 2);
    const questions: any = await f.harness.behavior.callRpc('questions_list', { airdId: 'fixture', includeAnswered: false });
    assert.match(JSON.stringify(questions), /Запасная модель тоже недоступна/);
    const result = await f.harness.behavior.callAgentTool('sf_wait_agents', { threadIds: ['agent-1'], timeoutSeconds: 10 }, { threadId: 'orch' });
    assert.match(text(result), /Требуется решение пользователя/);
  } finally { await f.close(); }
});

test('an immediate completion during provider transfer is not erased by the waiting-state bookkeeping', async () => {
  const f = await fixture();
  try {
    await f.configure(reserveB); const id = await f.spawn(); f.finishTransfer(); await f.fail(id);
    const result = await f.harness.behavior.callAgentTool('sf_wait_agents', { threadIds: [id], timeoutSeconds: 10 }, { threadId: 'orch' });
    assert.match(text(result), /Быстрый финальный ответ/); assert.doesNotMatch(text(result), /Продолжение ещё не началось/);
  } finally { await f.close(); }
});

test('a follow-up rejected before send returns is recovered with the new brief and generation', async () => {
  const f = await fixture();
  try {
    await f.configure(reserveB); const id = await f.spawn(); await f.done(id, 'Первый шаг завершён');
    f.harness.sdk.stub('threads.send', async (args: any) => {
      f.request(id, 'fast-rejection', args.input); f.states.set(id, { ...f.states.get(id), status: 'error' });
      await f.harness.behavior.emitThreadEvent('turn.failed', makeTurnFailedEvent({ threadId: id, requestId: 'fast-rejection', errorInfo: { category: 'rate-limit', httpStatusCode: 429, providerCode: null }, inputAccepted: false, originPluginId: 'software-factory' }));
      return { ok: true, delivery: 'sent' };
    });
    await f.harness.behavior.callAgentTool('sf_continue_agent', { threadId: id, task: 'Второй шаг: проверь WO-02' }, { threadId: 'orch' });
    await processPending(f);
    assert.equal(f.operations.filter((op) => op.startsWith('spawn:')).length, 2);
    assert.match(JSON.stringify(f.records.get('agent-2')), /Второй шаг: проверь WO-02/);
    assert.equal(f.db.prepare("SELECT status FROM fallback_jobs WHERE request_id='fast-rejection'").get().status, 'completed');
  } finally { await f.close(); }
});

test('only classified availability failures recover; authorization, spending, policy and unknown failures stop', () => {
  for (const category of ['unauthorized', 'billing', 'budget-exceeded', 'policy', 'sandbox', 'context-window-exceeded', 'bad-request', 'unknown'] as const) {
    assert.equal(failureKind(makeTurnFailedEvent({ errorInfo: { category, httpStatusCode: null, providerCode: null } })), 'stop');
  }
  assert.equal(failureKind(makeTurnFailedEvent({ errorInfo: null })), 'stop');
});

test('transient failures get two delayed retries, then one reserve transfer', async () => {
  const f = await fixture();
  try {
    await f.configure(reserveB); const id = await f.spawn();
    await f.fail(id, 'overloaded');
    let job: any = f.db.prepare('SELECT * FROM fallback_jobs ORDER BY rowid DESC LIMIT 1').get();
    assert.equal(job.action, 'retry'); assert.ok(job.due_at > Date.now());
    assert.equal(f.harness.inspection.sdk.callsTo('threads.send').length, 0);
    await processPending(f);
    await f.fail(id, 'connection-failed'); await processPending(f);
    assert.equal(f.harness.inspection.sdk.callsTo('threads.send').length, 2);
    await f.fail(id, 'overloaded');
    assert.equal(f.harness.inspection.sdk.callsTo('threads.spawn').length, 2);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM fallback_jobs WHERE action='retry'").get().n, 2);
  } finally { await f.close(); }
});

test('a user stop cancels a delayed recovery and a missing reserve leaves ordinary retries alone', async () => {
  const f = await fixture();
  try {
    await f.configure(reserveB); const id = await f.spawn(); await f.fail(id, 'overloaded');
    f.states.set(id, { ...f.states.get(id), status: 'idle' });
    await processPending(f);
    assert.equal(f.harness.inspection.sdk.callsTo('threads.send').length, 0);
    assert.equal(f.harness.inspection.sdk.callsTo('threads.spawn').length, 1);
    await f.configure(null); const other = await f.spawn(); await f.fail(other);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM fallback_jobs').get().n, 1);
    const consent = await f.harness.behavior.callRpc('provider-retry.v1.consent', { threadId: other, requestId: 'none', reason: 'Rate limited', sendAt: 0 });
    assert.equal(consent.kind, 'allow');
  } finally { await f.close(); }
});

test('turning the reserve off cancels a pending recovery on an already running task', async () => {
  const f = await fixture();
  try {
    await f.configure(reserveB); const id = await f.spawn(); await f.fail(id, 'overloaded');
    await f.configure(null); await processPending(f);
    assert.equal(f.operations.filter((op) => op.startsWith('send:')).length, 0);
    assert.equal(f.db.prepare('SELECT status FROM fallback_jobs').get().status, 'cancelled');
    assert.equal(f.db.prepare('SELECT reserve FROM fallback_tasks WHERE thread_id=?').get(id).reserve, null);
  } finally { await f.close(); }
});

test('pending recovery survives plugin reload; an uncertain completed dispatch is reconciled without another send', async () => {
  const f = await fixture();
  try {
    await f.configure(reserveA); const id = await f.spawn(); await f.fail(id, 'overloaded');
    await f.reload();
    await processPending(f);
    assert.equal(f.operations.filter((op) => op.startsWith('send:')).length, 1);
    f.db.prepare("UPDATE fallback_jobs SET status='dispatching',target_thread=NULL").run();
    await f.reload();
    await processPending(f);
    assert.equal(f.operations.filter((op) => op.startsWith('send:')).length, 1);
    assert.equal(f.db.prepare("SELECT status FROM fallback_jobs").get().status, 'completed');
  } finally { await f.close(); }
});

test('an uncertain cross-provider dispatch is located by metadata instead of spawning another agent', async () => {
  const f = await fixture();
  try {
    await f.configure(reserveB); await f.spawn(); await f.fail('agent-1');
    f.db.prepare("UPDATE fallback_jobs SET status='dispatching',target_thread=NULL").run();
    await f.reload(); await processPending(f);
    assert.equal(f.operations.filter((op) => op.startsWith('spawn:')).length, 2);
    assert.equal(f.db.prepare("SELECT target_thread FROM fallback_jobs").get().target_thread, 'agent-2');
  } finally { await f.close(); }
});

test('a failure announced while the plugin was unloaded is recovered once from persisted events', async () => {
  const f = await fixture();
  try {
    await f.configure(reserveA); const id = await f.spawn();
    f.states.set(id, { ...f.states.get(id), status: 'error' });
    f.records.get(id)!.push(
      { type: 'turn/input/accepted', seq: 2, data: { clientRequestId: `request-${id}` } },
      { type: 'provider/error', seq: 3, data: { message: 'limit', errorInfo: { category: 'rate-limit', httpStatusCode: 429, providerCode: null } } },
    );
    await f.reload();
    const worker = f.harness.behavior.runService('model-fallback');
    try {
      for (let i = 0; i < 100 && !f.operations.some((op) => op.startsWith('send:')); i++) await new Promise((resolve) => setTimeout(resolve, 5));
      assert.equal(f.operations.filter((op) => op.startsWith('send:')).length, 1);
    } finally { worker.controller.abort(); await worker.done; }
    await f.reload(); await processPending(f);
    assert.equal(f.operations.filter((op) => op.startsWith('send:')).length, 1);
  } finally { await f.close(); }
});

test('switching cannot silently put an independent implementer on the test author provider', async () => {
  const f = await fixture();
  try {
    f.db.prepare(`INSERT INTO threads(thread_id,aird_id,role,kind,stage,title,created_at,provider) VALUES ('author','fixture','test-author','agent','delivery','Independent author',0,'codex')`).run();
    await f.configure(reserveB, 'worker'); const id = await f.spawn('WO-01', 'worker'); await f.fail(id);
    assert.equal(f.harness.inspection.sdk.callsTo('threads.spawn').length, 1);
    assert.match(f.db.prepare('SELECT reason FROM fallback_jobs').get().reason, /независимость/);
  } finally { await f.close(); }
});

test('orchestrator provider transfer preserves the slice budget and blocks the superseded session', async () => {
  const f = await fixture();
  try {
    await f.harness.behavior.callRpc('orchestrator_set', { stage: 'discovery', provider: 'claude-code', model: 'a-primary', effort: 'medium', reserve: reserveB });
    f.states.set('orch', makeThreadResponse({ id: 'orch', providerId: 'claude-code', projectId: 'project-fixture', environmentId: 'env-fixture', status: 'active' }));
    f.request('orch', 'request-orch', [{ type: 'text', text: '/aird-discovery-loop demo', mentions: [] }]);
    for (let i = 0; i < 6; i++) f.db.prepare("INSERT INTO slices(aird_id,thread_id,ref,started_at) VALUES ('fixture','orch',?,?)").run(`phase-${i}`, i);
    await f.fail('orch');
    const current = f.db.prepare("SELECT target_thread FROM fallback_jobs").get().target_thread;
    const result = await f.harness.behavior.callAgentTool('sf_slice_begin', { ref: 'seventh' }, { threadId: current });
    assert.equal(result.isError, true); assert.match(text(result), /6|лимит/);
    const old = await f.harness.behavior.callAgentTool('sf_slice_begin', { ref: 'seventh' }, { threadId: 'orch' });
    assert.equal(old.isError, true);
    const detail: any = await f.harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    assert.equal(detail.session.slices, 6);
  } finally { await f.close(); }
});
