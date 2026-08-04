#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptWave } from './aird-contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const validator = join(here, 'aird-validate.mjs');
const root = mkdtempSync(join(tmpdir(), 'aird-validate-test-'));

const baseline = [
  '00-intake.md',
  '00-discussion-log.md',
  '01-prd.md',
  '03-risk-register.md',
  '04-trd.md',
  '07-implementation-plan.md',
  '08-quality-gates.md',
  '09-dod.md',
];

// Baseline docs carry the minimum contract the new gates require: a PRD that
// names a persona, and a DoD that says who observes what per wave.
const baselineContent = {
  '01-prd.md': `# PRD

| Persona | Job to be done |
|---|---|
| Operator | Sees the new result in the product |
`,
  '09-dod.md': `---
wave_outcomes:
  - wave: W1
    user_observable_outcome: The operator sees the new result in the product.
    persona: Operator
  - wave: W2
    user_observable_outcome: The operator can filter the new result.
    persona: Operator
---

# Definition of Done
`,
};

function git(repo, ...args) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function stateText({
  status = 'discovery',
  activeWave = 'none',
  profile = 'standard',
  packageClass = 'product',
  blockers = '[]',
  extraFrontmatter = '',
} = {}) {
  return `---
aird_state_version: '4.0'
discovery_profile: ${profile}
package_class: ${packageClass}
status: ${status}
active_wave: ${activeWave}
blockers: ${blockers}
${extraFrontmatter}---

## Blockers

- None.
`;
}

function workorderText({
  id,
  kind = 'implementation',
  status = 'ready',
  wave = 'W1',
  surface = 'backend',
  workClass = 'product',
  runtimeProfiles = ['unit'],
  dependsOn = [],
  riskIds = [],
  gateIds = [],
  dodIds = [],
  writePaths = null,
  docsToRead = ['04-trd.md#Target'],
  tasks = 1,
  extraFrontmatter = '',
  body = 'Implement one coherent behavior.',
  consumes = null,
  negativeCases = null,
} = {}) {
  const taskLines = Array.from({ length: tasks }, (_, index) => `${index + 1}. ${body} (${index + 1})`).join('\n');
  const consumesSection = consumes === null
    ? 'None.'
    : `| Input | Kind | Produced by |\n|---|---|---|\n${consumes.map((row) => `| ${row.input} | ${row.kind} | ${row.producedBy} |`).join('\n')}`;
  const verificationSection = negativeCases === null
    ? ''
    : `\n## Verification\n\n- Negative/edge cases: ${negativeCases.join(', ')}\n`;
  return `---
aird_workorder_schema_version: '4.0'
id: ${id}
kind: ${kind}
status: ${status}
wave: ${wave}
surface: ${surface}
work_class: ${workClass}
runtime_profiles: [${runtimeProfiles.join(', ')}]
depends_on: [${dependsOn.join(', ')}]
risk_ids: [${riskIds.join(', ')}]
gate_ids: [${gateIds.join(', ')}]
dod_ids: [${dodIds.join(', ')}]
allowed_write_paths: [${(writePaths ?? [`src/${id}.txt`]).join(', ')}]
docs_to_read: [${docsToRead.join(', ')}]
${extraFrontmatter}---

# Workorder

## Consumes

${consumesSection}

## Task Breakdown

${taskLines}

## Must Haves

- Observable behavior exists and is tested.
${verificationSection}`;
}

function makeRepository(name, workorders, options = {}) {
  const repo = join(root, name);
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'AIRD Test');
  git(repo, 'config', 'user.email', 'aird-test@example.invalid');
  writeFileSync(join(repo, 'base.txt'), 'base\n');
  git(repo, 'add', 'base.txt');
  git(repo, 'commit', '-m', 'base');
  git(repo, 'checkout', '-b', 'aird/test');

  const packageDir = join(repo, '.agent', 'aird', 'feature');
  mkdirSync(join(packageDir, 'workorders'), { recursive: true });
  mkdirSync(join(packageDir, 'evidence'), { recursive: true });
  writeFileSync(join(packageDir, 'STATE.md'), stateText(options));
  for (const file of baseline) writeFileSync(join(packageDir, file), baselineContent[file] ?? `# ${file}\n`);
  for (const workorder of workorders) {
    writeFileSync(join(packageDir, 'workorders', `${workorder.id}.md`), workorderText(workorder));
  }
  return { repo, packageDir };
}

function setState(packageDir, options) {
  writeFileSync(join(packageDir, 'STATE.md'), stateText(options));
}

