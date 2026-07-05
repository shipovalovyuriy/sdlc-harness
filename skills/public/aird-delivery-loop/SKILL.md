---
name: aird-delivery-loop
description: "Explicit ARiD/AIRD delivery loop for implementing an existing AIRD package through independent execution and verification subagents. Use only when the user explicitly invokes $aird-delivery-loop, says AIRD/ARiD delivery, or asks to execute workorders from an existing AIRD package. Runs implementation workers with $code-review-standards guidance, tests, code review, QA, browser checks for web apps, usability checks for UX flows, and fix loops until DoD/quality gates pass."
---

# AIRD Delivery Loop

## Operating Model

Run this as the main-session orchestration skill. The main session reads the AIRD package, spawns independent workers, integrates changes, launches verification agents, and loops defects back into scoped workorders.

Explicit invocation of this skill counts as an explicit request for delegation and parallel agent work: its spawning instructions have priority over the general no-delegation rule in `AGENTS.md`. Do not ask the user for permission before each spawn.

Use `supervisor` only when delivery requires more than 3 workers/agents running in parallel at the same time or coordination-heavy fan-out/fan-in tracking. For 2-3 dependent workorders, sequence them or create an integration workorder instead. When the main session drives workers directly, keep each parallel batch at 3 or fewer agents (including verification agents); a larger simultaneous batch requires `supervisor`.

Use `references/gates.md` for gate behavior, `references/revision-loop.md` for bounded defect loops, and `references/verification-patterns.md` for real-implementation checks. Keep the AIRD package `STATE.md` current after execution batches, verification gates, and pauses; set `status: in_delivery` when execution starts.

Do not begin delivery without an implementation-ready package. The minimum required to start is: `workorders/*.md` with allowed write scope, `08-quality-gates.md`, and `09-dod.md` (or an equivalent brief that specifies the same: scoped units of work, the gates to run, and the definition of done). If the user supplies an equivalent brief instead of an AIRD folder, first normalize it into a lightweight AIRD package by writing the minimum files above plus `STATE.md`; do not spawn workers directly from loose prose. The other inputs below are read when present. If even this minimum is missing or vague, do not silently proceed and do not force a full re-discovery: stop and tell the user the package is not implementation-ready, recommending `$aird-discovery-loop`. Handing off into `$aird-discovery-loop` is allowed only as that recommended next step and counts as an explicit invocation of discovery.

## Required Inputs

A full AIRD package contains all of these; read every one that exists. The hard requirement to start is only the minimum from the Operating Model (workorders + quality gates + DoD). If the user supplies an equivalent brief, normalize it into that minimum package shape first, then read whichever of the docs below are present.

Read:

- `STATE.md`;
- `00-intake.md`;
- `00-discussion-log.md` (a full discovery package always has it; treat its absence as a pre-flight gap unless the package is an equivalent brief that records its locked decisions elsewhere);
- `01-prd.md`;
- `02-ux-problem-framing.md` when present (user-facing work);
- `02-ui-spec.md` when present (user-facing work);
- `02-ui-prototype.md` and prototype artifacts when present (user-facing work);
- `03-risk-register.md`;
- `04-trd.md`;
- `07-implementation-plan.md`;
- `08-quality-gates.md`;
- `09-dod.md`;
- relevant `workorders/*.md`.

Read API/data docs when present:

- `05-api-contracts.md`;
- `06-data-models.md`.

## Independence Rules

- Spawn one worker per independent workorder.
- Prefer `fork_context=false` for workers. Pass only the workorder, required AIRD docs, and allowed paths. Note: `fork_context=true` cannot be combined with a role `agent_type`, so keep `fork_context=false` whenever you spawn a role like `backend-worker`/`frontend-worker`.
- Keep write sets disjoint. If two workorders need the same file, sequence them or create an integration workorder.
- A worker must not choose architecture. The workorder template instructs the worker to STOP and report a blocker if the brief is insufficient; when a worker reports such a blocker, the main session routes the workorder back to `architect`/discovery — the worker itself only reports, it does not re-dispatch.
- Workers report changed files, tests run, contract deviations, and blockers.
- No empty or vacuous results. A worker or verification agent must never return blank or a bare acknowledgment — report status, changed files, tests/evidence, and blockers. If it cannot access what it needs or cannot reach a verdict, it returns that as an explicit blocker; an empty result is a blocking failure, not a pass. A `reviewer`/`qa` gate that cannot read files or reach a verdict returns a blocking REVISE with the reason, never an implicit pass.

## Execution Phase

### 1. Normalize Workorders

Build a small execution map:

