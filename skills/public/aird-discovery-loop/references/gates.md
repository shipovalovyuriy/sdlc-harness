# Gate Taxonomy

Use gate types to make AIRD loop decisions predictable.

| Gate | Purpose | Failure behavior |
|---|---|---|
| Implementation readiness | Validate locked decisions, contracts, workorder sizing, write scopes, and focused test plans. | Block implementation only when reversible product work is not safely specified. Runtime environment/fixture availability is not part of this gate. |
| Runtime-verification readiness | Validate actual environment, credentials, dependencies, and fixtures. | Block runtime verification and release; do not roll back implementation readiness. |
| Release readiness | Validate every required gate and its evidence. | Block `ready_for_release` and `complete`. |
| Product-first | Keep the first wave on the smallest working public flow and enforce the supporting detour budget. | Block a second supporting workorder, a supporting share above 20%, or a separate supporting package without explicit user approval. |
| Schema lint | Deterministically validate workorder metadata, dependency graph, sizing, coverage, and mappings. | Fix schema/reference/cycle errors before human review; never ask a reviewer to compensate for machine-detectable defects. |
| Discussion | Lock a product/UX/API/data/rollout/quality decision before final artifacts. | Ask one decision at a time (`references/interview.md`); if unanswered, record the recommended default as an `unconfirmed` assumption (never fabricate a user decision). A specialization of escalation. |
| Prototype | Validate UX/business direction on a mock-data prototype before delivery. | Keep the prototype status `reviewing`; if unreviewed, record the direction as an `unconfirmed` assumption, do not mark `accepted`. A specialization of escalation. |
| Revision | Check produced output and route back with specific feedback. | Route back with feedback (open question in `00-discussion-log.md`, or a fix workorder in delivery); cap retries. |
| Escalation | Surface ambiguity or repeated failure to the user. | Pause with clear options and recommended default. |
| Abort | Stop when continuing would be unsafe or wasteful. | Preserve state, write `.continue-here.md`, and report why. |

Selection rule:

- Use implementation readiness before worker execution.
- Use runtime-verification readiness only before runtime evidence work.
- Use release readiness before `ready_for_release` or `complete`.
- Use product-first during plan review and before every supporting spawn.
- Run schema lint after each workorder packet and before shared-doc reconciliation; strict mode is mandatory for Workorder Frontmatter V3 packages.
- Use the discussion gate when user input would change scope, UX, API, data model, rollout risk, or quality gates.
- Use the prototype gate for user-facing work before finalizing TRD/workorders.
- Use revision after an artifact, plan, patch, or verification report is produced.
- Use escalation when automation lacks enough information or a revision loop stalls.
- Use abort when there is destructive risk, impossible prerequisites, or invalid state.

Discussion and prototype gates are recorded in `08-quality-gates.md` under escalation gates, and their open items live in `00-discussion-log.md`. Schema-lint output belongs in `codebase/` or the final readiness review; historical review artifacts must be marked superseded when a later revision replaces their workorder set. The discovery loop has no separate "discovery workorder" artifact: an unmet prerequisite becomes an open question in `00-discussion-log.md` plus a note in `STATE.md`. (Fix workorders are a delivery-loop concept and use the `aird-delivery-loop` skill's own `assets/templates/fix-workorder.md`.)
