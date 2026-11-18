import { createReadStream, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import { createInterface } from "node:readline";

export interface Counters {
  total: number | null;
  freshInput: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  output: number | null;
}
export interface ModelUsage extends Counters {
  provider: string;
  model: string | null;
  sources: number;
  nativeSources: number;
  durationMs: number | null;
  partial: boolean;
}
export interface UsageEvent { seq: number | string; type: string; createdAt?: number | string; data?: any }
interface UsageThread { thread_id: string; provider: string | null; model: string | null }
const usageEventTypes = ["client/turn/requested", "provider/modelFallback", "provider/error", "thread/tokenUsage/updated", "turn/started", "turn/completed", "item/started", "item/backgroundTask/completed", "item/backgroundTask/progress"] as const;
type EventReader = (args: { threadId: string; types: typeof usageEventTypes; order: "asc"; limit: string; afterSeq?: string }) => Promise<unknown>;
const fields = ["total", "freshInput", "cacheRead", "cacheWrite", "output"] as const;
const empty = (): Counters => ({ total: null, freshInput: null, cacheRead: null, cacheWrite: null, output: null });
const number = (n: unknown): number | null => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
const time = (n: unknown): number | null => number(n) ?? (typeof n === "string" ? number(Number(n)) ?? number(Date.parse(n)) : null);

/** Codex input includes its cached subset; Claude input counts fresh tokens only. */
export function normalizeUsage(provider: string, value: any): Counters {
  if (!value || typeof value !== "object") return empty();
  const input = number(value.inputTokens);
  let cacheRead = number(value.cacheReadInputTokens);
  const cached = number(value.cachedInputTokens);
  let cacheWrite = number(value.cacheWriteInputTokens);
  if (cacheRead === null && cached !== null && cacheWrite !== null) cacheRead = Math.max(0, cached - cacheWrite);
  // Codex has no cache creation charge/counter. A reported cached subset is cache read.
  if (provider.startsWith("codex") && cached !== null) {
    cacheRead ??= cached;
    cacheWrite ??= 0;
  }
  const inclusive = provider.startsWith("codex");
  return {
    total: number(value.totalTokens),
    freshInput: inclusive ? input !== null && cacheRead !== null && cacheWrite !== null ? Math.max(0, input - cacheRead - cacheWrite) : null : provider.startsWith("claude") ? input : null,
    cacheRead, cacheWrite, output: number(value.outputTokens),
  };
}

function add(to: Counters, from: Counters) {
  for (const field of fields) if (from[field] !== null) to[field] = (to[field] ?? 0) + from[field]!;
}
function row(provider: string, model: string | null, native = false): ModelUsage {
  return { ...empty(), provider, model, sources: 1, nativeSources: native ? 1 : 0, durationMs: null, partial: model === null };
}
interface NativeTask { session: string; agent: string; durationMs: number | null }
export interface ThreadUsage {
  afterSeq?: string;
  previous: Counters;
  model: string | null;
  rows: Map<string, ModelUsage>;
  native: Map<string, NativeTask>;
  startedAt: number | null;
  intervals: Array<[number, number]>;
  providerBlockedAt: number | null;
  providerWaits: Array<[number, number]>;
  read: boolean;
  partial: boolean;
}
export function newThreadUsage(model: string | null = null): ThreadUsage {
  return { previous: empty(), model, rows: new Map(), native: new Map(), startedAt: null, intervals: [], providerBlockedAt: null, providerWaits: [], read: false, partial: false };
}

/** Increment cumulative snapshots exactly once, attributing each delta to the model of that turn. */
export function consumeUsage(state: ThreadUsage, provider: string, events: UsageEvent[]) {
  for (const event of events) {
    if (state.afterSeq && Number(event.seq) <= Number(state.afterSeq)) continue;
    const data = event.data ?? {};
    if (event.type === "client/turn/requested") state.model = data.execution?.model ?? state.model;
    if (event.type === "provider/modelFallback" && typeof data.fallbackModel === "string") state.model = data.fallbackModel;
    const key = state.model ?? "";
    const at = time(event.createdAt);
    if (event.type === "provider/error" && data.errorInfo?.category === "rate-limit" && at !== null && state.providerBlockedAt === null) state.providerBlockedAt = at;
    if (event.type === "turn/started" && at !== null) {
      if (state.providerBlockedAt !== null) { state.providerWaits.push([state.providerBlockedAt,at]); state.providerBlockedAt = null; }
      if (state.startedAt === null) state.startedAt = at;
    }
    if (event.type === "turn/completed" && state.startedAt !== null && at !== null) {
      state.intervals.push([state.startedAt, at]);
      const part = state.rows.get(key) ?? row(provider, state.model);
      part.durationMs = (part.durationMs ?? 0) + Math.max(0, at - state.startedAt);
      state.rows.set(key, part);
      state.startedAt = null;
    }
    if (event.type === "thread/tokenUsage/updated") {
      const current = normalizeUsage(provider, data.tokenUsage?.total);
      const delta = empty();
      const reset = current.total !== null && state.previous.total !== null && current.total < state.previous.total;
      for (const field of fields) {
        // A newly available breakdown must not charge the old, unknown history
        // to a later model. Keep only attributable deltas and mark the gap.
        if (!reset && state.previous.total !== null && state.previous[field] === null) continue;
        if (current[field] !== null) delta[field] = reset ? current[field] : Math.max(0, current[field]! - (state.previous[field] ?? 0));
      }
      const part = state.rows.get(key) ?? row(provider, state.model);
      part.partial ||= fields.some((field) => current[field] === null || delta[field] === null);
      add(part, delta); state.rows.set(key, part);
      state.previous = current;
    }
    if (event.type.startsWith("item/backgroundTask/") || event.type === "item/started") {
      const item = data.item;
      if (item?.type === "backgroundTask" && item.taskType === "local_agent" && typeof data.providerThreadId === "string" && typeof item.familyId === "string") {
        const id = `${data.providerThreadId}/${item.familyId}`;
        state.native.set(id, { session: data.providerThreadId, agent: item.familyId, durationMs: number(item.usage?.durationMs) ?? state.native.get(id)?.durationMs ?? null });
      }
    }
    state.afterSeq = String(event.seq);
  }
}

/** Read only validated native agent logs under Claude's projects directory, never the task's outputFile. */
export async function nativeUsage(folder: string, session: string, agent: string, configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")): Promise<ModelUsage[] | null> {
  if (!/^[a-f\d-]{36}$/iu.test(session) || !/^a[a-f\d]{8,64}$/iu.test(agent)) return null;
  const projects = join(configDir, "projects");
  let path: string;
  try {
    const encoded = folder.replace(/[^a-zA-Z0-9]/gu, "-");
    const dirs = [encoded, ...readdirSync(projects).filter((dir) => dir !== encoded)];
    const base = dirs.map((dir) => join(projects, dir, session, "subagents", `agent-${agent}.jsonl`)).find((candidate) => { try { return statSync(candidate).isFile(); } catch { return false; } });
    if (!base) return null;
    path = realpathSync(base);
    const rel = relative(realpathSync(projects), path);
    if (rel === ".." || rel.startsWith(`..${sep}`) || rel.startsWith(sep)) return null;
  } catch { return null; }
  const messages = new Map<string, { model: string | null; value: Counters }>();
  let partial = false;
  const input = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let event: any;
      try { event = JSON.parse(line); } catch { partial = true; continue; }
      const message = event.type === "assistant" ? event.message : null;
      const usage = message?.usage;
      if (!usage || typeof message.id !== "string") continue;
      const freshInput = number(usage.input_tokens), cacheRead = number(usage.cache_read_input_tokens), cacheWrite = number(usage.cache_creation_input_tokens), output = number(usage.output_tokens);
      const value: Counters = { freshInput, cacheRead, cacheWrite, output, total: [freshInput, cacheRead, cacheWrite, output].every((v) => v !== null) ? freshInput! + cacheRead! + cacheWrite! + output! : null };
      const previous = messages.get(message.id);
      if (previous) for (const field of fields) if (previous.value[field] !== null) value[field] = Math.max(value[field] ?? 0, previous.value[field]!);
      messages.set(message.id, { model: typeof message.model === "string" ? message.model : null, value });
    }
  } catch { return null; }
  finally { lines.close(); input.destroy(); }
  if (!messages.size) return null;
  const models = new Map<string, ModelUsage>();
  for (const message of messages.values()) {
    const key = message.model ?? "", part = models.get(key) ?? row("claude-code", message.model, true);
    part.partial ||= partial || fields.some((field) => message.value[field] === null);
    add(part, message.value); models.set(key, part);
  }
  return [...models.values()];
}

