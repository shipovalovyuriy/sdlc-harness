# Verification Gate Routing

Use these routes when `08-quality-gates.md` does not specify a stronger project rule.

See `references/gates.md` for the gate taxonomy (pre-flight / revision / escalation / abort). Every row in the table below is a revision gate: it runs after output is produced and loops blocking findings into a scoped fix workorder with bounded retries.

| Change type | Required gates |
|---|---|
| Backend/API/data | tests, reviewer, QA integration checks |
| Frontend behavior | tests/build, reviewer, QA, browser verification |
| Visual/UI/UX | browser verification, usability check (qa + `usability-tester` skill), QA |
| Auth/permissions/secrets | tests, reviewer, cybersec, QA negative paths |
| Migration/schema | migration tests or dry run, reviewer, rollback check |
| Docs-only | docs review and link/render check when applicable |

Browser verification and the usability check are run by `qa` with the `verify-on-browser`/`playwright` or `usability-tester` skill loaded — none of these is a standalone agent. Blocking findings must become scoped fix workorders (`assets/templates/fix-workorder.md`).

For implementation gates, do not accept file existence alone. Check whether each relevant artifact exists, is substantive, is wired into the system, and works functionally through tests, browser checks, QA, or user-visible evidence.
