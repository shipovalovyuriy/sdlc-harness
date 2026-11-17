import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost, makeThreadResponse } from '@get-bb/plugin-sdk/testing';
import plugin from '../server.ts';
import { extractSection } from '../src/sections.ts';

const text = (r: any) => typeof r === 'string' ? r : r.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');

function repo(path: string, file: string) {
  mkdirSync(path, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '-b', 'master'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture');
  writeFileSync(join(path, file), 'base'); git('add', file); git('commit', '-qm', 'base');
  return git;
}

test('a section is cut by its heading up to the next heading of the same level, ignoring fenced code', () => {
  const doc = ['# Doc', '## 1. Панель: статусы', 'text', '```', '## not a heading', '```', '### detail', 'more', '## 2. Next', 'other'].join('\n');
  const section = extractSection(doc, '1. Панель: статусы')!;
  assert.equal(section.from, 2); assert.equal(section.to, 8);
  assert.match(section.text, /### detail/); assert.doesNotMatch(section.text, /2\. Next/);
  assert.equal(extractSection(doc, 'missing'), null);
});

test('a workspace of several repositories gets blind acceptance; workers get their docs_to_read sections in the brief', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-ws-acceptance-'));
  const ws = join(dir, 'ws');
  repo(join(ws, 'front', 'app'), 'page.tsx');
  repo(join(ws, 'back', 'api'), 'main.go');
  const agent = repo(join(ws, '.agent'), 'README.md');
  const pkg = join(ws, '.agent', 'aird', 'demo');
  mkdirSync(join(pkg, 'workorders'), { recursive: true });
  writeFileSync(join(pkg, 'STATE.md'), '---\nstatus: in_delivery\nactive_wave: W1\n---\n');
  writeFileSync(join(pkg, 'REVIEW-MANIFEST.json'), JSON.stringify({ base: 'master' }));
  writeFileSync(join(pkg, '05-api-contracts.md'), '# Contracts\n\n## 1. Панель: статусы\n\nGET /status returns the state.\n\n## 2. Другое\n\nUNRELATED CONTRACT TEXT\n');
  writeFileSync(join(pkg, 'workorders', 'WO-01.md'), '---\nid: WO-01\nkind: implementation\nstatus: ready\nwave: W1\ndod_ids: [DOD-01]\ndocs_to_read:\n  - 05-api-contracts.md#1. Панель: статусы\nallowed_write_paths:\n  - front/app/page.tsx\n---\n# WO-01\n');
  writeFileSync(join(pkg, 'workorders', 'WO-02.md'), '---\nid: WO-02\nkind: implementation\nstatus: ready\nwave: W1\ndod_ids: [DOD-02]\nallowed_write_paths:\n  - back/api/main.go\n---\n# WO-02\n');
  writeFileSync(join(pkg, '09-dod.md'), '### Acceptance Scenarios\n\n| ID | DoD | Boundary | Given | When | Then (expected) | Approved |\n|---|---|---|---|---|---|---|\n| AS-01 | DOD-01 | CLI | base | run | page implemented | user |\n| AS-02 | DOD-02 | CLI | base | run | api implemented | user |\n');
  agent('add', '-A'); agent('commit', '-qm', 'package');

  let spawnCount = 0;
  const { bb, harness } = createFakePluginHost({ pluginId: 'software-factory', settings: { worktreeRoot: join(dir, 'worktrees') }, sdk: {
    system: { config: async () => ({ primaryHostId: 'host-fixture' }) },
    projects: { list: async () => [{ id: 'project-fixture', name: 'Fixture', sources: [{ path: ws, hostId: 'host-fixture', isDefault: true }] }], machineEnvironment: async () => ({ variables: [], inheritedVariables: [] }) },
    providers: { list: async () => [{ id: 'claude-code', available: true }, { id: 'codex', available: true }], models: async () => ({ models: [] }) },
    threads: {
      get: async ({ threadId }: any) => makeThreadResponse({ id: threadId, providerId: 'claude-code', status: 'idle' }),
      spawn: async () => makeThreadResponse({ id: `thread-${++spawnCount}`, providerId: 'claude-code' }),
      list: async () => [], send: async () => ({}),
    },
  } as any });
  try {
    await plugin(bb);
    const db = bb.storage.database();
    db.prepare(`INSERT INTO airds(id,project_id,folder,slug,title,created_at,archived,work_folder,worktree_note) VALUES ('fixture','project-fixture',?,?,?,0,0,?,?)`).run(ws, 'demo', 'Demo', ws, 'workspace');
    await harness.behavior.callRpc('aird_start', { id: 'fixture', stage: 'delivery' });
    const orchestrator = (db.prepare(`SELECT thread_id FROM threads WHERE aird_id='fixture' AND kind='orchestrator'`).get() as any).thread_id;
    const overlay = (db.prepare(`SELECT work_folder FROM airds WHERE id='fixture'`).get() as any).work_folder;
    const call = (name: string, input: any, threadId = orchestrator) => harness.behavior.callAgentTool(name, input, { threadId });

    // The test author: its own suite repository next to the workspace copy, a base per repository.
    const author = await call('sf_spawn_agent', { role: 'test-author', task: 'Write AS-01 and AS-02 from the contract', label: 'acceptance' });
    assert.equal(author.isError, undefined, text(author));
    const authorId = /threadId (thread-\d+)/.exec(text(author))![1]!;
    const row = db.prepare(`SELECT * FROM airds WHERE id='fixture'`).get() as any;
    assert.equal(row.acceptance_folder, join(dir, 'worktrees', 'ws', 'demo-acceptance'));
    assert.ok(existsSync(join(row.acceptance_folder, '.git')), 'the suite has a repository of its own');
    assert.ok(!row.acceptance_folder.startsWith(`${overlay}/`), 'implementers never see the suite');
    const wave = db.prepare(`SELECT * FROM acceptance_waves WHERE aird_id='fixture'`).get() as any;
    assert.deepEqual(Object.keys(JSON.parse(wave.base_ref)), ['back/api', 'front/app']);
    assert.match(JSON.stringify(harness.inspection.sdk.callsTo('threads.spawn').at(-1)), /корень рабочего пространства/);

    const suite = join(row.acceptance_folder, 'acceptance', 'demo'); mkdirSync(suite, { recursive: true });
    writeFileSync(join(suite, 'run.sh'), [
      'a=failed; b=failed; code=1',
      '[ "$(cat "$1/front/app/page.tsx")" = implemented ] && a=passed',
      '[ "$(cat "$1/back/api/main.go")" = implemented ] && b=passed',
      '[ $a = passed ] && [ $b = passed ] && code=0',
      'printf \'[{"id":"AS-01","status":"%s","expected":"page implemented","actual":"x"},{"id":"AS-02","status":"%s","expected":"api implemented","actual":"x"}]\' "$a" "$b" > results.json',
      'exit "$code"', '',
    ].join('\n'));
    execFileSync('git', ['-C', row.acceptance_folder, 'add', '-A']); execFileSync('git', ['-C', row.acceptance_folder, '-c', 'user.email=f@example.invalid', '-c', 'user.name=F', 'commit', '-qm', 'suite']);
    const registered = await call('sf_register_suite', { runScript: join(suite, 'run.sh') }, authorId);
    assert.equal(registered.isError, undefined, text(registered));

    const baseline = await call('sf_run_acceptance', { baseline: true, waitSeconds: 20 });
    assert.match(text(baseline), /Red-first: pass/, text(baseline));
    for (const [rel, file] of [['front/app', 'page.tsx'], ['back/api', 'main.go']] as const) {
      const worktrees = execFileSync('git', ['-C', join(overlay, rel), 'worktree', 'list'], { encoding: 'utf8' }).trim().split('\n');
      assert.equal(worktrees.length, 1, `the baseline copy of ${rel} is removed`);
      writeFileSync(join(overlay, rel, file), 'implemented');
      execFileSync('git', ['-C', join(overlay, rel), 'commit', '-qam', `implement ${rel}`]);
    }
    const green = await call('sf_run_acceptance', { waitSeconds: 20 });
    assert.match(text(green), /Blind acceptance: pass/, text(green));
    let view: any = await harness.behavior.callRpc('acceptance', { id: 'fixture' });
    assert.equal(view.gate, 'passed');
    writeFileSync(join(overlay, 'back', 'api', 'main.go'), 'changed after verification');
    view = await harness.behavior.callRpc('acceptance', { id: 'fixture' });
    assert.equal(view.gate, 'untested', 'a change in any repository invalidates the verdict');

    // A delivery worker gets its workorder's sections, not the whole document.
    const worker = await call('sf_spawn_agent', { role: 'frontend-worker', task: 'Implement WO-01', workorders: ['WO-01'] });
    assert.equal(worker.isError, undefined, text(worker));
    const brief = JSON.stringify(harness.inspection.sdk.callsTo('threads.spawn').at(-1));
    assert.match(brief, /Разделы пакета из docs_to_read/); assert.match(brief, /GET \/status returns the state/);
    assert.doesNotMatch(brief, /UNRELATED CONTRACT TEXT/);
    assert.match(brief, /около 100 действий/);
  } finally { await harness.lifecycle.dispose(); rmSync(dir, { recursive: true, force: true }); }
});
