#!/usr/bin/env node
// Deterministic AIRD package validation. Semantic review happens once in
// discovery; this script proves Git-base, reviewed-wave, typed routing, and
// delivery-evidence invariants without reinterpreting workorder prose.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  CONSUMES_KINDS,
  CONSUMES_PRODUCERS,
  EXECUTABLE_KINDS,
  NON_IMPLEMENTATION_KINDS,
  RUNTIME_PROFILES,
  SURFACES,
  WORKORDER_KINDS,
  WORKORDER_STATUSES,
  WORK_CLASSES,
  asList,
  collectIds,
  getWaveClosure,
  inspectDependencyGraph,
  inspectGitBase,
  loadReviewManifest,
  loadWorkorders,
  parseExistentialRisks,
  parseFrontmatter,
  parseGateDodMapping,
  parseStateBlockers,
  parseWaveOutcomes,
} from './aird-contract.mjs';

const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const strict = args.includes('--strict');
const packageArgument = args.find((argument) => !argument.startsWith('--'));

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
const GATED = new Set(['ready_for_delivery', 'in_delivery', 'implementation_complete', 'verifying', 'ready_for_release', 'complete']);
const DONE_STATES = new Set(['complete', 'done', 'ready', 'accepted']);
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
const BACKEND_RUNTIME_PROFILES = new Set(['service', 'database', 'migration', 'api', 'job', 'artifact', 'external']);

// Soft sizing proxies. The 1-3 atomic-task rule counts bullets, which any
// author satisfies by writing three sentences that each hide six edits. These
// measure the load the worker actually carries. They stay warnings on purpose:
// discovery runs --strict (so they bite there) while delivery keeps them
// advisory for an already accepted closure.
const NON_TEST_WRITE_PATH_LIMIT = 6;
const DOD_PER_WORKORDER_LIMIT = 3;
const NEGATIVE_CASE_LIMIT = 10;

// A probe that swapped a boundary for a double answers a different question
// than the one the gate asked. These markers are how that shows up in an
// honest evidence log.
const SUBSTITUTION_MARKERS = [
  /\b(mocked?|faked?|doubles?|stubbed?|simulated|synthetic|dry[-\s]?run|offline[-\s]?only)\b/i,
  /"[a-z_]*(live|real|production)[a-z_]*"\s*:\s*false\b/i,
  /\b[a-z_]*(live|real|production)[a-z_]*\s*[:=]\s*false\b/i,
];

function scanProbeForSubstitution(text) {
  for (const line of text.split(/\r?\n/)) {
    for (const marker of SUBSTITUTION_MARKERS) {
      const hit = line.match(marker);
      if (hit) return `${hit[0]} — "${line.trim().slice(0, 120)}"`;
    }
  }
  return null;
}

const truthy = (value) => /^(true|yes|approved)$/i.test(String(value ?? '').trim());

const errors = [];
const warnings = [];
const err = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

function fail(message) {
  const output = { ok: false, errors: [message], warnings: [] };
  if (jsonOnly) console.log(JSON.stringify(output));
  else console.error(`FAIL: ${message}`);
  process.exit(1);
}