export function summarizeUsage(parts: ModelUsage[], missingThreads: number, native: { detected: number; measured: number }) {
  const byModel = new Map<string, ModelUsage>();
  const byProvider = new Map<string, number>();
  let total = 0;
  for (const part of parts) {
    total += part.total ?? 0;
    byProvider.set(part.provider, (byProvider.get(part.provider) ?? 0) + (part.total ?? 0));
    const key = `${part.provider}/${part.model ?? ""}`;
    const combined = byModel.get(key);
    if (!combined) byModel.set(key, { ...part });
    else {
      add(combined, part); combined.sources += part.sources; combined.nativeSources += part.nativeSources;
      combined.durationMs = combined.durationMs === null && part.durationMs === null ? null : (combined.durationMs ?? 0) + (part.durationMs ?? 0);
      combined.partial ||= part.partial;
    }
  }
  return {
    total, byProvider: [...byProvider].filter(([, tokens]) => tokens > 0).map(([provider, tokens]) => ({ provider, tokens })).sort((a, b) => b.tokens - a.tokens),
    byModel: [...byModel.values()].sort((a, b) => (b.total ?? 0) - (a.total ?? 0)),
    missingThreads, native, partial: missingThreads > 0 || native.measured < native.detected || parts.some((part) => part.partial),
  };
}

/** Completed provider-turn intervals, not GPU time; overlapping agents count once. */
export function executionTiming(intervals: Array<[number, number]>, incomplete = false) {
  const sorted = intervals.filter(([a,b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a).sort((a,b) => a[0]-b[0]);
  if (!sorted.length) return { observedWindowMs: null, occupiedMs: null, agentMs: null, incomplete: true };
  let start = sorted[0]![0], end = sorted[0]![1], occupiedMs = 0, agentMs = 0;
  for (const [a,b] of sorted) {
    agentMs += b-a;
    if (a > end) { occupiedMs += end-start; start=a; end=b; } else end=Math.max(end,b);
  }
  occupiedMs += end-start;
  return { observedWindowMs: end-sorted[0]![0], occupiedMs, agentMs, incomplete };
}

/** One collector per plugin lifetime; event cursors avoid re-reading the full history on page polls. */
export function usageCollector(read: EventReader, readNative = nativeUsage) {
  const cache = new Map<string, { state: ThreadUsage; checkedAt: number; pending?: Promise<void> }>();
  const nativeCache = new Map<string, { at: number; rows: ModelUsage[] | null }>();
  const collect = async (threads: UsageThread[], folder: string) => {
    const records = await Promise.all(threads.map(async (thread) => {
      const entry = cache.get(thread.thread_id) ?? { state: newThreadUsage(thread.model), checkedAt: 0 };
      cache.set(thread.thread_id, entry);
      if (!entry.pending && Date.now() - entry.checkedAt >= 30_000) {
        entry.pending = (async () => {
          try {
            for (let page = 0; page < 500; page += 1) {
              const events = await read({ threadId: thread.thread_id, types: usageEventTypes, order: "asc", limit: "100", ...(entry.state.afterSeq ? { afterSeq: entry.state.afterSeq } : {}) }) as UsageEvent[];
              consumeUsage(entry.state, thread.provider ?? "unknown", events);
              if (events.length < 100) { entry.state.read = true; entry.state.partial = false; break; }
              entry.state.partial = true;
            }
          } catch { entry.state.partial = true; }
          entry.checkedAt = Date.now();
        })().finally(() => { delete entry.pending; });
      }
      await entry.pending;
      return { thread, state: entry.state };
    }));
    const parts = records.flatMap(({ state }) => [...state.rows.values()].map((part) => ({ ...part, partial: part.partial || state.partial })));
    const tasks = new Map<string, NativeTask>();
    for (const { state } of records) for (const [id, task] of state.native) tasks.set(id, { ...task, durationMs: task.durationMs ?? tasks.get(id)?.durationMs ?? null });
    let measured = 0;
    for (const [id, task] of tasks) {
      let saved = nativeCache.get(id);
      if (!saved || Date.now() - saved.at >= 30_000) {
        saved = { rows: await readNative(folder, task.session, task.agent), at: Date.now() };
        nativeCache.set(id, saved);
      }
      if (!saved.rows) continue;
      measured += 1;
      // A native task's duration is reported once, even if it used more than one model.
      parts.push(...saved.rows.map((part, index) => ({ ...part, durationMs: index === 0 ? task.durationMs : null })));
    }
    const missing = records.filter(({ state }) => !state.read || ![...state.rows.values()].some((part) => part.total !== null)).length;
    return { summary: { ...summarizeUsage(parts, missing, { detected: tasks.size, measured }), timing: { ...executionTiming(records.flatMap(({state}) => state.intervals), records.some(({state}) => state.partial || !state.read || state.startedAt !== null || !state.intervals.length)), providerWaitMs: executionTiming(records.flatMap(({state}) => state.providerWaits)).occupiedMs, openProviderWaits: records.filter(({state}) => state.providerBlockedAt !== null).length } }, tokens: new Map(records.map(({ thread, state }) => [thread.thread_id, [...state.rows.values()].reduce<number | null>((sum, part) => part.total === null ? sum : (sum ?? 0) + part.total, null)])) };
  };
  return Object.assign(collect, { invalidate(threadId: string) { const entry = cache.get(threadId); if (entry) entry.checkedAt = 0; } });
}
