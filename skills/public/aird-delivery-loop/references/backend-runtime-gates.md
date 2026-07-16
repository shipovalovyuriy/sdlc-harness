# Backend Runtime Gates

Use this protocol for backend services, APIs, persistence, migrations, jobs,
queues, external adapters, startup/configuration, and deployable artifacts.
Runtime evidence is fail-closed for release and completion; runtime environment
availability does not block reversible implementation.

## Gate Classification

| Surface | Required release evidence |
|---|---|
| Any backend/runtime change | Production-equivalent runtime integration plus business-flow smoke |
| Database/dialect/query | Real production database dialect; zero skipped checks |
| Schema/migration/backfill | Fresh install, previous-release upgrade with representative data, idempotent reopen, rollback or fix-forward assertion |
| HTTP/API/handler/contract | Live request through the mounted boundary plus negative path |
| Job/queue/consumer | Live enqueue/execute/observe path plus retry or failure path |
| Dockerfile/image/binary/startup/config/deployment | Build the shipped artifact, start it, wait for readiness, health check, startup-log scan |

Unit tests, mocks, static review, source inspection, and a mocked browser cannot
replace required runtime evidence.

## Implementation-Readiness Contract

Before implementation, record the verification plan:

- production dependency types, versions/dialects, and the one runtime boundary
  owned by each workorder;
- intended non-skipping test command and evidence location;
- required previous-release schema/data contract for migration work;
- intended artifact build/start/health contract when applicable;
- public boundary and primary/negative/regression smoke behavior.

The actual environment, credentials, disposable dependency startup, and fixture
files may remain unavailable. Record them under
`ready_for_runtime_verification: blocked` and continue reversible product
implementation when `ready_for_implementation: ready`.

Do not create a standalone runtime-evidence project or supporting AIRD package
to close this gap without explicit user approval and detour-budget capacity.

## Runtime-Verification Readiness

Before executing this protocol, require:

- `ready_for_runtime_verification: ready`;
- actual dependency startup and cleanup commands;
- credentials/runner/container/DSN as applicable;
- previous-release fixtures and representative data for migrations;
- writable evidence paths under the AIRD package.

If any input is unavailable, set runtime and release readiness to `blocked`,
preserve `status: implementation_complete` when implementation is done, and
stop verification. Do not report a pass or roll implementation readiness back.

## Execution Rules

1. Capture executed, passed, failed, and skipped counts. A required test without
   execution proof is skipped.
2. Exercise production-equivalent dependencies. Mocks may supplement but cannot
   satisfy the gate.
3. Protect migration history. Do not edit an applied migration; add a forward
   migration unless deployment history proves the old file was never applied.
4. Test an empty database and a separate previous-release schema/data upgrade,
   then reopen/re-run to prove idempotency.
5. Exercise the persisted lifecycle most likely to fail: retry/restart,
   create/delete/recreate, duplicate delivery, partial recovery, or compatibility.
6. Build and start the shipped image/binary/package when packaging, startup,
   config, health, or migrations can change.
7. Run browser E2E only after backend runtime passes; a mocked browser is not
   backend wiring evidence.

## Verdict And Evidence Contract

Valid required-gate verdicts are `pass`, `fail`, and `blocked-no-evidence`.
Never use residual-risk, evidence-debt, wired-but-skipped, static-parity, or
"should work" language as PASS.

Only the user may accept a waiver. A waiver keeps
`ready_for_release: blocked` and cannot produce `status: complete`.

Write `10-backend-verification.md` from
`assets/templates/backend-verification.md`. A release-ready result requires:

- `result: pass`;
- positive `required_checks` equal to `passed_checks`;
- `failed_checks: 0` and `skipped_checks: 0`;
- `runtime_integration: pass` and `business_flow_smoke: pass`;
- migration/API/artifact subtype results `pass` when applicable;
- a non-empty evidence file inside the AIRD package for every required result.
