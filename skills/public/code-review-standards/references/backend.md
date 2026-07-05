# Backend Standards

Use for services, APIs, repositories, jobs, workers, and data-processing code.

## Implementation Checks

- Keep source of truth and transaction boundaries explicit.
- Place code in the existing ownership layer: transport/controller for protocol, service/use-case for business rules, repository/store for persistence, adapter/client for external systems.
- Validate inputs at trust boundaries: HTTP, queues, cron payloads, files, DB rows from legacy tables, external APIs.
- Preserve idempotency for retries, webhooks, schedulers, and message consumers.
- Use timeouts, cancellation/context propagation, and bounded retries for network or database calls.
- Keep domain logic out of transport glue unless the local architecture intentionally co-locates it.
- Make error behavior observable and stable: status codes, error shapes, logs, metrics, and user-safe messages.
- Plan migrations with compatibility, backfill, rollback, and partial deployment in mind.
- Reuse existing validators, mappers, repositories, clients, transaction helpers, and error types when they match the domain.
- Avoid unbounded loops, N+1 queries, repeated external calls, and serial work that should be batched or parallelized safely.

## Review Checks

- Are authz checks server-side and near the protected operation?
- Are API contracts backward compatible or explicitly versioned?
- Are queries bounded, indexed, and safe from N+1 or unbounded scans where scale matters?
- Are concurrent writes, races, and duplicate requests handled?
- Do tests cover invalid input, permission failures, retries/idempotency, and migration edge cases?
- Did the change add a new abstraction where extending an existing service/helper would be clearer?
