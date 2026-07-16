#!/usr/bin/env node

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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

function stateV2({
  status,
  implementation = 'ready',
  runtime = 'blocked',
  release = 'blocked',
  packageClass = 'product',
  packageApproved = false,
  productStarted = false,
  productFiles = 0,
  firstSlice = 'pending',
  supportingWip = 0,
  supportingUsed = 0,
  supportingPercent = 0,
  detourApproved = false,
} = {}) {
  return `---
aird_state_version: '2.0'
package_class: ${packageClass}
supporting_package_user_approved: ${packageApproved}
status: ${status}
readiness:
  ready_for_implementation: ${implementation}
  ready_for_runtime_verification: ${runtime}
  ready_for_release: ${release}
value_flow:
  product_implementation_started: ${productStarted}
  product_files_changed: ${productFiles}
  first_vertical_slice: ${firstSlice}
  supporting_wip: ${supportingWip}
  supporting_workorders_used: ${supportingUsed}
  supporting_delivery_percent: ${supportingPercent}
  cycles_without_user_value: 0
  minutes_without_user_value: 0
detour_budget:
  user_approved_overrun: ${detourApproved}
---

## Blockers

- None.
`;
}

function makePackage(name, { status = 'complete', evidence = null, state = null } = {}) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'workorders'), { recursive: true });
  mkdirSync(join(dir, 'evidence'), { recursive: true });
  writeFileSync(join(dir, 'STATE.md'), state ?? `---\nstatus: ${status}\n---\n\n## Blockers\n\n- None.\n`);
  for (const file of baseline) writeFileSync(join(dir, file), `# ${file}\n`);
  writeFileSync(join(dir, 'workorders', '001-migration.md'), `# Migration Workorder

## Identity

- Recommended agent: backend-worker

## Objective

Add a PostgreSQL migration and store change.

## Task Breakdown

1. Add the schema migration and store change.

## Scope

- Writes: migration, store, and focused tests.
`);
  writeFileSync(join(dir, 'workorders', '002-api.md'), `# API Workorder

## Identity

- Recommended agent: backend-worker

## Objective

Mount one HTTP API handler.

## Task Breakdown

1. Mount the API handler.

## Scope

- Writes: handler, route, and focused tests.
`);
  writeFileSync(join(dir, 'workorders', '003-artifact.md'), `# Artifact Workorder

## Identity

- Recommended agent: backend-worker

## Objective

Build one deployable container startup path.

## Task Breakdown

1. Build and configure the container image.

## Scope

- Writes: Dockerfile, startup configuration, and focused tests.
`);
  if (evidence) {
    writeFileSync(join(dir, '10-backend-verification.md'), evidence);
    for (const file of ['runtime.log', 'flow.log', 'upgrade.log', 'api.log', 'artifact.log']) {
      writeFileSync(join(dir, 'evidence', file), `PASS ${file}\n`);
    }
  }
  return dir;
}

function makeUiPackage(name, { includePrototypeReading = true } = {}) {
  const dir = makePackage(name, {
    state: stateV2({ status: 'ready_for_delivery' }),
  });
  for (const file of ['02-ux-problem-framing.md', '02-ui-spec.md']) {
    writeFileSync(join(dir, file), `# ${file}\n`);
  }
  writeFileSync(join(dir, '02-ui-prototype.md'), '# Prototype\n\nArtifact: `prototype/app.html`\n');
  const docs = includePrototypeReading
    ? `docs_to_read:
  - 02-ui-prototype.md#Contract
  - prototype/app.html#Artifact`
    : `docs_to_read:
  - 04-trd.md#UI`;
  writeFileSync(join(dir, 'workorders', '001-backend.md'), `---
aird_workorder_schema_version: '3.0'
id: WO-01
kind: implementation
work_class: product
status: ready
priority: P1
depends_on: []
risk_ids: []
gate_ids: []
dod_ids: []
review_packet: ui
vertical_slice_id: VS-01
runtime_boundaries: []
acceptance_scenario_count: 1
lifecycle_operations: []
allowed_write_paths: [src/ui.tsx]
${docs}
---

## Identity

- Recommended agent: frontend-worker

## Task Breakdown

1. Implement the UI.

## Scope

- Objective: Implement UI prototype parity.

## Contracts

- UI contract.

## Must Haves

- Verify prototype sections, interactions, responsive composition, and intentional deviations.

## Acceptance Criteria

1. UI matches the prototype.

## Verification

- Browser later.
`);
  return dir;
}

const validEvidence = `---
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

function run(dir) {
  const result = spawnSync(process.execPath, [validator, dir, '--json'], { encoding: 'utf8' });
  let parsed = null;
  try { parsed = JSON.parse(result.stdout); } catch { /* asserted below */ }
  return { code: result.status, parsed, stdout: result.stdout, stderr: result.stderr };
}

function assertCase(name, result, expectedCode, expectedError = null) {
  if (result.code !== expectedCode) {
    throw new Error(`${name}: exit ${result.code}, expected ${expectedCode}\n${result.stdout}\n${result.stderr}`);
  }
  if (!result.parsed) throw new Error(`${name}: validator did not return JSON`);
  if (expectedError && !result.parsed.errors.some((error) => error.includes(expectedError))) {
    throw new Error(`${name}: missing error containing ${JSON.stringify(expectedError)}\n${result.stdout}`);
  }
}

try {
  assertCase(
    'missing backend evidence',
    run(makePackage('missing-evidence')),
    1,
    '10-backend-verification.md is missing',
  );

  assertCase(
    'required skip blocks completion',
    run(makePackage('skipped', {
      evidence: validEvidence.replace('passed_checks: 5', 'passed_checks: 4').replace('skipped_checks: 0', 'skipped_checks: 1'),
    })),
    1,
    'skipped_checks must be 0',
  );

  assertCase(
    'migration upgrade evidence is mandatory',
    run(makePackage('missing-upgrade', {
      evidence: validEvidence
        .replace('migration_upgrade: pass', 'migration_upgrade: not_required')
        .replace('migration_upgrade_evidence: evidence/upgrade.log', 'migration_upgrade_evidence: not_required'),
    })),
    1,
    'migration_upgrade must be pass',
  );

  assertCase(
    'malformed counts cannot pass',
    run(makePackage('malformed-count', {
      evidence: validEvidence.replace('skipped_checks: 0', 'skipped_checks: 0oops'),
    })),
    1,
    'skipped_checks must be 0',
  );

  assertCase(
    'evidence cannot escape package',
    run(makePackage('escaping-evidence', {
      evidence: validEvidence.replace('runtime_integration_evidence: evidence/runtime.log', 'runtime_integration_evidence: ../runtime.log'),
    })),
    1,
    'does not resolve to an evidence file inside the AIRD package',
  );

  assertCase('complete backend evidence passes', run(makePackage('valid', { evidence: validEvidence })), 0);
  assertCase('paused package may retain blocker', run(makePackage('paused', { status: 'paused' })), 0);

  assertCase(
    'implementation readiness does not require runtime fixtures',
    run(makePackage('implementation-ready-runtime-blocked', {
      state: stateV2({ status: 'ready_for_delivery' }),
    })),
    0,
  );

  assertCase(
    'implementation complete may retain runtime blocker',
    run(makePackage('implementation-complete-runtime-blocked', {
      state: stateV2({
        status: 'implementation_complete',
        productStarted: true,
        productFiles: 3,
        firstSlice: 'functional',
      }),
    })),
    0,
  );

  assertCase(
    'release readiness requires runtime readiness',
    run(makePackage('release-runtime-blocked', {
      state: stateV2({
        status: 'ready_for_release',
        release: 'ready',
      }),
    })),
    1,
    'requires runtime verification readiness',
  );

  assertCase(
    'release readiness requires backend evidence',
    run(makePackage('release-missing-evidence', {
      state: stateV2({
        status: 'ready_for_release',
        runtime: 'ready',
        release: 'ready',
      }),
    })),
    1,
    'claims release readiness but 10-backend-verification.md is missing',
  );

  assertCase(
    'detour budget blocks release state claims',
    run(makePackage('detour-overrun', {
      state: stateV2({
        status: 'in_delivery',
        supportingUsed: 2,
        supportingPercent: 25,
      }),
    })),
    1,
    'supporting detour exceeded',
  );

  assertCase(
    'supporting package requires approval',
    run(makePackage('supporting-package-unapproved', {
      state: stateV2({ status: 'ready_for_delivery', packageClass: 'supporting' }),
    })),
    1,
    'requires explicit user approval',
  );

  assertCase('UI prototype uses docs_to_read', run(makeUiPackage('ui-docs-to-read')), 0);
  assertCase(
    'UI prototype missing docs_to_read is blocked',
    run(makeUiPackage('ui-missing-docs-to-read', { includePrototypeReading: false })),
    1,
    'docs_to_read omits 02-ui-prototype.md',
  );

  console.log('aird-validate tests: PASS (15 cases)');
} finally {
  rmSync(root, { recursive: true, force: true });
}
