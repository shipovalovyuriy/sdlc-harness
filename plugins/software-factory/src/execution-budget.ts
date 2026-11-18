/** Versioned policy: only newly launched workers opt in; legacy workers keep their policy. */
export const EXECUTION_POLICY = { version: 2, warnActions: 60, stopActions: 80, warnTokens: 120_000, stopTokens: 160_000, warnPct: 40, stopPct: 50, maxAgeMs: 5 * 60_000 } as const;
export interface BudgetObservation { actions: number; contextTokens: number | null; contextWindow: number | null; capturedAt: number | null; now: number }
export function decideExecutionBudget(o: BudgetObservation): { action: 'continue' | 'warn' | 'checkpoint'; reasons: string[]; measurementQuality: 'measured' | 'unknown' | 'stale' } {
  const fresh = o.capturedAt !== null && o.capturedAt <= o.now && o.now - o.capturedAt <= EXECUTION_POLICY.maxAgeMs;
  const known = fresh && o.contextTokens !== null && Number.isFinite(o.contextTokens) && o.contextTokens >= 0;
  const pct = known && o.contextWindow !== null && o.contextWindow > 0 ? o.contextTokens! / o.contextWindow * 100 : null;
  const reasons: string[] = [];
  let action: 'continue' | 'warn' | 'checkpoint' = 'continue';
  const check = (value: number | null, warn: number, stop: number, label: string) => {
    if (value === null || value < warn) return;
    reasons.push(`${label}: ${Math.round(value)}`);
    if (value >= stop) action = 'checkpoint'; else if (action === 'continue') action = 'warn';
  };
  check(o.actions, EXECUTION_POLICY.warnActions, EXECUTION_POLICY.stopActions, 'действия');
  check(known ? o.contextTokens : null, EXECUTION_POLICY.warnTokens, EXECUTION_POLICY.stopTokens, 'контекст');
  check(pct, EXECUTION_POLICY.warnPct, EXECUTION_POLICY.stopPct, '% окна');
  return { action, reasons, measurementQuality: known ? 'measured' : o.capturedAt === null ? 'unknown' : 'stale' };
}

/** Conservative overlap, including parent directories and glob prefixes. Unknown scope conflicts. */
export function scopesOverlap(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return true;
  const prefix = (s: string) => s.replace(/^\.\//u, '').split(/[?*\[]/u)[0]!.replace(/\/+$/u, '');
  return a.some(x => b.some(y => { const p = prefix(x), q = prefix(y); return !p || !q || p === q || p.startsWith(q + '/') || q.startsWith(p + '/'); }));
}

export function checkpointProblem(data: Record<string, unknown>, source: string): string | null {
  if (data.checkpoint_source !== source) return 'checkpoint_source must identify the stopped worker';
  if (typeof data.checkpoint_revision !== 'string' || !data.checkpoint_revision.trim()) return 'checkpoint_revision is required';
  for (const key of ['checkpoint_dirty_paths', 'checkpoint_completed', 'checkpoint_remaining', 'checkpoint_checks']) {
    if (!Array.isArray(data[key]) || !(data[key] as unknown[]).every(v => typeof v === 'string' && v.trim())) return `${key} must be a list of nonempty strings`;
  }
  if (!(data.checkpoint_checks as string[]).length) return 'record executed checks or explicitly state that checks were not run';
  return null;
}
