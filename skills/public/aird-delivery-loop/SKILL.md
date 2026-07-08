---
name: aird-delivery-loop
description: "Explicit ARiD/AIRD delivery loop for implementing an existing AIRD package through independent execution and verification subagents. Use only when the user explicitly invokes $aird-delivery-loop, says AIRD/ARiD delivery, or asks to execute workorders from an existing AIRD package. Runs implementation workers with $code-review-standards guidance, tests, code review, QA, browser checks for web apps, usability checks for UX flows, and fix loops until DoD/quality gates pass. Context is disposable, disk is memory: the orchestrator stays lean, checkpoints to STATE.md, and re-spawns instead of compacting."
---

# AIRD Delivery Loop

## Operating Model: Context Is Disposable, Disk Is Memory

Run this as the main-session orchestration skill. The main session reads the AIRD package once, builds a compact delivery brief, spawns fresh-context workers per workorder, integrates, verifies per wave, and loops defects back into scoped fix workorders.

The core rule that keeps token spend sane: **no long-lived all-remembering orchestrator.** Everything durable lives in files (`STATE.md`, `.continue-here.md`, workorders, evidence files); the orchestrator context is a disposable working buffer. A fresh session must always be able to continue from `STATE.md` alone.

- **Checkpoint, don't compact.** After pre-flight, after each integrated wave, and after each verification gate, write the durable outcome into `STATE.md`. When the main context passes ~50% of the window, or before starting a new wave with a heavy tail of tool output behind you, write `.continue-here.md` (from `assets/templates/continue-here.md`) and continue in a fresh session from it. Hitting auto-compaction is a process failure: it means the checkpoint was late. Never rely on compaction to carry state.
- **Workers always start fresh.** A worker gets its workorder file, the named AIRD doc paths, and standards refs — never the parent transcript. One workorder = one fresh worker context, one coherent commit-sized change.
- **The orchestrator never holds raw bulk.** Full logs, screenshots, and file contents live on disk; the orchestrator holds verdicts, counts, and paths.

Explicit invocation of this skill counts as an explicit request for delegation and parallel agent work: its spawning instructions have priority over the general no-delegation rule in `AGENTS.md`. Do not ask the user for permission before each spawn.

Use `supervisor` only when delivery requires more than 3 workers/agents running in parallel at the same time. Otherwise the main session drives waves directly, with each parallel batch at 3 or fewer agents (including verification agents).

Use `references/gates.md` for gate behavior, `references/revision-loop.md` for bounded defect loops, `references/verification-patterns.md` for real-implementation checks. Set `status: in_delivery` in `STATE.md` when execution starts.

Do not begin delivery without an implementation-ready package. The minimum to start: `workorders/*.md` with allowed write scope and task breakdown, `08-quality-gates.md`, and `09-dod.md` (or an equivalent brief specifying the same). If the user supplies an equivalent brief, first normalize it into a lightweight AIRD package (the minimum files plus `STATE.md`); do not spawn workers from loose prose. If even this minimum is missing or vague, stop and recommend `$aird-discovery-loop` — that recommendation counts as an explicit invocation of discovery.

## Required Inputs

The AIRD package is read **once**, at pre-flight — and **not by the orchestrator**. Spawn a single pre-flight reader subagent (fresh context, discarded after) that reads the package and returns: the delivery brief below, the Workorder Sizing Gate verdict per workorder, and any pre-flight gaps. The orchestrator itself opens at most `STATE.md` and the validator output; full docs entering the main context become permanent replay weight in every subsequent request. Later steps re-open only the named section they actually need — never the package.

Hard requirement: `workorders/*.md`, `08-quality-gates.md`, `09-dod.md`, `STATE.md`. Read when present: `00-intake.md`, `00-discussion-log.md`, `01-prd.md`, `02-ux-problem-framing.md` / `02-ui-spec.md` / `02-ui-prototype.md` (user-facing work), `03-risk-register.md`, `04-trd.md`, `05-api-contracts.md`, `06-data-models.md`, `07-implementation-plan.md`, `codemap.md`.