function read(path) {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function profileLimit(profile) {
  return ({ lite: 5, standard: 12, deep: 25 })[profile];
}

if (!packageArgument) fail('no package directory given. Usage: node aird-validate.mjs <package-dir> [--json] [--strict]');
const packageDir = resolve(packageArgument);
if (!existsSync(packageDir) || !statSync(packageDir).isDirectory()) fail(`not a directory: ${packageDir}`);

const statePath = join(packageDir, 'STATE.md');
if (!existsSync(statePath)) fail(`STATE.md missing in ${packageDir}`);
const stateText = read(statePath);
const state = parseFrontmatter(stateText);
const status = state.status;
if (!Object.keys(state).length) warn('STATE.md has no YAML frontmatter block');
if (!status) err('STATE.md frontmatter has no `status`');
else if (!STATUS_ENUM.includes(status)) err(`invalid status \`${status}\` (allowed: ${STATUS_ENUM.join(', ')})`);

const filesOnDisk = new Set(readdirSync(packageDir).filter((file) => {
  try { return statSync(join(packageDir, file)).isFile(); } catch { return false; }
}));

const artifactRows = [];
for (const line of stateText.split(/\r?\n/)) {
  const match = line.match(/^\|\s*([0-9A-Za-z._-]+\.md)\s*\|\s*([A-Za-z_-]+)\s*\|(.*)\|/);
  if (match) artifactRows.push({ name: match[1].trim(), status: match[2].trim().toLowerCase() });
}
if (!artifactRows.length) warn('no Artifact Progress table rows parsed from STATE.md');
for (const row of artifactRows) {
  if (DONE_STATES.has(row.status) && !filesOnDisk.has(row.name)) {
    err(`STATE.md marks ${row.name} as "${row.status}" but the file is missing on disk`);
  }
}
const trackedArtifacts = new Set(artifactRows.map((row) => row.name));
for (const file of filesOnDisk) {
  if (/^\d\d-.+\.md$/.test(file) && !trackedArtifacts.has(file)) {
    warn(`file ${file} exists on disk but is not tracked in the Artifact Progress table`);
  }
}

const workorders = loadWorkorders(packageDir);
const manifest = loadReviewManifest(packageDir);
const v4Mode = Boolean(manifest) || workorders.some((workorder) => workorder.frontmatter.aird_workorder_schema_version === '4.0');
if (GATED.has(status)) {
  for (const required of BASELINE_REQUIRED) {
    if (!filesOnDisk.has(required)) err(`status is "${status}" but required artifact ${required} is missing`);
  }
  const userFacingArtifacts = UI_BLOCK.some((file) => filesOnDisk.has(file));
  if (userFacingArtifacts) {
    for (const file of UI_BLOCK) {
      if (!filesOnDisk.has(file)) err(`user-facing package has a 02-* artifact but ${file} is missing`);
    }
  }
  if (!workorders.length) err(`status is "${status}" but workorders/ has no *.md workorders`);
  if (!v4Mode) err('implementation readiness requires Workorder Frontmatter V4 and REVIEW-MANIFEST.json; normalize legacy structure without reopening accepted product decisions');
}

const acceptedFiles = new Set();
const waveResults = {};
let baseResult = null;
let baseValid = false;

if (manifest) {
  if (manifest.schema_version !== '1.0') err(`REVIEW-MANIFEST.json has unsupported schema_version: ${manifest.schema_version || '(missing)'}`);
  if (!manifest.base?.ref || !manifest.base?.sha) {
    err('REVIEW-MANIFEST.json is missing base ref/sha');
  } else {
    try {
      baseResult = inspectGitBase(packageDir, manifest.base.ref);
      if (baseResult.sha !== manifest.base.sha) {
        err(`target base ${manifest.base.ref} moved from reviewed ${manifest.base.sha.slice(0, 12)} to ${baseResult.sha.slice(0, 12)}; accepted waves require rebase and affected review`);
      } else if (baseResult.behind > 0 || baseResult.merge_base_sha !== baseResult.sha) {
        err(`branch is behind target base ${manifest.base.ref} by ${baseResult.behind} commit(s); implementation must not start`);
      } else {
        baseValid = true;
      }
    } catch (error) {
      err(`could not verify reviewed target base: ${error.message}`);
    }
  }

  const manifestWaves = manifest.waves && typeof manifest.waves === 'object' ? manifest.waves : {};
  for (const [wave, acceptance] of Object.entries(manifestWaves)) {
    const issues = [];
    let closure = [];
    if (acceptance?.status !== 'accepted') issues.push(`manifest status is ${acceptance?.status || '(missing)'}`);
    try {
      closure = getWaveClosure(workorders, wave);
    } catch (error) {
      issues.push(error.message);
    }
    if (closure.length > 12) issues.push(`dependency closure has ${closure.length} executable workorders; limit is 12`);

    const recorded = acceptance?.workorders && typeof acceptance.workorders === 'object'
      ? acceptance.workorders
      : {};
    const closureFiles = new Set(closure.map((workorder) => workorder.file));
    for (const workorder of closure) {
      acceptedFiles.add(workorder.file);
      const entry = recorded[workorder.file];
      if (!entry) issues.push(`${workorder.file} is absent from accepted hashes`);
      else if (entry.contract_sha256 !== workorder.contractSha256) issues.push(`${workorder.file} contract hash changed after semantic acceptance`);
      if (!['ready', 'in_progress', 'done'].includes(workorder.status)) {
        issues.push(`${workorder.id} status ${workorder.status || '(missing)'} is not executable`);
      }
    }
    for (const recordedFile of Object.keys(recorded)) {
      if (!closureFiles.has(recordedFile)) issues.push(`${recordedFile} is recorded but no longer belongs to the wave dependency closure`);
    }
    waveResults[wave] = {
      valid: issues.length === 0,
      workorders: closure.map((workorder) => workorder.id),
      issues,
    };
  }
}

const activeWave = state.active_wave && state.active_wave !== 'none' ? state.active_wave : null;
const validAcceptedWaves = Object.entries(waveResults).filter(([, result]) => result.valid).map(([wave]) => wave);
for (const [wave, result] of Object.entries(waveResults)) {
  if (result.valid) continue;
  const message = `accepted wave ${wave} is invalid: ${result.issues.join('; ')}`;
  if (wave === activeWave || validAcceptedWaves.length === 0) err(message);
  else warn(`${message}; other unchanged accepted waves remain eligible`);
}
if (GATED.has(status)) {
  if (!manifest) err('status claims implementation readiness but REVIEW-MANIFEST.json is missing');
  else if (!baseValid) err('no accepted wave is usable until target-base provenance is current');
  else if (!validAcceptedWaves.length) err('no hash-matching accepted implementation wave is ready');
  if (status === 'in_delivery' && !activeWave) err('status is in_delivery but STATE.md active_wave is none/missing');
  if (activeWave && !waveResults[activeWave]?.valid) err(`STATE.md active_wave ${activeWave} is not a valid accepted wave`);
}

function reportWorkorderIssue(workorder, message) {
  const full = `${workorder.file}: ${message}`;
  if (acceptedFiles.has(workorder.file)) err(full);
  else warn(full);
}

if (v4Mode) {
  const seenIds = new Map();
  const legacyBacklog = [];
  for (const workorder of workorders) {
    if (workorder.frontmatter.aird_workorder_schema_version !== '4.0') {
      if (acceptedFiles.has(workorder.file)) err(`${workorder.file}: accepted closure must use aird_workorder_schema_version 4.0`);
      else legacyBacklog.push(workorder.file);
      continue;
    }
    if (!workorder.frontmatter.id) reportWorkorderIssue(workorder, 'id is required');
    if (seenIds.has(workorder.id)) {
      const other = seenIds.get(workorder.id);
      const message = `duplicate id ${workorder.id} also used by ${other.file}`;
      if (acceptedFiles.has(workorder.file) || acceptedFiles.has(other.file)) err(message); else warn(message);
    } else {
      seenIds.set(workorder.id, workorder);
    }
    if (!WORKORDER_KINDS.has(workorder.kind)) reportWorkorderIssue(workorder, `invalid kind ${workorder.kind || '(missing)'}`);
    if (!WORKORDER_STATUSES.has(workorder.status)) reportWorkorderIssue(workorder, `invalid status ${workorder.status || '(missing)'}`);
    if (!SURFACES.has(workorder.surface)) reportWorkorderIssue(workorder, `invalid surface ${workorder.surface || '(missing)'}`);
    if (!workorder.runtimeProfiles.length || workorder.runtimeProfiles.some((profile) => !RUNTIME_PROFILES.has(profile))) {
      reportWorkorderIssue(workorder, `invalid runtime_profiles ${workorder.runtimeProfiles.join(', ') || '(missing)'}`);
    }
    if (!WORK_CLASSES.has(workorder.workClass)) {
      reportWorkorderIssue(workorder, `invalid work_class ${workorder.frontmatter.work_class || '(missing)'}`);
    }
    if (EXECUTABLE_KINDS.has(workorder.kind) && !/^W[1-9]\d*$/.test(workorder.wave)) {
      reportWorkorderIssue(workorder, `implementation/spike wave must be W1, W2, ...; got ${workorder.wave || '(missing)'}`);
    }
    if (NON_IMPLEMENTATION_KINDS.has(workorder.kind) && workorder.wave !== 'none') {
      reportWorkorderIssue(workorder, `${workorder.kind} work must use wave: none and cannot block implementation readiness`);
    }

    if (EXECUTABLE_KINDS.has(workorder.kind)) {
      // Sizing is a blocking rule in both loops; it must be machine-checked and
      // not left to a reviewer's judgement.
      if (workorder.taskCount < 1 || workorder.taskCount > 3) {
        reportWorkorderIssue(workorder, `Task Breakdown has ${workorder.taskCount} atomic task(s); expected 1-3`);
      }
      if (!workorder.allowedWritePaths.length) {
        reportWorkorderIssue(workorder, 'allowed_write_paths is empty; a worker needs an explicit write scope');
      }
      for (const writePath of workorder.allowedWritePaths) {
        if (['.', './', '/', '*', '**', '**/*', './*'].includes(writePath.trim())) {
          reportWorkorderIssue(workorder, `allowed_write_paths contains the unbounded scope ${writePath}`);
        }
      }
      if (!workorder.docsToRead.length) {
        reportWorkorderIssue(workorder, 'docs_to_read is empty; name the exact files/sections instead of the whole package');
      }
    }

    if (workorder.kind === 'spike') {
      for (const key of ['spike_question', 'on_pass', 'on_fail']) {
        if (!workorder.frontmatter[key] || !asList(workorder.frontmatter[key]).length) {
          reportWorkorderIssue(workorder, `spike is missing ${key}`);
        }
      }
      const onFail = String(workorder.frontmatter.on_fail ?? '');
      if (onFail && !/return_to_discovery|block|stop|escalate/i.test(onFail)) {
        reportWorkorderIssue(workorder, `spike on_fail must fail closed or return to discovery; got ${onFail}`);
      }
    }
  }

  for (const issue of inspectDependencyGraph(workorders)) {
    const workorder = workorders.find((item) => item.file === issue.file);
    if (workorder) reportWorkorderIssue(workorder, issue.message);
    else err(`${issue.file}: ${issue.message}`);
  }

  // Two workorders in the same wave run in parallel; overlapping write scopes
  // are a merge collision, so they must be sequenced or merged instead.
  const byWave = new Map();
  for (const workorder of workorders) {
    if (!EXECUTABLE_KINDS.has(workorder.kind) || workorder.status === 'deferred') continue;
    if (!/^W[1-9]\d*$/.test(workorder.wave)) continue;
    byWave.set(workorder.wave, [...(byWave.get(workorder.wave) ?? []), workorder]);
  }
  for (const [wave, waveWorkorders] of byWave) {
    for (let i = 0; i < waveWorkorders.length; i += 1) {
      for (let j = i + 1; j < waveWorkorders.length; j += 1) {
        const left = waveWorkorders[i];
        const right = waveWorkorders[j];
        if (left.dependsOn.includes(right.id) || right.dependsOn.includes(left.id)) continue;
        const shared = left.allowedWritePaths.filter((path) => right.allowedWritePaths.includes(path));
        if (shared.length) {
          reportWorkorderIssue(left, `wave ${wave} write-scope collision with ${right.id} on ${shared.join(', ')}; sequence them via depends_on or merge the slice`);
        }
      }
    }
  }

  // Product-first / detour budget. Before the first wave lands, supporting work
  // is capped at one workorder and 20 percent of the closure.
  const firstWave = [...byWave.keys()].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))[0];
  const firstWaveWorkorders = firstWave ? byWave.get(firstWave) : [];
  const supporting = firstWaveWorkorders.filter((workorder) => workorder.workClass === 'supporting');
  const detourApproved = /^(true|yes|approved)$/i.test(String(state.supporting_detour_approved ?? ''));
  if (firstWaveWorkorders.length && !detourApproved) {
    if (supporting.length > 1) {
      err(`wave ${firstWave} has ${supporting.length} supporting workorders; the product-first budget allows 1 without explicit user approval (STATE.md supporting_detour_approved)`);
    }
    if (supporting.length / firstWaveWorkorders.length > 0.2) {
      err(`wave ${firstWave} is ${Math.round((supporting.length / firstWaveWorkorders.length) * 100)}% supporting work; the product-first budget allows 20% without explicit user approval (STATE.md supporting_detour_approved)`);
    }
  }
  if (legacyBacklog.length) {
    warn(`${legacyBacklog.length} legacy backlog workorder(s) are not delivery-eligible; normalize only a selected dependency closure, not the whole backlog`);
  }

  const profile = state.discovery_profile;
  const limit = profileLimit(profile);
  const activeExecutable = workorders.filter((workorder) =>
    workorder.frontmatter.aird_workorder_schema_version === '4.0'
    && EXECUTABLE_KINDS.has(workorder.kind)
    && workorder.status !== 'deferred'
  );
  if (!limit) err('STATE.md discovery_profile must be lite, standard, or deep for a V4 package');
  else if (activeExecutable.length > limit) {
    err(`${profile} profile has ${activeExecutable.length} active implementation/spike workorders; limit is ${limit}`);
  }
}

