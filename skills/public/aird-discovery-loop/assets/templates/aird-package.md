# AIRD Package Template

Use this template as the target artifact set under `.agent/aird/<feature-slug>/`.

## Root Files

- `STATE.md` - living status, active phase, blockers, next action.
- `.continue-here.md` - transient resume note when paused or blocked.
- `codemap.md` - hierarchical map of the change-relevant code; agents work from it (non-trivial changes).
- `codebase/` - optional deeper current-state map for broad or unfamiliar codebases.
- `prototype/` - optional UI mock stand for user-facing work.
- `10-ui-verification.md` - delivery browser/usability evidence for user-facing changes.

Optional codebase map:

- `codebase/architecture.md`
- `codebase/stack.md`
- `codebase/structure.md`
- `codebase/testing.md`
- `codebase/concerns.md`

## 00-intake.md

- Request:
- Goal:
- Target users/workflows:
- Current pain or opportunity:
- Constraints:
- Non-goals:
- Known surfaces:
- Initial success criteria:
- Open questions:

## 00-discussion-log.md

- Discussion status:
- Questions asked:
- Options considered:
- Risk-driven questions and mitigations:
- Architectural decisions (placement, data, contracts, failure, security, rollout, tradeoffs):
- Decisions locked:
- Risk mitigations locked:
- Rationale:
- Deferred ideas:
- Must not constraints:
- Remaining open questions:

## 01-prd.md

- Problem:
- Users:
- Jobs to be done:
- Desired outcome:
- Scope:
- Non-goals:
- User stories:
- Acceptance criteria:
- Metrics or observable signals:

## 02-ux-problem-framing.md

- Primary flow:
- Entry points:
- Happy path:
- Empty/loading/error states:
- Edge cases:
- Accessibility and responsiveness:
- Trust and comprehension risks:

## 02-ui-spec.md

- Surface:
- Primary user task:
- Layout intent:
- Information hierarchy:
- Components and controls:
- Interaction states:
- Empty/loading/error/success states:
- Responsive behavior:
- Accessibility expectations:
- Visual constraints:
- Browser/usability verification notes:

## 02-ui-prototype.md

- Prototype status:
- Prototype path or URL:
- Mock data:
- States covered:
- Business questions tested:
- UX questions tested:
- User feedback:
- Accepted direction:
- Changes required before delivery:
- Delivery handoff notes:

## 03-risk-register.md

| Risk | Category | Severity | Confidence | Discussion decision / assumption | Mitigation | Evidence gate / cheapest test | Decision rule | Affects |
|---|---|---:|---:|---|---|---|---|---|

## 04-trd.md

- Architecture summary:
- Current state:
- Proposed state:
- Boundaries:
- Data flow:
- Dependencies:
- Rollout and fallback:
- Observability:
- Compatibility:

## 05-api-contracts.md

- Endpoint/event:
- Request:
- Response:
- Errors:
- Auth/permissions:
- Compatibility:
- Tests:

## 06-data-models.md

- Entities:
- Fields:
- Relationships:
- Migrations:
- Backfill:
- Invariants:
- Retention/privacy:

## 07-implementation-plan.md

- Milestones:
- Workorders:
- Dependencies:
- Integration points:
- Rollback:

## 08-quality-gates.md

- Pre-flight gates:
- Revision gates:
- Escalation gates:
- Abort gates:
- Unit tests:
- Integration tests:
- Typecheck/lint/build:
- Browser verification:
- QA scenarios:
- Usability checks:
- Security checks:

### Gate -> DoD Mapping

Every DoD item must be covered by at least one gate; every gate must point to the DoD item it protects.

| Gate | Protects DoD item | Verification level |
|---|---|---|

## 09-dod.md

- Functional:
- Technical:
- UX:
- Tests:
- Observability:
- Docs:
- Release:
