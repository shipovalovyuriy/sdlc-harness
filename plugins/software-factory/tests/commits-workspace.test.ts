import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost, makeThreadResponse } from '@get-bb/plugin-sdk/testing';
import plugin from '../server.ts';
import { uniqueRepositories } from '../src/git.ts';

function repo(path: string) {
  mkdirSync(path, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '-b', 'master'); git('config', 'user.email', 'f@example.invalid'); git('config', 'user.name', 'F');
  const commit = (file: string, text: string, message: string) => { writeFileSync(join(path, file), text); git('add', file); git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  commit('README.md', 'base', 'base');
  return { git, commit };
}

test('a workspace that is not a repository: commits come from the repositories inside it, once each, labelled', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-commits-ws-'));
  const ws = join(dir, 'ws');
  try {
    // a: the AIRD branch is alive; a linked worktree of it must not duplicate its commits.
    const a = repo(join(ws, 'front', 'a'));
    a.git('checkout', '-q', '-b', 'aird/demo'); const live = a.commit('page.tsx', 'x', 'WO-01: page'); a.git('checkout', '-q', 'master');
    a.git('worktree', 'add', '-q', '-b', 'feature', join(ws, '.worktrees', 'a-feature'));
    // b: merged through a pull request, branch deleted afterwards.
    const b = repo(join(ws, 'back', 'b'));
    b.git('checkout', '-q', '-b', 'aird/demo'); const merged = b.commit('api.go', 'y', 'WO-02: api');
    b.git('checkout', '-q', 'master'); b.git('merge', '-q', '--no-ff', 'aird/demo', '-m', 'Merge pull request #7 from org/aird/demo'); b.git('branch', '-q', '-D', 'aird/demo');
    // c: unrelated.
    const c = repo(join(ws, 'back', 'c')); c.commit('other.go', 'z', 'unrelated');
    // d: no AIRD branch at all; the package's evidence records which commits are the AIRD's.
    const d = repo(join(ws, 'back', 'd'));
    const oldHead = execFileSync('git', ['-C', join(ws, 'back', 'd'), 'commit', '-q', '--allow-empty', '-m', 'released long ago'], { env: { ...process.env, GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z', GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z' } }) && d.git('rev-parse', 'HEAD');
    const dBase = d.git('rev-parse', 'HEAD');
    const recordedOnly = d.commit('svc.go', 'w', 'WO-03: service');
    // the package has its own repository.
    const agent = repo(join(ws, '.agent'));
    mkdirSync(join(ws, '.agent', 'aird', 'demo'), { recursive: true });
    mkdirSync(join(ws, '.agent', 'aird', 'demo', 'evidence'), { recursive: true });
    writeFileSync(join(ws, '.agent', 'aird', 'demo', 'evidence', 'wo-03.md'), [
      `- slice commit: ${recordedOnly.slice(0, 8)}`,
      `- base_ref: ${dBase}`,
      `- review: git diff ${dBase.slice(0, 8)}..HEAD`,
      `GATEWAY_HEAD=${oldHead}`,
    ].join('\n'));
    const pkgCommit = agent.commit('aird/demo/STATE.md', '---\nstatus: discovery\n---\n', 'docs: demo package');

    const unique = uniqueRepositories(ws, ['.worktrees/a-feature', 'back/b', 'back/c', 'front/a']);
    assert.deepEqual(unique.map((r) => r.rel), ['back/b', 'back/c', 'front/a'], 'the worktree collapses into its main checkout');
    void c;

    const { bb, harness } = createFakePluginHost({ pluginId: 'software-factory', settings: { worktreeRoot: join(dir, 'worktrees') }, sdk: {
      system: { config: async () => ({ primaryHostId: 'host-fixture' }) },
      projects: { list: async () => [{ id: 'project-fixture', name: 'Fixture', sources: [{ path: ws, hostId: 'host-fixture', isDefault: true }] }] },
      providers: { list: async () => [], models: async () => ({ models: [] }) },
      threads: { get: async ({ threadId }: any) => makeThreadResponse({ id: threadId }), list: async () => [], send: async () => ({}) },
    } as any });
    try {
      await plugin(bb);
      bb.storage.database().prepare(`INSERT INTO airds(id,project_id,folder,slug,title,created_at,archived,work_folder) VALUES ('fixture','project-fixture',?,?,?,0,0,?)`).run(ws, 'demo', 'Demo', ws);
      const result: any = await harness.behavior.callRpc('aird_commits', { id: 'fixture' });
      assert.equal(result.error, null);
      assert.equal(result.branch, 'aird/demo');
      assert.deepEqual(result.repos, ['back/b', 'back/d', 'front/a']);
      assert.equal(result.commits.find((commit: any) => commit.sha === recordedOnly)?.repo, 'back/d', 'a commit recorded in evidence is found without any branch');
      assert.ok(!result.commits.some((commit: any) => commit.sha === dBase), 'the base (base_ref, the left side of A..B) is not the AIRD');
      assert.ok(!result.commits.some((commit: any) => commit.subject === 'released long ago'), 'a commit from before the AIRD began is context, not the AIRD');
      const bySha = new Map(result.commits.map((commit: any) => [commit.sha, commit]));
      assert.equal((bySha.get(live) as any)?.repo, 'front/a');
      assert.equal((bySha.get(merged) as any)?.repo, 'back/b', 'a merged and deleted branch is still found');
      assert.equal((bySha.get(pkgCommit) as any)?.repo, 'пакет');
      assert.equal(result.commits.filter((commit: any) => commit.sha === live).length, 1, 'no duplicates from the worktree');
      assert.ok(!result.commits.some((commit: any) => commit.subject === 'unrelated'));
      const shown: any = await harness.behavior.callRpc('aird_commit', { id: 'fixture', sha: merged });
      assert.equal(shown.error, null); assert.match(shown.patch, /api\.go/);
    } finally { await harness.lifecycle.dispose(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
