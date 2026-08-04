---
name: improve-my-code
description: Explicit loop for improving an existing codebase through standards-backed scan, scoped refactor, verification, reviewer feedback, fix iterations, and optional commit. Use only when the user explicitly invokes $improve-my-code or asks to improve/refactor/clean up a codebase with verification. Uses explorer, code-review-standards, workers, reviewer, QA/browser checks when relevant, and a bounded fix loop.
---

# Improve My Code

Run this as the main-session orchestration skill for codebase quality improvement. It is not a feature-delivery loop; it improves existing code while preserving behavior unless the user explicitly asks for a behavior change.

Explicit invocation counts as a request for delegation and parallel agent work. Use independent agents for scan, refactor, review, and QA, but keep the main session responsible for scope, integration, verification, and commit decisions.

## Operating Rules

- Preserve behavior by default.
- Prefer small, high-confidence improvements over broad rewrites.
- Use `$code-review-standards`: load only the specific reference files needed — always `references/universal.md` and `references/structure-reuse-performance.md`, plus stack-specific refs. Do not load the full skill or unrelated refs. Workers usually do not need standards at all — the workorder should already state what to change and how.
- Respect dirty worktrees. Never overwrite unrelated user changes. If unrelated changes touch the same files, inspect and work with them or stop with a blocker.
- Do not commit unless the user requested commit/autocommit or confirms commit mode.
- Use `supervisor` when more than 3 parallel workstreams are needed. Otherwise the main session coordinates.
- Stop instead of guessing when the safe scope, expected behavior, or verification path is unclear.

## Output Path

Write loop artifacts under:

```text
.agent/improve-my-code/<run-slug>/
```

`run-state.md` (from `assets/run-state.md`) is required for every run. Use `assets/improvement-candidate.md` and `assets/fix-workorder.md` when useful. Update `run-state.md` incrementally — edit the changed sections, do not regenerate the whole file.

## Loop

### 1. Intake And Safety

Create `run-state.md` with:

- repo/root path;
- branch and git status summary;
- requested scope;
- non-goals;
- commit mode: `off` unless explicitly requested;
- verification commands known or missing;
- user changes to protect.

If the request is "whole repo" or vague, scan broadly but refactor only a small selected batch. Do not silently rewrite the whole codebase.

Use batch limits unless the user gives a tighter scope:

- default implementation batch: 1-3 related candidates;
- default parallel workers: 3 or fewer;
- default file scope: touched area only, not repo-wide formatting.

### 2. Scan

Run a single scoped `explorer` agent by default, unless the user supplied exact files and exact improvements (then skip the scan). Split into multiple scan agents only when the user explicitly asked for broad coverage or the repo is genuinely large — and never more than 3, with disjoint areas (e.g. frontend / backend+data / tests+tooling). Scanning is the most expensive phase and only 1-3 candidates get implemented per batch — keep it proportional.

Each scan agent must use `$code-review-standards` in Reviewer Mode and return improvement candidates, not patches. Cap output at the 10 highest-value candidates per agent; evidence is path/line plus one sentence, no code quoting. Per candidate:

- issue;
- evidence path/line;
- risk/severity;
- affected standard;
- behavior-preservation risk;
- suggested refactor;
- verification needed.

### 3. Select Batch

Build `improvement-backlog.md` (a plain ranked list, one line per candidate) from scan results. If multiple scan agents ran, deduplicate by file/line first — overlapping areas produce duplicate candidates. Select a small batch for implementation:

- prefer P1/P2 correctness, maintainability, duplication, structure, test, and low-risk performance improvements;
- skip style-only issues handled by formatter/linter;
- avoid mixing unrelated refactors in one batch;
- keep write sets disjoint when parallelizing.

If the batch changes public behavior, API contracts, migrations, or broad architecture, stop and recommend `$aird-discovery-loop` instead.

Ask the user before implementing when the selected batch is broad, high-risk, or mostly subjective cleanup. Proceed without asking only for clearly behavior-preserving, localized improvements with a reliable verification path.

### 4. Refactor

Create one `workorders/*.md` per independent improvement. Assign:

- `frontend-worker` for frontend/UI code;
- `backend-worker` for backend/API/data/service code;
- `worker` for tests/tooling/small mixed changes;
- `debugger` first when the improvement depends on understanding a bug/regression;
- `cybersec` for security-sensitive improvements.

Pass each worker:

- one workorder;
- specific `$code-review-standards` ref files only if the workorder genuinely needs them (usually it does not);
- allowed read/write paths;
- behavior-preservation requirement;
- required verification commands;
- instruction to edit directly and report back briefly: changed files, reuse decisions, and blockers — no diff dumps or long narratives.

### 5. Integrate

After workers finish:

- inspect the diff;
- ensure changes stayed inside allowed scope;
- ensure behavior changes are intentional and documented;
- update `run-state.md`;
- create fix workorders for blockers.

### 6. Verify

Run verification after integration:

- formatter/lint/typecheck/build/tests relevant to touched code — always;
- focused tests for changed behavior;
- `reviewer` (with the same standards refs) only for batches with real risk: logic changes, shared/core code, or anything with non-trivial behavior-preservation risk. Skip it for mechanical, localized refactors already covered by lint/typecheck/tests;
- `qa` and browser verification only for user-facing frontend changes;
- `cybersec` review only for security-sensitive changes.

Treat missing evidence as blocked, not passed. Record commands, exit status, and evidence in `verification.md`.

### 7. Fix Loop

For each blocking finding:

1. Create a scoped fix workorder.
2. Assign the smallest appropriate worker.
3. Re-run focused checks.
4. Re-run only the gate that raised the finding — not the full gate set.

A verification cycle = one integration pass plus its gates (step 6 is cycle 1). Run at most 3 cycles. If blockers remain after cycle 3, stop with remaining findings and recommended next step.

### 8. Commit Gate

Commit only when:

- commit mode is on because the user asked for it or confirmed it;
- git status has only intended changes or unrelated changes are explicitly excluded;
- verification gates passed or deferred blockers are explicitly accepted;
- the final diff is scoped and explainable.

Use a concise commit message describing the improvement batch. If commit mode is off, leave changes uncommitted and report the exact verification result.

## Final Response

Summarize:

- scope scanned and candidates selected;
- agents used;
- files changed;
- standards refs used;
- verification commands and results;
- reviewer/QA findings and fix-loop result;
- commit hash if committed, otherwise that changes are uncommitted;
- remaining risks or deferred candidates.
