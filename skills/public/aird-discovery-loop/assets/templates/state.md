---
aird_state_version: '1.0'
# status: discovery | ready_for_delivery | in_delivery | complete | paused
status: discovery
active_phase: intake
next_action: draft-intake
updated_at: ''
progress:
  # artifacts_total counts every row in the Artifact Progress table (required + conditional + optional).
  # artifacts_required is the baseline for non-UI work (8); for user-facing work add the 3 conditional 02-* rows.
  artifacts_total: 13
  artifacts_required: 8
  artifacts_complete: 0
  workorders_total: 0
  workorders_ready: 0
---

# AIRD State

Status values: `discovery` (in discovery), `ready_for_delivery` (all exit criteria met), `in_delivery` (delivery loop running), `complete` (DoD passed), `paused` (blocked; see `.continue-here.md`).

## Current Position

- Feature:
- Status:
- Active phase:
- Last activity:
- Next action:

## Artifact Progress

| Artifact | Status | Notes |
|---|---|---|
| 00-intake.md | pending | |
| 00-discussion-log.md | pending | |
| 01-prd.md | pending | |
| 02-ux-problem-framing.md | conditional | user-facing changes only |
| 02-ui-spec.md | conditional | user-facing changes only |
| 02-ui-prototype.md | conditional | user-facing changes only |
| 03-risk-register.md | pending | |
| 04-trd.md | pending | |
| 05-api-contracts.md | optional | |
| 06-data-models.md | optional | |
| 07-implementation-plan.md | pending | |
| 08-quality-gates.md | pending | |
| 09-dod.md | pending | |

## Workorders

- Ready:
- Blocked:
- Deferred:

## Delivery Evidence

- `10-ui-verification.md`: produced during delivery for user-facing changes; not counted in discovery artifact progress.

## Decisions

- 

## Blockers

- None.

## Resume

- Required reading:
- Exact next action:
