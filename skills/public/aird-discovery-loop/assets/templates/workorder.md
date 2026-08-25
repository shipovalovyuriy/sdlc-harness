---
aird_workorder_schema_version: '4.0'
id: WO-00
kind: implementation
status: draft
wave: W1
surface: backend
work_class: product
runtime_profiles: [unit]
depends_on: []
risk_ids: []
gate_ids: []
dod_ids: []
allowed_write_paths: []
# Everything that locks the contract this slice changes: consumer tests,
# snapshots/goldens, fixtures, enum/schema/count locks, generated expectations.
# Found by one bounded search at drafting time, not by a delivery worker after
# the fact. Every path listed here must sit inside allowed_write_paths --
# `aird-validate.mjs` checks that. An explicit `[]` is a valid answer.
impact_radius: []
docs_to_read: []
# Only when a soft sizing limit is deliberately exceeded (>6 non-test write
# paths, >3 dod_ids, >10 negative cases): say why the slice cannot be cut.
# oversize_justification: ''
---

# Workorder Template

## Identity

- ID:
- Title:
- Recommended agent:
- Priority:
- Contract fields above are authoritative; do not repeat dependencies, wave,
  surface, runtime profiles, status, write paths, or docs-to-read here.

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

The worker starts from a fresh context and receives paths, never the parent
transcript. Spawn it with `fork_turns: "none"`.

- Exact workorder path to pass:
- Exact AIRD doc paths to pass:
- Exact code-review standards refs to pass:
- Extra context allowed:
- Extra context forbidden:

## Consumes

Every input this workorder needs that the repository does not already contain,
and who produces it. `Kind` is `file`, `artifact`, `config`, `data`, or `code`.
`Produced by` is a workorder ID (which must also appear in `depends_on`),
`exists-in-repo`, `release-binding`, or `none`. Write `None.` if there are no
such inputs — an empty section is treated as an unanswered question.

This is where two invisible failures get caught: an artifact everyone
references and nobody creates, and a file this workorder must edit to satisfy
its own acceptance criteria while a different workorder owns the write scope.

| Input | Kind | Produced by |
|---|---|---|

## Task Breakdown

Sizing rule: 1–3 atomic tasks forming one coherent, independently testable
ownership slice. Keep the smallest runnable behavior together; split only at a
real ownership, dependency, or integration seam. Soft limits, warned by the
validator and fatal under the `--strict` discovery run: 6 non-test write paths,
3 `dod_ids`, 10 negative cases. Exceed one only with `oversize_justification`.

1. 
2. 
3. 

## Scope

- Objective:
- Exact behavior delta:
- Allowed read paths:
- Allowed write paths: see authoritative frontmatter
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

## Shared Error And Public Wiring Pre-flight

Run one bounded repository search while drafting. Redirect raw matches to
package evidence and show only a count or `tail -N`.

- Error/public surface introduced or changed: <description | not applicable — reason>
- Shared service error renderer/mapper: <path + required scope outcome | not applicable — reason>
- Public route/export/registration root: <path + required scope outcome | not applicable — reason>
- Evidence command: <bounded rg/git grep command + evidence path>

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

Return exactly six one-line fields: `status`, `paths`, `commands` with exit
codes, `numbers` as an evidence-section pointer, `evidence`, and `blockers`.
Never add a table or seventh field. Detailed results and numeric values belong
in evidence, not in the chat response. A silent or vacuous result is a failure.

If this workorder does not fully determine the design, STOP: make no architectural decisions, implement nothing speculative, and report the gap as a blocker so the main session can route it back to `architect`/discovery.
