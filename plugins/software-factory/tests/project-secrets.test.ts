import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost, makePluginAgentConfigurationContext, makeThreadResponse } from '@get-bb/plugin-sdk/testing';
import plugin from '../server.ts';

const VALUE = 'correct-horse-battery-staple';

test('project secrets go to bb machine environment; agents see names and notes, never values', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-secrets-')); const folder = join(dir, 'project'); mkdirSync(folder);
  const stored = new Map<string, { value: string; note: string | null }>();
  const list = () => ({
    builtInGit: { status: 'not logged in', statusMessage: '' },
    variables: [...stored].map(([name, v]) => ({ name, note: v.note, secret: true, value: null })),
    inheritedVariables: [{ name: 'GH_TOKEN', note: null, secret: true, value: null }],
  });
  let spawnCount = 0;
  const { bb, harness } = createFakePluginHost({ pluginId: 'software-factory', settings: { worktreeRoot: join(dir, 'worktrees') }, sdk: {
    system: { config: async () => ({ primaryHostId: 'host-fixture' }) },
    projects: {
      list: async () => [{ id: 'project-fixture', name: 'Fixture', sources: [{ path: folder, hostId: 'host-fixture', isDefault: true }] }],
      machineEnvironment: async () => list(),
      setMachineEnvironmentVariable: async ({ name, value, note }: any) => { stored.set(name, { value, note }); return list(); },
      deleteMachineEnvironmentVariable: async ({ name }: any) => { stored.delete(name); return list(); },
    },
    providers: { list: async () => [{ id: 'claude-code', available: true }], models: async () => ({ models: [] }) },
    threads: { get: async ({ threadId }: any) => makeThreadResponse({ id: threadId, providerId: 'claude-code' }), spawn: async () => makeThreadResponse({ id: `thread-${++spawnCount}` }), list: async () => [], send: async () => ({}) },
  } as any });
  try {
    await plugin(bb);
    await assert.rejects(harness.behavior.callRpc('project_secret_set', { projectId: 'project-fixture', name: '1BAD', value: 'x' }));
    await harness.behavior.callRpc('project_secret_set', { projectId: 'project-fixture', name: 'AIRD_APP_PASSWORD', value: VALUE, note: 'пароль тестового пользователя' });
    assert.equal(stored.get('AIRD_APP_PASSWORD')?.value, VALUE);
    const listed: any = await harness.behavior.callRpc('project_secrets', { projectId: 'project-fixture' });
    assert.deepEqual(listed.secrets.map((s: any) => [s.name, s.inherited]), [['AIRD_APP_PASSWORD', false], ['GH_TOKEN', true]]);
    assert.doesNotMatch(JSON.stringify(listed), new RegExp(VALUE));

    const db = bb.storage.database();
    db.prepare(`INSERT INTO airds(id,project_id,folder,slug,title,created_at,archived,work_folder) VALUES ('fixture','project-fixture',?,?,?,0,0,?)`).run(folder, 'demo', 'Demo', folder);
    await harness.behavior.callRpc('aird_start', { id: 'fixture', stage: 'discovery' });
    const context = (kind: string) => makePluginAgentConfigurationContext({ pluginMetadata: { kind, stage: 'discovery', slug: 'demo' }, project: { id: 'project-fixture', kind: 'standard', name: 'Fixture', gitRemoteUrl: null } } as any);
    const orchestrator = await harness.behavior.resolveAgentConfiguration(context('orchestrator'));
    const agent = await harness.behavior.resolveAgentConfiguration(context('agent'));
    for (const config of [orchestrator, agent]) {
      assert.match(config.instructions ?? '', /\$AIRD_APP_PASSWORD` — пароль тестового пользователя/);
      assert.doesNotMatch(config.instructions ?? '', /GH_TOKEN/, 'global variables are not advertised');
    }
    const everything = JSON.stringify([harness.inspection.sdk.callsTo('threads.spawn'), orchestrator, agent, harness.inspection.logEntries]);
    assert.doesNotMatch(everything, new RegExp(VALUE), 'the value never leaves bb machine environment');

    await harness.behavior.callRpc('project_secret_unset', { projectId: 'project-fixture', name: 'AIRD_APP_PASSWORD' });
    await harness.behavior.callRpc('project_secrets', { projectId: 'project-fixture' });
    const after = await harness.behavior.resolveAgentConfiguration(context('orchestrator'));
    assert.match(after.instructions ?? '', /Секретов у проекта нет/);
  } finally { await harness.lifecycle.dispose(); rmSync(dir, { recursive: true, force: true }); }
});
