import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { createFakePluginHost, makeThreadResponse } from '@get-bb/plugin-sdk/testing';
import plugin from '../server.ts';
import { allowedTargets, appendTransition, historyProblem, readTransitions, setField, sliceDecision } from '../src/lifecycle.ts';

const text = (r: any) => typeof r === 'string' ? r : r.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
const front = (t: string) => parse(/^---\n([\s\S]*?)\n---/.exec(t)![1]!);

test('stages advance one at a time; paused resumes where it stopped; history must not skip', () => {
  assert.deepEqual(allowedTargets('ready_for_delivery', []), ['in_delivery']);
  assert.deepEqual(allowedTargets('in_delivery', []), ['implementation_complete', 'paused']);
  assert.deepEqual(allowedTargets('complete', []), []);
  const paused = [{ from: 'verifying', to: 'paused', at: 'x', by: 't' }];
  assert.deepEqual(allowedTargets('paused', paused), ['verifying']);
  assert.equal(historyProblem('complete', [{ from: 'in_delivery', to: 'complete', at: 'x', by: 't' }])?.includes('пропускает'), true);
  assert.equal(historyProblem('verifying', [
    { from: 'in_delivery', to: 'implementation_complete', at: 'x', by: 't' },
    { from: 'implementation_complete', to: 'verifying', at: 'x', by: 't' },
  ]), null);
  assert.match(historyProblem('complete', [{ from: 'in_delivery', to: 'implementation_complete', at: 'x', by: 't' }]) ?? '', /status: complete/);
});

test('the session budget stops the seventh slice and at 70% context; unmeasured context is said, not guessed', () => {
  assert.equal(sliceDecision({ slices: 5, contextPct: 20 }).allowed, true);
  assert.equal(sliceDecision({ slices: 6, contextPct: 20 }).allowed, false);
  assert.equal(sliceDecision({ slices: 2, contextPct: 70 }).allowed, false);
  assert.equal(sliceDecision({ slices: 2, contextPct: 61 }).worker, true);
  assert.match(sliceDecision({ slices: 0, contextPct: null }).reason, /н\/д/);
  assert.equal(sliceDecision({ slices: 6, contextPct: null }).allowed, false);
});

test('STATE.md edits keep the rest of the file and round-trip through YAML', () => {
  const original = "---\nstatus: in_delivery # live\nactive_wave: W1\nblockers: []\n---\n\n# State\nbody\n";
  let next = setField(original, 'status', 'implementation_complete');
  next = setField(next, 'context_fill', '42%');
  next = appendTransition(next, { from: 'in_delivery', to: 'implementation_complete', at: '2026-11-15T10:00:00.000Z', by: 'sf_transition', thread: 'thr_1' });
  next = appendTransition(next, { from: 'implementation_complete', to: 'verifying', at: '2026-11-15T11:00:00.000Z', by: 'sf_transition' });
  const data = front(next);
  assert.equal(data.status, 'implementation_complete');
  assert.equal(data.context_fill, '42%');
  assert.deepEqual(data.blockers, []);
  assert.deepEqual(readTransitions(data).map((t) => t.to), ['implementation_complete', 'verifying']);
  assert.ok(next.endsWith('---\n\n# State\nbody\n'));
});

test('the validator rejects a stage history that skips a stage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-validate-'));
  try {
    writeFileSync(join(dir, 'STATE.md'), "---\naird_state_version: '4.0'\nstatus: complete\ntransitions:\n  - from: in_delivery\n    to: complete\n    at: '2026-11-15T10:00:00Z'\n    by: hand\n---\n");
    const script = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'skills', 'aird-delivery-loop', 'assets', 'scripts', 'aird-validate.mjs');
    let out = '';
    try { out = execFileSync('node', [script, dir, '--json'], { encoding: 'utf8' }); } catch (error: any) { out = String(error.stdout ?? ''); }
    assert.match(out, /transitions\[1\] in_delivery -> complete skips the delivery lifecycle/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Factory owns stage transitions and the session budget: no skipped stage, no seventh slice, reset only after a confirmed handoff', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-lifecycle-')); const folder = join(dir, 'project'); mkdirSync(folder);
  const pkg = join(folder, '.agent', 'aird', 'demo'); mkdirSync(join(pkg, 'workorders'), { recursive: true });
  writeFileSync(join(pkg, 'STATE.md'), "---\nstatus: ready_for_delivery\nactive_wave: W1\nready_for_implementation: ready\nready_for_runtime_verification: blocked\nready_for_release: blocked\nroot_slices_since_handoff: 0\n---\n\n# State\n");
  const wo = (status: string) => writeFileSync(join(pkg, 'workorders', 'WO-01.md'), `---\nid: WO-01\nkind: implementation\nstatus: ${status}\nwave: W1\n---\n# WO-01\n`);
  wo('ready');
  let usage: any = { usedTokens: 100_000, modelContextWindow: 1_000_000, estimated: true, snapshot: { providerSessionId: 'sess-1' } };
  let spawned = 0;
  const { bb, harness } = createFakePluginHost({ pluginId: 'software-factory', settings: { worktreeRoot: join(dir, 'worktrees') }, sdk: {
    system: { config: async () => ({ primaryHostId: 'host-fixture' }) },
    projects: { list: async () => [{ id: 'project-fixture', name: 'Fixture', sources: [{ path: folder, hostId: 'host-fixture', isDefault: true }] }], machineEnvironment: async () => ({ variables: [], inheritedVariables: [] }) },
    providers: { list: async () => [{ id: 'claude-code', available: true }], models: async () => ({ models: [] }) },
    threads: {
      get: async ({ threadId }: any) => ({ ...makeThreadResponse({ id: threadId, providerId: 'claude-code', status: 'active' }), ...(usage ? { contextWindowUsage: usage } : {}) }),
      spawn: async () => makeThreadResponse({ id: `thread-${++spawned}`, providerId: 'claude-code' }),
      list: async () => [], send: async () => ({}),
    },
  } as any });
  try {
    await plugin(bb);
    const db = bb.storage.database();
    db.prepare(`INSERT INTO airds(id,project_id,folder,slug,title,created_at,archived,work_folder) VALUES ('fixture','project-fixture',?,?,?,0,0,?)`).run(folder, 'demo', 'Demo', folder);
    db.prepare(`INSERT INTO threads(thread_id,aird_id,role,kind,stage,title,created_at) VALUES ('orch-1','fixture','aird-delivery-loop','orchestrator','delivery','Delivery',0)`).run();
    const call = (name: string, input: any, threadId = 'orch-1') => harness.behavior.callAgentTool(name, input, { threadId });
    const state = () => front(readFileSync(join(pkg, 'STATE.md'), 'utf8'));

    // ----- transitions
    const skip = await call('sf_transition', { to: 'implementation_complete' });
    assert.equal(skip.isError, true); assert.match(text(skip), /недопустим/);
    assert.equal(text(await call('sf_transition', { to: 'in_delivery' })).includes('записан'), true);
    const notDone = await call('sf_transition', { to: 'implementation_complete' });
    assert.equal(notDone.isError, true); assert.match(text(notDone), /WO-01/);
    wo('done');
    assert.match(text(await call('sf_transition', { to: 'implementation_complete' })), /in_delivery → implementation_complete/);
    const noRuntime = await call('sf_transition', { to: 'verifying' });
    assert.equal(noRuntime.isError, true); assert.match(text(noRuntime), /ready_for_runtime_verification/);
    writeFileSync(join(pkg, 'STATE.md'), readFileSync(join(pkg, 'STATE.md'), 'utf8').replace('ready_for_runtime_verification: blocked', 'ready_for_runtime_verification: not_required'));
    assert.match(text(await call('sf_transition', { to: 'verifying' })), /записан/);
    const jumpToComplete = await call('sf_transition', { to: 'complete' });
    assert.equal(jumpToComplete.isError, true); assert.match(text(jumpToComplete), /только в ready_for_release/);
    assert.equal(state().status, 'verifying');
    let detail: any = await harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    assert.deepEqual(detail.lifecycle.history.map((t: any) => t.to), ['in_delivery', 'implementation_complete', 'verifying']);
    assert.deepEqual(readTransitions(state()).map((t) => t.to), detail.lifecycle.history.map((t: any) => t.to), 'UI and STATE.md show one sequence');
    assert.equal(detail.lifecycle.problem, null); assert.equal(detail.lifecycle.recorded, 3);
    // A hand edit of status is caught: the file and Factory's journal disagree.
    const before = readFileSync(join(pkg, 'STATE.md'), 'utf8');
    writeFileSync(join(pkg, 'STATE.md'), before.replace('status: verifying', 'status: complete'));
    detail = await harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    assert.ok(detail.lifecycle.problem, 'status: complete without its stages is flagged');
    writeFileSync(join(pkg, 'STATE.md'), before);

    // ----- session budget
    for (let n = 1; n <= 6; n += 1) {
      const slice = await call('sf_slice_begin', { ref: `WO-0${n}` });
      assert.equal(slice.isError, undefined, text(slice)); assert.match(text(slice), new RegExp(`Срез ${n} из 6`)); assert.match(text(slice), /контекст 10%/);
    }
    assert.equal(state().root_slices_since_handoff, 6); assert.equal(state().context_fill, '10%');
    const seventh = await call('sf_slice_begin', { ref: 'WO-07' });
    assert.equal(seventh.isError, true); assert.match(text(seventh), /граница сессии/i);
    db.prepare(`INSERT INTO threads(thread_id,aird_id,role,kind,stage,title,created_at) VALUES ('orch-1-worker-check','fixture','x','agent','delivery','x',0)`).run();
    const worker = await call('sf_spawn_agent', { role: 'frontend-worker', task: 'implement WO-07' });
    assert.equal(worker.isError, true); assert.match(text(worker), /лимит 6/);

    const noCheckpoint = await call('sf_handoff', {});
    assert.equal(noCheckpoint.isError, true); assert.match(text(noCheckpoint), /continue-here/);
    writeFileSync(join(pkg, '.continue-here.md'), '---\ncheckpoint_kind: proactive_handoff\n---\nNext: WO-07\n');
    const handoff = await call('sf_handoff', {});
    assert.equal(handoff.isError, undefined, text(handoff));
    const next = /@thread:(thread-\d+)/.exec(text(handoff))![1]!;
    assert.match(text(await call('sf_slice_begin', { ref: 'WO-07' })), /передача уже записана/);
    detail = await harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    assert.equal(detail.session.slices, 6, 'no reset until the new session confirms the handoff');
    assert.equal(detail.session.handoffs[0].confirmedAt, null);

    usage = null; // the new session cannot measure context: said explicitly, slice limit still applies
    const first = await call('sf_slice_begin', { ref: 'WO-07' }, next);
    assert.equal(first.isError, undefined, text(first)); assert.match(text(first), /Срез 1 из 6/); assert.match(text(first), /н\/д/);
    assert.equal(state().root_slices_since_handoff, 1); assert.equal(state().context_fill, 'n/a');
    detail = await harness.behavior.callRpc('aird_detail', { id: 'fixture' });
    assert.equal(detail.session.slices, 1); assert.notEqual(detail.session.handoffs[0].confirmedAt, null);

    usage = { usedTokens: 720_000, modelContextWindow: 1_000_000, estimated: false };
    const full = await call('sf_slice_begin', { ref: 'WO-08' }, next);
    assert.equal(full.isError, true); assert.match(text(full), /72%/);
  } finally { await harness.lifecycle.dispose(); rmSync(dir, { recursive: true, force: true }); }
});
