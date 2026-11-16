import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessRun, runSuite, selectScenarioScope, verdictText } from '../src/acceptance.ts';
const scenarios = [
  { id: 'AS-01', dodIds: ['DOD-01'], then: 'closed' },
  { id: 'AS-02', dodIds: ['DOD-02'], then: 'already closed' },
  { id: 'AS-03', dodIds: ['DOD-03'], then: 'exported' },
];
const workorders = [{ wave: 'W1', dodIds: ['DOD-01','DOD-02'] }, { wave: 'W2', dodIds: ['DOD-03','DOD-01'] }];
const result = (id: string, status: 'passed'|'failed'|'skipped', note?: string) => ({ id, status, expected: 'expected', actual: 'actual', note });
const run = (results: any[], exitCode = 0, error: string|null = null) => ({ results, exitCode, error, log: '' });
test('W1 ignores future rows; W2 keeps prior-wave regression rows', () => {
  const first = selectScenarioScope(scenarios, workorders, 'W1');
  assert.deepEqual(first.required.map(s=>s.id), ['AS-01','AS-02']);
  assert.match(verdictText([result('AS-01','passed'),result('AS-02','passed')],first.required,''), /: pass\./);
  const second = selectScenarioScope(scenarios, workorders, 'W2');
  assert.deepEqual(second.current.map(s=>s.id), ['AS-03']);
  assert.deepEqual(second.previous.map(s=>s.id), ['AS-01','AS-02']);
  assert.throws(()=>selectScenarioScope(scenarios,workorders,null), /active_wave/);
  assert.throws(()=>selectScenarioScope(scenarios,workorders,'W9'), /active_wave/);
  assert.throws(()=>selectScenarioScope([{id:'AS-99',dodIds:['DOD-99'],then:'missing owner'}],workorders,'W1'),/не связан/);
});
test('baseline distinguishes failures, skips, missing, pre-existing and prior regressions', () => {
  const current = new Set(['AS-01','AS-02']);
  const check = (r:any[]) => assessRun(run(r,1),scenarios.slice(0,2),'baseline',current).status;
  assert.equal(check([result('AS-01','failed'),result('AS-02','failed')]),'passed');
  assert.equal(check([result('AS-01','skipped'),result('AS-02','failed')]),'error');
  assert.equal(check([result('AS-01','failed')]),'error');
  assert.equal(check([result('AS-01','passed'),result('AS-02','failed')]),'failed');
  assert.equal(check([result('AS-01','passed','pre-existing: existing command'),result('AS-02','failed')]),'passed');
  assert.equal(assessRun(run([result('AS-01','failed'),result('AS-02','failed')],0), scenarios.slice(0,2),'baseline',current).status,'error');
  assert.equal(assessRun(run([result('AS-01','failed'),result('AS-02','passed'),result('AS-03','failed')],1), scenarios,'baseline',new Set(['AS-03'])).status,'failed');
});
test('wave fails closed for missing/duplicate results, exit failures, crashes and empty scope', () => {
  const passed = [result('AS-01','passed'),result('AS-02','passed')];
  assert.equal(assessRun(run(passed),scenarios.slice(0,2),'wave',new Set()).status,'passed');
  assert.equal(assessRun(run(passed,2),scenarios.slice(0,2),'wave',new Set()).status,'failed');
  assert.equal(assessRun(run(passed,0,'timeout'),scenarios.slice(0,2),'wave',new Set()).status,'error');
  assert.equal(assessRun(run(passed.slice(0,1)),scenarios.slice(0,2),'wave',new Set()).status,'error');
  assert.equal(assessRun(run([...passed,passed[0]]),scenarios.slice(0,2),'wave',new Set()).status,'error');
  assert.equal(assessRun(run([]),[],'wave',new Set()).status,'error');
});
test('failure feedback uses contract expected result and scrubs suite paths and stack lines', () => {
  const text = assessRun(run([{...result('AS-01','failed'),expected:'wrong oracle',actual:'/private/suite/test.ts at fn:8:2'}],1),scenarios.slice(0,1),'wave',new Set(),'/private/suite').text;
  assert.match(text,/Ожидалось: closed/);assert.doesNotMatch(text,/wrong oracle|\/private\/suite|fn:8:2/);
});
test('runner resolves paths from its directory, clears stale results, rejects malformed output and timeout', async () => {
  const folder=mkdtempSync(join(tmpdir(),'sf-suite-')); const dir=join(folder,'acceptance','demo');mkdirSync(dir,{recursive:true});
  const script=(body:string)=>writeFileSync(join(dir,'run.sh'),body);
  try {
    script(`printf '[{"id":"AS-01","status":"passed","note":"pre-existing: supported"}]' > results.json\n`);
    const ok=await runSuite(dir,folder,1000);assert.equal(ok.error,null);assert.equal(ok.results[0].note,'pre-existing: supported');
    script('exit 0\n');const empty=await runSuite(dir,folder,1000);assert.notEqual(empty.error,null);assert.deepEqual(empty.results,[]);
    script("printf '{}' > results.json\n");assert.notEqual((await runSuite(dir,folder,1000)).error,null);
    script(`printf '[{"id":"AS-01","status":"passed"}]' > results.json\nsleep 5\n`);
    const timeout=await runSuite(dir,folder,50);assert.match(timeout.error??'',/таймаут/);
    const controller=new AbortController();controller.abort();assert.match((await runSuite(dir,folder,1000,controller.signal)).error??'',/отменён/);
  } finally {rmSync(folder,{recursive:true,force:true});}
});

test('a suite that never ran is reported once as an environment or suite failure, not as missing tests', () => {
  const log = "file:///secret/acceptance/demo/report.mjs:33\nReferenceError: Cannot access 'shorten' before initialization\n    at file:///secret/acceptance/demo/report.mjs:33:52";
  const verdict = assessRun({ results: [], exitCode: 1, error: 'run.sh не записал корректный results.json — нет доказательств', log }, scenarios, 'baseline', new Set(['AS-01']), '/secret/acceptance');
  assert.equal(verdict.status, 'error');
  assert.match(verdict.text, /Набор не выполнился ни по одному сценарию.*ReferenceError: Cannot access 'shorten'/);
  assert.match(verdict.text, /Верни test-author/);
  assert.doesNotMatch(verdict.text, /теста нет в наборе/);
  assert.doesNotMatch(verdict.text, /\/secret\/|report\.mjs/);
});