function advanceMain(repo) {
  git(repo, 'checkout', 'main');
  writeFileSync(join(repo, 'base.txt'), `${readFileSync(join(repo, 'base.txt'), 'utf8')}advanced\n`);
  git(repo, 'add', 'base.txt');
  git(repo, 'commit', '-m', 'advance base');
  git(repo, 'checkout', 'aird/test');
}

function run(packageDir, extraArgs = []) {
  const result = spawnSync(process.execPath, [validator, packageDir, '--json', ...extraArgs], { encoding: 'utf8' });
  let parsed = null;
  try { parsed = JSON.parse(result.stdout); } catch { /* asserted below */ }
  return { code: result.status, parsed, stdout: result.stdout, stderr: result.stderr };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertResult(name, result, expectedCode, expectedText = null) {
  assert(result.code === expectedCode, `${name}: exit ${result.code}, expected ${expectedCode}\n${result.stdout}\n${result.stderr}`);
  assert(result.parsed, `${name}: validator did not return JSON\n${result.stdout}\n${result.stderr}`);
  if (expectedText) {
    const messages = [...result.parsed.errors, ...result.parsed.warnings];
    assert(messages.some((message) => message.includes(expectedText)), `${name}: missing ${JSON.stringify(expectedText)}\n${result.stdout}`);
  }
}

const validBackendEvidence = `---
result: pass
required_checks: 5
passed_checks: 5
failed_checks: 0
skipped_checks: 0
runtime_integration: pass
runtime_integration_evidence: evidence/runtime.log
business_flow_smoke: pass
business_flow_smoke_evidence: evidence/flow.log
migration_upgrade: pass
migration_upgrade_evidence: evidence/upgrade.log
api_smoke: pass
api_smoke_evidence: evidence/api.log
artifact_smoke: pass
artifact_smoke_evidence: evidence/artifact.log
---
`;

function addBackendEvidence(packageDir, evidence = validBackendEvidence) {
  writeFileSync(join(packageDir, '10-backend-verification.md'), evidence);
  for (const file of ['runtime.log', 'flow.log', 'upgrade.log', 'api.log', 'artifact.log']) {
    writeFileSync(join(packageDir, 'evidence', file), `PASS ${file}\n`);
  }
}

const validUIEvidence = `---
result: pass
preview_url: http://localhost:3000
browser_tool: playwright
required_states: 1
passed_states: 1
failed_states: 0
skipped_states: 0
usability_result: pass
screenshot_paths:
  - evidence/ui-happy.png
---

# UI Verification

| State | Result | Screenshot |
|---|---|---|
| Happy | pass | evidence/ui-happy.png |
`;

function addUIEvidence(packageDir, evidence = validUIEvidence) {
  writeFileSync(join(packageDir, '10-ui-verification.md'), evidence);
  writeFileSync(join(packageDir, 'evidence', 'ui-happy.png'), 'non-empty screenshot fixture\n');
}

try {
  {
    const { packageDir } = makeRepository('draft-later-wave', [
      { id: 'WO-01', wave: 'W1' },
      { id: 'WO-02', wave: 'W2', status: 'draft' },
    ]);
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    setState(packageDir, { status: 'ready_for_delivery' });
    const result = run(packageDir);
    assertResult('accepted W1 ignores draft W2', result, 0);
    assert(result.parsed.readyWaves.includes('W1'), 'accepted W1 was not reported ready');
  }

  {
    const { repo, packageDir } = makeRepository('stale-base-validation', [{ id: 'WO-01' }]);
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    setState(packageDir, { status: 'ready_for_delivery' });
    advanceMain(repo);
    assertResult('moved target base blocks delivery', run(packageDir), 1, 'target base main moved');
  }

  {
    const { repo, packageDir } = makeRepository('stale-base-acceptance', [{ id: 'WO-01' }]);
    advanceMain(repo);
    let message = '';
    try { acceptWave(packageDir, { wave: 'W1', baseRef: 'main' }); } catch (error) { message = error.message; }
    assert(message.includes('behind target base'), `stale accept-wave did not fail correctly: ${message}`);
  }

  {
    const { packageDir } = makeRepository('wave-local-hash', [
      { id: 'WO-01', wave: 'W1' },
      { id: 'WO-02', wave: 'W2' },
    ]);
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    acceptWave(packageDir, { wave: 'W2', baseRef: 'main' });
    setState(packageDir, { status: 'ready_for_delivery' });
    const path = join(packageDir, 'workorders', 'WO-01.md');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\nChanged after review.\n`);
    const result = run(packageDir);
    assertResult('one changed wave leaves independent wave ready', result, 0, 'contract hash changed after semantic acceptance');
    assert(result.parsed.readyWaves.includes('W2') && !result.parsed.readyWaves.includes('W1'), `unexpected ready waves: ${result.parsed.readyWaves}`);
  }

  {
    const { packageDir } = makeRepository('lifecycle-status-does-not-invalidate', [{ id: 'WO-01', wave: 'W1' }]);
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    const path = join(packageDir, 'workorders', 'WO-01.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace('status: ready', 'status: done'));
    setState(packageDir, { status: 'implementation_complete', activeWave: 'W1' });
    const result = run(packageDir);
    assertResult('lifecycle status change preserves acceptance', result, 0);
    assert(result.parsed.readyWaves.includes('W1'), 'status-only transition invalidated W1');
  }

  {
    const { packageDir } = makeRepository('evidence-nonblocking', [
      { id: 'WO-01', wave: 'W1' },
      { id: 'EV-01', kind: 'evidence', wave: 'none', status: 'draft', surface: 'tooling', runtimeProfiles: ['none'] },
    ]);
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    setState(packageDir, { status: 'ready_for_delivery' });
    assertResult('evidence work does not block W1', run(packageDir), 0);
  }

  {
    const { packageDir } = makeRepository('evidence-dependency', [
      { id: 'EV-01', kind: 'evidence', wave: 'none', surface: 'tooling', runtimeProfiles: ['none'] },
      { id: 'WO-01', wave: 'W1', dependsOn: ['EV-01'] },
    ]);
    let message = '';
    try { acceptWave(packageDir, { wave: 'W1', baseRef: 'main' }); } catch (error) { message = error.message; }
    assert(message.includes('depends on non-implementation'), `evidence dependency was not rejected: ${message}`);
  }

  {
    const { packageDir } = makeRepository('typed-frontend', [{
      id: 'WO-01',
      status: 'done',
      surface: 'frontend',
      runtimeProfiles: ['browser'],
      body: 'Render API results without changing any backend runtime.',
    }]);
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    setState(packageDir, { status: 'complete' });
    addUIEvidence(packageDir);
    const result = run(packageDir);
    assertResult('frontend prose does not trigger backend gates', result, 0);
    assert(result.parsed.backendRuntimeWorkorders.length === 0, `frontend was misclassified as backend: ${result.stdout}`);
  }

  {
    const { packageDir } = makeRepository('frontend-missing-screenshot', [{
      id: 'WO-01', status: 'done', surface: 'frontend', runtimeProfiles: ['browser'],
    }]);
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    setState(packageDir, { status: 'complete' });
    addUIEvidence(packageDir, validUIEvidence.replace('screenshot_paths:\n  - evidence/ui-happy.png', 'screenshot_paths: []'));
    assertResult('frontend screenshot evidence is fail-closed', run(packageDir), 1, 'screenshot_paths must contain');
  }

  {
    const { packageDir } = makeRepository('backend-ui-docs-do-not-route-browser', [{
      id: 'WO-01', status: 'done', surface: 'backend', runtimeProfiles: ['unit'],
    }]);
    for (const file of ['02-ux-problem-framing.md', '02-ui-spec.md', '02-ui-prototype.md']) {
      writeFileSync(join(packageDir, file), `# ${file}\n`);
    }
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    setState(packageDir, { status: 'complete' });
    assertResult('backend-only wave ignores unrelated UI docs at completion', run(packageDir), 0);
  }

  {
    const { packageDir } = makeRepository('missing-backend-evidence', [{
      id: 'WO-01', status: 'done', surface: 'backend', runtimeProfiles: ['database', 'migration', 'api', 'artifact'],
    }]);
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    setState(packageDir, { status: 'complete' });
    assertResult('typed backend requires evidence', run(packageDir), 1, '10-backend-verification.md is missing');
  }

  {
    const { packageDir } = makeRepository('skipped-backend-check', [{
      id: 'WO-01', status: 'done', surface: 'backend', runtimeProfiles: ['database', 'migration', 'api', 'artifact'],
    }]);
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    setState(packageDir, { status: 'complete' });
    addBackendEvidence(packageDir, validBackendEvidence.replace('passed_checks: 5', 'passed_checks: 4').replace('skipped_checks: 0', 'skipped_checks: 1'));
    assertResult('required backend skip blocks completion', run(packageDir), 1, 'skipped_checks must be 0');
  }

  {
    const { packageDir } = makeRepository('valid-backend', [{
      id: 'WO-01', status: 'done', surface: 'backend', runtimeProfiles: ['database', 'migration', 'api', 'artifact'],
    }]);
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    setState(packageDir, { status: 'complete' });
    addBackendEvidence(packageDir);
    assertResult('complete typed backend evidence passes', run(packageDir), 0);
  }

  {
    const { packageDir } = makeRepository('budget-limit', Array.from({ length: 6 }, (_, index) => ({
      id: `WO-${String(index + 1).padStart(2, '0')}`,
      wave: 'W1',
    })), { profile: 'lite' });
    let message = '';
    try { acceptWave(packageDir, { wave: 'W1', baseRef: 'main' }); } catch (error) { message = error.message; }
    assert(message.includes('limit is 5'), `lite budget was not enforced: ${message}`);
  }

  {
    const { packageDir } = makeRepository('progressive-legacy-normalization', [{ id: 'WO-01', wave: 'W1' }]);
    for (let index = 0; index < 30; index += 1) {
      writeFileSync(join(packageDir, 'workorders', `LEGACY-${index}.md`), `---
aird_workorder_schema_version: '3.0'
id: LEGACY-${index}
kind: implementation
status: ready
depends_on: []
---

# Legacy backlog
`);
    }
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    setState(packageDir, { status: 'ready_for_delivery' });
    const result = run(packageDir);
    assertResult('selected V4 wave ignores legacy backlog', result, 0, 'legacy backlog workorder(s)');
    assert(result.parsed.readyWaves.includes('W1'), 'normalized W1 was not ready with legacy backlog present');
  }

  {
    const repo = join(root, 'legacy-paused');
    mkdirSync(join(repo, 'workorders'), { recursive: true });
    writeFileSync(join(repo, 'STATE.md'), '---\nstatus: paused\n---\n\n## Blockers\n\n- waiting\n');
    writeFileSync(join(repo, 'workorders', 'legacy.md'), '# Legacy workorder\n');
    assertResult('paused legacy package remains inspectable', run(repo), 0);
  }

  // --- ported V3-lint coverage, now enforced on V4 packages ---

  {
    const { packageDir } = makeRepository('sizing-tasks', [{ id: 'WO-01', tasks: 4 }]);
    assertResult('oversized Task Breakdown is reported', run(packageDir), 0, 'Task Breakdown has 4 atomic task(s)');
    assertResult('oversized Task Breakdown fails under --strict', run(packageDir, ['--strict']), 1);
  }

  {
    const { packageDir } = makeRepository('unbounded-writes', [{ id: 'WO-01', writePaths: ['.'] }]);
    assertResult('unbounded write scope is reported', run(packageDir), 0, 'unbounded scope');
  }

  {
    const { packageDir } = makeRepository('missing-dependency', [
      { id: 'WO-01', dependsOn: ['WO-99'] },
    ]);
    assertResult('missing dependency is reported', run(packageDir), 0, 'depends on missing WO-99');
  }

  {
    const { packageDir } = makeRepository('dependency-cycle', [
      { id: 'WO-01', dependsOn: ['WO-02'] },
      { id: 'WO-02', dependsOn: ['WO-01'] },
    ]);
    assertResult('dependency cycle is reported', run(packageDir), 0, 'dependency cycle');
  }

  {
    const { packageDir } = makeRepository('evidence-dependency-pre-acceptance', [
      { id: 'WO-01', dependsOn: ['WO-90'] },
      { id: 'WO-90', kind: 'evidence', wave: 'none', surface: 'tooling', runtimeProfiles: ['none'] },
    ]);
    assertResult('evidence dependency is caught before acceptance too', run(packageDir), 0, 'depends on non-implementation WO-90');
  }

  {
    const { packageDir } = makeRepository('write-collision', [
      { id: 'WO-01', writePaths: ['src/shared.go'] },
      { id: 'WO-02', writePaths: ['src/shared.go'] },
    ]);
    assertResult('parallel write-scope collision is reported', run(packageDir), 0, 'write-scope collision');
  }

  {
    const { packageDir } = makeRepository('write-collision-sequenced', [
      { id: 'WO-01', writePaths: ['src/shared.go'] },
      { id: 'WO-02', writePaths: ['src/shared.go'], dependsOn: ['WO-01'] },
    ]);
    const messages = [...run(packageDir).parsed.errors, ...run(packageDir).parsed.warnings];
    assert(!messages.some((message) => message.includes('write-scope collision')), 'sequenced workorders must not collide');
  }

  {
    const { packageDir } = makeRepository('unknown-ids', [{ id: 'WO-01', riskIds: ['R-42'], dodIds: ['DOD-42'] }]);
    writeFileSync(join(packageDir, '03-risk-register.md'), '# Risks\n\n- R-01: something\n');
    writeFileSync(join(packageDir, '09-dod.md'), '# DoD\n\n- DOD-01: something\n');
    assertResult('unknown risk ID is reported', run(packageDir), 0, 'references unknown risk R-42');
    assertResult('unknown DoD ID is reported', run(packageDir), 0, 'references unknown DoD item DOD-42');
  }

  {
    const { packageDir } = makeRepository('gate-dod-coverage', [{ id: 'WO-01' }]);
    writeFileSync(join(packageDir, '09-dod.md'), '# DoD\n\n- DOD-01: shipped\n- DOD-02: uncovered\n');
    writeFileSync(join(packageDir, '08-quality-gates.md'), `# Gates

- G-01: tests

### Gate -> DoD Mapping

| Gate | Protects DoD item | Verification level |
|---|---|---|
| G-01 | DOD-01 | functional |
`);
    assertResult('uncovered DoD item is reported', run(packageDir), 0, 'DOD-02 is not covered by any gate');
    setState(packageDir, { status: 'ready_for_delivery' });
    assertResult('uncovered DoD item blocks a gated status', run(packageDir), 1, 'DOD-02 is not covered by any gate');
  }

  {
    const { packageDir } = makeRepository('product-first', [
      { id: 'WO-01', workClass: 'supporting' },
      { id: 'WO-02', workClass: 'supporting' },
      { id: 'WO-03' },
    ]);
    assertResult('supporting detour over budget is reported', run(packageDir), 1, 'product-first budget allows 1');
    writeFileSync(
      join(packageDir, 'STATE.md'),
      stateText({}).replace('status: discovery', 'supporting_detour_approved: true\nstatus: discovery'),
    );
    assertResult('explicit user approval releases the detour budget', run(packageDir), 0);
  }

  {
    const { packageDir } = makeRepository('spike-contract', [
      { id: 'WO-01', kind: 'spike' },
    ]);
    assertResult('spike without a fixed question is reported', run(packageDir), 0, 'spike is missing spike_question');
  }

  {
    const { packageDir } = makeRepository('ui-honest-prose', [
      { id: 'WO-01', surface: 'frontend', runtimeProfiles: ['browser'], status: 'done', docsToRead: ['02-ui-prototype.md'] },
    ]);
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    writeFileSync(join(packageDir, 'evidence', 'ui-happy.png'), 'x');
    writeFileSync(
      join(packageDir, '10-ui-verification.md'),
      `${validUIEvidence}\n## Notes\n\nThe dev server could not run at first; fixed by installing deps. The preview was unavailable for 40s during startup.\n`,
    );
    setState(packageDir, { status: 'complete', activeWave: 'W1' });
    assertResult('honest debugging prose does not block completion', run(packageDir), 0);

    writeFileSync(
      join(packageDir, '10-ui-verification.md'),
      `${validUIEvidence}\n## State Checks\n\n| State | Verdict | Screenshot |\n|---|---|---|\n| error | blocked-no-evidence | - |\n`,
    );
    assertResult('a blocked state row still blocks completion', run(packageDir), 1, 'blocked-no-evidence');
  }

  // --- existential probe gate ---

  function setExistentialRisk(packageDir, {
    id = 'R-01',
    status,
    probe = null,
    claimLockedAt = null,
    realBoundaries = null,
    fakedBoundaries = null,
  }) {
    const field = (name, value) => (value === null ? '' : `\n    ${name}: ${value}`);
    writeFileSync(
      join(packageDir, '03-risk-register.md'),
      `---
existential_risks:
  - id: ${id}
    claim: The provider accepts the body our serializer emits.${field('claim_locked_at', claimLockedAt)}${field('real_boundaries', realBoundaries)}${field('faked_boundaries', fakedBoundaries)}
    status: ${status}${probe ? `\n    probe: ${probe}` : ''}
---

# Risks

- ${id}: provider contract shape
`,
    );
  }

  {
    // The failure this gate exists for: 1 spike + 10 dependent workorders
    // designed and accepted before the spike ever ran.
    const { packageDir } = makeRepository('existential-premature-design', [
      { id: 'WO-01', kind: 'spike', extraFrontmatter: 'spike_question: does the count endpoint accept our body?\non_pass: unblock WO-02\non_fail: return_to_discovery\n' },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `WO-${String(index + 2).padStart(2, '0')}`,
        dependsOn: ['WO-01'],
      })),
    ]);
    setExistentialRisk(packageDir, { status: 'unproven' });
    const result = run(packageDir);
    assertResult('unproven existential risk blocks premature design', result, 1, 'may contain only the spike that probes them');
    assertResult('spike may not share a wave with its dependents', result, 1, 'owns its wave alone');
  }

  {
    const { packageDir } = makeRepository('existential-spike-only', [
      { id: 'WO-01', kind: 'spike', extraFrontmatter: 'spike_question: does the count endpoint accept our body?\non_pass: unblock W2\non_fail: return_to_discovery\n' },
    ]);
    setExistentialRisk(packageDir, { status: 'unproven' });
    assertResult('a spike-only package is allowed while the risk is unproven', run(packageDir), 0);
  }

  {
    const { packageDir } = makeRepository('existential-proven-without-evidence', [{ id: 'WO-01' }]);
    setExistentialRisk(packageDir, { status: 'proven' });
    assertResult('proven without a probe file is rejected', run(packageDir), 1, 'names no probe evidence file');

    setExistentialRisk(packageDir, { status: 'proven', probe: 'evidence/r-01.log' });
    assertResult('proven pointing at a missing probe file is rejected', run(packageDir), 1, 'probe evidence does not resolve');

    writeFileSync(join(packageDir, 'evidence', 'r-01.log'), 'POST /v1/responses/input_tokens -> 200\n');
    assertResult('proven with real probe output unblocks the package', run(packageDir), 0);
  }

  {
    const { packageDir } = makeRepository('existential-refuted', [{ id: 'WO-01' }]);
    setExistentialRisk(packageDir, { status: 'refuted', probe: 'evidence/r-01.log' });
    writeFileSync(join(packageDir, 'evidence', 'r-01.log'), 'POST with real providerBody -> 400\n');
    assertResult('a refuted assumption stops the package', run(packageDir), 1, 'is refuted; return to the discussion gate');
  }

  {
    const { packageDir } = makeRepository('existential-undeclared', [{ id: 'WO-01' }]);
    assertResult('an undeclared existential block is surfaced', run(packageDir), 0, 'declares no `existential_risks:` block');
    assertResult('and it is fatal under --strict', run(packageDir, ['--strict']), 1);
    setExistentialRisk(packageDir, { status: 'proven', probe: 'evidence/r-01.log' });
    writeFileSync(join(packageDir, 'evidence', 'r-01.log'), 'probe output\n');
    const after = run(packageDir);
    assert(
      ![...after.parsed.errors, ...after.parsed.warnings].some((message) => message.includes('declares no `existential_risks:` block')),
      'declaring existential_risks did not clear the finding',
    );
  }

  // --- Claim freeze and substituted boundaries -------------------------------
  // The expensive failure is not a missing probe. It is a claim quietly
  // narrowed to whatever the probe managed to run, with the load-bearing
  // boundary replaced by a double, then marked proven.

  {
    const { packageDir } = makeRepository('existential-faked-boundary', [{ id: 'WO-01' }]);
    writeFileSync(join(packageDir, 'evidence', 'r-01.log'), 'pipeline executed against a local snapshot\n');
    setExistentialRisk(packageDir, {
      status: 'proven',
      probe: 'evidence/r-01.log',
      realBoundaries: '[reader-api]',
      fakedBoundaries: '[llm-gateway]',
    });
    assertResult('a proven risk that declares a faked boundary is rejected', run(packageDir), 1, 'while declaring faked boundaries');
  }

  {
    const { packageDir } = makeRepository('existential-substitution-scan', [{ id: 'WO-01' }]);
    writeFileSync(
      join(packageDir, 'evidence', 'r-01.log'),
      'gateway: deterministic structured-output contract double\n"live_gateway_verified": false\n',
    );
    setExistentialRisk(packageDir, { status: 'proven', probe: 'evidence/r-01.log', realBoundaries: '[reader-api]' });
    assertResult('an undeclared substitution in the probe log is caught', run(packageDir), 1, 'reads like a substituted boundary');

    setExistentialRisk(packageDir, {
      status: 'proven',
      probe: 'evidence/r-01.log',
      realBoundaries: '[reader-api]',
      fakedBoundaries: '[]',
    });
    const after = run(packageDir);
    assert(
      !after.parsed.errors.some((message) => message.includes('reads like a substituted boundary')),
      'declaring faked_boundaries: [] did not clear the substitution scan',
    );
  }

  {
    const { packageDir } = makeRepository('existential-claim-locked-after-probe', [{ id: 'WO-01' }]);
    writeFileSync(join(packageDir, 'evidence', 'r-01.log'), 'POST /v1/count -> 200 {"tokens": 12}\n');
    setExistentialRisk(packageDir, {
      status: 'proven',
      probe: 'evidence/r-01.log',
      claimLockedAt: "'2999-01-01T00:00:00Z'",
      realBoundaries: '[provider-api]',
      fakedBoundaries: '[]',
    });
    assertResult('a claim locked after its probe ran is rejected', run(packageDir), 1, 'the claim was written after the result was known');

    setExistentialRisk(packageDir, {
      status: 'proven',
      probe: 'evidence/r-01.log',
      claimLockedAt: "'2000-01-01T00:00:00Z'",
      realBoundaries: '[provider-api]',
      fakedBoundaries: '[]',
    });
    assertResult('a claim locked before its probe ran is accepted', run(packageDir), 0);
  }

  // --- Consumed-input closure ------------------------------------------------

  {
    const { packageDir } = makeRepository('consumes-missing-producer', [{
      id: 'WO-01',
      consumes: [{ input: 'ontology release v1', kind: 'artifact', producedBy: 'WO-00' }],
    }]);
    assertResult('an input produced by nothing is caught', run(packageDir), 0, 'which no workorder defines');
  }

  {
    const { packageDir } = makeRepository('consumes-undeclared-dependency', [
      { id: 'WO-01' },
      {
        id: 'WO-02',
        consumes: [{ input: 'src/settings.py', kind: 'file', producedBy: 'WO-01' }],
      },
    ]);
    assertResult('a consumed input without depends_on is caught', run(packageDir), 0, 'depends_on does not include it');
  }

  {
    const { packageDir } = makeRepository('consumes-declared', [
      { id: 'WO-01' },
      {
        id: 'WO-02',
        dependsOn: ['WO-01'],
        consumes: [
          { input: 'src/settings.py', kind: 'file', producedBy: 'WO-01' },
          { input: 'approved gateway endpoint', kind: 'config', producedBy: 'release-binding' },
        ],
      },
    ]);
    const result = run(packageDir);
    assertResult('a declared and depended-on input passes', result, 0);
    assert(
      ![...result.parsed.errors, ...result.parsed.warnings].some((message) => message.includes('Consumes')),
      'a fully declared Consumes table still produced a finding',
    );
  }

  {
    const { packageDir } = makeRepository('consumes-missing-section', [{ id: 'WO-01' }]);
    const path = join(packageDir, 'workorders', 'WO-01.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/## Consumes\n\nNone\.\n\n/, ''));
    assertResult('an omitted Consumes section is surfaced', run(packageDir), 0, 'has no `## Consumes` table');
  }

  // --- STATE.md blockers -----------------------------------------------------

  {
    const { packageDir } = makeRepository('blocker-needs-user-decision', [{ id: 'WO-01' }]);
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    setState(packageDir, {
      status: 'ready_for_delivery',
      blockers: `
  - id: B-01
    statement: the console repository has no reviewable git baseline
    blocks: [W2]
    owner: user
    needs_user_decision: true
    resolved: false`,
    });
    assertResult('an unresolved user decision blocks readiness', run(packageDir), 1, 'needs a user decision and is unresolved');
  }

  {
    const { packageDir } = makeRepository('blocker-blocks-accepted-wave', [{ id: 'WO-01' }]);
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    setState(packageDir, {
      status: 'ready_for_delivery',
      blockers: `
  - id: B-01
    statement: the runtime credential is unavailable
    blocks: [W1]
    owner: platform
    needs_user_decision: false
    resolved: false`,
    });
    assertResult('a blocker on an accepted wave is caught', run(packageDir), 1, 'which is recorded as an accepted ready wave');
  }

  {
    const { packageDir } = makeRepository('blockers-undeclared', [{ id: 'WO-01' }]);
    writeFileSync(
      join(packageDir, 'STATE.md'),
      stateText({ status: 'discovery' }).replace(/^blockers: \[\]\n/m, ''),
    );
    assertResult('an undeclared blockers list is surfaced', run(packageDir), 0, 'declares no `blockers:` list');
  }

  // --- Product-first measured by outcome -------------------------------------

  {
    const { packageDir } = makeRepository('platform-slice-unapproved', [{ id: 'WO-01' }]);
    writeFileSync(join(packageDir, '09-dod.md'), '# Definition of Done\n');
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    setState(packageDir, { status: 'ready_for_delivery' });
    assertResult('an accepted wave with no user-observable outcome is rejected', run(packageDir), 1, 'declares no user-observable outcome');

    setState(packageDir, { status: 'ready_for_delivery', extraFrontmatter: 'platform_slice_approved: true\n' });
    assertResult('an explicitly approved platform slice is allowed', run(packageDir), 0);
  }

  {
    const { packageDir } = makeRepository('outcome-persona-not-in-prd', [{ id: 'WO-01' }]);
    writeFileSync(
      join(packageDir, '09-dod.md'),
      `---
wave_outcomes:
  - wave: W1
    user_observable_outcome: A curl client receives the payload.
    persona: Integration engineer
---

# Definition of Done
`,
    );
    acceptWave(packageDir, { wave: 'W1', baseRef: 'main' });
    setState(packageDir, { status: 'ready_for_delivery' });
    assertResult('a persona the PRD never names is surfaced', run(packageDir), 0, 'which 01-prd.md never mentions');
  }

  // --- Cross-document integrity ----------------------------------------------

  {
    const { packageDir } = makeRepository('dangling-risk-reference', [{ id: 'WO-01' }]);
    setExistentialRisk(packageDir, { status: 'proven', probe: 'evidence/r-01.log', realBoundaries: '[api]', fakedBoundaries: '[]' });
    writeFileSync(join(packageDir, 'evidence', 'r-01.log'), 'POST -> 200\n');
    writeFileSync(join(packageDir, '01-prd.md'), `${baselineContent['01-prd.md']}\nR-01 and R-05 remain material.\n`);
    assertResult('a dangling risk id in prose is caught', run(packageDir), 0, 'references unknown risk R-05');
  }

  // --- Deep-profile non-functional targets ------------------------------------

  {
    const { packageDir } = makeRepository('deep-without-non-functional', [{ id: 'WO-01' }], { profile: 'deep' });
    assertResult('a deep package with no scale/latency/cost targets is surfaced', run(packageDir), 0, 'states no non-functional targets');

    writeFileSync(join(packageDir, '04-trd.md'), '# TRD\n\n## Non-functional targets\n\n- 200 rps, p95 300 ms, $400/month.\n');
    const after = run(packageDir);
    assert(
      ![...after.parsed.errors, ...after.parsed.warnings].some((message) => message.includes('states no non-functional targets')),
      'stating non-functional targets did not clear the finding',
    );
  }

  // --- UX accepted for an undecomposed wave -----------------------------------

  {
    const { packageDir } = makeRepository('prototype-without-consumer', [{ id: 'WO-01', surface: 'backend' }]);
    for (const file of ['02-ux-problem-framing.md', '02-ui-spec.md', '02-ui-prototype.md']) {
      writeFileSync(join(packageDir, file), `# ${file}\n`);
    }
    writeFileSync(
      join(packageDir, 'STATE.md'),
      `${stateText({ status: 'discovery' })}
| Artifact | Status | Notes |
|---|---|---|
| 02-ui-prototype.md | accepted | reviewed with the user |
`,
    );
    assertResult('UX accepted for a wave nobody decomposed is surfaced', run(packageDir), 0, 'no frontend/mixed workorder can consume it');
  }

  // --- Soft sizing proxies ----------------------------------------------------

  {
    const { packageDir } = makeRepository('sizing-proxies', [{
      id: 'WO-01',
      writePaths: ['a/one.py', 'a/two.py', 'a/three.py', 'a/four.py', 'a/five.py', 'a/six.py', 'a/seven.py', 'tests/test_a.py'],
      dodIds: ['DOD-01', 'DOD-02', 'DOD-03', 'DOD-04'],
      negativeCases: Array.from({ length: 12 }, (_, index) => `case ${index + 1}`),
    }]);
    writeFileSync(join(packageDir, '09-dod.md'), `${baselineContent['09-dod.md']}\nDOD-01 DOD-02 DOD-03 DOD-04\n`);
    const result = run(packageDir);
    assertResult('too many non-test write paths is surfaced', result, 0, 'non-test write paths (soft limit 6)');
    assertResult('too many DoD items in one slice is surfaced', result, 0, 'DoD items (soft limit 3)');
    assertResult('too many negative cases is surfaced', result, 0, 'negative cases (soft limit 10)');

    const path = join(packageDir, 'workorders', 'WO-01.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace(
      /^docs_to_read: .*$/m,
      (line) => `${line}\noversize_justification: one migration that cannot be split without leaving the schema half-applied`,
    ));
    const justified = run(packageDir);
    assert(
      ![...justified.parsed.errors, ...justified.parsed.warnings].some((message) => message.includes('soft limit')),
      'oversize_justification did not silence the sizing proxies',
    );
  }

  console.log('aird-validate tests: PASS (58 cases)');
} finally {
  rmSync(root, { recursive: true, force: true });
}
