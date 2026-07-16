---
aird_workorder_schema_version: '3.0'
id: WO-XX
kind: implementation
work_class: product
status: draft
priority: P1
depends_on: []
risk_ids: []
gate_ids: []
dod_ids: []
review_packet: fixes
vertical_slice_id: VS-XX
runtime_boundaries: []
acceptance_scenario_count: 1
lifecycle_operations: []
allowed_write_paths:
  - exact/path
docs_to_read:
  - 09-dod.md#Exact Item
---

# Fix Workorder Template

## Identity

- Title:
- Recommended agent:
- One-sentence outcome:

## Context

- Source gate:
- Severity:
- Affected DoD item:
- Original workorder:
- Relevant AIRD docs:
- Code standards to load (`$code-review-standards` references):
- Contract/DoD deviation:
- Evidence:

## Task Breakdown

Sizing rule: 1–3 atomic tasks max; a fix workorder is the smallest change that resolves the finding, in one fresh worker context. If the fix is bigger than that, it is not a fix — split it or route back to discovery.

1. 

## Scope

- Allowed read paths:
- Allowed write paths:
- Allowed commands:
- Expected behavior:
- Out of scope:

## Contracts

- Contract/DoD behavior that must be restored:
- Runtime verification plan:
- Runtime environment/fixtures available: yes / no / not_required

## Must Haves

### Truths

- Original blocking behavior is removed without weakening the protected gate.

### Artifacts

| Path | Provides | Substantive check | Evidence required |
|---|---|---|---|

### Key Links

| From | To | Via | Focused verification |
|---|---|---|---|

## Acceptance Criteria

1. The original finding is resolved by the focused check without weakening its gate.

## Verification

- Focused checks:
- Gate criticality: required / optional
- Production-equivalent runtime dependencies and startup command:
- Required-check accounting: executed / passed / failed / skipped (required skips block PASS)
- Migration change: no / yes — if yes, fresh install + previous-release upgrade + idempotency + rollback/fix-forward evidence:
- API/job/queue change: no / yes — if yes, live public-boundary smoke evidence:
- Deployable runtime change: no / yes — if yes, shipped artifact build/start/health evidence:
- Persisted business-flow/regression sequence:
- Standards focus: project structure / function design / reuse / duplication / optimization / language conventions
- Full gates to re-run:
- Verification levels: exists / substantive / wired / functional
- Evidence attached (fail-closed — no vacuous pass): test output / command exit / screenshot / API response / diff
- Issue count before fix:
- Issue count after fix:

## Watchdog

- Stop after 30 minutes without a focused test.
- Stop when partial files exist without the affected Key Link wired.
- Stop and split at half-context without completion.

## Reporting

Report changed files, tests run, and whether the original finding is resolved. Never return empty; if blocked, report the blocker and reason explicitly — a silent or vacuous result is treated as a failure, not a fix.
