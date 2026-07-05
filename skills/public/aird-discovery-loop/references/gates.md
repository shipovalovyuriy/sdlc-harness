# Gate Taxonomy

Use gate types to make AIRD loop decisions predictable.

| Gate | Purpose | Failure behavior |
|---|---|---|
| Pre-flight | Validate prerequisites before starting work. | Block entry; ask for missing input, or record the gap as an open question in `00-discussion-log.md` and `STATE.md`. |
| Discussion | Lock a product/UX/API/data/rollout/quality decision before final artifacts. | Ask one decision at a time (`references/interview.md`); if unanswered, record the recommended default as an `unconfirmed` assumption (never fabricate a user decision). A specialization of escalation. |
| Prototype | Validate UX/business direction on a mock-data prototype before delivery. | Keep the prototype status `reviewing`; if unreviewed, record the direction as an `unconfirmed` assumption, do not mark `accepted`. A specialization of escalation. |
| Revision | Check produced output and route back with specific feedback. | Route back with feedback (open question in `00-discussion-log.md`, or a fix workorder in delivery); cap retries. |
| Escalation | Surface ambiguity or repeated failure to the user. | Pause with clear options and recommended default. |
| Abort | Stop when continuing would be unsafe or wasteful. | Preserve state, write `.continue-here.md`, and report why. |

Selection rule:

- Use pre-flight before discovery, planning, or worker execution.
- Use the discussion gate when user input would change scope, UX, API, data model, rollout risk, or quality gates.
- Use the prototype gate for user-facing work before finalizing TRD/workorders.
- Use revision after an artifact, plan, patch, or verification report is produced.
- Use escalation when automation lacks enough information or a revision loop stalls.
- Use abort when there is destructive risk, impossible prerequisites, or invalid state.

Discussion and prototype gates are recorded in `08-quality-gates.md` under escalation gates, and their open items live in `00-discussion-log.md`. The discovery loop has no separate "discovery workorder" artifact: an unmet prerequisite becomes an open question in `00-discussion-log.md` plus a note in `STATE.md`. (Fix workorders are a delivery-loop concept and use the `aird-delivery-loop` skill's own `assets/templates/fix-workorder.md`.)
