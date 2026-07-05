#!/usr/bin/env node
// aird-validate.mjs — deterministic drift check between STATE.md and the AIRD package on disk.
// Purpose: STATE.md is model-maintained prose; this script proves its claims against the filesystem
// so `ready_for_delivery` / `complete` can never be a rubber stamp.
//
// Usage:
//   node aird-validate.mjs <package-dir>
//   node aird-validate.mjs <package-dir> --json      # machine-readable only
//   node aird-validate.mjs <package-dir> --strict    # warnings also fail (exit 1)
//
// Exit code: 0 = pass (errors == 0), 1 = fail. With --strict, warnings also fail.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const strict = args.includes('--strict');
const pkgDir = args.find((a) => !a.startsWith('--'));

const STATUS_ENUM = ['discovery', 'ready_for_delivery', 'in_delivery', 'complete', 'paused'];
const DONE_STATES = ['complete', 'done', 'ready', 'accepted'];
const BASELINE_REQUIRED = [
  '00-intake.md',
  '00-discussion-log.md',
  '01-prd.md',
  '03-risk-register.md',
  '04-trd.md',
  '07-implementation-plan.md',
  '08-quality-gates.md',
  '09-dod.md',
];
const UI_BLOCK = ['02-ux-problem-framing.md', '02-ui-spec.md', '02-ui-prototype.md'];
// Statuses that assert the package is finished enough to hand off / ship.
const GATED = ['ready_for_delivery', 'in_delivery', 'complete'];

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function fail(msg) {
  const out = { ok: false, errors: [msg], warnings: [] };
  if (jsonOnly) console.log(JSON.stringify(out));
  else console.error(`FAIL: ${msg}`);
  process.exit(1);
}

if (!pkgDir) fail('no package directory given. Usage: node aird-validate.mjs <package-dir>');
if (!existsSync(pkgDir) || !statSync(pkgDir).isDirectory()) fail(`not a directory: ${pkgDir}`);

const statePath = join(pkgDir, 'STATE.md');
if (!existsSync(statePath)) fail(`STATE.md missing in ${pkgDir}`);
const stateText = readFileSync(statePath, 'utf8');

