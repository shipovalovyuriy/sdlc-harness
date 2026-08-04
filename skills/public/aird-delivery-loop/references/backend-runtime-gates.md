# Backend Runtime Gates

Use this protocol when V4 workorder frontmatter has `surface` among `backend`,
`data`, `infra`, or `mixed` and selects a runtime profile among `service`,
`database`, `migration`, `api`, `job`, `artifact`, or `external`. Never infer
this classification from arbitrary workorder prose.

## Gate Classification

Classify these as `required` whenever the corresponding surface changes:

| Surface | Required gate |
|---|---|
| Any backend/runtime change | production-equivalent runtime integration plus business-flow smoke |
| Database/dialect/query change | real production database dialect; zero skipped checks |
| Schema/migration/backfill change | fresh install, previous-release upgrade with representative data, idempotent reopen, rollback or fix-forward assertion |
| HTTP/API/handler/contract change | live request through the mounted runtime boundary plus negative path |
| Job/queue/consumer change | live enqueue/execute/observe path plus retry or failure path |
| Dockerfile/image/binary/startup/config/deployment change | build the shipped artifact, start it, wait for readiness, health check, startup-log scan |

A required gate cannot be replaced by unit tests, mocks, static review, source inspection, or a browser pointed at a mocked backend.

## Pre-flight Contract

Before implementation, record:

- exact production dependency types and versions/dialects;
- disposable dependency startup command and cleanup owner;
- exact non-skipping test command;
- previous shipped revision/schema used by upgrade tests;
- representative pre-upgrade data and affected lifecycle scenario;
- deployable artifact build/start/health commands when applicable;
- public runtime boundary and primary/negative/regression smoke steps;
- evidence log paths under the AIRD package `evidence/` directory.

The runtime type, intended commands, public boundary, and evidence locations
must be designed before implementation. Actual credentials, disposable
environment, previous-release fixture, or runner availability may remain
`blocked-no-evidence` while reversible implementation proceeds. They block the
verification phase, release readiness, and `status: complete`—not an accepted
implementation wave. Stop implementation only when the missing dependency is
needed to implement safely (for example, migration history cannot be resolved)
or the workorder explicitly requires live probing as part of its code change.

## Execution Rules

1. **Count actual execution.** Capture executed, passed, failed, and skipped counts. For runners that return exit 0 when tests skip, parse verbose/JSON/JUnit output or invoke required named tests individually. A required test with no execution proof is skipped.
2. **Use production-equivalent dependencies.** Exercise the real database dialect/protocol and changed external boundaries. In-memory substitutes and mocks may supplement but cannot satisfy this gate.
3. **Protect migration history.** Compare touched migration files with the delivery base. Treat edits to already-shipped migrations as blocking drift unless deployment history proves they were never applied. Add a new forward migration for shipped-state changes.
4. **Test both database starting states.** Apply all migrations to an empty database, then separately restore or construct the last shipped schema/data and apply only the upgrade. Reopen/re-run migrations to prove idempotency.
5. **Reproduce the lifecycle, not only the function.** Exercise the persisted-state sequence most likely to fail after upgrade, such as create/delete/recreate, retry/restart, partial failure/recovery, duplicate delivery, or old-client/new-server compatibility.
6. **Run what ships.** Build and start the real image/binary/package when the change can affect packaging, module resolution, startup, config, health, or migrations. Source tests do not prove the artifact starts.
7. **Keep browser last.** Browser E2E may add confidence after backend runtime PASS, but it cannot be the first exercise of backend wiring or persisted-state behavior.

## Verdict Rules

Valid final required-gate verdicts are only `pass`, `fail`, and `blocked-no-evidence`.

Never use any of these as PASS:

- `PASS with residual risk`;
- `evidence debt`;
- `wired-but-skipped`;
- `static parity only`;
- `should work in production`;
- exit code 0 with required checks skipped or not discovered.

Only the user may accept a waiver. Record it as a waiver, keep `STATE.md` at `paused`, and keep the release verdict `NO-GO`; do not mark the workorder, wave, DoD, or delivery complete.

## Evidence Contract

Write `10-backend-verification.md` from `assets/templates/backend-verification.md`. Store every referenced log under the package directory and ensure:

- `result: pass`;
- `required_checks` is positive and equals `passed_checks`;
- `failed_checks: 0`;
- `skipped_checks: 0`;
- `runtime_integration: pass`;
- `business_flow_smoke: pass`;
- migration/API/artifact subtype results are `pass` when the corresponding surface changed;
- every required result has a non-empty evidence file that exists on disk.
