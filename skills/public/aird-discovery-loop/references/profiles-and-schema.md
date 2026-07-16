# AIRD Profiles And Machine-Readable Contracts

Use this file as the canonical source for AIRD readiness, package state, and
Workorder Frontmatter V3. Do not redefine these contracts in templates or other
references.

## Contents

- Discovery Profiles
- Readiness Contract
- Product-First And Detour Contract
- Workorder Frontmatter V3
- Lint And Review Ordering

## Discovery Profiles

Choose one profile at intake. Risk and irreversibility override line-count
estimates.

| Profile | Use when | Typical shape | Review rule |
|---|---|---|---|
| `lite` | Localized, reversible change in one ownership boundary | Concise required docs; usually 2–5 workorders | One packet review after lint |
| `standard` | Cross-layer or material single-service contract/rollout | Scoped recon; usually 5–12 workorders | One or two write-seam packets |
| `deep` | Security boundary, infrastructure, migration, multi-service/API/data change, or high-impact rollout | Full evidence-backed package and execution waves | Packets of at most 7 workorders |

Counts calibrate; they are not quotas. Never merge work to hit a count. More
than 12 workorders requires execution waves in `07-implementation-plan.md`.

## Readiness Contract

Track three independent readiness fields in `STATE.md`:

- `ready_for_implementation`: `blocked` or `ready`. Set `ready` when product
  decisions, contracts, workorder sizing, write scopes, and focused test plans
  are sufficient for reversible implementation.
- `ready_for_runtime_verification`: `blocked`, `ready`, or `not_required`. Set
  `ready` only when the actual environment, credentials, production-equivalent
  dependencies, and fixtures needed by required runtime checks are available.
- `ready_for_release`: `blocked` or `ready`. Set `ready` only after every
  required static, review, QA, browser, security, migration, and runtime gate
  has passed with concrete evidence.

Runtime dependency types, versions/dialects, boundaries, and intended commands
must be known before implementation. Actual environment access and fixtures do
not block reversible implementation. Missing runtime access blocks runtime
verification, `ready_for_release`, and `status: complete`.

Use these lifecycle statuses:

- `discovery`: package design is in progress;
- `ready_for_delivery`: compatibility status meaning
  `ready_for_implementation: ready`;
- `in_delivery`: implementation work is running;
- `implementation_complete`: required product implementation workorders are
  done; release evidence may still be blocked;
- `verifying`: required runtime/browser/release checks are running;
- `ready_for_release`: all required gates passed;
- `complete`: delivery is closed with release-ready evidence;
- `paused`: progress stopped with a recorded blocker or approval request.

`ready_for_delivery` and `in_delivery` require only
`ready_for_implementation: ready`. `verifying` requires
`ready_for_runtime_verification: ready|not_required`. `ready_for_release` and
`complete` require `ready_for_release: ready`.

## Product-First And Detour Contract

Classify each package as `product` or `supporting`, and every workorder as
`product`, `supporting`, or `verification`.

Before the first vertical slice is `functional`:

- keep the first implementation wave on the smallest public product flow;
- allow at most one small supporting workorder and at most 20 percent supporting
  delivery effort without explicit user approval;
- stop when either limit is exceeded;
- never create a separate supporting AIRD package without explicit user
  approval. A runtime-evidence or tooling project is a supporting package.

Record approvals and value-flow counters in `STATE.md`. Documentation, tooling,
and evidence-file changes do not count as product files or user value.

## Workorder Frontmatter V3

Frontmatter is the machine-readable source of truth:

```yaml
---
aird_workorder_schema_version: '3.0'
id: WO-00
kind: implementation
work_class: product
status: ready
priority: P1
depends_on: [WO-01]
risk_ids: [R-01]
gate_ids: [G-01]
dod_ids: [DOD-01]
review_packet: product-slice
vertical_slice_id: VS-01
runtime_boundaries: [scm]
acceptance_scenario_count: 4
lifecycle_operations: []
allowed_write_paths:
  - service/path.go
docs_to_read:
  - 04-trd.md#Target Architecture
---
```

Enums and meanings:

- `kind`: `implementation`, `spike`, `evidence`, `review`;
- `work_class`: `product`, `supporting`, `verification`;
- `status`: `draft`, `ready`, `in_progress`, `done`, `blocked`, `deferred`;
- `vertical_slice_id`: a stable slice ID such as `VS-01`; use `none` only for
  supporting or verification work;
- `runtime_boundaries`: separately running systems or protocols crossed by the
  work, such as `kubernetes`, `database`, `scm`, or `registry`. Internal handler,
  provider, and store layers in one service are not separate runtime boundaries;
- `acceptance_scenario_count`: number of distinct required scenarios owned by
  this workorder;
- `lifecycle_operations`: any of `build`, `start`, `health`, `live`, `rollback`,
  and `cleanup` owned by this workorder.

### Blocking Sizing Rules

A workorder is oversized and must not be spawned when any condition holds:

- it has more than one runtime boundary;
- it combines Kubernetes, database, SCM, and registry responsibilities;
- an implementation workorder owns more than 8 acceptance scenarios;
- it owns build, start, health, live, rollback, and cleanup together;
- it contains more than 3 atomic tasks or more than one ownership/write seam;
- it requires the whole AIRD package instead of named files and sections;
- a fresh worker cannot finish it within half of a context window.

There is no high-risk exception to sizing. Split the workorder before spawn.
High risk changes review depth, not executable size.

### Spike Workorders

For `kind: spike`, also require:

```yaml
spike_question: Can the selected runtime execute the build flow?
on_pass: unblock WO-03
on_fail: return_to_discovery
must_not_decide:
  - weaker runtime fallback
```

A spike answers one fixed question. It cannot select unreviewed architecture or
silently implement a fallback.

## Lint And Review Ordering

Run strict lint after every workorder packet:

```bash
node <skill>/scripts/aird-lint.mjs .agent/aird/<feature-slug> --strict-schema
```

Strict lint checks V3 schema, lifecycle states, sizing, dependency graph, write
and document scopes, product-first/detour state, risk/gate/DoD coverage,
Gate-to-DoD transpose, counts, and packet sizing. Legacy mode may read V2 or
heading-only packages, but it must not weaken a V3 package.

Draft the dependency spine, lint each packet, run semantic/sizing review, split
failures, then reconcile `07-implementation-plan.md`, `08-quality-gates.md`,
`09-dod.md`, and `STATE.md` once from accepted frontmatter.
