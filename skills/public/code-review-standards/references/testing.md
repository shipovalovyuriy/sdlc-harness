# Testing Standards

## What Good Tests Prove

- The requested behavior works.
- The old bug or missing behavior would fail before the change when practical.
- Negative paths are covered: invalid input, missing permissions, not found, conflicts, empty data, and external failures.
- Integration points are wired, not only unit-stubbed.
- Migrations, API contracts, and UI states have evidence when affected.

## Test Smells

- Tests assert implementation details while missing user-visible or contract behavior.
- Tests only check that a function was called, not the result that matters.
- Mocks duplicate the implementation and make false positives likely.
- Snapshot changes are accepted without explaining the behavioral change.
- Async tests pass without awaiting the actual work.
- Tests depend on ordering, time, network, or shared state without control.

## Worker Rule

If a required test cannot be run, report the exact command, failure/blocker, and the remaining evidence owed. Do not mark the gate passed.

