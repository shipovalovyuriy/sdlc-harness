import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideExecutionBudget as decide, scopesOverlap } from '../src/execution-budget.ts';
const observation = { actions: 0, contextTokens: null, contextWindow: null, capturedAt: null, now: 1_000_000 };
test('budget limits actions with unknown context and absolute/relative fresh context independently', () => {
  for (const [actions, expected] of [[59,'continue'],[60,'warn'],[79,'warn'],[80,'checkpoint'],[165,'checkpoint']] as const) assert.equal(decide({ ...observation, actions }).action, expected);
  const measured = { ...observation, capturedAt: 1_000_000, contextWindow: 1_000_000 };
  assert.equal(decide({ ...measured, contextTokens: 120_000 }).action, 'warn');
  assert.equal(decide({ ...measured, contextTokens: 160_000 }).action, 'checkpoint');
  assert.equal(decide({ ...measured, contextTokens: 50_000, contextWindow: 100_000 }).action, 'checkpoint');
  assert.equal(decide({ ...measured, contextTokens: 500_000, capturedAt: 0 }).action, 'continue');
  assert.equal(decide({ ...measured, contextTokens: 500_000, capturedAt: 0 }).measurementQuality, 'stale');
});
test('scope ownership includes directories and glob prefixes; unknown scope is conservative', () => {
  assert.equal(scopesOverlap(['src/a/**'], ['src/a/x.ts']), true);
  assert.equal(scopesOverlap(['src/a'], ['src/ab']), false);
  assert.equal(scopesOverlap([], ['src/a']), true);
});

test('checkpoint cannot be a stale promise, empty checks or another worker note', async () => {
 const {checkpointProblem}=await import('../src/execution-budget.ts');
 const note={checkpoint_source:'worker',checkpoint_revision:'abc + dirty',checkpoint_dirty_paths:['src/a.ts'],checkpoint_completed:['implemented'],checkpoint_remaining:['verify'],checkpoint_checks:['not run: dependency unavailable']};
 assert.equal(checkpointProblem(note,'worker'),null);
 assert.ok(checkpointProblem({...note,checkpoint_source:'other'},'worker'));
 assert.ok(checkpointProblem({...note,checkpoint_checks:[]},'worker'));
 assert.ok(checkpointProblem({...note,checkpoint_remaining:'done'},'worker'));
});
