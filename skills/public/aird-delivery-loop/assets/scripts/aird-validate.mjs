#!/usr/bin/env node
// aird-validate.mjs — deterministic drift/evidence check for an AIRD package.
// Purpose: STATE.md and evidence summaries are model-maintained prose; this script checks their
// machine-verifiable claims against disk so `ready_for_delivery` / `complete` cannot be rubber stamps.
//
// Usage:
//   node aird-validate.mjs <package-dir>
//   node aird-validate.mjs <package-dir> --json      # machine-readable only
//   node aird-validate.mjs <package-dir> --strict    # warnings also fail (exit 1)
//
// Exit code: 0 = pass (errors == 0), 1 = fail. With --strict, validation
// warnings also fail; warn-only session checkpoint advisories never fail.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const strict = args.includes('--strict');
const pkgDir = args.find((a) => !a.startsWith('--'));

const STATUS_ENUM = [
  'discovery',
  'ready_for_delivery',
  'in_delivery',
  'implementation_complete',
  'verifying',
  'ready_for_release',
  'complete',
  'paused',
];
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
const GATED = [
  'ready_for_delivery',
  'in_delivery',
  'implementation_complete',
  'verifying',
  'ready_for_release',
  'complete',
];
const RELEASE_GATED = ['ready_for_release', 'complete'];

const errors = [];
const warnings = [];
const advisories = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const advise = (m) => advisories.push(m);

function fail(msg) {
  const out = { ok: false, errors: [msg], warnings: [] };
  if (jsonOnly) console.log(JSON.stringify(out));
  else console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function scalar(value) {
  const trimmed = value.trim();
  if (trimmed === '[]') return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const body = trimmed.slice(1, -1).trim();
    if (!body) return [];
    return body.split(',').map((item) => scalar(item));
  }
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  const parsed = {};
  if (!match) return parsed;
  let activeList = null;
  for (const raw of match[1].split('\n')) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const list = line.match(/^\s+-\s+(.+)$/);
    if (list && activeList) {
      parsed[activeList].push(scalar(list[1]));
      continue;
    }
    const field = line.match(/^\s*([a-z_]+):\s*(.*?)\s*$/);
    if (!field) continue;
    if (!field[2]) {
      parsed[field[1]] = [];
      activeList = field[1];
    } else {
      parsed[field[1]] = scalar(field[2]);
      activeList = null;
    }
  }
  return parsed;
}

function asArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

function section(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|$(?![\\s\\S]))`, 'im'));
  return match ? match[1] : '';
}

if (!pkgDir) fail('no package directory given. Usage: node aird-validate.mjs <package-dir>');
if (!existsSync(pkgDir) || !statSync(pkgDir).isDirectory()) fail(`not a directory: ${pkgDir}`);

const statePath = join(pkgDir, 'STATE.md');
if (!existsSync(statePath)) fail(`STATE.md missing in ${pkgDir}`);
const stateText = readFileSync(statePath, 'utf8');

// --- parse frontmatter (between the first two --- fences), ignoring # comments ---
const fm = parseFrontmatter(stateText);
if (!Object.keys(fm).length) {
  warn('STATE.md has no YAML frontmatter block');
}

const status = fm.status;
if (!status) err('STATE.md frontmatter has no `status`');
else if (!STATUS_ENUM.includes(status)) err(`invalid status \`${status}\` (allowed: ${STATUS_ENUM.join(', ')})`);

const stateV2 = String(fm.aird_state_version ?? '') === '2.0';
const implementationReadiness = fm.ready_for_implementation;
const runtimeReadiness = fm.ready_for_runtime_verification;
const releaseReadiness = fm.ready_for_release;

