---
id: F-NNNN
class: correctness       # fixed vocabulary from process-metrics.md
root_cause: code         # code | workorder | intent
closed: false
---

# Fix Workorder Template

The frontmatter is machine-read by `aird-metrics.mjs`; without it the run's
`findings.by_class` and `findings.by_root_cause` are `null` and the
improvement phase is blind. `root_cause` names where the defect was born:
`code` (the workorder was sufficient, the implementation deviated),
`workorder` (the accepted workorder/DoD/gate was silent or wrong on this
point), `intent` (the user's request itself did not settle it).

Store as `fix-workorders/F-NNNN.md`, never under discovery's immutable
`workorders/` directory. The finding ID is monotonic and is never reused.

## Finding

- Finding ID:
- Source gate:
- Severity:
- Affected DoD item:
- Original workorder:
- Relevant AIRD docs:
- Code standards to load (`$code-review-standards` references):
- Contract/DoD deviation:
- Evidence:

## Executor Context Package

The orchestrator is the default executor, for mechanical and non-mechanical
fixes alike. Choose `fresh-worker` only under one of the two spawn
justifications: this group is a large independent slice running concurrently
with another dependency-ready slice, or the orchestrator is at/above 60%
context with substantive work left. A production-behavior, security, contract,
or specialist-judgment fix raises review depth, not routing. Pass paths, never
the parent transcript, and spawn with `fork_turns: "none"`.

- Execution mode (`orchestrator-local` / `fresh-worker`):
- Spawn justification (`parallelism` / `context-headroom` / n/a):
- Selected role `agent_type` (fresh-worker only):
- Exact fix workorder path to pass:
- Exact AIRD doc paths to pass:
- Exact code-review standards refs to pass:
- Extra context allowed:
- Extra context forbidden:

## Task Breakdown

Sizing rule: 1–3 atomic tasks max; a fix workorder is the smallest change that resolves the finding in one bounded executor context. If it is bigger, split it or route back to discovery.

1. 

## Fix Scope

- Recommended executor / role:
- Allowed read paths:
- Allowed write paths:
- Allowed commands:
- Expected behavior:
- Out of scope:

## Verification

- Focused checks:
- Gate criticality: required / optional
- Production-equivalent runtime dependencies and startup command:
- Required-check accounting: executed / passed / failed / skipped (required skips block PASS)
- Migration change: no / yes — if yes, fresh install + previous-release upgrade + idempotency + rollback/fix-forward evidence:
- API/job/queue change: no / yes — if yes, live public-boundary smoke evidence:
- Deployable runtime change: no / yes — if yes, shipped artifact build/start/health evidence:
- Persisted business-flow/regression sequence:
- Standards focus: project structure / function design / reuse / duplication / optimization / language conventions
- Full gates to re-run:
- Verification levels: exists / substantive / wired / functional
- Evidence attached (fail-closed — no vacuous pass): test output / command exit / screenshot / API response / diff
- Issue count before fix:
- Issue count after fix:

## Reporting

Return exactly six one-line fields: `status`, `paths`, `commands` with exit
codes, `numbers` as an evidence-section pointer, `evidence`, and `blockers`.
Never add a table or seventh field. Detailed results and numeric values belong
in evidence. A silent or vacuous result is a failure, not a fix.
