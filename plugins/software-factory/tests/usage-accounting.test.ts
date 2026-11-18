import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { consumeUsage, nativeUsage, newThreadUsage, normalizeUsage, usageCollector } from '../src/usage.ts';

const total = (inputTokens: number, cacheReadInputTokens: number, cacheWriteInputTokens: number, outputTokens: number, inclusive = false) => ({ inputTokens, cacheReadInputTokens, cacheWriteInputTokens, cachedInputTokens: cacheReadInputTokens + cacheWriteInputTokens, outputTokens, totalTokens: inputTokens + outputTokens + (inclusive ? 0 : cacheReadInputTokens + cacheWriteInputTokens) });
const event = (seq: number, value: any) => ({ seq, type: 'thread/tokenUsage/updated', data: { tokenUsage: { total: value } } });
const model = (seq: number, name: string) => ({ seq, type: 'client/turn/requested', data: { execution: { model: name } } });

test('normalizes fresh input without double-counting Codex cache; absent counters stay unknown', () => {
  assert.deepEqual(normalizeUsage('claude-code', total(10, 80, 5, 5)), { total: 100, freshInput: 10, cacheRead: 80, cacheWrite: 5, output: 5 });
  assert.deepEqual(normalizeUsage('codex', total(95, 80, 0, 5, true)), { total: 100, freshInput: 15, cacheRead: 80, cacheWrite: 0, output: 5 });
  assert.equal(normalizeUsage('codex', { inputTokens: 95, cachedInputTokens: 80, outputTokens: 5, totalTokens: 100 }).freshInput, 15);
  assert.equal(normalizeUsage('claude-code', { totalTokens: 100 }).cacheRead, null);
  assert.equal(normalizeUsage('other', { inputTokens: 100 }).freshInput, null);
  assert.equal(normalizeUsage('claude-code', { totalTokens: NaN }).total, null);
});

test('attributes cumulative deltas to actual models and handles replay and counter resets', () => {
  const state = newThreadUsage();
  consumeUsage(state, 'claude-code', [model(1, 'sonnet'), event(2, total(10, 80, 5, 5)), event(3, total(10, 80, 5, 5)), model(4, 'opus'), event(5, total(30, 160, 10, 10))]);
  assert.equal(state.rows.get('sonnet')?.total, 100);
  assert.equal(state.rows.get('opus')?.total, 110);
  consumeUsage(state, 'claude-code', [event(5, total(30, 160, 10, 10)), event(6, total(1, 5, 2, 2))]);
  assert.equal(state.rows.get('opus')?.total, 120);
  assert.equal(state.rows.get('opus')?.freshInput, 21);
  consumeUsage(state, 'claude-code', [{ seq: 7, type: 'turn/started', createdAt: 1000 }, { seq: 8, type: 'turn/completed', createdAt: 4000 }]);
  assert.equal(state.rows.get('opus')?.durationMs, 3000);
  consumeUsage(state, 'claude-code', [{ seq: 9, type: 'provider/modelFallback', data: { fallbackModel: 'reserve' } }, event(10, total(2, 10, 4, 4))]);
  assert.equal(state.rows.get('reserve')?.total, 10);
});

test('a newly reported breakdown does not attribute unknown earlier input to the next model', () => {
  const state = newThreadUsage('first');
  consumeUsage(state, 'claude-code', [event(1, { totalTokens: 100 }), model(2, 'second'), event(3, total(10, 100, 5, 5))]);
  assert.equal(state.rows.get('second')?.total, 20);
  assert.equal(state.rows.get('second')?.freshInput, null);
  assert.equal(state.rows.get('second')?.partial, true);
});

test('paginates with SDK limit, counts source/replacement and native once, preserves missing coverage', async () => {
  const logs = new Map<string, any[]>([
    ['source', [model(1, 'opus'), ...Array.from({ length: 105 }, (_, i) => event(i + 2, total(i + 1, 0, 0, 0))), { seq: 107, type: 'item/backgroundTask/completed', data: { providerThreadId: 'session', item: { type: 'backgroundTask', taskType: 'local_agent', familyId: 'agent', usage: { totalTokens: 999999, durationMs: 1000 } } } }]],
    ['replacement', [model(1, 'sonnet'), event(2, total(5, 0, 0, 0)), { seq: 3, type: 'item/backgroundTask/completed', data: { providerThreadId: 'session', item: { type: 'backgroundTask', taskType: 'local_agent', familyId: 'agent', usage: { totalTokens: 999999 } } } }]],
  ]);
  let reads = 0, nativeReads = 0;
  const collect = usageCollector(async ({ threadId, afterSeq, limit }) => {
    reads++; assert.equal(limit, '100');
    if (threadId === 'unavailable') throw new Error('offline');
    return (logs.get(threadId) ?? []).filter((e) => e.seq > Number(afterSeq ?? 0)).slice(0, Number(limit));
  }, async () => { nativeReads++; return [{ total: 10, freshInput: 1, cacheRead: 7, cacheWrite: 1, output: 1, provider: 'claude-code', model: 'opus', sources: 1, nativeSources: 1, durationMs: null, partial: false }]; });
  const threads = ['source', 'replacement', 'unavailable'].map((thread_id) => ({ thread_id, provider: 'claude-code', model: null }));
  const first = await collect(threads, '/fixture');
  assert.equal(first.summary.total, 120); assert.equal(first.summary.byModel.find((m) => m.model === 'opus')?.total, 115);
  assert.deepEqual(first.summary.native, { detected: 1, measured: 1 }); assert.equal(nativeReads, 1);
  assert.equal(first.summary.missingThreads, 1); assert.equal(first.summary.partial, true);
  assert.equal(first.tokens.get('source'), 105); assert.equal(reads, 4);
  assert.equal((await collect(threads, '/fixture')).summary.total, 120); assert.equal(reads, 4);
  const missing = usageCollector(async () => [{ seq: 1, type: 'item/backgroundTask/completed', data: { providerThreadId: 's', item: { type: 'backgroundTask', taskType: 'local_agent', familyId: 'a' } } }], async () => null);
  assert.deepEqual((await missing(threads.slice(0, 1), '/fixture')).summary.native, { detected: 1, measured: 0 });
});

test('native logs deduplicate stream records, ignore snapshot totals, and reject missing or escaping paths', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-native-'));
  const session = '12345678-1234-1234-1234-123456789abc', agent = 'a123456789';
  try {
    const folder = '/fixture/worktree', sub = join(dir, 'projects', '-fixture-worktree', session, 'subagents'); mkdirSync(sub, { recursive: true });
    const message = (output: number) => JSON.stringify({ type: 'assistant', message: { id: 'msg-1', model: 'sonnet', usage: { input_tokens: 1, cache_read_input_tokens: 80, cache_creation_input_tokens: 4, output_tokens: output } } });
    writeFileSync(join(sub, `agent-${agent}.jsonl`), [message(1), message(5), JSON.stringify({ type: 'user', message: { content: 'ignored' } }), '{partial'].join('\n'));
    const rows = await nativeUsage(folder, session, agent, dir);
    assert.equal(rows?.[0]?.total, 90); assert.equal(rows?.[0]?.output, 5); assert.equal(rows?.[0]?.nativeSources, 1); assert.equal(rows?.[0]?.partial, true);
    assert.equal(await nativeUsage(folder, session, 'a000000000', dir), null);
    assert.equal(await nativeUsage(folder, '../../outside', agent, dir), null);
    const outside = join(dir, 'outside.jsonl'); writeFileSync(outside, message(10));
    symlinkSync(outside, join(sub, 'agent-aabcdef123.jsonl'));
    assert.equal(await nativeUsage(folder, session, 'aabcdef123', dir), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
