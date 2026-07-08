# Fix Workorder Template

## Finding

- Source gate:
- Severity:
- Affected DoD item:
- Original workorder:
- Relevant AIRD docs:
- Code standards to load (`$code-review-standards` references):
- Contract/DoD deviation:
- Evidence:

## Subagent Context Package

- Spawn with `fork_context=false` (required when assigning a role `agent_type`; `fork_context=true` is incompatible with `agent_type`):
- Do not pass parent transcript:
- Exact fix workorder path to pass:
- Exact AIRD doc paths to pass:
- Exact code-review standards refs to pass:
- Extra context allowed:
- Extra context forbidden:

## Task Breakdown

Sizing rule: 1–3 atomic tasks max; a fix workorder is the smallest change that resolves the finding, in one fresh worker context. If the fix is bigger than that, it is not a fix — split it or route back to discovery.

1. 

## Fix Scope

- Recommended agent:
- Allowed read paths:
- Allowed write paths:
- Allowed commands:
- Expected behavior:
- Out of scope:

## Verification

- Focused checks:
- Standards focus: project structure / function design / reuse / duplication / optimization / language conventions
- Full gates to re-run:
- Verification levels: exists / substantive / wired / functional
- Evidence attached (fail-closed — no vacuous pass): test output / command exit / screenshot / API response / diff
- Issue count before fix:
- Issue count after fix:

## Reporting

Report changed files, tests run, and whether the original finding is resolved. Never return empty; if blocked, report the blocker and reason explicitly — a silent or vacuous result is treated as a failure, not a fix.