**Delivery brief** (the orchestrator's only working memory; keep it under a page):

- workorder order, waves, and dependencies;
- locked decisions and risk gates that constrain implementation;
- allowed paths per workorder;
- exact gate commands (test/lint/build/deploy-check) from `08-quality-gates.md`;
- DoD items and which gate proves each.

## Context Budget Hard Rules

These are blocking rules, not preferences. Violating them is what turns a delivery run into a 100M+ token session.

1. **Batch checks into one compound command.** Never issue `git status`, `git diff --check`, `git diff --stat`, or an ssh health-check as separate serial calls when one compound command answers the question: `git status --short && git diff --stat && go test ./... 2>&1 | tail -30`. Every extra tool call replays the entire context.
   Cap every listing command that can explode: `| head -50` on `git ls-files --others`, `find`, `ls -R`, and any recursive listing — build caches and artifact dirs turn an innocent listing into 100K+ tokens. If a listing overflows, filter (exclude cache/artifact dirs) instead of scrolling it.
2. **No chunk-polling of long-running processes.** For builds, test suites, deploys, and remote scripts: redirect full output to a log file, run to completion (in the background if needed), then read the verdict once — exit code, counts, `tail -30`, and the log path. Never stream 30-second output chunks into the conversation, never poll a running process with repeated reads. If a process needs watching, a single wait-then-tail beats N polls.
3. **Images never enter the orchestrator context.** Screenshots are evidence files: save to disk, record the path in `10-ui-verification.md`. Only a QA subagent (fresh context, discarded after the verdict) opens pixels. The orchestrator receives pass/fail per state plus paths.
4. **Subagent results are summaries with pointers.** A worker or verifier returns: status, changed paths, commands run with exit codes, evidence file paths, blockers — not transcripts, not full logs, not file contents. If a result exceeds ~40 lines, it belongs in a file with a path returned instead.
5. **Read once, brief forward.** AIRD docs, skill references, and standards files are read once at the phase that needs them. If you notice yourself re-reading the same reference, the delivery brief is missing a line — fix the brief, don't re-read.
6. **Verify per wave, not per twitch.** Gate commands run once after a wave integrates (plus targeted tests a worker runs on its own diff). Re-running the full gate set after every micro-fix is the second-biggest token sink after polling.
7. **Checkpoint and re-spawn beats one long session.** The trigger is concrete, not a vibe: when context usage crosses ~50% of the window, the **very next action** is writing `STATE.md` + `.continue-here.md` and continuing fresh — not "after this one more step". Between waves is always a legal cut point; take it if the tail of tool output behind you is heavy. A fresh session re-reading a one-page brief is orders of magnitude cheaper than dragging 150K tokens of dead tool output through every subsequent call. Reaching 60%+ during mere planning means rule 1 or the pre-flight delegation was violated — fix that, don't push on.

For small or low-risk diffs, choose the narrowest gate set allowed by `08-quality-gates.md` and `references/verification-gates.md`: targeted tests plus one focused reviewer/QA pass at batch end. Do not run browser/usability/security/docs gates unless the change type or AIRD gates require them.

## Workorder Sizing Gate

A workorder is executable only if a single worker can complete it in one fresh context without degradation. At pre-flight, check every workorder against:

- it has a **Task Breakdown of 1–3 atomic tasks** (an atomic task = one coherent edit unit: one endpoint, one component, one migration, one config surface — roughly one commit);
- the worker can finish it while staying within about half of a fresh context window (inputs + files it must open + its own diff);
- its docs-to-read list names specific files/sections, not "the whole package".

An oversized or unsplit workorder is a **blocking pre-flight gap**: do not spawn a worker on it and do not split it yourself ad hoc mid-delivery. Route it back to discovery (or run a scoped normalization step that rewrites it into 2+ sequenced workorders with disjoint write sets, recorded in `STATE.md`) before execution. Oversized workorders are exactly what produce mid-worker compactions, re-reading loops, and half-done diffs.

## Independence Rules

- Spawn one worker per independent workorder; group independent workorders into **waves** (parallel where write sets and dependencies do not collide, sequential otherwise).
- Prefer `fork_context=false` for workers. Pass only the workorder path, the named AIRD doc paths, and standards refs. Note: `fork_context=true` cannot be combined with a role `agent_type`, so keep `fork_context=false` whenever you spawn a role like `backend-worker`/`frontend-worker`.
- Keep write sets disjoint. If two workorders need the same file, sequence them or create an integration workorder.
- A worker must not choose architecture. If the brief is insufficient, the worker STOPs and reports a blocker; the main session routes it back to `architect`/discovery.
- Workers report changed files, tests run, contract deviations, and blockers.
- No empty or vacuous results. A worker or verification agent must never return blank or a bare acknowledgment. If it cannot access what it needs or cannot reach a verdict, it returns an explicit blocker; an empty result is a blocking failure, not a pass. A `reviewer`/`qa` gate that cannot read files or reach a verdict returns a blocking REVISE with the reason, never an implicit pass.

## Execution Phase

### 1. Pre-flight And Waves

Delegate package reading to one pre-flight reader subagent (see Required Inputs). It builds the execution map — workorder id, recommended agent, allowed write paths, dependencies, required gates for its wave (from `08-quality-gates.md`, fallback `references/verification-gates.md`), standards refs to load, `must_haves`, risk level — and returns it with the delivery brief. The orchestrator receives roughly one page of text, not the package.

Run pre-flight gates before spawning anything:

- minimum package exists and is readable; equivalent briefs are normalized first;
- **Workorder Sizing Gate passes for every workorder** (see above);
- write sets are disjoint or explicitly sequenced;
- each workorder has verifiable `must_haves` (content quality, not filename presence).

Run the deterministic state check and treat a non-zero exit as a blocking gap:

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/public/aird-delivery-loop/assets/scripts/aird-validate.mjs" ".agent/aird/<feature-slug>"
```

It is structural, not semantic — run it in addition to reviewer/QA gates, not instead of them.

Group workorders into waves. Record the wave plan in `STATE.md`, then write the delivery brief. From this point the brief, not the package, is the working memory.

### 2. Spawn Implementation Agents

Route by scope: `backend-worker` (backend/APIs/services/data/migrations), `frontend-worker` (UI behavior/implementation), `worker` (small mixed/tooling), `debugger` first for bug isolation, `cybersec` for auth/secrets/permissions/sensitive data/external callbacks. Prefer the cheapest agent tier that can do the job: mechanical, well-specified tasks go to plain workers; reserve heavyweight roles for design-ambiguous or high-risk workorders.

Standards via `$code-review-standards`: always `universal.md` + `structure-reuse-performance.md`; `frontend.md`/`typescript-react.md` for React/TS frontend; `backend.md` + `api-design.md` + language file for backend; `security.md` for auth/permissions/secrets/PII/callbacks/multi-tenant data; `testing.md` when tests or behavior change; `community-awesome.md` only for tooling choices with primary-source verification.

Per worker, pass: one workorder path; named AIRD doc paths; selected standards refs and the instruction to use Worker Mode before coding; the few locked decisions/risk gates relevant to this workorder; UX/UI constraints for user-facing work; allowed read/write scope; required tests; instruction to edit files directly, run its own targeted tests with output to a log file, and report the summary-with-pointers shape from the Context Budget Hard Rules. Keep prompts compact — paths and constraints, not copied AIRD sections.

### 3. Integrate (per wave)

After a wave finishes: inspect the diff (`git diff --stat` then targeted `git diff -- <paths>`); resolve conflicts; ensure no changes escaped allowed scope unless justified; update AIRD notes on deviations; update `STATE.md` with completed workorders, blockers, next action; create follow-up workorders for unresolved blockers. **This is a checkpoint** — if context is past ~50%, write `.continue-here.md` and continue fresh before verification.

### Review Scheduling Policy

Default to one reviewer pass per integrated wave, not per workorder. Workers run targeted tests on their own diff; the reviewer checks the integrated wave diff against the AIRD package, DoD, standards, and risk gates.

Run per-workorder reviewer only when the workorder is high-risk or crosses an expensive boundary: auth/permissions/secrets/PII/tenant isolation; migrations/schema/backfills/irreversible data changes; public API/event contracts or SDK-facing behavior; shared framework/core files, concurrency/idempotency, rollout/fallback machinery, deployment manifests; explicitly marked high risk; or a worker reported a blocker/deviation.

For low-risk workorders with disjoint files, record `reviewer: deferred to wave batch` in `STATE.md` and run one focused reviewer on the wave diff. If a reviewer finds blocking issues, create scoped fix workorders and re-run reviewer only on the affected diff plus the original finding.

## Verification Phase

Run verification once per integrated wave (and once at the end across the final state). Gate commands come from the delivery brief; their full output goes to log files, and only exit codes, counts, failing lines, and log paths enter the conversation.

Required gates:

- project tests/lint/typecheck/build named in `08-quality-gates.md`;
- `reviewer` with `$code-review-standards` loaded — correctness, regressions, structure, reuse/duplication, maintainability, missing tests;
- `qa` for acceptance criteria, edge cases, negative paths, integration behavior.

Every verification pass must check four levels where applicable: **exists, substantive, wired, functional**. File existence alone is not implementation.

**Fail-closed rule:** a gate is "passed" only with concrete evidence attached — test output with counts, a command exit status, a screenshot file path with a DOM assertion, an API response, or a diff. A gate with no evidence is a blocking failure, not a pass. Never record a vacuous pass. If evidence cannot be produced (no runner, no preview, environment missing), mark the gate `blocked-no-evidence` and escalate or explicitly defer it in `STATE.md`. Record the evidence pointer (log path, command, screenshot file, DoD line) next to each gate result.

Conditional gates: UI Verification Protocol (below) for any user-facing change — mandatory; `cybersec` for security-sensitive changes; `docs` when user-facing or operational docs must change.

### UI Verification Protocol (mandatory for user-facing changes)

A change is **user-facing** if it touches frontend files (components, pages/routes, templates, styles, client-side scripts) **or** the package contains `02-ui-spec.md` or `02-ui-prototype.md`. Browser verification is then a required gate; "I read the code and it looks right" is not evidence. Do these steps; do not narrate them as done without running them:

1. **Launch a target.** Start the dev server / build a preview in the background with output to a log file, and get a concrete URL — or identify an already-running one. No running target → mark the gate `blocked-no-evidence`, escalate, do NOT mark complete. (This is the step the loop most often skips.)
2. **Drive it in a real browser — inside a QA subagent.** Spawn `qa` with the `verify-on-browser` (CDP) or `playwright` skill loaded. It navigates the URL, walks the primary flow from `02-ux-problem-framing.md`/`02-ui-spec.md` plus each required state (happy, empty, loading, error, permission-denied), and **saves a screenshot file per state**. Screenshots stay on disk; the subagent returns a per-state pass/fail verdict plus file paths. The orchestrator never loads image bytes into its own context.
3. **Usability check.** Same or a second `qa` subagent with the `usability-tester` skill loaded (it is a skill, not an agent — do not spawn it as an `agent_type`); intake from `02-ui-spec.md`/`02-ui-prototype.md`; compare the running UI against the accepted prototype direction and mock states.
4. **Record evidence.** Write `10-ui-verification.md` from `assets/templates/ui-verification.md`: preview mode + URL, per-state pass/fail table with screenshot paths, usability findings, issues found/fixed. This file is what the fail-closed rule and `aird-validate.mjs` require.

If a live preview is genuinely unavailable, fall back to `qa` review against the UI spec and prototype states — but record the fallback and the missing browser evidence explicitly in `10-ui-verification.md` and `STATE.md`. Never silently skip the gate or report it passed.

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

- all required workorders are done or explicitly deferred;
- tests and quality gates pass, each with evidence attached (fail-closed — no vacuous passes);
- reviewer has no blocking findings;
- QA accepts the DoD against concrete evidence, not assertion;
- for user-facing changes, `10-ui-verification.md` exists with a real preview URL and a per-state pass/fail table (screenshot paths), or explicitly records why the preview was unavailable;
- the usability check has no blocking UX findings for user-facing flows, or is explicitly deferred when browser control is unavailable;
- security-sensitive changes have been reviewed;
- required docs updates are done or explicitly deferred;
- `STATE.md` shows `status: complete` or a clearly documented deferred state;
- final diff is scoped and explainable.

## Final Response

Summarize: AIRD path and workorders executed; waves and agents used with scopes; changed files; gates run with evidence pointers; remaining risks or deferred work; whether the DoD passed. Keep it a summary with pointers — the evidence lives in the package, not in the reply.
