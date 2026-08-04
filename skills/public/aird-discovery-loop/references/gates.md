# Gate Taxonomy

Use gate types to make AIRD loop decisions predictable.

| Gate | Purpose | Failure behavior |
|---|---|---|
| Implementation readiness | Validate locked decisions, contracts, workorder sizing, write scopes, and focused test plans. | Block implementation only when reversible product work is not safely specified. Runtime environment/fixture availability is not part of this gate. |
| Runtime-verification readiness | Validate actual environment, credentials, dependencies, and fixtures. | Block runtime verification and release; do not roll back implementation readiness. |
| Release readiness | Validate every required gate and its evidence. | Block `ready_for_release` and `complete`. |
| Product-first | Keep the first wave on the smallest working public flow, enforce the supporting detour budget, and require the accepted wave to name a user-observable outcome and a PRD persona rather than rely on a self-declared `work_class`. | Block a second supporting workorder, a supporting share above 20%, a wave with no declared outcome, or a separate supporting package without explicit user approval (`supporting_detour_approved` / `platform_slice_approved`). |
| Session checkpoint | Persist phase outcomes to disk so a fresh session can resume, and surface context/time/cycle drift. | Routine: write `STATE.md`, keep `checkpoint_kind: routine`, and continue automatically without asking the user anything. Hard boundary only (100% context, auto-compaction, external blocker, required user decision): write `.continue-here.md` and end the root task. See `references/delivery-contract.md`. |
| Deterministic validation | Machine-check workorder metadata, sizing (including the non-test write-path, DoD-count, and negative-case proxies), write scopes, dependency graph, consumed-input producer closure, risk/gate/DoD wiring across every document, Gate→DoD coverage, structured blockers, wave outcomes, and the detour budget. | Fix schema/reference/cycle errors before human review; never ask a reviewer to compensate for machine-detectable defects. |
| Existential probe | Prove a load-bearing external assumption by driving the real production path against the real boundary, before any design document exists. The claim is locked before the probe runs and names which boundaries were real and which were substituted. | `unproven` caps the package at one spike workorder owning its own wave; `refuted` returns to the discussion gate. A proxy request, a reachability check, a conditionally accepted assumption, or a claim narrowed after the fact to match a partial result does not close it. |
| Package integrity | One whole-package pass before `accept-wave`: reference integrity, producer closure for consumed inputs, vocabulary closure, ownership of stated runtime requirements, blocker reality. | New blocking `F-` findings. Runs once per package; closure reviews are too narrow to see systemic gaps by design, so this is the only place they surface. |
| Discussion | Lock a product/UX/API/data/rollout/quality decision before final artifacts. | Ask one decision at a time (`references/interview.md`); if unanswered, record the recommended default as an `unconfirmed` assumption (never fabricate a user decision). A specialization of escalation. |
| Prototype | Validate UX/business direction on a mock-data prototype before delivery. | Keep the prototype status `reviewing`; if unreviewed, record the direction as an `unconfirmed` assumption, do not mark `accepted`. A specialization of escalation. |
| Revision | Check produced output and route back with specific feedback. | Route back with feedback (open question in `00-discussion-log.md`, or a fix workorder in delivery); cap retries. |
| Escalation | Surface ambiguity or repeated failure to the user. | Pause with clear options and recommended default. |
| Abort | Stop when continuing would be unsafe or wasteful. | Preserve state, write `.continue-here.md`, and report why. |

Selection rule:

- Use implementation readiness before worker execution.
- Use runtime-verification readiness only before runtime evidence work.
- Use release readiness before `ready_for_release` or `complete`.
- Use product-first during plan review and before every supporting spawn; the budget (one supporting workorder, 20 percent, `work_class`, `supporting_detour_approved`) is defined in `references/delivery-contract.md`.
- Run deterministic validation after each workorder batch and before shared-doc reconciliation. During discovery it must run with `--strict`, otherwise pre-acceptance findings stay warnings and the package reports `PASS` while broken.
- Use the existential probe gate before phase 4, and again whenever a new load-bearing external assumption appears. It outranks every documentation gate: an unproven assumption blocks design, not the other way round.
- Run the package integrity gate exactly once, after finding closure and before `accept-wave`.
- Use the discussion gate when user input would change scope, UX, API, data model, rollout risk, or quality gates.
- Use the prototype gate for user-facing work before finalizing TRD/workorders.
- Use revision after an artifact, plan, patch, or verification report is produced.
- Use escalation when automation lacks enough information or a revision loop stalls.
- Use abort when there is destructive risk, impossible prerequisites, or invalid state.

Discussion and prototype gates are recorded in `08-quality-gates.md` under escalation gates, and their open items live in `00-discussion-log.md`. Validator output is derived data — read it, act on it, and do not copy its counts into prose; historical review artifacts must be marked superseded when a later revision replaces their workorder set. The discovery loop has no separate "discovery workorder" artifact: an unmet prerequisite becomes an open question in `00-discussion-log.md` plus a note in `STATE.md`. (Fix workorders are a delivery-loop concept and use the `aird-delivery-loop` skill's own `assets/templates/fix-workorder.md`.)
