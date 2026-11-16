import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acceptanceBase, acceptanceSuiteRevision, deliveryRevision, ensureAcceptanceWorktree, refreshAcceptanceWorktree, withBaselineCheckout } from '../src/worktree.ts';
test('wave baselines are immutable and wave two includes wave one, preserving the independent suite', async () => {
  const dir=mkdtempSync(join(tmpdir(),'sf-git-'));const repo=join(dir,'repo');mkdirSync(repo);
  const git=(...args:string[])=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const commit=(text:string)=>{writeFileSync(join(repo,'behavior.txt'),text);git('add','behavior.txt');git('commit','-qm',text);return git('rev-parse','HEAD');};
  try {
    git('init','-q','-b','main');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');
    const first=commit('base');
    mkdirSync(join(repo,'.agent','aird','demo'),{recursive:true});writeFileSync(join(repo,'.agent','aird','demo','STATE.md'),'bookkeeping');
    assert.equal(await acceptanceBase(repo),first);
    const clean=await deliveryRevision(repo);writeFileSync(join(repo,'.agent','aird','demo','STATE.md'),'different bookkeeping');assert.equal(await deliveryRevision(repo),clean);
    writeFileSync(join(repo,'behavior.txt'),'dirty source');assert.notEqual(await deliveryRevision(repo),clean);writeFileSync(join(repo,'behavior.txt'),'base');assert.equal(await deliveryRevision(repo),clean);
    const info=await ensureAcceptanceWorktree(repo,'demo',join(dir,'worktrees'),first);
    assert.ok(info.worktree);const author=info.workFolder;
    mkdirSync(join(author,'acceptance','demo'),{recursive:true});writeFileSync(join(author,'acceptance','demo','run.sh'),'echo suite');
    execFileSync('git',['-C',author,'add','acceptance']);execFileSync('git',['-C',author,'commit','-qm','independent suite']);
    writeFileSync(join(author,'acceptance','demo','results.json'),'[]');execFileSync('git',['-C',author,'add','acceptance']);execFileSync('git',['-C',author,'commit','-qm','recorded evidence']);
    const suiteRevision=await acceptanceSuiteRevision(author,'demo');writeFileSync(join(author,'acceptance','demo','results.json'),'[{"id":"AS-01"}]');assert.equal(await acceptanceSuiteRevision(author,'demo'),suiteRevision);
    const wave1=commit('wave one implemented');
    await withBaselineCheckout(repo,first,async target=>{assert.equal(readFileSync(join(target,'behavior.txt'),'utf8'),'base');});
    const second=await acceptanceBase(repo);assert.equal(second,wave1);
    await refreshAcceptanceWorktree(author,second,repo);
    assert.equal(readFileSync(join(author,'behavior.txt'),'utf8'),'wave one implemented');
    assert.equal(readFileSync(join(author,'acceptance','demo','run.sh'),'utf8'),'echo suite');
    await refreshAcceptanceWorktree(author,second,repo); // repeat is idempotent
    commit('wave two implemented');
    await withBaselineCheckout(repo,second,async target=>{assert.equal(readFileSync(join(target,'behavior.txt'),'utf8'),'wave one implemented');});
    const list=git('worktree','list','--porcelain');assert.doesNotMatch(list,/aird-baseline-/);
    writeFileSync(join(repo,'behavior.txt'),'uncommitted');await assert.rejects(acceptanceBase(repo),/незакоммиченные/);
    writeFileSync(join(repo,'behavior.txt'),'wave two implemented');writeFileSync(join(repo,'new-code.ts'),'new source');await assert.rejects(acceptanceBase(repo),/незакоммиченные/);
    writeFileSync(join(author,'acceptance','demo','run.sh'),'dirty suite');await assert.rejects(refreshAcceptanceWorktree(author,git('rev-parse','HEAD'),repo),/незакоммиченные/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('the baseline checkout borrows installed dependencies so the project test runner can start', async () => {
  const { execFileSync } = await import('node:child_process');
  const { existsSync, lstatSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { withBaselineCheckout } = await import('../src/worktree.ts');
  const dir = mkdtempSync(join(tmpdir(), 'sf-baseline-deps-'));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-q', '-b', 'master'); git('config', 'user.email', 'f@example.invalid'); git('config', 'user.name', 'F');
    writeFileSync(join(repo, '.gitignore'), 'node_modules\n'); writeFileSync(join(repo, 'a.txt'), 'base'); git('add', '-A'); git('commit', '-qm', 'base');
    mkdirSync(join(repo, 'node_modules', '.bin'), { recursive: true });
    const base = git('rev-parse', 'HEAD');
    const seen = await withBaselineCheckout(repo, base, async (target) => ({ linked: lstatSync(join(target, 'node_modules')).isSymbolicLink(), bin: existsSync(join(target, 'node_modules', '.bin')) }));
    assert.deepEqual(seen, { linked: true, bin: true });
    assert.ok(existsSync(join(repo, 'node_modules', '.bin')), 'removing the checkout keeps the borrowed dependencies');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
