---
name: aird-delivery-loop
description: "Explicit ARiD/AIRD delivery loop for implementing an existing AIRD package through independent execution and verification subagents. Use only when the user explicitly invokes $aird-delivery-loop, says AIRD/ARiD delivery, or asks to execute workorders from an existing AIRD package. Prioritizes the first product slice, limits supporting detours, blocks oversized workers before spawn, allows reversible implementation before runtime fixtures are available, and keeps runtime evidence fail-closed for release and completion."
---

# AIRD Delivery Loop

## Operating Model: Context Is Disposable, Disk Is Memory

Run this as the main-session orchestration skill. The main session reads the AIRD package once, builds a compact delivery brief, spawns fresh-context workers per workorder, integrates, verifies per wave, and loops defects back into scoped fix workorders.

The core rule that keeps token spend sane: **no long-lived all-remembering orchestrator.** Everything durable lives in files (`STATE.md`, `.continue-here.md`, workorders, evidence files); the orchestrator context is a disposable working buffer. A fresh session must always be able to continue from `STATE.md` alone.

- **Checkpoint, don't compact.** After pre-flight, after each integrated wave, and after each verification gate, write the durable outcome into `STATE.md`. When the main context passes ~80% of the window, or before starting a new wave with a heavy tail of tool output behind you, write `.continue-here.md` (from `assets/templates/continue-here.md`) and continue in a fresh session from it. Hitting auto-compaction means the checkpoint was late. Never rely on compaction to carry state.
- **Workers always start fresh.** A worker gets its workorder file, the named AIRD doc paths, and standards refs — never the parent transcript. One workorder = one fresh worker context, one coherent commit-sized change.
- **The orchestrator never holds raw bulk.** Full logs, screenshots, and file contents live on disk; the orchestrator holds verdicts, counts, and paths.

Explicit invocation of this skill counts as an explicit request for delegation and parallel agent work: its spawning instructions have priority over the general no-delegation rule in `AGENTS.md`. Do not ask the user for permission before each spawn.

Use `supervisor` only when delivery requires more than 3 workers/agents running in parallel at the same time. Otherwise the main session drives waves directly, with each parallel batch at 3 or fewer agents (including verification agents).

Use `references/gates.md` for gate behavior, `references/revision-loop.md` for bounded defect loops, `references/verification-patterns.md` for real-implementation checks, and `references/backend-runtime-gates.md` whenever a wave touches backend/API/data/migrations/jobs/queues/deployable service artifacts. Use the discovery skill's `references/profiles-and-schema.md` as the canonical readiness, product-first, detour, and Workorder V3 contract. Set `status: in_delivery` only when `ready_for_implementation: ready`.

Do not begin delivery without an implementation-ready package. The minimum to start is `STATE.md` with `ready_for_implementation: ready`, sized `workorders/*.md`, `08-quality-gates.md`, and `09-dod.md`. If the user supplies an equivalent brief, normalize it into that lightweight package before spawning. If the minimum is missing or vague, stop and recommend `$aird-discovery-loop`; the user's explicit acceptance is still required before opening a new AIRD package.

## Required Inputs

The AIRD package is read **once**, at pre-flight — and **not by the orchestrator**. Spawn a single pre-flight reader subagent (fresh context, discarded after) that reads the package and returns: the delivery brief below, the Workorder Sizing Gate verdict per workorder, and any pre-flight gaps. The orchestrator itself opens at most `STATE.md` and the validator output; full docs entering the main context become permanent replay weight in every subsequent request. Later steps re-open only the named section they actually need — never the package.

Hard requirement: `workorders/*.md`, `08-quality-gates.md`, `09-dod.md`, `STATE.md`. Read when present: `00-intake.md`, `00-discussion-log.md`, `01-prd.md`, `02-ux-problem-framing.md` / `02-ui-spec.md` / `02-ui-prototype.md` (user-facing work), `03-risk-register.md`, `04-trd.md`, `05-api-contracts.md`, `06-data-models.md`, `07-implementation-plan.md`, `codemap.md`.

**Delivery brief** (the orchestrator's only working memory; keep it under a page):

- workorder order, waves, and dependencies;
- locked decisions and risk gates that constrain implementation;
- allowed paths per workorder;
- exact gate commands (test/lint/build/deploy-check) from `08-quality-gates.md`;
- DoD items and which gate proves each.
- every gate's criticality: `required` or `optional`; required gates cannot be self-deferred by an agent;
- backend runtime profile: production dependency types/dialects, previous-release upgrade source, deployable artifact command, health/API/business-flow smoke commands.
- first vertical slice, work class per workorder, detour counters, and worker watchdog state.

## Context Budget Hard Rules

These are blocking rules:

1. Batch related checks and cap recursive listings.
2. Write long command output to logs; return exit, counts, tail, and path once.
3. Keep screenshots on disk; only disposable QA contexts open pixels.
4. Require worker/verifier summaries with status, paths, commands, evidence, and blockers; results over 40 lines belong in files.
5. Read AIRD sources once and carry a one-page brief forward.
6. Run full gates per integrated wave, not after every micro-edit.
7. At 80 percent orchestrator context, write `STATE.md` and `.continue-here.md`, then continue fresh.

For small or low-risk diffs, choose the narrowest gate set allowed by `08-quality-gates.md` and `references/verification-gates.md`: targeted tests plus one focused reviewer/QA pass at batch end. Narrowing may reduce scope, but it may never replace a required production-dialect/runtime, migration-upgrade, deployable-artifact, or API/business-flow gate with unit tests or static review. Do not run browser/usability/security/docs gates unless the change type or AIRD gates require them.

## Product-First And Detour Gate

Before the first vertical slice is functional, schedule the smallest product
workorders that wire its public flow. Do not prioritize a runtime harness,
tooling project, generalized evidence framework, or other supporting work over
that slice unless it is the one small enabling workorder inside the detour
budget.

Before every supporting spawn, read `STATE.md`. Stop and request explicit user
approval when supporting work would exceed one small workorder or 20 percent of
delivery effort. Stop before creating any separate supporting AIRD package
unless the user explicitly approved that package. Update product file count,
supporting WIP, delivery percentage, and time/cycles without user value at every
checkpoint.

## Workorder Sizing Gate

A workorder is executable only if Workorder Frontmatter V3 passes strict lint
and one fresh worker can complete it without degradation. Reject it before
spawn when it has:

- more than one runtime boundary;
- Kubernetes, database, SCM, and registry responsibilities together;
- more than 8 implementation acceptance scenarios;
- build, start, health, live, rollback, and cleanup together;
- more than 3 atomic tasks, more than one ownership/write seam, whole-package
  reading, or an honest estimate above half a fresh context.

An oversized workorder is a blocking pre-flight gap with no high-risk exception.
Do not spawn it. Route it to discovery for 2+ sequenced workorders with disjoint
write sets and update `STATE.md` before execution.

## Independence Rules

- Spawn one worker per independent workorder; group independent workorders into **waves** (parallel where write sets and dependencies do not collide, sequential otherwise).
- Spawn workers with `fork_turns: none` or `fork_turns: "1"`. Put the working
  role in the task name and message, and pass only the workorder path, named
  AIRD doc paths, and standards refs.
- Keep write sets disjoint. If two workorders need the same file, sequence them or create an integration workorder.
- A worker must not choose architecture. If the brief is insufficient, the worker STOPs and reports a blocker; the main session routes it back to `architect`/discovery.
- Workers report changed files, tests run, contract deviations, and blockers.
- No empty or vacuous results. A worker or verification agent must never return blank or a bare acknowledgment. If it cannot access what it needs or cannot reach a verdict, it returns an explicit blocker; an empty result is a blocking failure, not a pass. A `reviewer`/`qa` gate that cannot read files or reach a verdict returns a blocking REVISE with the reason, never an implicit pass.

## Worker Watchdog

The orchestrator owns wall-clock and context enforcement; do not rely on the
worker to notice its own overrun. Record worker start and checkpoint state in
`STATE.md`.

- If no focused test has run within 30 minutes, interrupt the worker, preserve
  its diff, mark `sizing failure`, and split the workorder.
- If several partial files exist but no declared product Key Link is wired,
  stop immediately as a sizing failure.
- If the worker reaches about 50 percent of its context without completing the
  workorder, stop and split before compaction.
- After a watchdog stop, do not continue the same workorder or issue unlimited
  follow-ups. Create smaller sequenced workorders and use fresh workers.

## Execution Phase

### 1. Pre-flight And Waves

Delegate package reading to one pre-flight reader subagent (see Required Inputs). It builds the execution map — workorder id, recommended agent, allowed write paths, dependencies, required gates for its wave (from `08-quality-gates.md`, fallback `references/verification-gates.md`), standards refs to load, `must_haves`, risk level — and returns it with the delivery brief. The orchestrator receives roughly one page of text, not the package.

Run pre-flight gates before spawning anything:

- minimum package exists and is readable; equivalent briefs are normalized first;
- `STATE.md` has `ready_for_implementation: ready`;
- **Workorder Sizing Gate passes for every workorder** (see above);
- the first runnable wave advances the named first product slice;
- supporting work is inside the detour budget or has explicit user approval;
- write sets are disjoint or explicitly sequenced;
- each workorder has verifiable `must_haves` (content quality, not filename presence).
- every quality gate is classified `required` or `optional`; if a gate protects a DoD item, production contract, migration, persistence boundary, or deployable runtime, classify it `required`;
- every backend/API/data/migration workorder names the required runtime boundary,
  production dependency type/dialect, and intended non-skipping verification
  command. Missing actual infrastructure or fixtures sets
  `ready_for_runtime_verification: blocked`; it does not block reversible
  implementation;
- migration workorders identify the required fresh-install and previous-release
  fixture contracts. Actual fixture availability is checked before runtime
  verification. Editing an already-shipped migration remains an implementation
  blocker unless the package proves it was never applied;
- API or deployable-service workorders define the intended artifact
  build/start/health and live smoke contract where applicable. The commands may
  remain unexecuted until runtime verification;
- when `02-ui-prototype.md` exists, treat it and every declared prototype
  artifact as an implementation source of truth. Block pre-flight unless each
  UI implementation and final browser/usability workorder names them in
  frontmatter `docs_to_read` and verifies prototype interactions, responsive
  composition, and intentional deviations.

Run the deterministic state check and treat a non-zero exit as a blocking gap:

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/public/aird-delivery-loop/assets/scripts/aird-validate.mjs" ".agent/aird/<feature-slug>"
```

It checks package structure plus machine-readable UI/backend evidence invariants; it does not judge behavioral correctness. Run it in addition to reviewer/QA/runtime gates, not instead of them.

Group workorders into waves. Record the wave plan in `STATE.md`, then write the delivery brief. From this point the brief, not the package, is the working memory.

### 2. Spawn Implementation Agents

Label the bounded task by scope: `backend-worker`
(backend/APIs/services/data/migrations), `frontend-worker` (UI behavior),
`worker` (small mixed/tooling), `debugger` (bug isolation), or `cybersec`
(auth/secrets/permissions/sensitive data/external callbacks). These are task
labels and prompt responsibilities, not special spawn parameters.

Use `$code-review-standards` with a hard context cap:

- a worker loads **at most 3 refs**, a reviewer **at most 4** — only those matching the languages/surfaces actually present in its workorder or diff;
- load `universal.md`, `structure-reuse-performance.md` for non-trivial work,
  and only the one relevant stack/specialty ref;
- never load both frontend and backend stacks into one agent — if a workorder genuinely spans both, that is a sizing failure: split it.

Per worker, pass: one workorder path; named AIRD doc paths; selected standards
refs; work class and vertical slice; locked decisions/risk gates; allowed scope;
the first focused test; and the Worker Watchdog stop conditions. Require direct
edits, targeted tests, wired Key Link evidence, and a summary with pointers.
Keep prompts compact.

### 3. Integrate (per wave)

After a wave finishes: inspect the diff; resolve conflicts; ensure no changes
escaped allowed scope; update AIRD deviations; mark workorders `done`; and
update `STATE.md` readiness, product file count, first-slice state, supporting
WIP/share, cycles/minutes without user value, blockers, and next action. Create
scoped follow-up workorders only inside the sizing and detour rules. This is a
checkpoint; if context is past ~80%, write `.continue-here.md` and continue
fresh before verification.

### Review Scheduling Policy

Default to one reviewer per integrated wave plus one final reviewer. Use a
per-workorder reviewer only for a named trigger:

- auth, permissions, secrets, PII, or tenant isolation;
- irreversible migration, schema, or backfill behavior;
- public API, event, or SDK contract compatibility;
- shared-core concurrency, idempotency, rollout/fallback, or deployment-manifest behavior;
- an explicit `high-risk` marker in the workorder with a named risk-register entry;
- a worker-reported blocker or contract deviation that cannot safely wait for wave integration.

Record the trigger and boundary in `STATE.md`. Backend code or tests alone are
not high risk. Do not manufacture singleton waves for review. After a finding,
review only the affected fix against the original finding; keep unrelated
coverage for the final reviewer.

## Verification Phase

Run verification once per integrated wave and once at the end across the final state. This does not authorize an extra reviewer after each workorder: reviewer scheduling remains governed by the policy above. Gate commands come from the delivery brief; their full output goes to log files, and only exit codes, executed/passed/failed/skipped counts, failing lines, and log paths enter the conversation.

Required gates:

- project tests/lint/typecheck/build named in `08-quality-gates.md`;
- `reviewer` with `$code-review-standards` loaded (max 4 refs, per the standards cap) — correctness, regressions, structure, reuse/duplication, maintainability, missing tests;
- `qa` for acceptance criteria, edge cases, negative paths, integration behavior.

Give reviewers the wave diff, its workorders, and protected DoD lines only.
Review from hunks and open the minimum surrounding source. Diff review cannot
replace runtime verification.

Every verification pass must check four levels where applicable: **exists, substantive, wired, functional**. File existence alone is not implementation.

**Fail closed:** PASS requires executed checks and concrete evidence, not exit 0.
Any required skip, unavailable check, or unverified result is
`blocked-no-evidence`. A user waiver still keeps `ready_for_release: blocked`
and cannot produce `complete`. Keep `implementation_complete` when code is done;
use `paused` only when no safe progress or a user decision remains.

Conditional gates: Backend Runtime Verification Protocol (below) for backend/API/data/migration/deployable-service changes — mandatory; UI Verification Protocol for user-facing changes — mandatory; `cybersec` for security-sensitive changes; `docs` when user-facing or operational docs must change.

When implementation workorders are done but required runtime/browser fixtures or
targets are unavailable, set `status: implementation_complete`, keep
`ready_for_runtime_verification` and `ready_for_release` blocked, and record the
missing inputs. Do not create a supporting runtime-evidence project or undo
implementation readiness without explicit user approval.

### Backend Runtime Verification Protocol (mandatory for backend changes)

Read and execute `references/backend-runtime-gates.md` only when
`ready_for_runtime_verification: ready`. It is the canonical protocol for real
dependencies, migrations, shipped artifacts, live contracts, and zero-skip
evidence. If readiness is blocked, preserve `implementation_complete` and
release `NO-GO`. Browser checks run only after backend runtime passes.

### UI Verification Protocol (mandatory for user-facing changes)

A change is **user-facing** if it touches frontend files (components, pages/routes, templates, styles, client-side scripts) **or** the package contains `02-ui-spec.md` or `02-ui-prototype.md`. Browser verification is then a required gate; "I read the code and it looks right" is not evidence. Do these steps; do not narrate them as done without running them:

1. **Launch a target.** Start the dev server / build a preview in the background with output to a log file, and get a concrete URL — or identify an already-running one. No running target → mark the gate `blocked-no-evidence`, escalate, do NOT mark complete. (This is the step the loop most often skips.)
2. **Drive it in a real browser — inside a QA subagent.** Spawn `qa` with the `verify-on-browser` (CDP) or `playwright` skill loaded. It navigates the URL, walks the primary flow from `02-ux-problem-framing.md`/`02-ui-spec.md` plus each required state (happy, empty, loading, error, permission-denied), and **saves a screenshot file per state**. Screenshots stay on disk; the subagent returns a per-state pass/fail verdict plus file paths. The orchestrator never loads image bytes into its own context.
3. **Usability check.** Same or a second `qa` task with the
   `usability-tester` skill named in its prompt; intake comes from
   `02-ui-spec.md`/`02-ui-prototype.md`. Compare the running UI against the
   accepted prototype direction and mock states.
4. **Record evidence.** Write `10-ui-verification.md` from `assets/templates/ui-verification.md`: preview mode + URL, per-state pass/fail table with screenshot paths, usability findings, issues found/fixed. This file is what the fail-closed rule and `aird-validate.mjs` require.

If a live preview is unavailable, a `qa` review against the UI spec may record
partial evidence, but the browser gate remains `blocked-no-evidence`. Record the
fallback, keep `status: implementation_complete` when product implementation is
done, and keep `ready_for_release: blocked`; never report delivery complete.

## Defect Loop

For each verification finding:

1. Classify severity and affected DoD item.
2. Create or update a scoped fix workorder from `assets/templates/fix-workorder.md` — fix workorders obey the same sizing gate (1–3 atomic tasks).
3. Assign the smallest appropriate worker in a fresh context.
4. Re-run only impacted tests first, then the smallest required gate set for the affected diff. Re-run reviewer/QA only when the fix touches reviewed behavior, risk boundaries, or the original finding area — never the full gate battery for a one-file fix.
5. Repeat until no blocking findings remain, max 3 revision attempts per finding group.
6. Escalate to the user if the blocking count does not decrease between attempts or the third attempt still has blockers.

Bound the whole loop: at most 3 full verification cycles per delivery run. New blocking findings on cycle 3+ go straight to escalation with the remaining blockers and a recommended next step.

Do not mark delivery complete while reviewer, QA, browser, or usability gates have blocking findings.

On pause, blockage, or a context checkpoint, write `.continue-here.md` from `assets/templates/continue-here.md` with exact next action, completed work, blockers, and required reading.

## Completion Criteria

Delivery is complete only when:

- all required workorders are done; optional workorders may be explicitly deferred;
- tests and quality gates pass, each with evidence attached (fail-closed — no vacuous passes);
- reviewer has no blocking findings;
- QA accepts the DoD against concrete evidence, not assertion;
- backend changes have `10-backend-verification.md` with zero failed/skipped checks and all required runtime, upgrade, artifact, API, and business-flow results passing;
- for user-facing changes, `10-ui-verification.md` exists with a real preview URL and a per-state pass/fail table backed by screenshot paths;
- the usability check has no blocking UX findings for user-facing flows;
- security-sensitive changes have been reviewed;
- required docs updates are done or explicitly deferred;
- `STATE.md` shows `ready_for_release: ready` and `status: complete`; a missing
  runtime target, required-gate waiver, or deferred required work keeps release
  blocked while implementation may remain `implementation_complete`;
- final diff is scoped and explainable.

## Final Response

Summarize: AIRD path and workorders executed; waves and agents used with scopes; changed files; gates run with evidence pointers; remaining risks or deferred work; whether the DoD passed. Keep it a summary with pointers — the evidence lives in the package, not in the reply.