// Existential probe gate. An unproven load-bearing assumption caps the package
// at one spike; a refuted one stops it. This is the check that prevents a
// structurally perfect package from being built on a contract nobody called.
const riskRegisterText = read(join(packageDir, '03-risk-register.md'));
const existentialRisks = parseExistentialRisks(riskRegisterText);
{
  const executable = workorders.filter(
    (workorder) => EXECUTABLE_KINDS.has(workorder.kind) && workorder.status !== 'deferred',
  );
  const packageRoot = resolve(packageDir);

  // Silence is not the same as "no existential risk". Force the question to be
  // answered once design has started; an empty list is a valid answer.
  if (v4Mode && executable.length && !/^existential_risks:\s*$/m.test(riskRegisterText)) {
    warn('03-risk-register.md declares no `existential_risks:` block; state it explicitly before designing (an empty list is a valid answer)');
  }

  for (const risk of existentialRisks) {
    const id = risk.id || '(unnamed)';
    if (!['unproven', 'proven', 'refuted'].includes(risk.status)) {
      err(`existential risk ${id} has invalid status "${risk.status ?? '(missing)'}" (unproven | proven | refuted)`);
      continue;
    }
    if (risk.status === 'refuted') {
      err(`existential risk ${id} is refuted; return to the discussion gate and pick another approach before designing on it`);
      continue;
    }
    if (risk.status === 'proven') {
      // The failure this whole gate exists for is not a missing probe -- it is
      // a claim quietly narrowed to whatever the probe managed to run, with the
      // load-bearing boundary replaced by a double. Both halves are checked
      // here: what the probe drove, and when the claim was fixed.
      const fakedBoundaries = asList(risk.faked_boundaries);
      const declaresFaked = Object.prototype.hasOwnProperty.call(risk, 'faked_boundaries');
      if (fakedBoundaries.length) {
        err(`existential risk ${id} is proven while declaring faked boundaries (${fakedBoundaries.join(', ')}); substituting a boundary answers a different question. Keep the risk unproven and cap the package at its spike, or probe the real boundary`);
      }
      if (!asList(risk.real_boundaries).length) {
        warn(`existential risk ${id} is proven but names no \`real_boundaries\`; state which boundaries the probe actually drove`);
      }
      if (!risk.claim_locked_at) {
        warn(`existential risk ${id} is proven but has no \`claim_locked_at\`; the claim must be fixed before the probe runs so it cannot be narrowed to fit the result`);
      }

      const pointer = risk.probe;
      if (!pointer) {
        err(`existential risk ${id} is proven but names no probe evidence file`);
        continue;
      }
      const fullPath = resolve(packageDir, pointer);
      if (relative(packageRoot, fullPath).startsWith('..') || !existsSync(fullPath)) {
        err(`existential risk ${id} probe evidence does not resolve inside the AIRD package: ${pointer}`);
      } else {
        try {
          const probeStat = statSync(fullPath);
          if (!probeStat.isFile() || probeStat.size === 0) {
            err(`existential risk ${id} probe evidence is empty/non-file: ${pointer}`);
          } else {
            const lockedAt = Date.parse(risk.claim_locked_at ?? '');
            if (Number.isFinite(lockedAt) && probeStat.mtimeMs < lockedAt) {
              err(`existential risk ${id} was locked at ${risk.claim_locked_at}, which is newer than its probe evidence ${pointer}; the claim was written after the result was known`);
            }
            // Silence about a substituted boundary is the loophole. Declaring
            // `faked_boundaries: []` is an explicit, auditable assertion that
            // nothing was substituted; omitting the field is not.
            if (!declaresFaked) {
              const hit = scanProbeForSubstitution(read(fullPath));
              if (hit) {
                err(`existential risk ${id} probe evidence reads like a substituted boundary (${hit}); declare \`faked_boundaries\` explicitly — use \`[]\` to assert on the record that nothing was substituted`);
              }
            }
          }
        } catch {
          err(`existential risk ${id} cannot read probe evidence: ${pointer}`);
        }
      }
    }
  }

  const unproven = existentialRisks.filter((risk) => risk.status === 'unproven');
  if (unproven.length) {
    const ids = unproven.map((risk) => risk.id || '(unnamed)').join(', ');
    const nonSpike = executable.filter((workorder) => workorder.kind !== 'spike');
    if (nonSpike.length) {
      err(`existential risk(s) ${ids} are unproven, so the package may contain only the spike that probes them; found ${nonSpike.length} implementation workorder(s): ${nonSpike.map((workorder) => workorder.id).join(', ')}`);
    }
    if (executable.length > 1) {
      err(`existential risk(s) ${ids} are unproven; exactly one spike workorder is allowed, found ${executable.length}`);
    }
  }
}

