# Universal Review Standards

Use for every implementation and review.

## Review Priorities

1. Correctness: the code implements the requested behavior, handles invalid paths, preserves contracts, and avoids regressions.
2. Safety: no data loss, privilege bypass, secret exposure, injection, unsafe concurrency, or unchecked external input.
3. Integration: the change is wired into routes, handlers, DI, schemas, migrations, feature flags, and build/test config.
4. Tests: tests prove the important behavior, negative paths, and risks from the workorder/DoD.
5. Maintainability: names, boundaries, dependencies, and abstractions match the project and reduce future risk.
6. Operability: logging, errors, metrics, rollout, rollback, and migration behavior are clear where relevant.
7. Structure and reuse: code lives in the right layer, reuses fitting local primitives, and avoids harmful duplication.
8. Performance: the change does not add obvious unbounded work, avoidable repeated I/O, render churn, or scalability regression.

## Evidence Rules

- Prefer exact file/line references.
- Tie every blocking finding to an observable risk.
- Distinguish bugs from preferences.
- Do not require broad refactors unrelated to the workorder.
- Do not accept placeholder code, dead wiring, fake tests, or "looks good" without evidence.
- If a check cannot run, record why and what evidence is still owed.

## Severity

- P0: data loss, security break, production outage, build cannot run.
- P1: likely correctness regression, broken contract, migration risk, missing critical verification.
- P2: maintainability or edge-case risk that should be fixed before merge if practical.
- P3: non-blocking cleanup, naming, documentation, or future improvement.

## Implementation Baseline

- Keep edits inside allowed paths.
- Match existing architecture before introducing a new pattern.
- Check existing functions/types/components/services before adding new ones.
- Keep functions cohesive and side effects visible.
- Use real dependencies requested by the user; do not fake a named library/tool.
- Prefer explicit error handling and typed/validated boundaries.
- Make tests fail for the old behavior or meaningfully prove the new behavior.
- Remove only code made obsolete by the current change.
