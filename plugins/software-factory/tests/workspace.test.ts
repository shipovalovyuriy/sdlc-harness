import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost, makeThreadResponse } from '@get-bb/plugin-sdk/testing';
import plugin from '../server.ts';
import { nestedRepos, repoOfPath } from '../src/worktree.ts';

function repo(path: string, file: string) {
  mkdirSync(path, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '-b', 'master'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture');
  writeFileSync(join(path, file), 'base'); git('add', file); git('commit', '-qm', 'base');
  return git;
}

test('repository of a workspace path is the deepest nested repository', () => {
  const repos = ['front/app', 'front/app/vendor-repo', 'back/api'];
  assert.equal(repoOfPath('front/app/src/x.ts', repos), 'front/app');
  assert.equal(repoOfPath('./front/app/vendor-repo/a/**', repos), 'front/app/vendor-repo');
  assert.equal(repoOfPath('.agent/aird/x/evidence/a.txt', repos), null);
  assert.equal(repoOfPath('back/api', repos), 'back/api');
});

test('polyrepo workspace: delivery gets worktrees for written repositories only and never touches the user checkouts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-workspace-'));
  const ws = join(dir, 'ws');
  const front = repo(join(ws, 'front', 'app'), 'page.tsx');
  repo(join(ws, 'back', 'api'), 'main.go');
  const agent = repo(join(ws, '.agent'), 'README.md');
  writeFileSync(join(ws, 'go.work'), 'go 1.23\n');
  mkdirSync(join(ws, 'front', 'app', 'node_modules'));
  const pkg = join(ws, '.agent', 'aird', 'demo');
  mkdirSync(join(pkg, 'workorders'), { recursive: true });
  writeFileSync(join(pkg, 'STATE.md'), '---\nstatus: ready_for_delivery\nactive_wave: W1\n---\n');
  writeFileSync(join(pkg, 'REVIEW-MANIFEST.json'), JSON.stringify({ base: 'master' }));
  writeFileSync(join(pkg, 'workorders', 'WO-01.md'), '---\nid: WO-01\nkind: implementation\nstatus: ready\nwave: W1\nallowed_write_paths:\n  - front/app/page.tsx\n  - .agent/aird/demo/evidence/wo01.txt\n---\n# WO-01\n');
  agent('add', '-A'); agent('commit', '-qm', 'package');
  assert.deepEqual(nestedRepos(ws), ['.agent', 'back/api', 'front/app']);

  let spawnCount = 0;
  const { bb, harness } = createFakePluginHost({ pluginId: 'software-factory', settings: { worktreeRoot: join(dir, 'worktrees') }, sdk: {
    system: { config: async () => ({ primaryHostId: 'host-fixture' }) },
    projects: { list: async () => [{ id: 'project-fixture', name: 'Fixture', sources: [{ path: ws, hostId: 'host-fixture', isDefault: true }] }] },
    providers: { list: async () => [{ id: 'claude-code', available: true }], models: async () => ({ models: [] }) },
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

    let detail: any = await harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    assert.deepEqual(detail.deliveryRepos, ['front/app']); assert.equal(detail.deliveryReposReady, false);

    await harness.behavior.callRpc('aird_start', { id: 'fixture', stage: 'delivery' });
    const row = db.prepare(`SELECT * FROM airds WHERE id='fixture'`).get() as any;
    const overlay = row.work_folder;
    assert.equal(overlay, join(dir, 'worktrees', 'ws', 'demo'));
    const branchOf = (path: string) => execFileSync('git', ['-C', path, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
    assert.equal(branchOf(join(overlay, 'front', 'app')), 'aird/demo');
    // Code: an own clone whose git data lives inside the AIRD folder, not a worktree of the user's repository.
    assert.equal(lstatSync(join(overlay, 'front', 'app')).isSymbolicLink(), false);
    assert.equal(lstatSync(join(overlay, 'front', 'app', '.git')).isDirectory(), true);
    for (const linked of ['back', 'go.work']) assert.equal(lstatSync(join(overlay, linked)).isSymbolicLink(), true, linked);
    assert.equal(front('rev-parse', '--abbrev-ref', 'HEAD'), 'master', 'the user checkout keeps its branch');
    // The package is tracked in .agent here, so .agent travels as its own clone on the AIRD branch.
    assert.equal(lstatSync(join(overlay, '.agent')).isSymbolicLink(), false);
    assert.equal(branchOf(join(overlay, '.agent')), 'aird/demo');
    assert.equal(readFileSync(join(overlay, '.agent', 'aird', 'demo', 'STATE.md'), 'utf8'), readFileSync(join(pkg, 'STATE.md'), 'utf8'));

    const spawn = JSON.stringify(harness.inspection.sdk.callsTo('threads.spawn')[0]);
    assert.match(spawn, new RegExp(overlay.replace(/[/.]/g, '\\$&')));
    assert.match(spawn, /front\/app.*свой клон на ветке/);
    assert.match(spawn, /Пакет AIRD:/);
    assert.match(spawn, /node_modules/);
    assert.doesNotMatch(spawn, /worktree на ветке|в worktree/);

    detail = await harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    assert.equal(detail.deliveryReposReady, true); assert.equal(detail.summary.exists, true);
    assert.deepEqual(detail.deliveryRepos, ['front/app'], 'the package repository is not a code repository');
    assert.equal(detail.layout.ok, true, JSON.stringify(detail.layout));
    assert.deepEqual(detail.layout.checks.map((c: any) => c.label), ['Код front/app', 'Git-данные front/app', 'Пакет AIRD']);

    writeFileSync(join(overlay, 'front', 'app', 'page.tsx'), 'implemented');
    execFileSync('git', ['-C', join(overlay, 'front', 'app'), 'commit', '-qam', 'WO-01: implement']);
    const commits: any = await harness.behavior.callRpc('aird_commits', { id: 'fixture' });
    assert.ok(commits.commits.some((c: any) => c.subject === 'WO-01: implement'), JSON.stringify(commits));
    const sha = commits.commits.find((c: any) => c.subject === 'WO-01: implement').sha;
    const shown: any = await harness.behavior.callRpc('aird_commit', { id: 'fixture', sha });
    assert.equal(shown.error, null); assert.match(shown.patch, /implemented/);
    assert.equal(readFileSync(join(ws, 'front', 'app', 'page.tsx'), 'utf8'), 'base', 'the user checkout is untouched');
    assert.equal(front('rev-parse', 'refs/heads/aird/demo'), sha, 'Factory pushed the AIRD branch into the user repository');

    // A second start is idempotent; an empty note may arrive as null from the bb RPC transport.
    await harness.behavior.callRpc('aird_start', { id: 'fixture', stage: 'delivery', note: null });
    assert.equal(branchOf(join(overlay, 'front', 'app')), 'aird/demo');
  } finally { await harness.lifecycle.dispose(); rmSync(dir, { recursive: true, force: true }); }
});

test('an untracked workspace package moves inside the AIRD folder; the old path links to it; a legacy worktree becomes a clone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-workspace-pkg-'));
  const ws = join(dir, 'ws');
  const front = repo(join(ws, 'front', 'app'), 'page.tsx');
  repo(join(ws, '.agent'), 'README.md');
  const pkg = join(ws, '.agent', 'aird', 'demo');
  mkdirSync(join(pkg, 'workorders'), { recursive: true });
  writeFileSync(join(pkg, 'STATE.md'), '---\nstatus: ready_for_delivery\nactive_wave: W1\n---\n');
  writeFileSync(join(pkg, 'workorders', 'WO-01.md'), '---\nid: WO-01\nkind: implementation\nstatus: ready\nwave: W1\nallowed_write_paths:\n  - front/app/page.tsx\n---\n# WO-01\n');
  // A legacy layout: a git worktree of the user's repository, made before clones.
  const overlay = join(dir, 'worktrees', 'ws', 'demo');
  mkdirSync(join(overlay, 'front'), { recursive: true });
  writeFileSync(join(ws, 'front', 'app', '.env'), 'TRACKED=1'); writeFileSync(join(ws, 'front', 'app', '.gitignore'), 'node_modules\n');
  front('add', '.env', '.gitignore'); front('commit', '-qm', 'env');
  front('worktree', 'add', '-q', '-b', 'aird/demo', join(overlay, 'front', 'app'));
  mkdirSync(join(overlay, 'front', 'app', 'node_modules', 'dep'), { recursive: true });
  const { bb, harness } = createFakePluginHost({ pluginId: 'software-factory', settings: { worktreeRoot: join(dir, 'worktrees') }, sdk: {
    system: { config: async () => ({ primaryHostId: 'host-fixture' }) },
    projects: { list: async () => [{ id: 'project-fixture', name: 'Fixture', sources: [{ path: ws, hostId: 'host-fixture', isDefault: true }] }] },
    providers: { list: async () => [{ id: 'claude-code', available: true }], models: async () => ({ models: [] }) },
    threads: { get: async ({ threadId }: any) => makeThreadResponse({ id: threadId, providerId: 'claude-code', status: 'idle' }), spawn: async () => makeThreadResponse({ id: 'thread-1' }), list: async () => [], send: async () => ({}) },
  } as any });
  try {
    await plugin(bb);
    const db = bb.storage.database();
    const repos = JSON.stringify([{ rel: 'front/app', main: join(ws, 'front', 'app'), path: join(overlay, 'front', 'app'), branch: 'aird/demo', base: 'master' }]);
    db.prepare(`INSERT INTO airds(id,project_id,folder,slug,title,created_at,archived,work_folder,worktree,branch,repos) VALUES ('fixture','project-fixture',?,?,?,0,0,?,?,?,?)`).run(ws, 'demo', 'Demo', overlay, overlay, 'aird/demo', repos);
    let detail: any = await harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    assert.equal(detail.layout.ok, false, 'a worktree keeps git data outside the AIRD folder');
    assert.match(JSON.stringify(detail.layout.checks), /вне рабочей папки/);

    await harness.behavior.callRpc('aird_start', { id: 'fixture', stage: 'delivery' });
    assert.equal(lstatSync(join(overlay, 'front', 'app', '.git')).isDirectory(), true, 'the worktree became an own clone');
    assert.equal(lstatSync(join(overlay, 'front', 'app', 'node_modules', 'dep')).isDirectory(), true, 'installed dependencies survive the migration');
    assert.equal(readFileSync(join(overlay, 'front', 'app', '.env'), 'utf8'), 'TRACKED=1', 'a tracked .env comes with the clone');
    assert.equal(lstatSync(join(overlay, '.agent', 'aird', 'demo')).isDirectory(), true);
    assert.equal(lstatSync(join(overlay, '.agent', 'aird', 'demo')).isSymbolicLink(), false, 'the package lives inside the AIRD folder');
    assert.equal(lstatSync(pkg).isSymbolicLink(), true, 'the old path links to it');
    assert.equal(realpathSync(join(pkg, 'STATE.md')), realpathSync(join(overlay, '.agent', 'aird', 'demo', 'STATE.md')));
    detail = await harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    assert.equal(detail.layout.ok, true, JSON.stringify(detail.layout));
  } finally { await harness.lifecycle.dispose(); rmSync(dir, { recursive: true, force: true }); }
});
