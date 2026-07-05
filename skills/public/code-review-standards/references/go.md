# Go Standards

## Checks

- Keep names, package boundaries, and exported comments idiomatic for the surrounding code.
- Return errors explicitly and wrap with useful context where local style supports it.
- Do not ignore errors unless deliberately safe and locally conventional.
- Use `context.Context` for request-scoped cancellation/timeouts across I/O boundaries.
- Keep interfaces small; accept interfaces where useful, return concrete types unless the project pattern says otherwise.
- Avoid goroutine leaks: define cancellation, channel ownership, and close behavior.
- Protect shared state with clear synchronization; run race-sensitive tests when relevant.
- Prefer table tests for variants and edge cases where the project uses them.

## Sources

- Effective Go: https://go.dev/doc/effective_go
- Go Code Review Comments: https://go.dev/wiki/CodeReviewComments