- workorder id;
- recommended agent;
- allowed write paths;
- dependencies;
- required verification gates for this workorder (e.g. tests, reviewer, qa, browser, usability, cybersec — derived from `08-quality-gates.md` and `references/verification-gates.md` by change type);
- code standards refs to load from `$code-review-standards` (always `universal.md` and `structure-reuse-performance.md`, plus frontend/backend/API/security/language/testing refs by stack);
- must_haves: truths, artifacts, and key links;
- risk level (from `03-risk-register.md` or the workorder `Priority`).

Pre-flight / revision / escalation / abort are process stages every workorder passes through (see `references/gates.md`), not a per-workorder attribute — do not try to tag each workorder with a single gate type.

If `08-quality-gates.md` is incomplete, consult `references/verification-gates.md` as the fallback gate matrix.

Before spawning workers, run pre-flight gates: the minimum package exists (`workorders/*.md`, `08-quality-gates.md`, `09-dod.md`, plus `STATE.md`; an equivalent brief must be normalized into these files first), the AIRD docs that are present are readable, workorders have non-overlapping write sets or explicit sequencing, and each workorder has verifiable `must_haves`. Pre-flight checks content quality, not just filename presence.

Run the deterministic state check first and treat a non-zero exit as a blocking pre-flight gap (do not start workers until it passes). For an equivalent brief, run this only after the brief has been normalized into a lightweight AIRD package with `STATE.md`:

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/public/aird-delivery-loop/assets/scripts/aird-validate.mjs" ".agent/aird/<feature-slug>"
```

It cross-checks `STATE.md` against the filesystem (status enum, artifacts the state calls done actually exist, gated statuses have the baseline set and workorders). It is structural, not semantic — it does not judge content quality, so run it in addition to the reviewer/QA gates, not instead of them.

Group workorders into parallel batches only when write paths and dependencies do not collide.

### 2. Spawn Implementation Agents

Route by scope:

- `backend-worker` for backend, APIs, services, data, migrations;
- `frontend-worker` for frontend behavior and UI implementation;
- `worker` for small mixed or tooling tasks;
- `debugger` first for bug/regression isolation before implementation;
- `cybersec` for auth, secrets, permissions, sensitive data, external callbacks, or explicit security work.

Before spawning a coding worker, route standards through `$code-review-standards`:

- always pass `references/universal.md` and `references/structure-reuse-performance.md`;
- pass `references/frontend.md` and `references/typescript-react.md` for `frontend-worker` when the stack is React/TypeScript;
- pass `references/backend.md`, `references/api-design.md`, and the detected language file for `backend-worker`;
- pass `references/security.md` for auth, permissions, secrets, PII, callbacks, imports/exports, or multi-tenant data;
- pass `references/testing.md` when the workorder includes tests or changes behavior;
- pass `references/community-awesome.md` only when choosing/reviewing tooling, libraries, linters, SAST, or project gates, and require primary-source verification before adoption;
- instruct the worker to identify project-local conventions/tooling before editing and to report structure, reuse, and optimization choices.

For each worker, pass:

- one workorder;
- required AIRD doc paths;
- selected `$code-review-standards` refs and the instruction to use Worker Mode before coding;
- locked decisions from `00-discussion-log.md` when relevant;
- risk mitigation decisions and evidence gates from `00-discussion-log.md`/`03-risk-register.md`;
- UX framing from `02-ux-problem-framing.md` (edge cases, trust/comprehension risks, accessibility) for user-facing work;
- UI spec constraints from `02-ui-spec.md` for user-facing work;
- prototype acceptance notes and mock scenarios from `02-ui-prototype.md` for user-facing work;
- allowed read/write scope;
- required tests and verification;
- instruction to edit files directly and report changed paths.

### 3. Integrate

After workers finish:

- inspect diff;
- resolve conflicts;
- ensure no changes escaped allowed scope unless justified;
- update AIRD notes if implementation deviated from the plan;
- update `STATE.md` with completed workorders, blockers, and next action;
- create follow-up workorders for unresolved blockers.

## Verification Phase

Run verification after integration, not only inside workers.

Required gates:

- project tests/lint/typecheck/build named in `08-quality-gates.md`;
- `reviewer` with `$code-review-standards` loaded for code correctness, regressions, project structure, function boundaries, reuse/duplication, optimization, maintainability, and missing tests;
- `qa` for acceptance criteria, edge cases, negative paths, and integration behavior.

Every verification pass must check four levels where applicable: exists, substantive, wired, and functional. Do not accept file existence alone as implementation.

Fail-closed rule: a gate is "passed" only with concrete evidence attached — test output with counts, a command exit status, a browser screenshot or DOM assertion, an API response, or a diff. A gate with no evidence is treated as a blocking failure, not a pass. Never record a vacuous pass ("looks correct", "should work", "QA accepts" with nothing behind it). If evidence cannot be produced (no runner, no preview, environment missing), mark the gate `blocked-no-evidence` and either escalate or explicitly defer it in `STATE.md` — do not silently upgrade it to passed. Record the evidence pointer (log path, command, screenshot file, or DoD line) next to each gate result.

Conditional gates:

- For any **user-facing change**, run the UI Verification Protocol below — it is mandatory, not optional, and completion is blocked without its recorded evidence.
- Use `cybersec` for security-sensitive changes.
- Use `docs` when user-facing or operational docs must be updated.

### UI Verification Protocol (mandatory for user-facing changes)

A change is **user-facing** if it touches frontend files (components, pages/routes, templates, styles, client-side scripts) **or** the package contains `02-ui-spec.md` or `02-ui-prototype.md`. For a user-facing change, browser verification is a **required** gate — the change cannot be marked complete without recorded browser evidence. "I read the code and it looks right" is not evidence. Do these steps; do not narrate them as done without actually running them:

1. **Launch a target.** Start the app / dev server (run the project's dev command in the background) or build a static preview, and get a concrete URL — or identify an already-running preview URL. You cannot verify UI without a running target: if you cannot get one, mark the gate `blocked-no-evidence`, escalate, and do NOT mark the change complete. (This is the step the loop most often skips — a browser with no server to point at opens nothing.)
2. **Drive it in a real browser.** Spawn `qa` with the `verify-on-browser` (CDP) or `playwright` skill loaded, or use the in-app browser directly. Navigate the URL and walk the primary flow from `02-ux-problem-framing.md`/`02-ui-spec.md`, plus each required state (happy, empty, loading, error, permission-denied). Capture a screenshot per state.
3. **Usability check.** Spawn `qa` with the `usability-tester` skill loaded (it is a skill, not an agent — do not spawn it as an `agent_type`); fill its intake from `02-ui-spec.md`/`02-ui-prototype.md`, and compare the running UI against the accepted `02-ui-prototype.md` direction and mock states.
4. **Record evidence.** Write `10-ui-verification.md` from `assets/templates/ui-verification.md`: preview mode + URL, a per-state pass/fail table with screenshot paths, usability findings, and issues found/fixed. This file is the evidence the fail-closed rule and `aird-validate.mjs` require.

If Computer Use / a live preview is genuinely unavailable in the environment, you may fall back to `qa` review against the UI spec and prototype states — but record that fallback and the missing browser evidence explicitly in `10-ui-verification.md` and `STATE.md`. Never silently skip the gate or report it as passed.

Also verify frontend work against `02-ui-spec.md` and `02-ux-problem-framing.md` when they exist.

## Defect Loop

For each verification finding:

1. Classify severity and affected DoD item.
2. Create or update a scoped fix workorder from `assets/templates/fix-workorder.md`.
3. Assign the smallest appropriate worker.
4. Re-run only impacted tests first, then the full required gate set.
5. Repeat until no blocking findings remain, with a maximum of 3 revision attempts per finding group.
6. Escalate to the user if the blocking issue count does not decrease between attempts or the third attempt still has blockers.

Bound the whole loop, not just each group: run at most 3 full verification cycles per delivery run. New blocking findings discovered on cycle 3 or later do not open fresh revision loops — take them straight to escalation with the remaining blockers and a recommended next step.

Do not mark delivery complete while reviewer, QA, browser, or usability gates have blocking findings.

On pause or blockage, write `.continue-here.md` from `assets/templates/continue-here.md` with exact next action, completed work, blockers, and required reading.

## Completion Criteria

Delivery is complete only when:

- all required workorders are done or explicitly deferred;
- tests and quality gates pass, each with evidence attached (fail-closed rule — no vacuous passes);
- reviewer has no blocking findings;
- QA accepts the DoD against concrete evidence, not assertion;
- for user-facing changes, `10-ui-verification.md` exists with a real preview URL and a per-state pass/fail table (browser evidence), or explicitly records why the preview was unavailable;
- the usability check (qa + `usability-tester` skill) has no blocking UX findings for user-facing flows, or is explicitly deferred when Computer Use is unavailable;
- security-sensitive changes have been reviewed;
- required docs updates are done or explicitly deferred;
- `STATE.md` shows `status: complete` or a clearly documented deferred state;
- final diff is scoped and explainable.

## Final Response

Summarize:

- AIRD path and workorders executed;
- agents used and scopes;
- changed files;
- tests and verification gates run;
- remaining risks or deferred work;
- whether the DoD passed.
