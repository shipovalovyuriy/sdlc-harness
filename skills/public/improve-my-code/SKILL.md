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
- Use `$code-review-standards`: always load `universal.md` and `structure-reuse-performance.md`; add stack-specific refs.
- Respect dirty worktrees. Never overwrite unrelated user changes. If unrelated changes touch the same files, inspect and work with them or stop with a blocker.
- Do not commit unless the user requested commit/autocommit or confirms commit mode.
- Use `supervisor` when more than 3 parallel workstreams are needed. Otherwise the main session coordinates.
- Stop instead of guessing when the safe scope, expected behavior, or verification path is unclear.

## Output Path

Write loop artifacts under:

```text
.agent/improve-my-code/<run-slug>/
```

Use `assets/run-state.md`, `assets/improvement-candidate.md`, and `assets/fix-workorder.md` when useful.

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

Run one or more scoped `explorer` agents first unless the user supplied exact files and exact improvements. Split by bounded areas: frontend, backend, data, tests, build/tooling, security-sensitive code.

Each scan agent must use `$code-review-standards` in Reviewer Mode and return improvement candidates, not patches:

- issue;
- evidence path/line;
- risk/severity;
- affected standard;
- behavior-preservation risk;
- suggested refactor;
- verification needed.

### 3. Select Batch

Build `improvement-backlog.md` from scan results. Select a small batch for implementation:

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
- selected `$code-review-standards` refs;
- allowed read/write paths;
- behavior-preservation requirement;
- required verification commands;
- instruction to edit directly and report changed files, reuse decisions, and blockers.

### 5. Integrate

After workers finish:

- inspect the diff;
- ensure changes stayed inside allowed scope;
- ensure behavior changes are intentional and documented;
- update `run-state.md`;
- create fix workorders for blockers.

### 6. Verify

Run verification after integration:

- formatter/lint/typecheck/build/tests relevant to touched code;
- focused tests for changed behavior;
- `reviewer` with `$code-review-standards` loaded;
- `qa` and browser verification for user-facing frontend changes;
- `cybersec` review for security-sensitive changes.

Treat missing evidence as blocked, not passed. Record commands, exit status, and evidence in `verification.md`.

### 7. Fix Loop

For each blocking finding:

1. Create a scoped fix workorder.
2. Assign the smallest appropriate worker.
3. Re-run focused checks.
4. Re-run reviewer/QA gates affected by the fix.

Run at most 3 verification cycles. If blockers remain after cycle 3, stop with remaining findings and recommended next step.

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
