---
aird_state_version: '4.0'
# discovery_profile is required by aird-validate.mjs: lite | standard | deep
discovery_profile: standard
package_class: product
# status: discovery | ready_for_delivery | in_delivery | implementation_complete | verifying | ready_for_release | complete | paused
status: discovery
# The three readiness fields are independent; see references/delivery-contract.md
ready_for_implementation: blocked
ready_for_runtime_verification: blocked
ready_for_release: blocked
# set true only on explicit user approval of a product-first detour
supporting_detour_approved: false
# set true only when the user explicitly accepts a wave whose outcome is a
# platform slice (internal API/tool surface) rather than a user-observable one
platform_slice_approved: false
active_phase: intake
active_wave: none
checkpoint_kind: routine
next_action: draft-intake
updated_at: ''
# Blockers are contract data, not prose. `blockers: []` is a valid answer and an
# explicit one. Any entry with needs_user_decision: true must go through the
# discussion gate before status: ready_for_delivery, and no blocker may name a
# wave that is being accepted.
blockers: []
#  - id: B-01
#    statement: the console repository has no reviewable git baseline
#    blocks: [W2]
#    owner: user
#    needs_user_decision: true
#    resolved: false
---

# AIRD State

Status values describe workflow position only. `ready_for_delivery` means at
least one wave is accepted in `REVIEW-MANIFEST.json`; it does not claim every
later workorder is ready. Run `aird-validate.mjs` for derived readiness and
counts.

## Current Position

- Feature:
- Discovery profile: lite / standard / deep
- Status:
- Active phase:
- Active wave:
- Last activity:
- Next action:

## Artifact Progress

Track every `NN-*.md` the package produces here, including delivery evidence —
`aird-validate.mjs` warns about any numbered artifact on disk that this table
does not list.

| Artifact | Status | Notes |
|---|---|---|
| codemap.md | conditional | non-trivial changes; skip only for tiny known-file edits |
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
| 10-ui-verification.md | conditional | delivery evidence; user-facing changes only |
| 10-backend-verification.md | conditional | delivery evidence; backend runtime changes only |

## Wave Position

- Earliest accepted wave: derived from `REVIEW-MANIFEST.json`
- Current execution wave:
- Later draft waves:

## Delivery Evidence

- `10-ui-verification.md`: produced during delivery for user-facing changes.
- `10-backend-verification.md`: produced during delivery for backend runtime changes.

Both are delivery outputs; keep their rows `conditional` until delivery writes them.

## Product-First Position

- Package class: product / supporting
- First wave supporting workorders: 0 (limit 1 without approval)
- Supporting share of first wave: 0% (limit 20% without approval)
- Detour approval: none / user-approved on <date> because <reason>
- Accepted wave outcome: see `09-dod.md` `wave_outcomes` (user-observable
  outcome + PRD persona), or record `platform_slice_approved: true` above with
  the user's decision and reason in Decisions.

## Readiness Checks

- Target-base freshness: derived by `aird-validate.mjs`
- Accepted wave hashes: derived by `aird-validate.mjs`
- Documentation depth: pending / pass / blocked
- Medium/high risks have mitigation owners and evidence gates: pending / pass / blocked
- Earliest wave is executable without parent chat: pending / pass / blocked
- Whole-package integrity pass: pending / pass / blocked
- Non-functional targets stated (deep profile): pending / pass / n/a

## Decisions

- 

## Blockers

Authoritative list is the `blockers:` frontmatter above. Use this section only
for context a reviewer needs beyond the structured fields.

## Resume

- Required reading:
- Exact next action:
