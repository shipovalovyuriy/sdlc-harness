#!/usr/bin/env node

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const linter = join(here, 'aird-lint.mjs');
const root = mkdtempSync(join(tmpdir(), 'aird-lint-test-'));

function stateText({
  status = 'ready_for_delivery',
  packageClass = 'product',
  packageApproved = false,
  implementation = 'ready',
  runtime = 'blocked',
  release = 'blocked',
  productStarted = false,
  productFiles = 0,
  firstSlice = 'pending',
  supportingWip = 0,
  supportingUsed = 0,
  supportingPercent = 0,
  detourApproved = false,
  total = 1,
  ready = 1,
  inProgress = 0,
  done = 0,
} = {}) {
  return `---
aird_state_version: '2.0'
package_class: ${packageClass}
supporting_package_user_approved: ${packageApproved}
discovery_profile: standard
status: ${status}
readiness:
  ready_for_implementation: ${implementation}
  ready_for_runtime_verification: ${runtime}
  ready_for_release: ${release}
progress:
  workorders_total: ${total}
  workorders_ready: ${ready}
  workorders_in_progress: ${inProgress}
  workorders_done: ${done}
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
`;
}

function workorderText({
  status = 'ready',
  workClass = 'product',
  verticalSlice = 'VS-01',
  boundaries = ['scm'],
  scenarios = 1,
  lifecycle = [],
  docs = ['04-trd.md#Target'],
} = {}) {
  const scenarioLines = Array.from({ length: scenarios }, (_, index) => `${index + 1}. Scenario ${index + 1}.`).join('\n');
  return `---
aird_workorder_schema_version: '3.0'
id: WO-01
kind: implementation
work_class: ${workClass}
status: ${status}
priority: P1
depends_on: []
risk_ids: [R-01]
gate_ids: [G-01]
dod_ids: [DOD-01]
review_packet: product
vertical_slice_id: ${verticalSlice}
runtime_boundaries: [${boundaries.join(', ')}]
acceptance_scenario_count: ${scenarios}
lifecycle_operations: [${lifecycle.join(', ')}]
allowed_write_paths:
  - src/product
docs_to_read:
${docs.map((item) => `  - ${item}`).join('\n')}
---

# Workorder

## Identity

- Recommended agent: worker

## Context

- Product value.

## Task Breakdown

1. Implement one coherent change.

## Scope

- Objective: advance the product slice.

## Contracts

- Preserve the contract.

## Must Haves

### Truths

- Product flow works.

### Artifacts

| Path | Provides | Substantive check | Evidence required |
|---|---|---|---|

### Key Links

| From | To | Via | Focused verification |
|---|---|---|---|

## Acceptance Criteria

${scenarioLines}

## Verification

- Focused test.

## Reporting

- Report evidence.
`;
}

function makePackage(name, { state = {}, workorder = {} } = {}) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'workorders'), { recursive: true });
  writeFileSync(join(dir, 'STATE.md'), stateText(state));
  for (const file of ['00-intake.md', '00-discussion-log.md', '01-prd.md', '04-trd.md']) {
    writeFileSync(join(dir, file), `# ${file}\n`);
  }
  writeFileSync(join(dir, '03-risk-register.md'), '# Risks\n\nR-01\n');
  writeFileSync(join(dir, '07-implementation-plan.md'), '# Plan\n');
  writeFileSync(join(dir, '08-quality-gates.md'), '# Gates\n\n## Gate -> DoD Mapping\n\n| Gate | DoD |\n|---|---|\n| G-01 | DOD-01 |\n');
  writeFileSync(join(dir, '09-dod.md'), '# DoD\n\n## DoD -> Gate Mapping\n\n| DoD | Gate |\n|---|---|\n| DOD-01 | G-01 |\n');
  writeFileSync(join(dir, 'workorders', 'WO-01-product.md'), workorderText(workorder));
  return dir;
}

function run(dir) {
  return spawnSync(process.execPath, [linter, dir, '--strict-schema'], { encoding: 'utf8' });
}

function assertCase(name, result, expectedCode, expectedText = null) {
  if (result.status !== expectedCode) {
    throw new Error(`${name}: exit ${result.status}, expected ${expectedCode}\n${result.stdout}\n${result.stderr}`);
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (expectedText && !output.includes(expectedText)) {
    throw new Error(`${name}: missing ${JSON.stringify(expectedText)}\n${output}`);
  }
}

try {
  assertCase('focused product workorder passes', run(makePackage('valid')), 0);

  assertCase(
    'multiple runtime boundaries fail',
    run(makePackage('multiple-boundaries', { workorder: { boundaries: ['database', 'scm'] } })),
    1,
    'crosses 2 runtime boundaries',
  );

  assertCase(
    'kubernetes database scm registry combination fails',
    run(makePackage('four-boundaries', {
      workorder: { boundaries: ['kubernetes', 'database', 'scm', 'registry'] },
    })),
    1,
    'combines Kubernetes, database, SCM, and registry',
  );

  assertCase(
    'too many implementation scenarios fail',
    run(makePackage('many-scenarios', { workorder: { scenarios: 9 } })),
    1,
    'acceptance scenarios; max 8',
  );

  assertCase(
    'full lifecycle fails',
    run(makePackage('full-lifecycle', {
      workorder: { lifecycle: ['build', 'start', 'health', 'live', 'rollback', 'cleanup'] },
    })),
    1,
    'owns build/start/health/live/rollback/cleanup',
  );

  assertCase(
    'whole document reading fails strict lint',
    run(makePackage('whole-doc', { workorder: { docs: ['04-trd.md'] } })),
    1,
    'docs_to_read must name exact sections',
  );

  assertCase(
    'done workorder lifecycle passes',
    run(makePackage('done', {
      state: {
        status: 'implementation_complete',
        productStarted: true,
        productFiles: 2,
        firstSlice: 'functional',
        ready: 0,
        done: 1,
      },
      workorder: { status: 'done' },
    })),
    0,
  );

  assertCase(
    'detour overrun fails',
    run(makePackage('detour', {
      state: { supportingUsed: 2, supportingPercent: 25 },
    })),
    1,
    'supporting detour exceeded',
  );

  assertCase(
    'supporting package requires approval',
    run(makePackage('supporting-package', {
      state: { packageClass: 'supporting' },
    })),
    1,
    'requires explicit user approval',
  );

  console.log('aird-lint tests: PASS (9 cases)');
} finally {
  rmSync(root, { recursive: true, force: true });
}
