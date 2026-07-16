---
aird_state_version: '2.0'
# product | supporting
package_class: product
# Required true for a separate supporting AIRD package.
supporting_package_user_approved: false
# lite | standard | deep
discovery_profile: standard
# discovery | ready_for_delivery | in_delivery | implementation_complete |
# verifying | ready_for_release | complete | paused
status: discovery
active_phase: intake
next_action: draft-intake
updated_at: ''
readiness:
  # blocked | ready
  ready_for_implementation: blocked
  # blocked | ready | not_required
  ready_for_runtime_verification: blocked
  # blocked | ready
  ready_for_release: blocked
workorder_schema:
  version: '3.0'
  strict: true
progress:
  artifacts_total: 13
  artifacts_required: 8
  artifacts_complete: 0
  workorders_total: 0
  workorders_ready: 0
  workorders_in_progress: 0
  workorders_done: 0
value_flow:
  product_implementation_started: false
  product_files_changed: 0
  # pending | in_progress | functional
  first_vertical_slice: pending
  supporting_wip: 0
  supporting_workorders_used: 0
  supporting_delivery_percent: 0
  cycles_without_user_value: 0
  minutes_without_user_value: 0
detour_budget:
  small_supporting_workorders_limit: 1
  supporting_delivery_percent_limit: 20
  user_approved_overrun: false
watchdog:
  active_workorder: none
  worker_started_at: ''
  first_focused_test_at: ''
  public_flow_wired: false
  context_used_percent: 0
quality:
  documentation_depth: pending
  medium_high_risks_have_gates: pending
---

# AIRD State

Use `references/profiles-and-schema.md` as the canonical contract. Update this
file after every phase, worker checkpoint, and integrated wave.

## Current Position

- Feature:
- Package class: product / supporting
- Discovery profile: lite / standard / deep
- Status:
- Active phase:
- Last activity:
- Next action:

## Readiness

- Ready for implementation: blocked / ready
- Implementation blockers:
- Ready for runtime verification: blocked / ready / not_required
- Runtime environment or fixture blockers:
- Ready for release: blocked / ready
- Release gate blockers:

Runtime environment or fixture blockers do not belong under implementation
blockers unless they also leave the product contract or reversible design
undefined.

## Value Flow

- Product implementation started: yes / no
- Product files changed: count and paths
- First vertical slice: pending / in_progress / functional
- Supporting WIP: count and workorder IDs
- Supporting workorders used:
- Supporting delivery percent:
- Cycles without user value:
- Minutes without user value:
- Last user-value evidence:

Product files implement the primary domain or user flow. AIRD documents,
tooling, fixtures, evidence logs, and standalone runtime harnesses are
supporting work.

## Detour Budget

- One-small-workorder limit exceeded: yes / no
- Twenty-percent limit exceeded: yes / no
- User-approved overrun: yes / no, with decision-log pointer
- Separate supporting package approved: yes / no, with user decision pointer

If either detour limit is exceeded without approval, set `status: paused` and do
not spawn more supporting work.

## Worker Watchdog

- Active workorder:
- Worker start time:
- First focused test time:
- Public flow wired: yes / no, with Key Link evidence
- Context used percent:
- Watchdog verdict: continue / stop-and-split

Stop and split when no focused test exists after 30 minutes, several partial
files exist without a wired public flow, or half the worker context is consumed
without a complete workorder.

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

- Schema mode: strict v3 / legacy-compatible
- Review packets:
- Execution waves:
- Ready:
- In progress:
- Done:
- Blocked:
- Deferred:

## Delivery Evidence

- `10-backend-verification.md`: required before release for backend/runtime changes.
- `10-ui-verification.md`: required before release for user-facing changes.

## Readiness Checks

- Documentation depth: pending / pass / blocked
- Medium/high risks have mitigation owners and evidence gates: pending / pass / blocked
- Workorders pass deterministic and semantic sizing: pending / pass / blocked
- First wave advances the first vertical slice: pending / pass / blocked

## Decisions

- 

## Blockers

- None.

## Resume

- Required reading:
- Exact next action:
