# Verification Gate Routing

Use these routes when `08-quality-gates.md` does not specify a stronger project rule.

See `references/gates.md` for the gate taxonomy (pre-flight / revision / escalation / abort). The table below lists required gate types by change category; it does not imply that every gate runs after every workorder. Use the delivery skill's Review Scheduling Policy: reviewer and QA normally run once after an integrated batch, while workers run targeted tests after their own work. Run per-workorder reviewer only for high-risk/security/data/API/shared-core boundaries or explicit AIRD requirements.

| Change type | Required gates |
|---|---|
| Backend/API/data | targeted tests per worker; mandatory production-equivalent runtime integration and business-flow smoke with zero skips; reviewer and QA integration checks at batch end unless high-risk |
| Frontend behavior | tests/build per worker; reviewer, QA, and browser verification at batch end unless high-risk |
| Visual/UI/UX | browser verification, usability check (qa + `usability-tester` skill), QA |
| Auth/permissions/secrets | tests, per-workorder reviewer when scoped, cybersec, QA negative paths |
| Migration/schema | fresh install plus previous-release upgrade with representative data, immutable-history check, idempotent reopen, rollback/fix-forward check, mandatory per-workorder reviewer |
| Docs-only | docs review and link/render check when applicable |

Browser verification and the usability check are run by `qa` with the `verify-on-browser`/`playwright` or `usability-tester` skill loaded — none of these is a standalone agent. Prefer one browser/usability pass after the UI batch is runnable; run earlier only for a prototype or flow decision that would block downstream work. Blocking findings must become scoped fix workorders (`assets/templates/fix-workorder.md`).

Backend runtime verification follows `references/backend-runtime-gates.md` and
is complete before browser verification. Enter it only after implementation,
when `ready_for_runtime_verification: ready`. Missing runtime access keeps
release blocked but does not invalidate completed reversible implementation. A
required test that exits 0 while skipped is still `blocked-no-evidence`.

For implementation gates, do not accept file existence alone. Check whether each relevant artifact exists, is substantive, is wired into the system, and works functionally through tests, browser checks, QA, or user-visible evidence.