// --- parse frontmatter (between the first two --- fences), ignoring # comments ---
const fmMatch = stateText.match(/^---\n([\s\S]*?)\n---/);
const fm = {};
if (fmMatch) {
  for (const raw of fmMatch[1].split('\n')) {
    const line = raw.replace(/\s+#.*$/, '');
    const m = line.match(/^\s*([a-z_]+):\s*(.+?)\s*$/);
    if (m) fm[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} else {
  warn('STATE.md has no YAML frontmatter block');
}

const status = fm.status;
if (!status) err('STATE.md frontmatter has no `status`');
else if (!STATUS_ENUM.includes(status)) err(`invalid status \`${status}\` (allowed: ${STATUS_ENUM.join(', ')})`);

// --- parse the Artifact Progress table: | name | status | notes | ---
const rows = [];
for (const line of stateText.split('\n')) {
  const m = line.match(/^\|\s*([0-9A-Za-z._-]+\.md)\s*\|\s*([A-Za-z_-]+)\s*\|(.*)\|/);
  if (m) rows.push({ name: m[1].trim(), status: m[2].trim().toLowerCase() });
}
if (!rows.length) warn('no Artifact Progress table rows parsed from STATE.md');

// --- filesystem inventory ---
const filesOnDisk = new Set(
  readdirSync(pkgDir).filter((f) => {
    try { return statSync(join(pkgDir, f)).isFile(); } catch { return false; }
  })
);
const workordersDir = join(pkgDir, 'workorders');
const workorderFiles = existsSync(workordersDir) && statSync(workordersDir).isDirectory()
  ? readdirSync(workordersDir).filter((f) => f.endsWith('.md'))
  : [];

// Check 1: every artifact the table calls done must exist on disk.
for (const r of rows) {
  if (DONE_STATES.includes(r.status) && !filesOnDisk.has(r.name)) {
    err(`STATE.md marks ${r.name} as "${r.status}" but the file is missing on disk`);
  }
}

// Check 2: untracked NN-*.md artifacts present on disk but absent from the table.
const tableNames = new Set(rows.map((r) => r.name));
for (const f of filesOnDisk) {
  if (/^\d\d-.+\.md$/.test(f) && !tableNames.has(f)) {
    warn(`file ${f} exists on disk but is not tracked in the Artifact Progress table`);
  }
}

// Check 3: artifacts_total should match the number of table rows.
if (fm.artifacts_total !== undefined && rows.length && Number(fm.artifacts_total) !== rows.length) {
  warn(`artifacts_total=${fm.artifacts_total} but the table has ${rows.length} rows`);
}

// Check 4: gated statuses require the baseline set (+ full UI block if any UI artifact is present).
if (GATED.includes(status)) {
  for (const req of BASELINE_REQUIRED) {
    if (!filesOnDisk.has(req)) err(`status is "${status}" but required artifact ${req} is missing`);
  }
  const userFacing = UI_BLOCK.some((f) => filesOnDisk.has(f));
  if (userFacing) {
    for (const f of UI_BLOCK) {
      if (!filesOnDisk.has(f)) err(`user-facing package (a 02-* file exists) but ${f} is missing`);
    }
  }
  if (!workorderFiles.length) err(`status is "${status}" but workorders/ has no *.md workorders`);
}

// Check 4b: a completed user-facing change must carry real browser evidence.
// "User-facing" = discovery produced a 02-* UI artifact. This catches the common
// failure where the loop marks a UI change done without ever opening a browser.
if (status === 'complete' && UI_BLOCK.some((f) => filesOnDisk.has(f))) {
  const evName = '10-ui-verification.md';
  if (!filesOnDisk.has(evName)) {
    err(`user-facing change is "complete" but ${evName} (browser evidence) is missing — the UI Verification Protocol did not run`);
  } else {
    let txt = '';
    try { txt = readFileSync(join(pkgDir, evName), 'utf8'); } catch { /* ignore */ }
    const blockedFallback = /blocked-no-evidence|preview.*unavailable|could not run|browser evidence still owed/i.test(txt);
    const hasUrl = /https?:\/\/|localhost|127\.0\.0\.1|:\d{2,5}(\/|\b)/.test(txt);
    const hasResult = /\b(pass|fail)\b/i.test(txt);
    if (!blockedFallback && !hasUrl) {
      err(`${evName} has no preview URL — browser verification looks unrun (add the URL, or record the blocked-preview fallback)`);
    }
    if (!blockedFallback && !hasResult) {
      err(`${evName} has no pass/fail results — browser verification looks unrun`);
    }
  }
}

// Check 5: workorders_total vs actual workorder files.
if (fm.workorders_total !== undefined && Number(fm.workorders_total) !== workorderFiles.length) {
  warn(`workorders_total=${fm.workorders_total} but workorders/ has ${workorderFiles.length} file(s)`);
}

// Check 6: `complete` should not leave open blockers section — heuristic scan.
if (status === 'complete') {
  const blockersMatch = stateText.match(/##\s*Blockers([\s\S]*?)(\n##\s|\n*$)/i);
  if (blockersMatch) {
    const body = blockersMatch[1].toLowerCase();
    const hasOpen = /- .*(block|todo|pending|unresolved|open)/.test(body) && !/none\.?/.test(body);
    if (hasOpen) warn('status is "complete" but the Blockers section still lists open items');
  }
}

const ok = errors.length === 0 && (!strict || warnings.length === 0);
const result = {
  ok,
  package: pkgDir,
  status: status ?? null,
  artifactsTracked: rows.length,
  filesOnDisk: filesOnDisk.size,
  workorders: workorderFiles.length,
  errors,
  warnings,
};

if (jsonOnly) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`AIRD validate: ${pkgDir}`);
  console.log(`  status: ${status ?? '(none)'} | artifacts tracked: ${rows.length} | workorders: ${workorderFiles.length}`);
  for (const e of errors) console.log(`  ERROR  ${e}`);
  for (const w of warnings) console.log(`  WARN   ${w}`);
  console.log(ok ? 'PASS' : 'FAIL');
}

process.exit(ok ? 0 : 1);
