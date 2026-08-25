# Gate Taxonomy

Use gate types to make delivery decisions predictable.

| Gate | Purpose | Failure behavior |
|---|---|---|
| Implementation readiness | Validate `ready_for_implementation`, V4 sizing, product-first order, write scopes, and verification plans before implementation starts. Before any worker spawn, also prove one of the two spawn justifications: actual parallelism between large, dependency-ready slices with disjoint write sets, or orchestrator context at/above 60% with substantive work left. Readiness fields and statuses are defined in `../aird-discovery-loop/references/delivery-contract.md`. | Block implementation only for an unsafe or underspecified product contract. Missing runtime access/fixtures blocks later verification, not this gate. With neither justification met, the work routes to the orchestrator instead of blocking. |
| Runtime-verification readiness | Validate actual environment, credentials, dependencies, and fixtures before runtime gates. | Preserve implementation completion; block runtime verification and release. |
| Product-first / detour | Keep the first wave on the product slice and supporting work inside one small workorder / 20 percent, routed by `work_class`, with the accepted wave naming a user-observable outcome and a PRD persona. | Block the supporting spawn or package until explicit user approval recorded as `supporting_detour_approved: true`, or `platform_slice_approved: true` for a wave whose outcome is an internal API/tool surface. Enforced by `aird-validate.mjs`; the budget is defined in `../aird-discovery-loop/references/delivery-contract.md`. |
| Release readiness | Validate all required evidence before completion. | Keep `ready_for_release: blocked` and prevent `complete`. |
| Session checkpoint | Persist progress and surface context/time/cycle degradation. | Routine: record and continue automatically. Hard boundary: checkpoint and end the root task; request a fresh task only when the product cannot restart it automatically. Never create a chat or interrupt a healthy routine slice. |
| Revision | Check integrated wave/final review, tests, QA, browser, and usability results. | Batch findings from that pass into scoped fix workorders; run one restricted closure after the finding group is author-complete. |
| Escalation | Surface ambiguity, stalled revision loops, or conflicting findings to the user. | Pause with clear options and recommended default. |
| Abort | Stop when continuing would be unsafe, destructive, or meaningless. | Preserve state, write `.continue-here.md` (`assets/templates/continue-here.md`), and report why. |

Selection rule:

- Use implementation readiness before product implementation, and apply the
  two-justification spawn rule (actual parallelism, or 60% orchestrator context
  with substantive work left) before every implementation-worker spawn.
- Use product-first/detour before every supporting spawn or package creation.
- Use runtime-verification readiness before backend/browser runtime gates.
- Use release readiness before `ready_for_release` or `complete`.
- Use revision after an integrated wave/final verification pass produces
  findings. Individual worker patches receive author checks, not an automatic
  reviewer or full revision cycle.
- Use escalation when the blocking issue count does not decrease or the user must decide.
- Use abort for invalid state, unsafe commands, destructive risk, or broken prerequisites.
