// Delivery lifecycle owned by Software Factory: stage transitions and the
// session budget. Agents do not edit `status` or the slice counter in STATE.md
// themselves; they call sf_transition / sf_slice_begin / sf_handoff, which
// check the preconditions, write STATE.md and record an event. These are the
// pure parts: the order of stages, the budget rule, and the STATE.md edits.

/** The delivery stages in their only allowed order (delivery-contract lifecycle). */
export const DELIVERY_FLOW = ["ready_for_delivery", "in_delivery", "implementation_complete", "verifying", "ready_for_release", "complete"] as const;
export type DeliveryStatus = (typeof DELIVERY_FLOW)[number];

/** Six slices or 70% context per root session; at 60% the next substantive slice goes to a worker. */
export const SLICE_LIMIT = 6;
export const CONTEXT_HANDOFF_PCT = 70;
export const CONTEXT_WORKER_PCT = 60;

export interface Transition {
  from: string;
  to: string;
  at: string;
  by: string;
  thread?: string | null;
}

/** The next stage, or `paused` / back from `paused` to where it stopped. */
export function allowedTargets(current: string, transitions: Transition[]): string[] {
  const index = DELIVERY_FLOW.indexOf(current as DeliveryStatus);
  if (current === "paused") {
    const resume = [...transitions].reverse().find((t) => t.to === "paused")?.from;
    return resume ? [resume] : [];
  }
  if (index < 0 || index === DELIVERY_FLOW.length - 1) return [];
  const next = [DELIVERY_FLOW[index + 1]!];
  return index >= 1 ? [...next, "paused"] : next;
}

/**
 * The history must walk the flow without gaps and end at the current status.
 * Returns the first problem, or null.
 */
export function historyProblem(status: string, transitions: Transition[]): string | null {
  let at = transitions[0]?.from ?? null;
  for (const [i, t] of transitions.entries()) {
    if (t.from !== at) return `переход ${i + 1} начинается с ${t.from}, а предыдущий закончился на ${at}`;
    const allowed = allowedTargets(t.from, transitions.slice(0, i));
    if (!allowed.includes(t.to)) return `переход ${t.from} → ${t.to} пропускает этапы (допустимо: ${allowed.join(", ") || "—"})`;
    at = t.to;
  }
  if (at !== null && at !== status) return `status: ${status}, а последний записанный переход ведёт в ${at}`;
  return null;
}

export interface SessionBudget {
  /** Slices already started since the last confirmed handoff. */
  slices: number;
  /** Context fill of the current session, or null when it cannot be measured. */
  contextPct: number | null;
}

/** Whether one more slice may start in this session, and what to tell the orchestrator. */
export function sliceDecision(budget: SessionBudget): { allowed: boolean; worker: boolean; reason: string } {
  const context = budget.contextPct === null ? "контекст: н/д (измерение недоступно)" : `контекст: ${budget.contextPct}%`;
  if (budget.slices >= SLICE_LIMIT) {
    return { allowed: false, worker: false, reason: `уже ${budget.slices} срезов в этой сессии (лимит ${SLICE_LIMIT}); ${context}` };
  }
  if (budget.contextPct !== null && budget.contextPct >= CONTEXT_HANDOFF_PCT) {
    return { allowed: false, worker: false, reason: `${context} — не меньше ${CONTEXT_HANDOFF_PCT}%` };
  }
  const worker = budget.contextPct !== null && budget.contextPct >= CONTEXT_WORKER_PCT;
  return { allowed: true, worker, reason: `срез ${budget.slices + 1} из ${SLICE_LIMIT}; ${context}` };
}

// ------------------------------------------------------------ STATE.md edits

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/u;

function yamlScalar(value: string | number): string {
  if (typeof value === "number") return String(value);
  return /^[A-Za-z0-9_.\-/%]+$/u.test(value) ? value : `'${value.replace(/'/gu, "''")}'`;
}

/** Sets one top-level scalar field of the frontmatter, keeping everything else byte for byte. */
export function setField(text: string, key: string, value: string | number): string {
  const match = FRONTMATTER.exec(text);
  if (!match) return `---\n${key}: ${yamlScalar(value)}\n---\n${text}`;
  const body = match[1]!;
  const line = new RegExp(`^${key}:.*$`, "mu");
  const next = line.test(body) ? body.replace(line, `${key}: ${yamlScalar(value)}`) : `${body}\n${key}: ${yamlScalar(value)}`;
  return text.replace(body, () => next);
}

/** Appends one entry to the `transitions:` block list (creating it at the end of the frontmatter). */
export function appendTransition(text: string, t: Transition): string {
  const entry = [
    `  - from: ${yamlScalar(t.from)}`,
    `    to: ${yamlScalar(t.to)}`,
    `    at: ${yamlScalar(t.at)}`,
    `    by: ${yamlScalar(t.by)}`,
    ...(t.thread ? [`    thread: ${yamlScalar(t.thread)}`] : []),
  ].join("\n");
  const match = FRONTMATTER.exec(text);
  if (!match) return `---\ntransitions:\n${entry}\n---\n${text}`;
  const lines = match[1]!.split(/\r?\n/u);
  const start = lines.findIndex((line) => /^transitions:\s*(\[\s*\])?\s*$/u.test(line));
  if (start < 0) {
    lines.push("transitions:", entry);
  } else {
    lines[start] = "transitions:";
    let end = start + 1;
    while (end < lines.length && (/^\s/u.test(lines[end]!) || lines[end] === "")) end += 1;
    lines.splice(end, 0, entry);
  }
  return text.replace(match[1]!, () => lines.join("\n"));
}

/** Reads `transitions` from parsed frontmatter data. */
export function readTransitions(data: Record<string, unknown>): Transition[] {
  const raw = data.transitions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      from: String(item.from ?? ""),
      to: String(item.to ?? ""),
      at: String(item.at ?? ""),
      by: String(item.by ?? ""),
      thread: item.thread === undefined || item.thread === null ? null : String(item.thread),
    }));
}
