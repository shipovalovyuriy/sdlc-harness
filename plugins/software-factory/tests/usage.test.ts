import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost, makeThreadResponse } from '@get-bb/plugin-sdk/testing';
import plugin from '../server.ts';

const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

test('Factory shows tokens per agent and tells a long delivery worker to checkpoint once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-usage-')); const folder = join(dir, 'project'); mkdirSync(folder);
  const actions = new Map<string, number>([['worker-long', 105], ['worker-short', 40]]);
  const tokens = new Map<string, number>([['worker-long', 58_000_000], ['worker-short', 4_000_000], ['orch-1', 3_000_000]]);
  mock.timers.enable({ apis: ['setInterval'] });
  const { bb, harness } = createFakePluginHost({ pluginId: 'software-factory', settings: { worktreeRoot: join(dir, 'worktrees') }, sdk: {
    system: { config: async () => ({ primaryHostId: 'host-fixture' }) },
    projects: { list: async () => [{ id: 'project-fixture', name: 'Fixture', sources: [{ path: folder, hostId: 'host-fixture', isDefault: true }] }], machineEnvironment: async () => ({ variables: [], inheritedVariables: [] }) },
    providers: { list: async () => [{ id: 'claude-code', available: true }], models: async () => ({ models: [] }) },
    threads: {
      get: async ({ threadId }: any) => makeThreadResponse({ id: threadId, providerId: 'claude-code', status: threadId.startsWith('worker') ? 'active' : 'idle' }),
      list: async () => [], send: async () => ({}),
      events: {
        list: async ({ threadId, types, afterSeq }: any) => {
          if (types?.[0] === 'thread/tokenUsage/updated') {
            return tokens.has(threadId) ? [{ seq: 1, type: types[0], data: { tokenUsage: { total: { totalTokens: tokens.get(threadId) } } } }] : [];
          }
          if (types?.[0] === 'provider/rateLimits/updated') {
            if (threadId === 'worker-long') return [{ seq: 2, createdAt: Date.now() - 60_000, data: { rateLimits: { providerId: 'claude-code', status: 'warning', windows: [{ label: 'Five-hour limit', status: 'warning', resetsAtMs: Date.now() + 3600_000 }] } } }];
            if (threadId === 'worker-short') return [{ seq: 2, createdAt: Date.now() - 600_000, data: { rateLimits: { providerId: 'claude-code', status: 'allowed', windows: [{ label: 'Five-hour limit', status: 'allowed', resetsAtMs: Date.now() + 3600_000 }] } } }];
            return [];
          }
          if (afterSeq) return [];
          const n = actions.get(threadId) ?? 0;
          return Array.from({ length: n * 2 }, (_, i) => ({ seq: i + 1, type: 'item/completed', data: { item: { type: i % 2 ? 'reasoning' : 'commandExecution' } } }));
        },
      },
    },
  } as any });
  try {
    await plugin(bb);
    const db = bb.storage.database();
    db.prepare(`INSERT INTO airds(id,project_id,folder,slug,title,created_at,archived,work_folder) VALUES ('fixture','project-fixture',?,?,?,0,0,?)`).run(folder, 'demo', 'Demo', folder);
    const now = Date.now();
    db.prepare(`INSERT INTO threads(thread_id,aird_id,role,kind,stage,title,created_at,provider) VALUES ('orch-1','fixture','aird-delivery-loop','orchestrator','delivery','Delivery',?,'claude-code')`).run(now);
    db.prepare(`INSERT INTO threads(thread_id,aird_id,role,kind,stage,title,created_at,provider,refs,parent_thread_id) VALUES ('worker-long','fixture','backend-worker','agent','delivery','backend-worker · WO-05',?,'claude-code','["WO-05"]','orch-1')`).run(now);
    db.prepare(`INSERT INTO threads(thread_id,aird_id,role,kind,stage,title,created_at,provider,refs,parent_thread_id) VALUES ('worker-short','fixture','backend-worker','agent','delivery','backend-worker · WO-04',?,'claude-code','["WO-04"]','orch-1')`).run(now);

    mock.timers.tick(60_000); await flush();
    const sends = () => harness.inspection.sdk.callsTo('threads.send').map((call: any) => JSON.stringify(call));
    const signals = sends().filter((call) => call.includes('бюджет воркера'));
    assert.equal(signals.length, 1, 'only the worker past the budget is signalled');
    assert.match(signals[0]!, /worker-long/); assert.match(signals[0]!, /steer-if-active/);
    assert.match(signals[0]!, /105 действий/); assert.match(signals[0]!, /evidence\/WO-05-progress\.md/);
    assert.ok((db.prepare(`SELECT budget_signal_at FROM threads WHERE thread_id='worker-long'`).get() as any).budget_signal_at);

    mock.timers.tick(60_000); await flush();
    assert.equal(sends().filter((call) => call.includes('бюджет воркера')).length, 1, 'the signal is sent once');

    const detail: any = await harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    const long = detail.threads.find((thread: any) => thread.threadId === 'worker-long');
    assert.equal(long.tokens, 58_000_000); assert.ok(long.budgetSignalAt);
    assert.equal(detail.session.tokens.total, 65_000_000);
    assert.deepEqual(detail.session.tokens.byProvider, [{ provider: 'claude-code', tokens: 65_000_000 }]);
    // The newest limit report per provider wins: the worker that just saw a warning.
    assert.equal(detail.session.limits.length, 1);
    assert.equal(detail.session.limits[0].provider, 'claude-code'); assert.equal(detail.session.limits[0].status, 'warning');
    assert.equal(detail.session.limits[0].window, 'Five-hour limit'); assert.ok(detail.session.limits[0].resetsAt > Date.now());
  } finally {
    mock.timers.reset();
    await harness.lifecycle.dispose(); rmSync(dir, { recursive: true, force: true });
  }
});
