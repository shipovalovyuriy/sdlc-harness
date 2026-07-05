# API Design Standards

Use when endpoints, events, schemas, or public module contracts change.

## Contract Checks

- Keep request/response shapes explicit and documented in AIRD `05-api-contracts.md` when present.
- Preserve backward compatibility unless the workorder explicitly allows a breaking change.
- Make error shape, status code, and retry semantics stable.
- Validate and sanitize inputs at the boundary.
- Define pagination, sorting, filtering, and limits for list endpoints.
- Keep IDs, timestamps, money, enums, and nullable fields consistent with project conventions.
- Avoid leaking internal errors, stack traces, secrets, or implementation-only fields.
- For events/webhooks, define idempotency keys, ordering assumptions, retries, and signature/authorization behavior.

## Review Questions

- Can old clients still call this safely?
- Are optional/null/default fields handled consistently?
- Does the server enforce what the UI hides?
- Is there a contract test or integration test for the changed shape?
- Are migrations and API rollout order compatible?