if (stateV2) {
  if (!['product', 'supporting'].includes(String(fm.package_class))) {
    err(`invalid package_class \`${fm.package_class}\``);
  }
  if (fm.package_class === 'supporting' && fm.supporting_package_user_approved !== true) {
    err('separate supporting AIRD package requires explicit user approval');
  }
  if (!['blocked', 'ready'].includes(String(implementationReadiness))) {
    err(`invalid ready_for_implementation \`${implementationReadiness}\``);
  }
  if (!['blocked', 'ready', 'not_required'].includes(String(runtimeReadiness))) {
    err(`invalid ready_for_runtime_verification \`${runtimeReadiness}\``);
  }
  if (!['blocked', 'ready'].includes(String(releaseReadiness))) {
    err(`invalid ready_for_release \`${releaseReadiness}\``);
  }
  const implementationStatuses = [
    'ready_for_delivery',
    'in_delivery',
    'implementation_complete',
    'verifying',
    'ready_for_release',
    'complete',
  ];
  if (implementationStatuses.includes(status) && implementationReadiness !== 'ready') {
    err(`status ${status} requires ready_for_implementation: ready`);
  }
  if (status === 'verifying' && !['ready', 'not_required'].includes(runtimeReadiness)) {
    err('status verifying requires ready_for_runtime_verification: ready|not_required');
  }
  if (RELEASE_GATED.includes(status) && releaseReadiness !== 'ready') {
    err(`status ${status} requires ready_for_release: ready`);
  }
  if (releaseReadiness === 'ready' && !['ready', 'not_required'].includes(runtimeReadiness)) {
    err('ready_for_release: ready requires runtime verification readiness or not_required');
  }
  const numericStateFields = [
    'product_files_changed',
    'supporting_wip',
    'supporting_workorders_used',
    'supporting_delivery_percent',
    'cycles_without_user_value',
    'minutes_without_user_value',
  ];
  for (const field of numericStateFields) {
    if (!Number.isInteger(fm[field]) || fm[field] < 0) err(`${field} must be a non-negative integer`);
  }
  if (fm.product_files_changed > 0 && fm.product_implementation_started !== true) {
    err('product files changed but product_implementation_started is false');
  }
  if (!['pending', 'in_progress', 'functional'].includes(String(fm.first_vertical_slice))) {
    err(`invalid first_vertical_slice \`${fm.first_vertical_slice}\``);
  }
  if (fm.first_vertical_slice === 'functional' &&
      (fm.product_implementation_started !== true || fm.product_files_changed < 1)) {
    err('functional first vertical slice requires started implementation and product files');
  }
  if ((fm.supporting_workorders_used > 1 || fm.supporting_delivery_percent > 20) &&
      fm.user_approved_overrun !== true) {
    err('supporting detour exceeded one workorder or 20 percent without user approval');
  }

  if (fm.checkpoint_mode === undefined) {
    warn('STATE.md lacks warn-only session checkpoint telemetry');
  } else {
    if (fm.checkpoint_mode !== 'warn_only') err(`invalid checkpoint_mode \`${fm.checkpoint_mode}\``);
    if (!['unavailable', 'observed', 'estimated'].includes(String(fm.context_measurement))) {
      err(`invalid context_measurement \`${fm.context_measurement}\``);
    }
    const checkpointNumericFields = [
      'context_used_percent',
      'session_elapsed_minutes',
      'aird_cycles_since_user_choice',
      'workorders_completed_since_user_choice',
      'last_warning_elapsed_minutes',
      'last_warning_context_percent',
      'worker_minutes_without_focused_test',
    ];
    for (const field of checkpointNumericFields) {
      if (!Number.isInteger(fm[field]) || fm[field] < 0) err(`${field} must be a non-negative integer`);
    }
    if (fm.context_used_percent > 100 || fm.last_warning_context_percent > 100) {
      err('context percentages must be between 0 and 100');
    }
    if (typeof fm.checkpoint_warning_active !== 'boolean') {
      err('checkpoint_warning_active must be true or false');
    }
    if (!['none', 'continue_current', 'start_fresh'].includes(String(fm.checkpoint_recommendation))) {
      err(`invalid checkpoint_recommendation \`${fm.checkpoint_recommendation}\``);
    }
    if (!['not_requested', 'continue_current', 'start_fresh'].includes(String(fm.user_checkpoint_decision))) {
      err(`invalid user_checkpoint_decision \`${fm.user_checkpoint_decision}\``);
    }

    const checkpointReasons = [];
    if (['observed', 'estimated'].includes(fm.context_measurement) &&
        fm.context_used_percent >= 60 &&
        fm.context_used_percent - fm.last_warning_context_percent >= 10) {
      checkpointReasons.push(`context ${fm.context_used_percent}%`);
    }
    if (fm.session_elapsed_minutes >= 45 &&
        fm.session_elapsed_minutes - fm.last_warning_elapsed_minutes >= 30) {
      checkpointReasons.push(`session ${fm.session_elapsed_minutes} minutes`);
    }
    if (fm.aird_cycles_since_user_choice >= 2) {
      checkpointReasons.push(`${fm.aird_cycles_since_user_choice} AIRD cycles`);
    }
    if (fm.workorders_completed_since_user_choice >= 2) {
      checkpointReasons.push(`${fm.workorders_completed_since_user_choice} completed workorders`);
    }
    if (fm.worker_minutes_without_focused_test >= 30 && !fm.first_focused_test_at) {
      checkpointReasons.push(`${fm.worker_minutes_without_focused_test} worker minutes without focused test`);
    }
    if (checkpointReasons.length && fm.checkpoint_warning_active !== true) {
      advise(`checkpoint warning due: ${checkpointReasons.join(', ')}`);
    }
    if (fm.checkpoint_warning_active === true && fm.user_checkpoint_decision === 'not_requested') {
      advise('checkpoint warning awaits user choice: continue_current or start_fresh');
    }
  }
}

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

const workorders = workorderFiles.map((file) => {
  let text = '';
  try { text = readFileSync(join(workordersDir, file), 'utf8'); } catch { /* reported by later checks */ }
  const data = parseFrontmatter(text);
  const deliverySurface = [
    section(text, 'Identity'),
    section(text, 'Objective'),
    section(text, 'Task Breakdown'),
    section(text, 'Scope'),
    section(text, 'Contracts'),
  ].join('\n');
  return { file, text, data, deliverySurface };
});

const backendWorkorders = workorders.filter(({ data, deliverySurface }) => {
  const structuredBoundaries = asArray(data.runtime_boundaries);
  const structuredBackend = structuredBoundaries.some((boundary) =>
    /database|postgres|mysql|sqlite|api|http|grpc|queue|job|service|kubernetes|registry|scm/i.test(boundary)
  );
  return structuredBackend ||
    /backend-worker|\bbackend\b|\bserver\b|\bservice\b|\bapi\b|\bendpoint\b|\bhandler\b|\bdatabase\b|\bpostgres(?:ql)?\b|\bmysql\b|\bsqlite\b|\bmigration\b|\bschema\b|\bbackfill\b|\brepository\b|\bstore\b|\bqueue\b|\bconsumer\b|\bjob\b|\bdockerfile\b|\bcontainer\b|\bdeployment\b/i.test(deliverySurface);
});
const backendSurface = backendWorkorders.map(({ deliverySurface }) => deliverySurface).join('\n');
const migrationChange = /\bmigration\b|\bschema\b|\bbackfill\b|\bddl\b/i.test(backendSurface);
const apiChange = /\bapi\b|\bendpoint\b|\bhandler\b|\bhttp\b|\broute\b|\bgrpc\b|\bwebhook\b/i.test(backendSurface);
const artifactChange = /\bdockerfile\b|\bcontainer\b|\bimage\b|\bbinary\b|\bstartup\b|\bdeployment\b|\bdeployable\b|\bhealth\b|\breadiness\b/i.test(backendSurface);

