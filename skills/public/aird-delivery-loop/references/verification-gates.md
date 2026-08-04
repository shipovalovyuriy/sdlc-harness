# Verification Gate Routing

Use these routes when `08-quality-gates.md` does not specify a stronger project
rule. Route by Workorder Frontmatter V4 `surface` and `runtime_profiles`; prose
keywords and filenames are not classifiers.

See `references/gates.md` for the gate taxonomy (pre-flight / revision /
escalation / abort). The table below lists required gate types by change
category; it does not imply that every gate runs after every workorder. Use the
delivery skill's Review Scheduling Policy: reviewer and QA run once after an
integrated wave, while workers run targeted tests after their own work. Never
run a per-workorder reviewer. Stronger project gates may add test, runtime,
security, or QA depth at the wave boundary, but do not change review cadence.

| Change type | Required gates |
|---|---|
| Backend/API/data | targeted tests per worker; mandatory production-equivalent runtime integration and business-flow smoke with zero skips; reviewer and QA integration checks at the wave boundary |
| Frontend behavior | tests/build per worker; reviewer, QA, and browser verification at the wave boundary |
| Visual/UI/UX | browser verification, usability check (see routing below), QA |
| Auth/permissions/secrets | tests; cybersec, reviewer, and QA negative paths at the wave boundary |
| Migration/schema | fresh install plus previous-release upgrade with representative data, immutable-history check, idempotent reopen, rollback/fix-forward check, reviewer at the wave boundary |
| Docs-only | docs review and link/render check when applicable |

Browser verification and the usability check are skills, not standalone agents. Browser verification runs inside `qa` with `verify-on-browser`/`playwright` loaded. The usability check routes by target: a **web UI** is walked by the same `qa` subagent through those same browser skills, while a **desktop/native target** needs the `usability-tester` skill, which drives Computer Use — `qa` has no Computer Use tools, so it cannot run that path and the check must come from a context that does. If neither route is available, the gate is `blocked-no-evidence` with the missing capability named; it is never silently skipped or assumed passed. Prefer one browser/usability pass after the UI batch is runnable; run earlier only for a prototype or flow decision that would block downstream work. Blocking findings must become scoped fix workorders (`assets/templates/fix-workorder.md`).

Route browser verification only from completed accepted frontend/mixed
workorder frontmatter with the `browser` runtime profile. The presence of UI
specification/prototype documents alone does not make a backend-only wave a
frontend change.

Backend runtime verification follows `references/backend-runtime-gates.md` and
is complete before browser verification. Runtime-environment unavailability
blocks verification/release, not reversible implementation. A required test
that exits 0 while skipped is still `blocked-no-evidence`.

For implementation gates, do not accept file existence alone. Check whether each relevant artifact exists, is substantive, is wired into the system, and works functionally through tests, browser checks, QA, or user-visible evidence.
