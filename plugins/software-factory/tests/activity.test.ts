import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost, makeThreadResponse } from '@get-bb/plugin-sdk/testing';
import plugin from '../server.ts';

test('a thread whose turn ended but whose background task runs is shown as working, with what it does and said', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-activity-')); const folder = join(dir, 'project'); mkdirSync(folder);
  const now = Date.now();
  const events: Record<string, any[]> = {
    'orch-1': [
      { seq: 1, type: 'item/started', createdAt: now - 30 * 60_000, data: { item: { id: 'bg-1', type: 'backgroundTask', description: 'Run blind acceptance', taskStatus: 'running' } } },
      { seq: 2, type: 'item/started', createdAt: now - 20 * 60_000, data: { item: { id: 'bg-2', type: 'backgroundTask', description: 'Install dependencies', taskStatus: 'running' } } },
      { seq: 3, type: 'item/backgroundTask/completed', createdAt: now - 19 * 60_000, data: { item: { id: 'bg-2', type: 'backgroundTask', taskStatus: 'completed' } } },
      { seq: 4, type: 'item/completed', createdAt: now - 5 * 60_000, data: { item: { id: 'm-1', type: 'agentMessage', text: 'Приёмка ещё идёт в фоне, осталось 14 сценариев.' } } },
      { seq: 5, type: 'turn/completed', createdAt: now - 5 * 60_000, data: {} },
    ],
    'worker-1': [
      { seq: 1, type: 'item/started', createdAt: now - 60_000, data: { item: { id: 'c-1', type: 'commandExecution', command: 'cd /work && go test ./internal/portraits/...' } } },
    ],
  };
  const status: Record<string, string> = { 'orch-1': 'idle', 'worker-1': 'active' };
  const { bb, harness } = createFakePluginHost({ pluginId: 'software-factory', settings: { worktreeRoot: join(dir, 'worktrees') }, sdk: {
    system: { config: async () => ({ primaryHostId: 'host-fixture' }) },
    projects: { list: async () => [{ id: 'project-fixture', name: 'Fixture', sources: [{ path: folder, hostId: 'host-fixture', isDefault: true }] }], machineEnvironment: async () => ({ variables: [], inheritedVariables: [] }) },
    providers: { list: async () => [{ id: 'claude-code', available: true }], models: async () => ({ models: [] }) },
    threads: {
      get: async ({ threadId }: any) => makeThreadResponse({ id: threadId, providerId: 'claude-code', status: (status[threadId] ?? 'idle') as any }),
      list: async ({ threadIds }: any = {}) => (threadIds ?? Object.keys(status)).map((id: string) => makeThreadResponse({ id, providerId: 'claude-code', status: (status[id] ?? 'idle') as any })),
      send: async () => ({}),
      events: {
        list: async ({ threadId, types, afterSeq, limit }: any) => {
          if (Number(limit) > 100) throw new Error('HTTP 400: Thread event limit cannot exceed 100');
          return (events[threadId] ?? []).filter((event) => types.includes(event.type) && (!afterSeq || event.seq > Number(afterSeq))).slice(0, Number(limit));
        },
      },
    },
  } as any });
  try {
    await plugin(bb);
    const db = bb.storage.database();
    db.prepare(`INSERT INTO airds(id,project_id,folder,slug,title,created_at,archived,work_folder) VALUES ('fixture','project-fixture',?,?,?,0,0,?)`).run(folder, 'demo', 'Demo', folder);
    db.prepare(`INSERT INTO threads(thread_id,aird_id,role,kind,stage,title,created_at,provider) VALUES ('orch-1','fixture','aird-delivery-loop','orchestrator','delivery','aird-delivery-loop · demo',?,'claude-code')`).run(now - 3600_000);
    db.prepare(`INSERT INTO threads(thread_id,aird_id,role,kind,stage,title,created_at,provider,parent_thread_id) VALUES ('worker-1','fixture','backend-worker','agent','delivery','backend-worker · WO-02',?,'claude-code','orch-1')`).run(now - 600_000);

    let detail: any = await harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    const orchestrator = () => detail.threads.find((thread: any) => thread.threadId === 'orch-1');
    assert.equal(orchestrator().status, 'background', 'idle with a running background task is not "готов"');
    assert.deepEqual(orchestrator().activity.background.map((task: any) => task.description), ['Run blind acceptance'], 'a completed task is gone');
    assert.equal(detail.now.working, true);
    assert.deepEqual(detail.now.items.map((item: any) => [item.threadId, item.kind]), [['orch-1', 'background'], ['worker-1', 'running']]);
    assert.match(detail.now.items.find((item: any) => item.threadId === 'worker-1').text, /выполняет: go test \.\/internal\/portraits/);
    assert.match(detail.now.orchestrator.message, /осталось 14 сценариев/);

    // The background task finishes and the worker's turn ends: nobody works, the orchestrator waits.
    events['orch-1'].push({ seq: 6, type: 'item/backgroundTask/completed', createdAt: Date.now(), data: { item: { id: 'bg-1', type: 'backgroundTask', taskStatus: 'completed' } } });
    status['worker-1'] = 'idle';
    await harness.behavior.emitThreadEvent('thread.idle', { thread: makeThreadResponse({ id: 'worker-1', providerId: 'claude-code', status: 'idle' }) } as any);
    await new Promise((resolve) => setTimeout(resolve, 5_100));
    detail = await harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    assert.equal(orchestrator().status, 'waiting');
    assert.equal(detail.now.working, false);
    assert.equal(detail.threads.find((thread: any) => thread.threadId === 'worker-1').status, 'idle');
  } finally { await harness.lifecycle.dispose(); rmSync(dir, { recursive: true, force: true }); }
});
