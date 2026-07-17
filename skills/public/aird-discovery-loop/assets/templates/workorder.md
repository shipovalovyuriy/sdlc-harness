---
aird_workorder_schema_version: '3.0'
id: WO-XX
# implementation | spike | evidence | review
kind: implementation
# product | supporting | verification
work_class: product
# draft | ready | in_progress | done | blocked | deferred
status: draft
priority: P1
depends_on: []
risk_ids: []
gate_ids: []
dod_ids: []
review_packet: product-slice
# Stable slice ID; use none only for supporting or verification work.
vertical_slice_id: VS-XX
# Separately running systems/protocols crossed by this workorder; maximum one.
runtime_boundaries: []
# Distinct numbered scenarios in Acceptance Criteria; implementation maximum 8.
acceptance_scenario_count: 0
# Any of: build, start, health, live, rollback, cleanup.
lifecycle_operations: []
allowed_write_paths:
  - exact/path
docs_to_read:
  - 04-trd.md#Exact Section
# For kind: spike, uncomment and fill all four fields.
# spike_question: ''
# on_pass: ''
# on_fail: ''
# must_not_decide: []
---

# Workorder

Use `references/profiles-and-schema.md` as the canonical schema and sizing
contract. Frontmatter is authoritative.

## Identity

- Title:
- Recommended agent:
- One-sentence outcome:

## Context

- Product or operational value advanced:
- Discussion decisions and risk mitigations to honor:
- Relevant files and current behavior:
- Dependency rationale and downstream consumers:
- Rejected alternatives and assumptions:

## Task Breakdown

List 1–3 atomic edit units. A workorder with a second runtime boundary,
ownership seam, or public flow is oversized even when this list has only three
items.

1. 

## Scope

- Objective:
- Exact behavior delta:
- Allowed read paths:
- Out of scope:
- Decisions the worker must not make:
- Stop-and-report conditions:

If another write path or runtime boundary is needed, stop and return the scope
change for split/review.

## Contracts

- API/event and data constraints:
- UX states and compatibility requirements:
- Observability and audit requirements:
- Rollout/fallback requirements:
- Runtime verification plan known before implementation:
- Runtime environment/fixtures currently available: yes / no / not_required

Unavailable runtime infrastructure blocks runtime verification and release, not
reversible implementation.

## Must Haves

### Truths

- Observable behavior:
- Non-regression and failure truths:

### Artifacts

| Path | Provides | Substantive check | Evidence required |
|---|---|---|---|

### Key Links

| From | To | Via | Focused verification |
|---|---|---|---|

## Acceptance Criteria

The number of scenarios below must equal `acceptance_scenario_count`.

### Scenarios

### Invariants

- The implementation honors locked decisions and does not choose architecture.
- Each product Key Link is wired, not merely represented by partial files.
- Required release evidence may remain blocked after implementation but cannot
  be reported as passed.

## Verification

- First focused test and exact command:
- Expected executed/passed/failed/skipped counts:
- Negative/edge cases:
- Reviewer focus:
- Runtime/browser evidence required before release:
- Verification levels: exists / substantive / wired / functional

## Checkpoint Warnings

- Warn after 30 minutes without a focused test; recommend interrupt-and-split,
  but do not interrupt for time alone.
- Multiple partial files without a wired Key Link are a sizing failure.
- At 50 percent observed context without completion, warn that a split/fresh
  worker is recommended.
- Ask the user to choose `continue_current` or `start_fresh`; do not choose for
  them. A continuation permits one more bounded cycle before warning again.

## Reporting

Report status, product and supporting files changed, focused test command and
result, wired Key Links, context/checkpoint warning state, deviations, and blockers.
Never return empty or a bare acknowledgment.
