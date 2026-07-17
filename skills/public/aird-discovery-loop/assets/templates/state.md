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
  # warn_only; context/time warnings never auto-stop or auto-start a chat.
  checkpoint_mode: warn_only
  active_workorder: none
  worker_started_at: ''
  first_focused_test_at: ''
  worker_minutes_without_focused_test: 0
  public_flow_wired: false
  # unavailable | observed | estimated
  context_measurement: unavailable
  context_used_percent: 0
  session_started_at: ''
  session_elapsed_minutes: 0
  aird_cycles_since_user_choice: 0
  workorders_completed_since_user_choice: 0
  last_warning_elapsed_minutes: 0
  last_warning_context_percent: 0
  checkpoint_warning_active: false
  checkpoint_warning_reasons: []
  # none | continue_current | start_fresh
  checkpoint_recommendation: none
  # not_requested | continue_current | start_fresh
  user_checkpoint_decision: not_requested
  user_checkpoint_decided_at: ''
warning_policy:
  context_warn_percent: 60
  session_warn_minutes: 45
  repeat_elapsed_minutes: 30
  repeat_context_percent: 10
  aird_cycles_warn: 2
  completed_workorders_warn: 2
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

## Checkpoint Warnings

- Mode: warn_only
- Active workorder:
- Worker start time:
- First focused test time:
- Worker minutes without focused test:
- Public flow wired: yes / no, with Key Link evidence
- Context measurement: unavailable / observed / estimated
- Context used percent, when observable:
- Session elapsed minutes:
- AIRD workflow cycles since user's last checkpoint choice:
- Workorders completed since user's last checkpoint choice:
- Warning active: yes / no
- Warning reasons:
- Recommendation: continue_current / start_fresh
- User decision: not_requested / continue_current / start_fresh
- User decision time:

Warn at 60 percent observed/estimated context, 45 elapsed minutes (then every
additional 30), two AIRD workflow cycles, two completed workorders, or 30 worker
minutes without a focused test. If context is unavailable, use the monotonic
time/cycle/workorder signals. Auto-compaction does not reset them.

A warning never interrupts work or starts a new chat automatically. Finish the
current safe atomic step and ask the user. On `continue_current`, reset the
since-choice counters and record the warning buckets; on `start_fresh`, write
`.continue-here.md` and let the user open or resume the new chat. Multiple
partial files without a wired Key Link remain a separate sizing failure.

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