// A fail-closed spike and the workorders that depend on it must not share one
// accepted closure -- accepting them together is what lets ten dependents be
// designed and accepted against an answer nobody has yet.
for (const workorder of workorders) {
  if (workorder.kind !== 'spike') continue;
  const dependents = workorders.filter(
    (item) => EXECUTABLE_KINDS.has(item.kind)
      && item.status !== 'deferred'
      && item.dependsOn.includes(workorder.id)
      && item.wave === workorder.wave,
  );
  if (dependents.length) {
    const message = `${workorder.file}: spike ${workorder.id} shares wave ${workorder.wave} with ${dependents.length} dependent(s) (${dependents.map((item) => item.id).join(', ')}); a spike owns its wave alone so its answer lands before they are accepted`;
    if (acceptedFiles.has(workorder.file)) err(message);
    else warn(message);
  }
}

// Risk/gate/DoD wiring. A workorder may not cite an ID that no package document
// defines, and every DoD item must be protected by at least one mapped gate --
// this is what the discovery exit criterion "quality gates are mapped to the
// DoD" actually asserts.
{
  const policy = (message) => (GATED.has(status) ? err(message) : warn(message));
  const riskText = read(join(packageDir, '03-risk-register.md'));
  const gatesText = read(join(packageDir, '08-quality-gates.md'));
  const dodText = read(join(packageDir, '09-dod.md'));
  const knownRisks = new Set(collectIds(riskText, /R-\d+/g));
  const knownGates = new Set(collectIds(gatesText, /G-\d+/g));
  const knownDod = new Set(collectIds(dodText, /DOD-\d+/g));

  for (const workorder of workorders) {
    if (!EXECUTABLE_KINDS.has(workorder.kind)) continue;
    const report = acceptedFiles.has(workorder.file) ? err : policy;
    for (const riskId of workorder.riskIds) {
      if (riskText && !knownRisks.has(riskId)) report(`${workorder.file}: references unknown risk ${riskId}`);
    }
    for (const gateId of workorder.gateIds) {
      if (gatesText && !knownGates.has(gateId)) report(`${workorder.file}: references unknown gate ${gateId}`);
    }
    for (const dodId of workorder.dodIds) {
      if (dodText && !knownDod.has(dodId)) report(`${workorder.file}: references unknown DoD item ${dodId}`);
    }
  }

  if (gatesText && dodText && knownDod.size) {
    const mapping = parseGateDodMapping(gatesText);
    if (!mapping.size) {
      policy('08-quality-gates.md has no parseable `Gate -> DoD Mapping` table rows');
    } else {
      const coveredDod = new Set([...mapping.values()].flat());
      for (const dodId of knownDod) {
        if (!coveredDod.has(dodId)) policy(`${dodId} is not covered by any gate in the Gate -> DoD Mapping table`);
      }
      for (const gateId of mapping.keys()) {
        if (!knownGates.has(gateId)) policy(`Gate -> DoD Mapping references ${gateId}, which 08-quality-gates.md does not define`);
      }
    }
  }
}

