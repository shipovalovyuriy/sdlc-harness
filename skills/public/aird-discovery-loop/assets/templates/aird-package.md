# AIRD Package Template

Use this template as the target artifact set under `.agent/aird/<feature-slug>/`.

Write the human-readable content of every generated artifact in clear Russian.
Use Russian headings where they are not machine-parsed. Preserve exact
filenames, frontmatter/schema keys, required validator headings, source
identifiers, commands, and third-party names; explain every necessary
abbreviation or borrowed term in Russian on first use.

## Root Files

- `STATE.md` - living status, active phase, blockers, next action.
- `REVIEW-MANIFEST.json` - generated target-base provenance, accepted waves,
  and accepted workorder hashes. Never hand-edit readiness mirrors elsewhere.
- `.continue-here.md` - transient resume note when paused or blocked.
- `DISCOVERY-SUMMARY.md` - detailed Russian-language explanation of the full
  operating sequence, component interactions, architectural decisions,
  implementation order, verification, risks, and delivery-readiness verdict.
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
- Evidence needed before delivery:

## 00-discussion-log.md

- Discussion status:
- Questions asked:
- Options considered:
- Risk-driven questions and mitigations:
- Architectural decisions (placement, data, contracts, failure, security, rollout, tradeoffs):
- Decisions locked:
- Risk mitigations locked:
- Rationale:
- Alternatives rejected:
- Deferred ideas:
- Must not constraints:
- Remaining open questions:
- Assumptions still unconfirmed:

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
- Evidence from user/repo:
- Delivery implications:

## 02-ux-problem-framing.md

- Primary flow:
- Entry points:
- Happy path:
- Empty/loading/error states:
- Edge cases:
- Accessibility and responsiveness:
- Trust and comprehension risks:
- Alternatives rejected:
- Acceptance signals:

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
- Prototype/QA evidence required:

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

Opens with the machine-read existential contract. List every assumption that is
outside your control, shape-changing if false, and cheaply falsifiable — and
probe it in phase 3.5 before any design document exists.

```yaml
---
existential_risks:
  - id: R-01
    claim: <the external fact the design depends on>
    claim_locked_at: ''       # set before the probe runs; never edited afterwards
    real_boundaries: []       # boundaries the probe actually drove
    faked_boundaries: []      # anything substituted; [] asserts nothing was
    status: unproven          # unproven | proven | refuted
    probe: evidence/r-01-<slug>.log
---
```

The claim is fixed before the probe runs; afterwards it may change only to
`refuted`. Narrowing it to describe the part that happened to work is not
proving it — record that as `unproven` with the proven part in `claim`. A
`proven` risk with a non-empty `faked_boundaries` is a contradiction and is
rejected.

| Risk | Category | Severity | Confidence | Discussion decision / assumption | Mitigation | Evidence gate / cheapest test | Decision rule | Affects |
|---|---|---:|---:|---|---|---|---|---|

Every medium/high risk must name the decision, mitigation owner or workorder, and evidence gate that closes it. Leave the package unready while a medium/high risk has no closure path. Keep the `Affects` column precise — it is the blast radius used for a scoped correction if the assumption is later disproved.

## 04-trd.md

- Architecture summary:
- Current state:
- Current-state evidence (paths/endpoints/tables/commands/runtime observations):
- Proposed state:
- Boundaries:
- Data flow:
- Interfaces and contracts:
- Sequence/control flow:
- Dependencies:
- Failure modes and concurrency/idempotency:
- Rollout and fallback:
- Observability:
- Non-functional targets (scale, latency/performance budget, cost) — required
  for a `deep` package; write the numbers, do not reference them:
- Compatibility:
- Alternatives rejected:
- Assumptions and open technical questions:

## 05-api-contracts.md

- Endpoint/event:
- Request:
- Response:
- Errors:
- Auth/permissions:
- Compatibility:
- Tests:
- Backward/forward compatibility notes:
- Observability/audit signals:

## 06-data-models.md

- Entities:
- Fields:
- Relationships:
- Migrations:
- Backfill:
- Invariants:
- Retention/privacy:
- Rollback/fallback:
- Data correctness gates:

## 07-implementation-plan.md

- Value-producing waves and their outcomes:
- Workorder IDs by wave (frontmatter remains authoritative):
- Dependency intent (workorder frontmatter remains authoritative):
- Integration points:
- Rollback:
- Order constraints:
- Evidence each milestone must produce:
- Progressive discovery trigger after the current implementation budget:

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
- Documentation depth check:

### Gate -> DoD Mapping

Every DoD item must be covered by at least one gate; every gate must point to the DoD item it protects.

| Gate | Protects DoD item | Verification level |
|---|---|---|

## 09-dod.md

Opens with the per-wave outcome contract. This is what makes the product-first
gate about who observes the wave rather than about a self-declared `work_class`.
The persona must be one `01-prd.md` defines.

```yaml
---
wave_outcomes:
  - wave: W1
    user_observable_outcome: <what a named person can now do that they could not before>
    persona: <persona from 01-prd.md>
---
```

A wave whose honest outcome is an internal API or tool surface is a platform
slice: take it to the user as one question and record
`platform_slice_approved: true` in `STATE.md`.

- Functional:
- Technical:
- UX:
- Tests:
- Observability:
- Docs:
- Release:
- Ready-for-delivery evidence:
