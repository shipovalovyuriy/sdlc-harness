---
result: pending
blocked_reason: none
required_checks: 0
passed_checks: 0
failed_checks: 0
skipped_checks: 0
runtime_integration: pending
runtime_integration_evidence: evidence/backend-runtime.log
business_flow_smoke: pending
business_flow_smoke_evidence: evidence/backend-business-flow.log
migration_upgrade: not_required
migration_upgrade_evidence: not_required
api_smoke: not_required
api_smoke_evidence: not_required
artifact_smoke: not_required
artifact_smoke_evidence: not_required
---

# Backend Verification

Final fail-closed runtime evidence for backend/API/data/migration/deployable-service changes. Do not set `result: pass` while any required check failed, skipped, was not discovered, or could not run.

## Runtime Profile

- Production dependency types/dialects and versions:
- Disposable environment startup command:
- Cleanup owner/status:
- Delivery base / previous shipped revision:
- Public runtime boundary exercised:
- Deployable artifact tested:

## Required Check Accounting

`required_checks` counts named assertions/tests/gates that must execute. `passed_checks` must equal it. A runner exit code is evidence only when discovery/execution counts prove the required checks actually ran.

| Gate | Required | Exact command / request | Executed | Passed | Failed | Skipped | Result | Evidence path |
|---|---|---|---:|---:|---:|---:|---|---|
| Production-equivalent runtime integration | yes | | | | | | | |
| Persisted business-flow/regression smoke | yes | | | | | | | |
| Fresh schema install | when migrations change | | | | | | | |
| Previous-release schema/data upgrade | when migrations change | | | | | | | |
| Migration idempotency + rollback/fix-forward | when migrations change | | | | | | | |
| Live API/job/queue contract smoke | when contract changes | | | | | | | |
| Shipped artifact build/start/health | when deployable runtime changes | | | | | | | |

## Migration Evidence

- Historical migration immutability check:
- Fresh-install result:
- Previous-release fixture/source:
- Upgrade result:
- Representative pre-upgrade data:
- Idempotent reopen result:
- Rollback or fix-forward result:

## Business-Flow Smoke

- Primary persisted-state flow:
- Negative/failure flow:
- Regression/lifecycle sequence:
- Runtime observations or responses:
- Database/queue/job postconditions:

## Artifact And Startup Smoke

- Build result:
- Start/readiness result:
- Health result:
- Startup log scan:

## Waivers

Required-gate waivers cannot produce PASS. If the user explicitly accepts one, record it here, set `STATE.md` to `paused`, and keep release `NO-GO`.