// Prototype linkage is checked only for accepted frontend work. Later draft UI
// work never blocks an already accepted backend wave.
if (filesOnDisk.has('02-ui-prototype.md')) {
  const prototypeText = read(join(packageDir, '02-ui-prototype.md'));
  const declaredPaths = [...prototypeText.matchAll(/`([^`]+\.(?:html?|tsx?|jsx?|vue|svelte))`/gi)]
    .map((match) => match[1])
    .filter((path, index, all) => all.indexOf(path) === index);
  for (const workorder of workorders.filter((item) => acceptedFiles.has(item.file) && ['frontend', 'mixed'].includes(item.surface))) {
    const docsToRead = asList(workorder.frontmatter.docs_to_read);
    if (!docsToRead.some((entry) => entry.includes('02-ui-prototype.md'))) {
      err(`${workorder.file} is accepted frontend work but docs_to_read omits 02-ui-prototype.md`);
    }
    for (const declaredPath of declaredPaths) {
      if (!workorder.text.includes(declaredPath)) err(`${workorder.file} omits declared prototype artifact ${declaredPath}`);
    }
  }
}

// Consumed-input closure. The dependency graph proves ordering between
// workorders that exist; it says nothing about an input nobody produces -- a
// versioned artifact, seed dataset, config contract, or a file another
// workorder owns. That gap is invisible to every other check in this file, and
// it is what lets a wave be accepted with a hole in the middle of it.
{
  const byId = new Map(workorders.map((workorder) => [workorder.id, workorder]));
  for (const workorder of workorders) {
    if (!EXECUTABLE_KINDS.has(workorder.kind) || workorder.status === 'deferred') continue;
    if (workorder.consumes === null) {
      reportWorkorderIssue(workorder, 'has no `## Consumes` table; declare every input that does not exist in the repository yet and who produces it (an explicit `none` is a valid answer)');
      continue;
    }
    for (const row of workorder.consumes) {
      if (row.kind && !CONSUMES_KINDS.has(row.kind)) {
        reportWorkorderIssue(workorder, `Consumes "${row.input}" has invalid kind ${row.kind} (${[...CONSUMES_KINDS].join(', ')})`);
      }
      const producer = row.producedBy;
      if (!producer) {
        reportWorkorderIssue(workorder, `Consumes "${row.input}" names no producer`);
        continue;
      }
      if (CONSUMES_PRODUCERS.has(producer)) continue;
      const produced = byId.get(producer);
      if (!produced) {
        reportWorkorderIssue(workorder, `Consumes "${row.input}" is produced by ${producer}, which no workorder defines; add the producing workorder or mark it release-binding`);
        continue;
      }
      if (!EXECUTABLE_KINDS.has(produced.kind)) {
        reportWorkorderIssue(workorder, `Consumes "${row.input}" is produced by ${producer} (${produced.kind || 'untyped'}); an implementation input must come from implementation/spike work`);
        continue;
      }
      if (!workorder.dependsOn.includes(producer)) {
        reportWorkorderIssue(workorder, `Consumes "${row.input}" is produced by ${producer} but depends_on does not include it; a consumed input is a dependency, not a note`);
      }
    }
  }
}

// STATE.md blockers are contract data. A blocker that needs a user decision
// must stop readiness and go back through the discussion gate -- prose in a
// Blockers section blocks nothing.
{
  const blockersDeclared = Object.prototype.hasOwnProperty.call(state, 'blockers');
  if (!blockersDeclared) {
    const message = 'STATE.md frontmatter declares no `blockers:` list; state it explicitly (an empty list is a valid answer) so a blocker cannot hide in prose';
    if (GATED.has(status)) err(message); else warn(message);
  }
  for (const blocker of parseStateBlockers(stateText)) {
    const id = blocker.id || '(unnamed)';
    if (!blocker.statement) warn(`STATE.md blocker ${id} has no statement`);
    if (!blocker.owner) warn(`STATE.md blocker ${id} has no owner`);
    if (truthy(blocker.resolved)) continue;
    if (truthy(blocker.needs_user_decision)) {
      const message = `STATE.md blocker ${id} needs a user decision and is unresolved (${blocker.statement || 'no statement'}); take it through the discussion gate before claiming ${status}`;
      if (GATED.has(status)) err(message); else warn(message);
    }
    for (const blockedWave of asList(blocker.blocks)) {
      if (!blockedWave || blockedWave === 'none') continue;
      if (waveResults[blockedWave]?.valid) {
        err(`STATE.md blocker ${id} blocks ${blockedWave}, which is recorded as an accepted ready wave; resolve the blocker or withdraw the acceptance`);
      }
    }
  }
}

// Product-first, measured by outcome instead of by a self-declared work_class.
// A wave whose exit is only an internal API or tool surface is a platform
// slice; that can be the right call, but it is the user's call to make.
{
  const platformApproved = truthy(state.platform_slice_approved);
  const isProductPackage = String(state.package_class ?? 'product').trim() !== 'supporting';
  if (isProductPackage && !platformApproved && validAcceptedWaves.length) {
    const dodText = read(join(packageDir, '09-dod.md'));
    const prdText = read(join(packageDir, '01-prd.md'));
    const outcomes = new Map(parseWaveOutcomes(dodText).map((entry) => [entry.wave, entry]));
    for (const wave of validAcceptedWaves) {
      const outcome = outcomes.get(wave);
      if (!outcome?.user_observable_outcome || !outcome?.persona) {
        err(`accepted wave ${wave} declares no user-observable outcome in 09-dod.md \`wave_outcomes\` (needs user_observable_outcome + persona); a product package may not accept a platform-only wave without STATE.md platform_slice_approved: true`);
        continue;
      }
      if (prdText && !prdText.toLowerCase().includes(String(outcome.persona).toLowerCase())) {
        warn(`09-dod.md wave ${wave} names persona "${outcome.persona}", which 01-prd.md never mentions; an accepted wave must serve a persona the PRD defines`);
      }
    }
  }
}

// Cross-document ID integrity. The wiring check above reads workorder
// frontmatter only, so a dangling R-05 in the PRD survives every other gate.
{
  const policy = (message) => (GATED.has(status) ? err(message) : warn(message));
  const definitions = [
    { pattern: /R-\d+/g, definedIn: '03-risk-register.md', label: 'risk' },
    { pattern: /G-\d+/g, definedIn: '08-quality-gates.md', label: 'gate' },
    { pattern: /DOD-\d+/g, definedIn: '09-dod.md', label: 'DoD item' },
  ];
  for (const definition of definitions) {
    const definingText = read(join(packageDir, definition.definedIn));
    if (!definingText) continue;
    const known = new Set(collectIds(definingText, definition.pattern));
    for (const file of filesOnDisk) {
      if (!file.endsWith('.md') || file === definition.definedIn) continue;
      for (const id of collectIds(read(join(packageDir, file)), definition.pattern)) {
        if (!known.has(id)) policy(`${file} references unknown ${definition.label} ${id}; ${definition.definedIn} does not define it`);
      }
    }
  }
}

// Non-functional targets are a load-bearing decision for a deep package, and
// the one most often left out entirely -- then cited later as "the PRD budget".
if (state.discovery_profile === 'deep') {
  const nonFunctional = /non-?functional|latency budget|performance budget|scale target|throughput budget|cost model|cost budget/i;
  const covered = ['01-prd.md', '04-trd.md'].some((file) => nonFunctional.test(read(join(packageDir, file))));
  if (!covered) {
    const message = 'deep profile states no non-functional targets (scale, latency/performance budget, cost) in 01-prd.md or 04-trd.md; state them or record explicitly why they do not apply';
    if (GATED.has(status)) err(message); else warn(message);
  }
}

// UX work accepted for a wave nobody has decomposed goes stale before delivery
// reaches it. Keep it `reviewing` until a workorder can consume it.
{
  const prototypeRow = artifactRows.find((row) => row.name === '02-ui-prototype.md');
  if (prototypeRow && DONE_STATES.has(prototypeRow.status)) {
    const hasConsumer = workorders.some((workorder) =>
      EXECUTABLE_KINDS.has(workorder.kind)
      && workorder.status !== 'deferred'
      && ['frontend', 'mixed'].includes(workorder.surface));
    if (!hasConsumer) {
      const message = '02-ui-prototype.md is marked accepted but no frontend/mixed workorder can consume it; keep it `reviewing` until its wave is decomposed';
      if (GATED.has(status)) err(message); else warn(message);
    }
  }
}

