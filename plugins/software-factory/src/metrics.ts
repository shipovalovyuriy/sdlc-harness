// AIRD process metrics: the store both AIRD loops write at their terminal
// outcome and read for the "flagged twice becomes a rule" improvement phase
// (aird-discovery-loop/references/process-metrics.md):
//   ~/.agent/aird-metrics/history.jsonl          one JSON line per loop run
//   ~/.agent/aird-metrics/improvement-backlog.md proposals P-… and watch items W-…
//   ~/.agent/aird-metrics/evals/*.md             eval cases
// Read-only here. Signals are recomputed with the contract's rules so the page
// shows what the loop reacts to.
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { firstHeading, readText, splitFrontmatter } from "./aird";

export function metricsDir(): string {
  return process.env.AIRD_METRICS_DIR || join(homedir(), ".agent", "aird-metrics");
}

type Json = Record<string, unknown>;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function obj(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function counts(value: unknown): Record<string, number> | null {
  const o = obj(value);
  if (!o) return null;
  const out: Record<string, number> = {};
  for (const [key, v] of Object.entries(o)) if (typeof v === "number") out[key] = v;
  return out;
}

export interface MetricsSignal {
  id: string;
  label: string;
  severe: boolean;
}

export interface MetricsRun {
  key: string;
  ts: string | null;
  kind: "discovery" | "delivery" | "other";
  runtime: string | null;
  repo: string | null;
  slug: string | null;
  profile: string | null;
  outcome: string | null;
  durationHours: number | null;
  rootHandoffs: number | null;
  // discovery
  interviewQuestions: number | null;
  decisions: Record<string, number> | null;
  existentialRisks: Record<string, number> | null;
  workordersTotal: number | null;
  reviewFindings: number | null;
  reviewCoverage: string | null;
  strictValidatorFixes: number | null;
  scopedCorrections: number | null;
  discoveryIterations: number | null;
  // delivery
  slicesTotal: number | null;
  workersSpawned: number | null;
  gatesTotal: number | null;
  gatesFirstPass: number | null;
  gatesBlockedNoEvidence: number | null;
  gatesWaived: number | null;
  findingsTotal: number | null;
  fixCycles: number | null;
  maxRevisionAttempts: number | null;
  escalations: number | null;
  unclassified: number | null;
  discoveryDefects: number | null;
  packageReworkFiles: number | null;
  hardStops: number | null;
  autoCompactions: number | null;
  // both
  findingsByClass: Record<string, number> | null;
  findingsByRootCause: Record<string, number> | null;
  notes: string | null;
  signals: MetricsSignal[];
  raw: string;
}

function normalize(record: Json, index: number): MetricsRun {
  const kind = record.kind === "discovery" || record.kind === "delivery" ? record.kind : "other";
  const review = obj(record.review);
  const gates = obj(record.gates);
  const findings = obj(record.findings);
  const defects = obj(record.discovery_defects);
  const ts = str(record.ts) ?? str(record.date);
  return {
    key: `${index}`,
    ts,
    kind,
    runtime: str(record.runtime),
    repo: str(record.repo),
    slug: str(record.slug) ?? str(record.feature_slug),
    profile: str(record.profile) ?? str(record.discovery_profile),
    outcome: str(record.outcome),
    durationHours: num(record.duration_hours) ?? (num(record.elapsed_minutes) !== null ? Math.round((num(record.elapsed_minutes)! / 60) * 10) / 10 : null),
    rootHandoffs: num(record.root_handoffs),
    interviewQuestions: num(record.interview_questions),
    decisions: counts(record.decisions),
    existentialRisks: counts(record.existential_risks),
    workordersTotal: num(record.workorders_total),
    reviewFindings: num(review?.findings_total) ?? num(record.findings_total),
    reviewCoverage: str(review?.coverage) ?? str(record.review_coverage),
    strictValidatorFixes: num(record.strict_validator_fixes),
    scopedCorrections: num(record.scoped_corrections),
    discoveryIterations: num(record.discovery_iterations),
    slicesTotal: num(record.slices_total) ?? num(record.execution_slices) ?? num(record.slices),
    workersSpawned: num(record.workers_spawned) ?? num(record.implementation_workers_spawned),
    gatesTotal: num(gates?.total) ?? num(record.gates_total) ?? num(record.gates_required),
    gatesFirstPass: num(gates?.first_pass) ?? num(record.gates_passed),
    gatesBlockedNoEvidence: num(gates?.blocked_no_evidence) ?? num(record.gates_blocked_no_evidence),
    gatesWaived: num(gates?.waived),
    findingsTotal: kind === "delivery" ? (num(findings?.total) ?? num(record.findings_total)) : num(review?.findings_total),
    fixCycles: num(findings?.fix_cycles) ?? num(record.revision_cycles),
    maxRevisionAttempts: num(findings?.max_revision_attempts),
    escalations: num(findings?.escalations),
    unclassified: num(findings?.unclassified),
    discoveryDefects: num(defects?.total),
    packageReworkFiles: num(record.package_rework_files),
    hardStops: num(record.hard_stops),
    autoCompactions: num(record.auto_compactions),
    findingsByClass: kind === "delivery" ? counts(findings?.by_class) : counts(review?.findings_by_class),
    findingsByRootCause: counts(findings?.by_root_cause),
    notes: str(record.notes),
    signals: [],
    raw: JSON.stringify(record, null, 2),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function topClass(byClass: Record<string, number> | null): string | null {
  if (!byClass) return null;
  const entries = Object.entries(byClass).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0]![0];
}

/** The contract's signal rules (process-metrics.md → Comparison And Signals). */
function computeSignals(runs: MetricsRun[]): void {
  runs.forEach((run, index) => {
    const previous = runs.slice(Math.max(0, index - 20), index).filter((r) => r.kind === run.kind);
    const signals: MetricsSignal[] = [];
    const add = (id: string, label: string, severe = false) => signals.push({ id, label, severe });
    if (run.kind === "discovery") {
      if ((run.existentialRisks?.unproven ?? 0) > 0) add("unproven-risks", "Непроверенные existential-риски при приёмке", true);
      if (run.reviewCoverage && run.reviewCoverage !== "complete") add("review-coverage", "Финальное ревью прочитало пакет не полностью", true);
      if ((run.decisions?.unconfirmed ?? 0) > 0) add("unconfirmed-decisions", "Неподтверждённые решения", true);
      if ((run.discoveryIterations ?? 0) >= 2) add("discovery-iterations", "Discovery прошёл ≥2 итераций");
      if ((run.scopedCorrections ?? 0) >= 1) add("scoped-corrections", "Поздние исправления ошибочных предположений");
      const ratio = run.reviewFindings !== null ? run.reviewFindings / Math.max(run.workordersTotal ?? 0, 1) : null;
      const history = median(
        previous.map((r) => (r.reviewFindings !== null ? r.reviewFindings / Math.max(r.workordersTotal ?? 0, 1) : NaN)).filter(Number.isFinite),
      );
      if (ratio !== null && history !== null && history > 0 && ratio > history * 1.5) add("findings-density", "Плотность находок ревью выше медианы на 50%+");
    } else if (run.kind === "delivery") {
      if ((run.discoveryDefects ?? 0) > 0) add("discovery-defects", "Delivery нашёл дефекты в самом пакете", true);
      if ((run.gatesBlockedNoEvidence ?? 0) > 0) add("blocked-no-evidence", "Гейты без доказательств (blocked-no-evidence)", true);
      if ((run.gatesWaived ?? 0) > 0) add("waived-gates", "Гейты сняты waiver'ом", true);
      if ((run.escalations ?? 0) > 0) add("escalations", "Эскалации к пользователю", true);
      if ((run.unclassified ?? 0) > 0) add("unclassified", "Находки без класса во frontmatter", true);
      const rc = run.findingsByRootCause;
      if (rc) {
        const classified = (rc.code ?? 0) + (rc.workorder ?? 0) + (rc.intent ?? 0);
        if (classified > 0 && ((rc.workorder ?? 0) + (rc.intent ?? 0)) / classified >= 0.5) {
          add("born-in-package", "≥50% находок родились в пакете (workorder/intent)", true);
        }
      }
      const rate = run.gatesFirstPass !== null && run.gatesTotal ? run.gatesFirstPass / run.gatesTotal : null;
      const history = median(previous.map((r) => (r.gatesFirstPass !== null && r.gatesTotal ? r.gatesFirstPass / r.gatesTotal : NaN)).filter(Number.isFinite));
      if (rate !== null && history !== null && rate < history) add("first-pass-below-median", "First-pass гейтов ниже медианы");
      if ((run.fixCycles ?? 0) >= 2 || (run.maxRevisionAttempts ?? 0) >= 3) add("fix-cycles", "Много циклов исправлений");
      if ((run.packageReworkFiles ?? 0) > 0) add("package-rework", "Пакет переписывали во время delivery");
      if ((run.hardStops ?? 0) > 0 || (run.autoCompactions ?? 0) > 0) add("context-economy", "Hard stop / автокомпакция контекста");
      const bc = run.findingsByClass;
      if (bc && run.findingsTotal) {
        if (((bc["test-coverage"] ?? 0) + (bc.evidence ?? 0)) / run.findingsTotal >= 0.5) add("test-evidence-share", "≥50% находок — тесты и доказательства");
      }
    }
    const top = topClass(run.findingsByClass);
    if (top && previous.some((r) => topClass(r.findingsByClass) === top)) add(`top-class-repeat`, `Повтор верхнего класса находок: ${top}`);
    run.signals = signals;
  });
}

export interface BacklogEntry {
  id: string | null;
  type: "proposal" | "watch" | "note";
  title: string;
  status: string;
  date: string | null;
  markdown: string;
}

function normalizeStatus(text: string): string {
  const t = text.toLowerCase();
  if (/^(applied|применено|принято и применено)/u.test(t) || /применено/u.test(t)) return "applied";
  if (/^(accepted|принято)/u.test(t)) return "accepted";
  if (/^(rejected|отклонено)/u.test(t)) return "rejected";
  if (/^(proposed|предложено)/u.test(t)) return "proposed";
  if (/закрыто|closed/u.test(t)) return "closed";
  if (/наблюдение|watch/u.test(t)) return "watch";
  return t.split(/[\s(,.;]/u)[0] || "unknown";
}

function parseBacklog(text: string): BacklogEntry[] {
  const lines = text.split(/\r?\n/u);
  const entries: BacklogEntry[] = [];
  const heads: { index: number; level: number; text: string }[] = [];
  lines.forEach((line, index) => {
    const match = /^(#{2,3})\s+(.+)$/u.exec(line);
    if (match) heads.push({ index, level: match[1]!.length, text: match[2]!.trim() });
  });
  heads.forEach((head, h) => {
    const end = heads.slice(h + 1).find((next) => next.level <= head.level)?.index ?? lines.length;
    const nextAny = heads[h + 1]?.index ?? lines.length;
    const body = lines.slice(head.index + 1, end).join("\n").trim();
    if (/^(Предложения|Наблюдения.*|Watch.*)$/iu.test(head.text)) return;
    // Container headings whose content is only sub-entries carry nothing.
    if (lines.slice(head.index + 1, nextAny).join("\n").trim() === "" && end > nextAny) return;
    const idMatch = /^((?:P|W)-[A-Za-z0-9-]+)/u.exec(head.text);
    const id = idMatch ? idMatch[1]! : null;
    const titleRaw = head.text.replace(/^((?:P|W)-[A-Za-z0-9-]+)\s*[—–:-]*\s*/u, "");
    const statusLine = /^\s*-\s*Статус:\s*(.+)$/imu.exec(body)?.[1] ?? null;
    let type: BacklogEntry["type"] = "note";
    if (id?.startsWith("P-") || /предложени|принято/iu.test(head.text)) type = "proposal";
    if (id?.startsWith("W-") || /наблюдени|watch/iu.test(head.text)) type = "watch";
    const status = statusLine
      ? normalizeStatus(statusLine)
      : /применено|ПРИНЯТО И ПРИМЕНЕНО/u.test(head.text)
        ? "applied"
        : /предложено/iu.test(head.text)
          ? "proposed"
          : type === "watch"
            ? "watch"
            : type === "proposal"
              ? "proposed"
              : "note";
    const date =
      /^\s*-\s*Дата:\s*(\S+)/imu.exec(body)?.[1] ??
      /(\d{4}-\d{2}-\d{2})/u.exec(`${head.text} ${statusLine ?? ""}`)?.[1] ??
      null;
    entries.push({ id, type, title: titleRaw || head.text, status, date, markdown: `## ${head.text}\n\n${body}`.slice(0, 40_000) });
  });
  // Bullet watch items: "- W-0003 (2026-08-29, slug) — text".
  for (const line of lines) {
    const match = /^\s*-\s*(W-\d+)\s*\(([^)]*)\)\s*[—–-]\s*(.+)$/u.exec(line);
    if (!match) continue;
    if (entries.some((entry) => entry.id === match[1])) continue;
    entries.push({
      id: match[1]!,
      type: "watch",
      title: match[3]!.slice(0, 200),
      status: "watch",
      date: /(\d{4}-\d{2}-\d{2})/u.exec(match[2]!)?.[1] ?? null,
      markdown: line.replace(/^\s*-\s*/u, ""),
    });
  }
  return entries;
}

export interface MetricsOverview {
  dir: string;
  runs: MetricsRun[];
  backlog: BacklogEntry[];
  evals: { file: string; title: string }[];
  error: string | null;
}

export function readMetrics(): MetricsOverview {
  const dir = metricsDir();
  const historyText = readText(join(dir, "history.jsonl"));
  if (historyText === null) {
    return { dir, runs: [], backlog: [], evals: [], error: `Нет ${join(dir, "history.jsonl")} — AIRD ещё не записывал метрики` };
  }
  const records: Json[] = [];
  for (const line of historyText.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (obj(parsed)) records.push(parsed as Json);
    } catch {
      /* a broken line is skipped, like the metrics script does */
    }
  }
  const runs = records.map(normalize);
  computeSignals(runs);
  const backlogText = readText(join(dir, "improvement-backlog.md"));
  let evalFiles: string[] = [];
  try {
    evalFiles = readdirSync(join(dir, "evals")).filter((name) => name.endsWith(".md")).sort();
  } catch {
    evalFiles = [];
  }
  const evals = evalFiles.map((file) => {
    const text = readText(join(dir, "evals", file)) ?? "";
    return { file, title: firstHeading(splitFrontmatter(text).body) ?? file.replace(/\.md$/u, "") };
  });
  return { dir, runs, backlog: backlogText ? parseBacklog(backlogText) : [], evals, error: null };
}

export function readEval(file: string): string | null {
  if (!/^[A-Za-z0-9._-]+\.md$/u.test(file)) return null;
  return readText(join(metricsDir(), "evals", file));
}