if (stateV2) {
  const supportingWorkorders = workorders.filter(({ data }) =>
    data.work_class === 'supporting' && ['ready', 'in_progress', 'done'].includes(String(data.status))
  );
  const supportingWip = supportingWorkorders.filter(({ data }) => data.status === 'in_progress').length;
  const productStarted = workorders.some(({ data }) =>
    data.work_class === 'product' && ['in_progress', 'done'].includes(String(data.status))
  );
  if (supportingWorkorders.length > 1 && fm.user_approved_overrun !== true) {
    err('more than one supporting workorder requires user-approved detour overrun');
  }
  if (Number.isInteger(fm.supporting_wip) && fm.supporting_wip !== supportingWip) {
    err(`STATE supporting_wip=${fm.supporting_wip}, workorders=${supportingWip}`);
  }
  if (productStarted && fm.product_implementation_started !== true) {
    err('product workorders started but STATE product_implementation_started is false');
  }
}

// A prototype is a delivery contract, not optional inspiration. Deterministically
// require UI implementation and final browser/usability workorders to link it.
if (GATED.includes(status) && filesOnDisk.has('02-ui-prototype.md')) {
  let prototypeText = '';
  try { prototypeText = readFileSync(join(pkgDir, '02-ui-prototype.md'), 'utf8'); } catch { /* reported elsewhere */ }
  const declaredPaths = [...prototypeText.matchAll(/`([^`]+\.(?:html?|tsx?|jsx?|vue|svelte))`/gi)]
    .map((m) => m[1])
    .filter((p, i, all) => all.indexOf(p) === i);

  for (const { file, text, data } of workorders) {
    const identityAndObjective = `${section(text, 'Identity')}\n${section(text, 'Scope')}`;
    const uiImplementation = /frontend-worker|\bfrontend\b|\breact\b|\bui\b/i.test(identityAndObjective);
    const finalUiGate = /browser|usability/i.test(identityAndObjective);
    if (!uiImplementation && !finalUiGate) continue;

    const requiredReading = asArray(data.docs_to_read).join('\n');
    const mustHavesAndVerification = `${section(text, 'Must Haves')}\n${section(text, 'Verification')}`;
    if (!/02-ui-prototype\.md/i.test(requiredReading)) {
      err(`${file} is a UI/browser workorder but docs_to_read omits 02-ui-prototype.md`);
    }
    for (const declaredPath of declaredPaths) {
      if (!requiredReading.includes(declaredPath)) {
        err(`${file} is a UI/browser workorder but docs_to_read omits declared prototype artifact ${declaredPath}`);
      }
    }
    const namesParity = /prototype/i.test(mustHavesAndVerification)
      && /(section|hierarch|interaction|responsive|deviation|parity)/i.test(mustHavesAndVerification);
    if (!namesParity) {
      err(`${file} must name prototype sections/interactions/responsive composition or intentional deviations in Must Haves/Verification`);
    }
  }
}

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

// Check 4b: a release-ready user-facing change must carry real browser evidence.
// "User-facing" = discovery produced a 02-* UI artifact. This catches the common
// failure where the loop marks a UI change done without ever opening a browser.
if ((RELEASE_GATED.includes(status) || releaseReadiness === 'ready') && UI_BLOCK.some((f) => filesOnDisk.has(f))) {
  const evName = '10-ui-verification.md';
  if (!filesOnDisk.has(evName)) {
    err(`user-facing change claims release readiness but ${evName} (browser evidence) is missing`);
  } else {
    let txt = '';
    try { txt = readFileSync(join(pkgDir, evName), 'utf8'); } catch { /* ignore */ }
    const hasUrl = /https?:\/\/|localhost|127\.0\.0\.1|:\d{2,5}(\/|\b)/.test(txt);
    const hasResult = /\b(pass|fail)\b/i.test(txt);
    const blockedFallback = /blocked-no-evidence|preview.*unavailable|could not run|browser evidence still owed/i.test(txt);
    if (blockedFallback) {
      err(`${evName} records unavailable/deferred browser evidence; release readiness must remain blocked`);
    }
    if (!hasUrl) {
      err(`${evName} has no preview URL — browser verification looks unrun`);
    }
    if (!hasResult) {
      err(`${evName} has no pass/fail results — browser verification looks unrun`);
    }
  }
}

// Check 4c: release-ready backend delivery requires machine-checkable, zero-skip
// runtime evidence. Static review and exit code 0 cannot satisfy this contract.
if ((RELEASE_GATED.includes(status) || releaseReadiness === 'ready') && backendWorkorders.length) {
  const evName = '10-backend-verification.md';
  if (!filesOnDisk.has(evName)) {
    err(`backend change claims release readiness but ${evName} is missing`);
  } else {
    let text = '';
    try { text = readFileSync(join(pkgDir, evName), 'utf8'); } catch { /* reported through empty fields */ }
    const evidence = parseFrontmatter(text);
    const integer = (field) => /^\d+$/.test(evidence[field] ?? '') ? Number(evidence[field]) : Number.NaN;
    const required = integer('required_checks');
    const passed = integer('passed_checks');
    const failed = integer('failed_checks');
    const skipped = integer('skipped_checks');

    if (evidence.result !== 'pass') err(`${evName} result must be pass`);
    if (!Number.isInteger(required) || required <= 0) err(`${evName} required_checks must be a positive integer`);
    if (!Number.isInteger(passed) || passed !== required) err(`${evName} passed_checks must equal required_checks`);
    if (failed !== 0) err(`${evName} failed_checks must be 0`);
    if (skipped !== 0) err(`${evName} skipped_checks must be 0; required skipped checks block completion even when the runner exits 0`);

    const packageRoot = resolve(pkgDir);
    const requirePassAndEvidence = (resultField, evidenceField, label) => {
      if (evidence[resultField] !== 'pass') {
        err(`${evName} ${resultField} must be pass for ${label}`);
        return;
      }
      const pointer = evidence[evidenceField];
      if (!pointer || pointer === 'not_required') {
        err(`${evName} ${evidenceField} must point to ${label} evidence`);
        return;
      }
      const fullPath = resolve(pkgDir, pointer);
      const escapesPackage = relative(packageRoot, fullPath).startsWith('..');
      if (escapesPackage || !existsSync(fullPath)) {
        err(`${evName} ${evidenceField} does not resolve to an evidence file inside the AIRD package: ${pointer}`);
        return;
      }
      try {
        if (!statSync(fullPath).isFile() || statSync(fullPath).size === 0) {
          err(`${evName} ${evidenceField} points to empty/non-file evidence: ${pointer}`);
        }
      } catch {
        err(`${evName} cannot read ${evidenceField}: ${pointer}`);
      }
    };

    requirePassAndEvidence('runtime_integration', 'runtime_integration_evidence', 'production-equivalent runtime integration');
    requirePassAndEvidence('business_flow_smoke', 'business_flow_smoke_evidence', 'persisted business-flow smoke');
    if (migrationChange) requirePassAndEvidence('migration_upgrade', 'migration_upgrade_evidence', 'previous-release migration upgrade');
    if (apiChange) requirePassAndEvidence('api_smoke', 'api_smoke_evidence', 'live API contract smoke');
    if (artifactChange) requirePassAndEvidence('artifact_smoke', 'artifact_smoke_evidence', 'deployable artifact build/start/health smoke');
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
  backendWorkorders: backendWorkorders.map(({ file }) => file),
  backendRequirements: {
    runtimeIntegration: backendWorkorders.length > 0,
    businessFlowSmoke: backendWorkorders.length > 0,
    migrationUpgrade: migrationChange,
    apiSmoke: apiChange,
    artifactSmoke: artifactChange,
  },
  errors,
  warnings,
  advisories,
};

if (jsonOnly) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`AIRD validate: ${pkgDir}`);
  console.log(`  status: ${status ?? '(none)'} | artifacts tracked: ${rows.length} | workorders: ${workorderFiles.length}`);
  for (const e of errors) console.log(`  ERROR  ${e}`);
  for (const w of warnings) console.log(`  WARN   ${w}`);
  for (const advisory of advisories) console.log(`  WARN   ${advisory} (advisory)`);
  console.log(ok ? 'PASS' : 'FAIL');
}

process.exit(ok ? 0 : 1);