// Soft sizing proxies -- see the limit constants above for why these exist and
// why they stay warnings.
for (const workorder of workorders) {
  if (!EXECUTABLE_KINDS.has(workorder.kind) || workorder.status === 'deferred') continue;
  if (workorder.oversizeJustification) continue;
  if (workorder.nonTestWritePaths.length > NON_TEST_WRITE_PATH_LIMIT) {
    warn(`${workorder.file}: ${workorder.nonTestWritePaths.length} non-test write paths (soft limit ${NON_TEST_WRITE_PATH_LIMIT}); split at a real seam or record \`oversize_justification\``);
  }
  if (workorder.dodIds.length > DOD_PER_WORKORDER_LIMIT) {
    warn(`${workorder.file}: carries ${workorder.dodIds.length} DoD items (soft limit ${DOD_PER_WORKORDER_LIMIT}); one slice should not own that much of the Definition of Done`);
  }
  if (workorder.negativeCaseCount > NEGATIVE_CASE_LIMIT) {
    warn(`${workorder.file}: lists ${workorder.negativeCaseCount} negative cases (soft limit ${NEGATIVE_CASE_LIMIT}); that is several slices wearing one workorder`);
  }
}

const completedWorkorders = workorders.filter((workorder) => workorder.status === 'done' && acceptedFiles.has(workorder.file));
const frontendCompleted = completedWorkorders.some((workorder) =>
  ['frontend', 'mixed'].includes(workorder.surface) && workorder.runtimeProfiles.includes('browser')
);
const backendRuntimeWorkorders = completedWorkorders.filter((workorder) =>
  ['backend', 'data', 'infra', 'mixed'].includes(workorder.surface)
  && workorder.runtimeProfiles.some((profile) => BACKEND_RUNTIME_PROFILES.has(profile))
);
const backendProfiles = new Set(backendRuntimeWorkorders.flatMap((workorder) => workorder.runtimeProfiles));

if (status === 'complete' && frontendCompleted) {
  const evidenceName = '10-ui-verification.md';
  if (!filesOnDisk.has(evidenceName)) {
    err(`user-facing change is complete but ${evidenceName} is missing`);
  } else {
    const evidenceText = read(join(packageDir, evidenceName));
    const evidence = parseFrontmatter(evidenceText);
    const integer = (field) => /^\d+$/.test(evidence[field] ?? '') ? Number(evidence[field]) : Number.NaN;
    const required = integer('required_states');
    const passed = integer('passed_states');
    const failed = integer('failed_states');
    const skipped = integer('skipped_states');
    if (evidence.result !== 'pass') err(`${evidenceName} result must be pass`);
    // Deferred-evidence detection reads declared verdicts only. Scanning the
    // whole prose punished honest write-ups ("the dev server could not run at
    // first, fixed by ..."), which pushed authors to delete the history.
    if (evidence.blocked_reason && evidence.blocked_reason !== 'none') {
      err(`${evidenceName} declares blocked_reason "${evidence.blocked_reason}"; status cannot be complete`);
    }
    const blockedRows = evidenceText
      .split(/\r?\n/)
      .filter((line) => /^\s*\|/.test(line) && /\|\s*blocked-no-evidence\s*\|/i.test(line));
    if (blockedRows.length) {
      err(`${evidenceName} has ${blockedRows.length} state row(s) recorded as blocked-no-evidence; status cannot be complete`);
    }
    if (!/^https?:\/\/\S+$/i.test(evidence.preview_url ?? '')) err(`${evidenceName} preview_url must be an HTTP(S) URL`);
    if (!['verify-on-browser', 'playwright'].includes(evidence.browser_tool)) {
      err(`${evidenceName} browser_tool must be verify-on-browser or playwright`);
    }
    if (!Number.isInteger(required) || required <= 0) err(`${evidenceName} required_states must be a positive integer`);
    if (!Number.isInteger(passed) || passed !== required) err(`${evidenceName} passed_states must equal required_states`);
    if (failed !== 0) err(`${evidenceName} failed_states must be 0`);
    if (skipped !== 0) err(`${evidenceName} skipped_states must be 0`);
    if (evidence.usability_result !== 'pass') err(`${evidenceName} usability_result must be pass`);

    const screenshotPaths = [...new Set(asList(evidence.screenshot_paths))];
    if (Number.isInteger(required) && screenshotPaths.length < required) {
      err(`${evidenceName} screenshot_paths must contain at least one screenshot per required state`);
    }
    const packageRoot = resolve(packageDir);
    for (const pointer of screenshotPaths) {
      const fullPath = resolve(packageDir, pointer);
      if (!/\.(png|jpe?g|webp)$/i.test(pointer)) {
        err(`${evidenceName} screenshot path must be png, jpg, jpeg, or webp: ${pointer}`);
      } else if (relative(packageRoot, fullPath).startsWith('..') || !existsSync(fullPath)) {
        err(`${evidenceName} screenshot does not resolve inside the AIRD package: ${pointer}`);
      } else {
        try {
          if (!statSync(fullPath).isFile() || statSync(fullPath).size === 0) err(`${evidenceName} screenshot is empty/non-file: ${pointer}`);
        } catch {
          err(`${evidenceName} cannot read screenshot: ${pointer}`);
        }
      }
    }
  }
}

if (status === 'complete' && backendRuntimeWorkorders.length) {
  const evidenceName = '10-backend-verification.md';
  if (!filesOnDisk.has(evidenceName)) {
    err(`typed backend runtime change is complete but ${evidenceName} is missing`);
  } else {
    const evidence = parseFrontmatter(read(join(packageDir, evidenceName)));
    const integer = (field) => /^\d+$/.test(evidence[field] ?? '') ? Number(evidence[field]) : Number.NaN;
    const required = integer('required_checks');
    const passed = integer('passed_checks');
    const failed = integer('failed_checks');
    const skipped = integer('skipped_checks');
    if (evidence.result !== 'pass') err(`${evidenceName} result must be pass`);
    if (evidence.blocked_reason && evidence.blocked_reason !== 'none') {
      err(`${evidenceName} declares blocked_reason "${evidence.blocked_reason}"; status cannot be complete`);
    }
    if (!Number.isInteger(required) || required <= 0) err(`${evidenceName} required_checks must be a positive integer`);
    if (!Number.isInteger(passed) || passed !== required) err(`${evidenceName} passed_checks must equal required_checks`);
    if (failed !== 0) err(`${evidenceName} failed_checks must be 0`);
    if (skipped !== 0) err(`${evidenceName} skipped_checks must be 0; required skipped checks block completion`);

    const packageRoot = resolve(packageDir);
    const requireEvidence = (resultField, evidenceField, label) => {
      if (evidence[resultField] !== 'pass') {
        err(`${evidenceName} ${resultField} must be pass for ${label}`);
        return;
      }
      const pointer = evidence[evidenceField];
      if (!pointer || pointer === 'not_required') {
        err(`${evidenceName} ${evidenceField} must point to ${label} evidence`);
        return;
      }
      const fullPath = resolve(packageDir, pointer);
      if (relative(packageRoot, fullPath).startsWith('..') || !existsSync(fullPath)) {
        err(`${evidenceName} ${evidenceField} does not resolve to an evidence file inside the AIRD package: ${pointer}`);
        return;
      }
      try {
        if (!statSync(fullPath).isFile() || statSync(fullPath).size === 0) err(`${evidenceName} ${evidenceField} points to empty/non-file evidence: ${pointer}`);
      } catch {
        err(`${evidenceName} cannot read ${evidenceField}: ${pointer}`);
      }
    };

    requireEvidence('runtime_integration', 'runtime_integration_evidence', 'production-equivalent runtime integration');
    requireEvidence('business_flow_smoke', 'business_flow_smoke_evidence', 'persisted business-flow smoke');
    if (backendProfiles.has('migration')) requireEvidence('migration_upgrade', 'migration_upgrade_evidence', 'previous-release migration upgrade');
    if (backendProfiles.has('api') || backendProfiles.has('job')) requireEvidence('api_smoke', 'api_smoke_evidence', 'live public-boundary contract smoke');
    if (backendProfiles.has('artifact')) requireEvidence('artifact_smoke', 'artifact_smoke_evidence', 'deployable artifact build/start/health smoke');
  }
}

if (state.aird_state_version !== '4.0' && state.workorders_total !== undefined && Number(state.workorders_total) !== workorders.length) {
  warn(`workorders_total=${state.workorders_total} but workorders/ has ${workorders.length} file(s)`);
}
if (status === 'complete') {
  const blockers = stateText.match(/##\s*Blockers([\s\S]*?)(\n##\s|\n*$)/i)?.[1]?.toLowerCase() || '';
  if (/- .*(block|todo|pending|unresolved|open)/.test(blockers) && !/none\.?/.test(blockers)) {
    warn('status is complete but the Blockers section still lists open items');
  }
}

const ok = errors.length === 0 && (!strict || warnings.length === 0);
const result = {
  ok,
  package: packageDir,
  status: status ?? null,
  contract: v4Mode ? 'v4' : 'legacy',
  base: manifest ? {
    ref: manifest.base?.ref ?? null,
    reviewedSha: manifest.base?.sha ?? null,
    currentSha: baseResult?.sha ?? null,
    behind: baseResult?.behind ?? null,
    valid: baseValid,
  } : null,
  waves: waveResults,
  readyWaves: baseValid ? validAcceptedWaves : [],
  artifactsTracked: artifactRows.length,
  workorders: workorders.length,
  implementationWorkorders: workorders.filter((workorder) => EXECUTABLE_KINDS.has(workorder.kind)).length,
  nonImplementationWorkorders: workorders.filter((workorder) => NON_IMPLEMENTATION_KINDS.has(workorder.kind)).length,
  backendRuntimeWorkorders: backendRuntimeWorkorders.map((workorder) => workorder.file),
  backendRequirements: {
    runtimeIntegration: backendRuntimeWorkorders.length > 0,
    businessFlowSmoke: backendRuntimeWorkorders.length > 0,
    migrationUpgrade: backendProfiles.has('migration'),
    apiSmoke: backendProfiles.has('api') || backendProfiles.has('job'),
    artifactSmoke: backendProfiles.has('artifact'),
  },
  errors,
  warnings,
};

if (jsonOnly) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`AIRD validate: ${packageDir}`);
  console.log(`  status: ${status ?? '(none)'} | contract: ${result.contract} | workorders: ${workorders.length}`);
  if (manifest) console.log(`  base: ${manifest.base?.ref || '(missing)'} | ready waves: ${result.readyWaves.join(', ') || '(none)'}`);
  for (const message of errors) console.log(`  ERROR  ${message}`);
  for (const message of warnings) console.log(`  WARN   ${message}`);
  console.log(ok ? 'PASS' : 'FAIL');
}

process.exit(ok ? 0 : 1);
