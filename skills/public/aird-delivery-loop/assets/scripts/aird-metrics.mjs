#!/usr/bin/env node
// End-of-loop metrics record for the AIRD process-improvement phase.
// Derives every field it can from the package on disk (STATE.md frontmatter,
// workorders, risk register, review manifest, discussion log, verification
// evidence) and leaves the rest `null`. The orchestrator may pass what only it
// knows through --extra; it never retypes derivable numbers by hand.
//
//   node aird-metrics.mjs <package-dir> --kind discovery|delivery [--wave W1]
//        [--runtime claude|codex] [--outcome complete|escalated|abandoned]
//        [--extra '{"json":...}'] [--history <path>] [--dry-run] [--json]
//
// Writes <package>/metrics/<kind>[-<wave>].json and appends the same line to
// the shared history (default ~/.agent/aird-metrics/history.jsonl), then
// prints a compact comparison against the last 20 records of the same kind.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, appendFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  EXECUTABLE_KINDS,
  asList,
  loadReviewManifest,
  loadWorkorders,
  parseExistentialRisks,
  parseFrontmatter,
  parsePipeTable,
  parseStateFindings,
  section,
  collectIds,
} from './aird-contract.mjs';

const FINDING_CLASSES = new Set(['correctness', 'wiring', 'contract', 'data', 'security', 'test-coverage', 'ux', 'performance', 'docs', 'scope', 'evidence', 'process', 'other']);

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const flag = (name) => args.includes(name);
const packageArgument = args.find((argument, index) => !argument.startsWith('--') && (index === 0 || !args[index - 1].startsWith('--') || ['--dry-run', '--json'].includes(args[index - 1])));
if (!packageArgument) { console.error('usage: aird-metrics.mjs <package-dir> --kind discovery|delivery [--wave Wn] [--runtime claude|codex] [--outcome ...] [--extra json] [--history path] [--dry-run] [--json]'); process.exit(2); }
const packageDir = resolve(packageArgument);
const kind = option('--kind');
if (!['discovery', 'delivery'].includes(kind)) { console.error('--kind must be discovery or delivery'); process.exit(2); }
const wave = option('--wave') ?? null;
if (kind === 'delivery' && !wave) { console.error('--wave is required for kind delivery'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const runtime = option('--runtime') ?? (process.env.CODEX_HOME || here.includes('/.codex/') ? 'codex' : 'claude');
const historyPath = option('--history') ?? join(process.env.AIRD_METRICS_DIR ?? join(homedir(), '.agent', 'aird-metrics'), 'history.jsonl');
const dryRun = flag('--dry-run');
const jsonOnly = flag('--json');
let extra = {};
if (option('--extra')) {
  try { extra = JSON.parse(option('--extra')); } catch (error) { console.error(`--extra is not valid JSON: ${error.message}`); process.exit(2); }
}

const read = (file) => { try { return readFileSync(join(packageDir, file), 'utf8'); } catch { return ''; } };
const stateText = read('STATE.md');
if (!stateText) { console.error(`STATE.md missing in ${packageDir}`); process.exit(2); }
const state = parseFrontmatter(stateText);
const truthy = (value) => /^(true|yes|approved)$/i.test(String(value ?? '').trim());
const workorders = loadWorkorders(packageDir);
const executable = workorders.filter((workorder) => EXECUTABLE_KINDS.has(workorder.kind));
const manifest = loadReviewManifest(packageDir);
const acceptedWaves = manifest ? Object.keys(manifest.waves ?? manifest.accepted_waves ?? {}) : [];

function git(...gitArgs) {
  const result = spawnSync('git', ['-C', packageDir, ...gitArgs], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}
const repoName = basename(git('rev-parse', '--show-toplevel') ?? process.cwd());

function birthtime(file) {
  try { const stats = statSync(join(packageDir, file)); return stats.birthtimeMs || stats.mtimeMs; } catch { return null; }
}
function hours(fromMs) { return fromMs ? Math.round(((Date.now() - fromMs) / 3.6e6) * 10) / 10 : null; }

function countOccurrences(text, pattern) { return (text.match(pattern) ?? []).length; }
function classCounts(entries) {
  const counts = {};
  let seen = 0;
  for (const entry of entries) {
    const cls = String(entry.class ?? entry.finding_class ?? '').trim().toLowerCase();
    if (!FINDING_CLASSES.has(cls)) continue;
    counts[cls] = (counts[cls] ?? 0) + 1;
    seen += 1;
  }
  return seen ? counts : null;
}
function statusCounts(text, headingPattern) {
  const body = section(text, headingPattern);
  if (!body.trim()) return null;
  const rows = parsePipeTable(body);
  if (!rows.length) return null;
  const counts = { locked: 0, defaulted: 0, unconfirmed: 0, open: 0 };
  for (const cells of rows) {
    const cell = cells.map((value) => value.toLowerCase()).find((value) => /^(locked|defaulted|unconfirmed|open)$/.test(value));
    if (cell) counts[cell] += 1;
  }
  return counts;
}

const archiveText = read('evidence/state-archive.md');
const continueText = read('.continue-here.md');
// `section()` stops at the next heading of any level, and slice entries are
// `###` headings inside the index, so slice the `##` block by hand.
const sliceIndexText = (() => {
  const match = /^##\s+Current Wave Slice Index\s*$/im.exec(stateText);
  if (!match) return '';
  const remainder = stateText.slice(match.index + match[0].length);
  const next = remainder.search(/^##\s+/m);
  return next >= 0 ? remainder.slice(0, next) : remainder;
})();

const header = {
  schema: 1,
  kind,
  runtime,
  ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  repo: repoName,
  slug: basename(packageDir),
  profile: state.discovery_profile ?? null,
  package_class: state.package_class ?? null,
  outcome: option('--outcome') ?? (kind === 'discovery'
    ? (state.status === 'ready_for_delivery' || acceptedWaves.length ? 'complete' : (state.status === 'paused' ? 'escalated' : null))
    : (state.status === 'complete' ? 'complete' : (state.status === 'paused' ? 'escalated' : null))),
  duration_hours: kind === 'discovery' ? hours(birthtime('00-intake.md')) : null,
  root_handoffs: countOccurrences(`${archiveText}\n${continueText}`, /checkpoint_kind:\s*proactive_handoff/g) || null,
  notes: null,
};

let body;
if (kind === 'discovery') {
  const discussion = read('00-discussion-log.md');
  const risks = parseExistentialRisks(read('03-risk-register.md'));
  const findings = parseStateFindings(stateText);
  const questions = parsePipeTable(section(discussion, 'Questions Asked'));
  const architectural = statusCounts(discussion, 'Architectural Decisions');
  const riskDriven = statusCounts(discussion, 'Risk-Driven Questions And Mitigations');
  const decisions = architectural || riskDriven ? {
    locked: (architectural?.locked ?? 0) + (riskDriven?.locked ?? 0),
    defaulted: (architectural?.defaulted ?? 0) + (riskDriven?.defaulted ?? 0),
    unconfirmed: (architectural?.unconfirmed ?? 0) + (riskDriven?.unconfirmed ?? 0),
  } : null;
  const closureSize = acceptedWaves.reduce((sum, acceptedWave) => sum + (Object.keys(manifest?.waves?.[acceptedWave]?.workorders ?? {}).length), 0);
  body = {
    discovery_iterations: null,
    interview_questions: questions.length || null,
    decisions,
    existential_risks: {
      total: risks.length,
      proven: risks.filter((risk) => risk.status === 'proven').length,
      refuted: risks.filter((risk) => risk.status === 'refuted').length,
      unproven: risks.filter((risk) => !['proven', 'refuted'].includes(String(risk.status))).length,
    },
    waves_total: new Set(executable.map((workorder) => workorder.wave).filter((value) => value && value !== 'none')).size,
    accepted_waves: acceptedWaves,
    workorders_total: executable.length,
    workorders_accepted_wave: closureSize || null,
    review: {
      calls: Number.isInteger(Number(state.review_calls_used)) ? Number(state.review_calls_used) : null,
      coverage: state.review_coverage ?? null,
      findings_total: findings.length,
      findings_by_class: classCounts(findings),
    },
    strict_validator_fixes: null,
    platform_slice: truthy(state.platform_slice_approved),
    scoped_corrections: null,
  };
} else {
  const fixDir = join(packageDir, 'fix-workorders');
  const noteDir = join(packageDir, 'finding-notes');
  const list = (dir) => (existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.md')) : []);
  const findingEntries = [...list(fixDir).map((file) => join(fixDir, file)), ...list(noteDir).map((file) => join(noteDir, file))]
    .map((path) => parseFrontmatter(readFileSync(path, 'utf8')));
  const gatesText = read('08-quality-gates.md');
  const backend = parseFrontmatter(read('10-backend-verification.md'));
  const ui = parseFrontmatter(read('10-ui-verification.md'));
  const blockedNoEvidence = [backend, ui].filter((evidence) => /blocked/i.test(String(evidence.result ?? ''))).length;
  const sliceCount = countOccurrences(`${sliceIndexText}\n${archiveText}`, /^###\s+\S/gm);
  body = {
    waves_delivered: [wave],
    slices_total: sliceCount || null,
    workers_spawned: null,
    worker_reasons: { parallelism: null, context: null },
    gates: {
      total: collectIds(gatesText, /\bG-\d+/g).length || null,
      first_pass: null,
      blocked_no_evidence: blockedNoEvidence,
      waived: null,
    },
    findings: {
      total: findingEntries.length,
      by_class: classCounts(findingEntries),
      fix_cycles: null,
      max_revision_attempts: null,
      escalations: null,
    },
    package_rework_files: null,
    plan_deviations: null,
    discovery_defects: { impact_radius_misses: null, proxy_probes: null, oversized_workorders: null, consumes_gaps: null, total: null },
    hard_stops: countOccurrences(`${archiveText}\n${continueText}`, /checkpoint_kind:\s*hard_stop/g),
    auto_compactions: null,
  };
}

function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) merge(target[key], value);
    else target[key] = value;
  }
  return target;
}
const record = merge({ ...header, ...body }, extra);
if (record.discovery_defects && record.discovery_defects.total === null) {
  const parts = Object.entries(record.discovery_defects).filter(([key]) => key !== 'total').map(([, value]) => value);
  if (parts.every((value) => Number.isInteger(value))) record.discovery_defects.total = parts.reduce((sum, value) => sum + value, 0);
}

const line = JSON.stringify(record);
const snapshotPath = join(packageDir, 'metrics', kind === 'discovery' ? 'discovery.json' : `delivery-${wave}.json`);
if (!dryRun) {
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, `${line}\n`);
  mkdirSync(dirname(historyPath), { recursive: true });
  appendFileSync(historyPath, `${line}\n`);
}

// Comparison: same kind, last 20 records, same profile when 3+ share it.
let history = [];
try {
  history = readFileSync(historyPath, 'utf8').split(/\r?\n/).filter(Boolean).map((entry) => { try { return JSON.parse(entry); } catch { return null; } }).filter(Boolean);
} catch { /* no history yet */ }
const previous = history.filter((entry) => entry.kind === kind && entry.ts !== record.ts).slice(-20);
const sameProfile = previous.filter((entry) => entry.profile === record.profile);
const comparable = sameProfile.length >= 3 ? sameProfile : previous;
const median = (values) => { const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b); if (!sorted.length) return null; const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const signals = [];
if (kind === 'discovery') {
  if (record.existential_risks?.unproven > 0) signals.push('⚠ existential_risks.unproven > 0');
  if (record.review?.coverage !== 'complete') signals.push('⚠ review.coverage is not complete');
  if (record.decisions?.unconfirmed > 0) signals.push('⚠ decisions.unconfirmed > 0');
  if (record.discovery_iterations >= 2) signals.push('discovery_iterations >= 2');
  if (record.scoped_corrections >= 1) signals.push('scoped_corrections >= 1');
  const ratio = record.review?.findings_total / Math.max(record.workorders_total ?? 0, 1);
  const historyMedian = median(comparable.map((entry) => (entry.review?.findings_total ?? NaN) / Math.max(entry.workorders_total ?? 0, 1)));
  if (historyMedian !== null && ratio > historyMedian * 1.5) signals.push(`review findings per workorder ${ratio.toFixed(2)} exceeds history median ${historyMedian.toFixed(2)} by >50%`);
} else {
  const defects = record.discovery_defects ?? {};
  if (Object.values(defects).some((value) => Number.isFinite(value) && value > 0)) signals.push('⚠ discovery_defects > 0 (route the proposal at the discovery skill)');
  if (record.gates?.blocked_no_evidence > 0) signals.push('⚠ gates.blocked_no_evidence > 0');
  if (record.gates?.waived > 0) signals.push('⚠ gates.waived > 0');
  if (record.findings?.escalations > 0) signals.push('⚠ findings.escalations > 0');
  if (record.findings?.fix_cycles >= 2 || record.findings?.max_revision_attempts >= 3) signals.push('findings.fix_cycles >= 2 or max_revision_attempts >= 3');
  if (record.package_rework_files > 0) signals.push('package_rework_files > 0');
  if (record.hard_stops > 0 || record.auto_compactions > 0) signals.push('hard_stops or auto_compactions > 0');
  const firstPass = Number.isFinite(record.gates?.first_pass) ? record.gates.first_pass / Math.max(record.gates.total ?? 0, 1) : null;
  const historyMedian = median(comparable.map((entry) => (Number.isFinite(entry.gates?.first_pass) ? entry.gates.first_pass / Math.max(entry.gates.total ?? 0, 1) : NaN)));
  if (firstPass !== null && historyMedian !== null && firstPass < historyMedian) signals.push(`gates first-pass rate ${firstPass.toFixed(2)} below history median ${historyMedian.toFixed(2)}`);
}
const topClass = (entry) => { const classes = kind === 'discovery' ? entry.review?.findings_by_class : entry.findings?.by_class; if (!classes) return null; return Object.entries(classes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };
const currentTop = topClass(record);
if (currentTop && comparable.some((entry) => topClass(entry) === currentTop)) signals.push(`top finding class "${currentTop}" repeats a previous run`);

const summary = {
  record,
  snapshot: dryRun ? null : snapshotPath,
  history: dryRun ? null : historyPath,
  comparable_records: comparable.length,
  insufficient_history: comparable.length < 2,
  signals,
  null_fields: Object.entries(record).flatMap(([key, value]) => (value === null ? [key] : (value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value).filter(([, inner]) => inner === null).map(([inner]) => `${key}.${inner}`) : []))),
};
if (jsonOnly) console.log(JSON.stringify(summary));
else {
  console.log(dryRun ? 'dry run (nothing written)' : `written: ${snapshotPath}\nappended: ${historyPath}`);
  console.log(`comparable records: ${comparable.length}${summary.insufficient_history ? ' (insufficient history: propose only on ⚠ signals)' : ''}`);
  console.log(`signals: ${signals.length ? signals.join('; ') : 'none'}`);
  console.log(`null fields (fill via --extra if known): ${summary.null_fields.join(', ') || 'none'}`);
}
