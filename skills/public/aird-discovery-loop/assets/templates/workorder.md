# Workorder Template

## Identity

- ID:
- Title:
- Recommended agent:
- Priority:
- Depends on:

## Context

- AIRD docs to read:
- Code standards to load (`$code-review-standards` references):
- Discussion decisions to honor:
- Risk mitigations to implement or preserve:
- UI spec to honor:
- UI prototype path or URL to match:
- Mock scenarios to preserve in tests/fixtures:
- Relevant files or directories:
- Current behavior:
- Current-state evidence:
- Rejected alternatives to avoid re-opening:
- Assumptions this workorder may rely on:

## Subagent Context Package

- Spawn with `fork_context=false` (required when assigning a role `agent_type`; `fork_context=true` is incompatible with `agent_type`):
- Do not pass parent transcript:
- Exact workorder path to pass:
- Exact AIRD doc paths to pass:
- Exact code-review standards refs to pass:
- Extra context allowed:
- Extra context forbidden:

## Task Breakdown

Sizing rule: 1–3 atomic tasks, each one coherent edit unit (~one commit); the whole workorder must fit a fresh worker context in one sitting. If it does not fit, split into sequenced workorders instead of growing this list.

1. 
2. 
3. 

## Scope

- Objective:
- Exact behavior delta:
- Allowed read paths:
- Allowed write paths:
- Out of scope:
- Decisions the worker must not make:
- Stop-and-report conditions:

## Contracts

- API/event contracts:
- Data model constraints:
- Risk mitigation constraints:
- UX states:
- UI spec constraints:
- Prototype acceptance notes:
- Compatibility requirements:
- Observability/audit requirements:
- Rollout/fallback requirements:

## Must Haves

### Truths

- Observable behavior:
- Non-regression truths:
- Failure/edge-case truths:

### Artifacts

| Path | Provides | Substantive check | Evidence required |
|---|---|---|---|

### Key Links

| From | To | Via | Verification |
|---|---|---|---|

## Acceptance Criteria

- 
- The implementation honors the listed decisions and does not re-decide architecture.
- Each medium/high linked risk has passing evidence or an explicit blocker.
- All changed contracts, data paths, and user-visible behavior are covered by verification.

## Verification

- Commands:
- Browser/QA steps:
- Reviewer focus:
- Standards focus: project structure / function design / reuse / duplication / optimization / language conventions
- Evidence required to pass (fail-closed — no vacuous pass): test output / command exit / screenshot / API response / diff
- Negative/edge cases:
- Rollback/fallback check:
- Observability/audit check:
- Verification levels: exists / substantive / wired / functional
  - exists: file/endpoint/component/migration/test is present.
  - substantive: real implementation, not a placeholder or stub.
  - wired: connected to the rest of the system (imported, routed, called, applied).
  - functional: works when exercised (tests, browser flow, QA scenario, user-visible behavior).

## Reporting

Report changed files, tests run, deviations from AIRD, and blockers. Never return empty or a bare "done": if you produced nothing or were blocked, say so explicitly with the reason — a silent or vacuous result is treated as a failure.

If this workorder does not fully determine the design, STOP: make no architectural decisions, implement nothing speculative, and report the gap as a blocker so the main session can route it back to `architect`/discovery.
