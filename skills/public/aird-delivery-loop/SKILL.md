---
name: aird-delivery-loop
description: "Explicit ARiD/AIRD delivery loop for implementing an existing AIRD package through independent execution and verification subagents. Use only when the user explicitly invokes $aird-delivery-loop, says AIRD/ARiD delivery, or asks to execute workorders from an existing AIRD package. Runs implementation workers with $code-review-standards guidance, fail-closed backend runtime and migration-upgrade checks, tests, code review, QA, browser checks for web apps, usability checks for UX flows, and fix loops until DoD/quality gates pass. Context is disposable, disk is memory: the orchestrator stays lean, checkpoints to STATE.md, rotates fresh workers, and requests a fresh root task only at a real context boundary."
---

# AIRD Delivery Loop

## Operating Model: Context Is Disposable, Disk Is Memory

Run this as the main-session orchestration skill. The main session validates the
review manifest, reads only the earliest accepted wave and its named source
sections, builds a compact delivery brief, and executes **one bounded execution
slice at a time**. A slice is one workorder, at most two disjoint workorders
that share one integration boundary, or one finding-group fix/closure cycle.
After checkpointing a slice, the main session may continue automatically with
the next dependency-compatible slice while the hard context-stop conditions
below remain false. The wave is the acceptance/dependency unit; it is not
permission to keep one worker context alive across multiple workorders.

The core rule that keeps token spend sane: **no long-lived all-remembering orchestrator.** Everything durable lives in files (`STATE.md`, `REVIEW-MANIFEST.json`, `.continue-here.md`, workorders, evidence files); the orchestrator context is a disposable working buffer. A fresh session continues from `STATE.md`, the review manifest, and the selected wave—not parent chat history.

- **Checkpoint, don't compact.** After pre-flight, after every execution slice,
  and after each verification gate, write the durable outcome into `STATE.md`.
  A checkpoint is a durability boundary, not automatically a user-visible
  stop. Continue with a fresh worker after the checkpoint when the compact
  orchestrator still has budget. At 100% of the context window, after
  auto-compaction, or when another hard-stop condition below is true, write
  `.continue-here.md` (from `assets/templates/continue-here.md`) and end the
  current root task. The next task continues from disk. Never rely on
  compaction to carry state.
- **Workers always start fresh.** A worker gets its workorder file, the named AIRD doc paths, and standards refs — never the parent transcript. One workorder = one fresh worker context, one coherent commit-sized change.
- **The orchestrator never holds raw bulk.** Full logs, screenshots, and file contents live on disk; the orchestrator holds verdicts, counts, and paths.

Explicit invocation of this skill counts as an explicit request for delegation and parallel agent work: its spawning instructions have priority over the general no-delegation rule in `AGENTS.md`. Do not ask the user for permission before each spawn.

Use `references/gates.md` for gate behavior, `references/revision-loop.md` for bounded defect loops, `references/verification-patterns.md` for real-implementation checks, and `references/backend-runtime-gates.md` when accepted workorder frontmatter selects backend runtime profiles. `surface` and `runtime_profiles` are authoritative; never infer gate routing from arbitrary workorder prose.

The canonical definition of readiness fields, lifecycle statuses, workorder
schema, product-first budget, and checkpoint semantics is
`../aird-discovery-loop/references/delivery-contract.md`. Do not restate it here or
in `STATE.md` prose.

**Walk the statuses; do not jump.** Set `status: in_delivery` and
`active_wave: Wn` when execution starts. Set `implementation_complete` when the
required implementation workorders are done but release evidence may still be
open. Set `verifying` when required runtime/browser/release checks start, which
requires `ready_for_runtime_verification: ready|not_required`. Set
`ready_for_release` once every required gate has passed with evidence, then
`complete`. Going straight from `in_delivery` to `complete` destroys a resumed
session's ability to tell finished code from finished evidence.

Do not begin delivery without an implementation-ready wave. The minimum to
start is `STATE.md`, `REVIEW-MANIFEST.json`, V4 workorders for one accepted
dependency closure, `08-quality-gates.md`, and `09-dod.md`. A legacy package may
receive one scoped structural normalization to V4 for the selected wave and its
dependencies only; leave later legacy files as ineligible backlog. This is not
permission to normalize/re-review the whole package or reopen accepted
product/architecture decisions. If the minimum implementation contract itself
is vague, stop and recommend `$aird-discovery-loop`.

## Required Inputs

Read `STATE.md`, `REVIEW-MANIFEST.json`, and validator output first. Select one
valid accepted wave, then read only that wave's workorders and the exact
frontmatter `docs_to_read` sections. Do not spawn a semantic pre-flight reader:
discovery already reviewed these exact hashes against the recorded base.
Re-run semantic review only when the validator reports a moved base or changed
workorder hash, and only for the invalidated wave.

**Delivery brief** (the orchestrator's only working memory; keep it under a page):

- selected wave, workorder order, and dependency closure;
- locked decisions and risk gates that constrain implementation;
- allowed paths per workorder;
- exact gate commands (test/lint/build/deploy-check) from `08-quality-gates.md`;
- DoD items and which gate proves each.
- every gate's criticality: `required` or `optional`; required gates cannot be self-deferred by an agent;
- typed runtime profiles and their intended verification commands. Runtime
  access may remain unavailable during reversible implementation; that blocks
  verification/release, not worker launch.

## Context Budget Hard Rules

These are blocking rules, not preferences. Violating them is what turns a delivery run into a 100M+ token session.

1. **Batch checks into one compound command.** Never issue `git status`, `git diff --check`, `git diff --stat`, or an ssh health-check as separate serial calls when one compound command answers the question: `git status --short && git diff --stat && go test ./... 2>&1 | tail -30`. Every extra tool call replays the entire context.
   Cap every listing command that can explode: `| head -50` on `git ls-files --others`, `find`, `ls -R`, and any recursive listing — build caches and artifact dirs turn an innocent listing into 100K+ tokens. If a listing overflows, filter (exclude cache/artifact dirs) instead of scrolling it.
   The orchestrator's direct tool result budget is **8K tokens per call**;
   prefer 2–4K. Never request 20K–50K output "just in case". Large source or
   log inspection belongs in a fresh worker or an evidence file.
2. **No chunk-polling of long-running processes.** For builds, test suites, deploys, and remote scripts: redirect full output to a log file, run to completion (in the background if needed), then read the verdict once — exit code, counts, `tail -30`, and the log path. Never stream 30-second output chunks into the conversation, never poll a running process with repeated reads. If a process needs watching, a single wait-then-tail beats N polls.
   The same rule applies to agents: do not call `list_agents` repeatedly and do
   not issue 30-second status polls. Wait on the intended target; request at
   most one compact progress update when it changes a decision. Once an agent
   final is delivered, never fetch the same result again through an agent
   listing.
3. **Images never enter the orchestrator context.** Screenshots are evidence files: save to disk, record the path in `10-ui-verification.md`. Only a QA subagent (fresh context, discarded after the verdict) opens pixels. The orchestrator receives pass/fail per state plus paths.
4. **Subagent results are summaries with pointers.** A worker or verifier
   returns: status, changed paths, commands run with exit codes, evidence file
   paths, blockers — not transcripts, not full logs, not file contents. The
   normal final is at most 10 lines or 600 words, whichever is smaller. All
   matrices, command output, and detailed findings belong in an evidence file
   with only its path returned.
5. **Read once, brief forward.** AIRD docs, skill references, and standards files are read once at the phase that needs them. If you notice yourself re-reading the same reference, the delivery brief is missing a line — fix the brief, don't re-read.
6. **Verify per wave, not per twitch.** Gate commands run once after a wave
   integrates (plus targeted tests a worker runs on its own diff). Re-running
   the full gate set after every micro-fix is the second-biggest token sink
   after polling. The validator runs at pre-flight, after an accepted-contract
   or manifest change, at a checkpoint when AIRD artifacts changed, and at
   final verification—not after every source edit.
7. **Checkpoint routinely; stop only at a hard context boundary.** Checkpoint
   after every execution slice, but do not end the root task merely because a
   slice finished. After checkpointing, discard slice-local details, rebuild
   the next compact brief from disk, and continue with a fresh worker when the
   next dependency is ready. End the root task only when one of these
   hard-stop conditions is true: context usage reaches 100%; auto-compaction
   or summary injection occurred; or delivery state/evidence remains ambiguous
   after one narrow recovery attempt. For any truncated read, first
   retry once by reading only the missing named section(s), each with a strict
   output cap. Truncation alone is not a stop while a bounded recovery is
   available. When a hard stop is reached, the **very next action** is writing
   `STATE.md` + `.continue-here.md` and ending the current root task.
8. **STATE is an index, not a transcript.** Keep current position, closed
   workorders/findings, evidence pointers, blockers, and exact next action.
   Detailed chronology belongs under `evidence/`. After pre-flight, read only
   STATE frontmatter, Current Position, the active workorder block, and Exact
   Next Action; never dump the whole file back into context.
9. **No duplicate transport.** Do not both print a report in commentary and
   later repeat it in final. Do not copy an evidence file into chat. One-line
   progress updates may name only the changed state, blocker, or gate verdict.

### Mandatory Slice Checkpoint

At the end of every execution slice (implementation, finding-group author
work, restricted closure, or verification gate):

1. inspect only the slice's scoped diff and author evidence;
2. update `STATE.md` and `.continue-here.md` with paths and exact next action;
   set `checkpoint_kind: routine` without changing delivery status unless a
   hard stop, blocker, or user decision actually pauses delivery;
3. run the validator once when AIRD artifacts changed;
4. emit at most one concise commentary checkpoint naming the verdict, evidence
   path, blocker, and next slice;
5. discard slice-local detail and continue with the next dependency-compatible
   slice when no hard-stop condition is true.

A routine slice checkpoint must not tell the user to open a new task. Prefer
automatic continuation in the same root turn when the user asked to continue,
finish, or run the delivery loop. A later **fresh Codex task/session** starts a
new disposable root context from the checkpoint only after a hard-stop
condition, an external blocker, or a required user decision. A new turn in the
same long thread does not reset token cost, so do not mislabel it as fresh; it
may still continue safely while the hard-stop conditions remain false. If the
product cannot restart the root context automatically, ask for a fresh task
only at that actual hard boundary.

Pre-flight-only diagnostics are not an execution slice. When a bounded,
nonessential diagnostic is retried successfully under rule 7 and no delivery
state is ambiguous, continue the selected slice in the current fresh task
instead of manufacturing a checkpoint.

For small or low-risk diffs, choose the narrowest gate set allowed by
`08-quality-gates.md` and `references/verification-gates.md`: targeted author
checks plus the applicable focused reviewer, QA, or docs pass at batch end.
Narrowing may reduce scope, but it may never replace a required
production-dialect/runtime, migration-upgrade, deployable-artifact, or
API/business-flow gate with unit tests or static review. Do not run
browser/usability/security/docs gates unless the change type or AIRD gates
require them.

## Workorder Sizing Gate

A workorder is executable only if a single worker can complete it in one fresh context without degradation. At pre-flight, check workorders in the selected accepted dependency closure, not later draft waves, against:

- it has a **Task Breakdown of 1–3 atomic tasks** (an atomic task = one coherent edit unit: one endpoint, one component, one migration, one config surface — roughly one commit);
- the worker can finish it while staying within about half of a fresh context window (inputs + files it must open + its own diff);
- its docs-to-read list names specific files/sections, not "the whole package".

An oversized workorder blocks only its affected wave. Route that wave back to
discovery; do not invalidate unrelated accepted waves. Prefer one coherent
runnable ownership slice over mechanical one-file fragmentation.

## Independence Rules

- Spawn one worker per independent workorder; group independent workorders into **waves** (parallel where write sets and dependencies do not collide, sequential otherwise).
- Use `fork_turns: "none"` for workers. Pass only the workorder path, the named AIRD doc paths, and standards refs; never pass the parent transcript. `fork_turns`, not `fork_context`, is the supported spawn field.
- Keep write sets disjoint. If two workorders need the same file, sequence them or create an integration workorder.
- A worker must not choose architecture. If the brief is insufficient, the worker STOPs and reports a blocker; the main session routes it back to `architect`/discovery.
- Workers report changed files, tests run, contract deviations, and blockers.
- No empty or vacuous results. A worker or verification agent must never return blank or a bare acknowledgment. If it cannot access what it needs or cannot reach a verdict, it returns an explicit blocker; an empty result is a blocking failure, not a pass. A `reviewer`/`qa` gate that cannot read files or reach a verdict returns a blocking REVISE with the reason, never an implicit pass.

## Execution Phase

### 1. Pre-flight And Waves

Read the target base ref from `REVIEW-MANIFEST.json`. Fetch it when it is a
remote-tracking ref, then run the deterministic check before spawning anything:

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/public/aird-delivery-loop/assets/scripts/aird-validate.mjs" ".agent/aird/<feature-slug>"
```

Select the earliest `readyWaves` entry from validator output unless `STATE.md`
names another valid accepted wave. A nonzero result blocks only the base or
wave named by the error; an unchanged independent accepted wave remains
eligible when validator output lists it as ready.

For the selected closure only, confirm sizing, disjoint/ordered write sets,
verifiable `must_haves`, and named focused tests. Confirm that required release
gates are mapped, but do not demand their runtime environment before
implementation. Missing database/container/browser credentials or fixtures
sets verification/release to blocked; it does not block reversible code work.
Migration history edits still block immediately because they can make the
implementation itself unsafe.

For an auth/API/protocol/restart-sensitive workorder, perform one bounded
plumbing check before spawning implementation. Record a four-column table in
the delivery brief: required datum, trusted source, durable restart source, and
server-side recheck. Missing project/build/tenant IDs, credentials, cursor
state, or restart bindings are contract blockers; route them to one scoped
revision before code. This is not a broad semantic re-review.

**The plumbing check tests the real payload, not an equivalent one.** Discovery
proved the external contract at its phase-3.5 probe gate; pre-flight confirms
that the code path still emits what that probe accepted. Drive the actual
serializer/client with its unmodified output against the real boundary and
assert the terminal observable. A reachability check, a hand-written "equivalent"
request, or a documentation example is a proxy probe — it passes while the real
path returns `400`, and it converts a one-minute discovery failure into a
half-day delivery blocker. See `references/verification-patterns.md` for the
full red-flag list. If `03-risk-register.md` lists an existential risk whose
`probe` evidence does not exercise the production path, treat it as unproven and
route it back through the discovery probe gate before spawning implementation.

Two specific shapes qualify as "does not exercise the production path", and both
pass a careless read because the evidence file itself is honest:

- the risk declares a non-empty `faked_boundaries`, or its probe log contains
  substitution markers (`mock`, `double`, `stub`, `live_*: false`) with no
  `faked_boundaries` declaration at all;
- the `claim` describes a narrower scope than the design depends on — typically
  because it was rewritten after a partial probe. `claim_locked_at` older than
  the probe evidence is the check; the validator enforces it.

In both cases the assumption is unproven regardless of the `status` field.
Delivery does not re-litigate design, but it does not implement against an
untested contract either: stop and route it back.

When `02-ui-prototype.md` exists and the selected wave has `surface: frontend`
or `mixed`, its `docs_to_read` and acceptance evidence must name the prototype
contract and declared artifacts. Browser/usability verification stays a gate,
not a prerequisite workorder in the implementation dependency chain.

Set `STATE.md` to `in_delivery`, set `active_wave`, and write the one-page
delivery brief. Do not regroup or semantically re-review the accepted wave.

### 2. Spawn Implementation Agents

Route by frontmatter `surface`: `backend-worker` for backend/data/infra runtime
work, `frontend-worker` for frontend, `worker` for small mixed/tooling/docs,
`debugger` first for bug isolation, and `cybersec` for explicitly
security-sensitive risks. Do not route by keyword matches in the body.

Standards via `$code-review-standards` — with a hard cap. Every subagent already pays a ~28K-token spawn tax (permissions instructions + AGENTS.md) before reading anything; do not add a 25K standards pile on top. Rules:

- a worker loads **at most 3 reference files by default** and **at most 4** only
  for a named security/API/testing boundary; a reviewer loads at most 4;
- selection: `universal.md` and `structure-reuse-performance.md` always; for
  code work add exactly one most-relevant stack file (`frontend.md`,
  `typescript-react.md`, `backend.md`, or one language file). Use the fourth
  file only for
  `security.md` on auth/permissions/secrets/PII/callbacks/multi-tenant data,
  `testing.md` when tests are the main deliverable, or `api-design.md` for a
  public contract change. Count physical files, not conceptual "slots".
  `community-awesome.md` replaces the optional fourth file and is allowed only
  for tooling choices with primary-source verification;
- never load both frontend and backend stacks into one agent — if a workorder genuinely spans both, that is a sizing failure: split it.

Per worker, pass: one workorder path; named AIRD doc paths; selected standards refs and the instruction to use Worker Mode before coding; the few locked decisions/risk gates relevant to this workorder; UX/UI constraints for user-facing work; allowed read/write scope; required tests; instruction to edit files directly, run its own targeted tests with output to a log file, and report the summary-with-pointers shape from the Context Budget Hard Rules. Keep prompts compact — paths and constraints, not copied AIRD sections.
Tell the worker explicitly that its chat final is capped at 10 lines and that
detailed results must be written to the workorder evidence directory.

### 3. Integrate (per wave)

After an execution slice finishes: inspect only its targeted diff; resolve
conflicts; ensure no changes escaped allowed scope unless justified; update
AIRD notes on deviations; update `STATE.md` with completed workorders,
blockers, evidence pointers, and exact next action; create follow-up workorders
for unresolved blockers. This ends the slice, not automatically the root task.
If no hard-stop condition is true, rehydrate the compact next-slice brief from
disk and continue with the next dependency-compatible workorder or wave
verification using a fresh subagent.

### Review Scheduling Policy

Run at most one **broad** reviewer pass per integrated wave, never
automatically per workorder. Workers run targeted tests on their own diffs; the
wave reviewer checks the integrated wave diff against the AIRD package, DoD,
standards, and risk gates. Restricted closure reviews are not additional broad
passes: they inspect only open finding IDs and fix-caused hunks.

The terminal wave review is also the final reviewer when it covers the complete
integrated delivery state. Spawn a separate final reviewer only for unreviewed
cross-wave integration changes or final DoD boundaries that the terminal wave
review could not cover. Never review unchanged hunks twice merely to obtain
both a "wave" and a "final" verdict.

Do not spawn per-workorder reviewers, without exception. A workorder line such
as "independent review required", a sensitive boundary, a high-risk marker, or
a blocked downstream dependency is satisfied by the integrated wave review,
not an early reviewer. Workers own targeted author tests before integration.

Do not split an accepted wave or manufacture a singleton wave to obtain an
earlier review. If an accepted wave genuinely cannot proceed safely without an
intermediate reviewer, pause and route the wave definition back to discovery;
do not invent a delivery-time per-workorder gate.

If a reviewer finds blocking issues, assign monotonic finding IDs and batch
all findings from that pass into the smallest coherent fix cycle(s) by
dependency and overlapping write set. Complete author fixes and targeted tests
for the whole finding group before spawning one restricted closure reviewer.
That closure checks only open IDs and fix-caused hunks. Do not review each fix
workorder separately and do not start a fresh broad review after a closure.

## Verification Phase

Run one broad verification pass per integrated wave. Restricted closure checks
and impacted runtime rechecks from the bounded defect loop are allowed; they
must not become another broad wave review. At the end, run only final
integration gates not already satisfied by the terminal wave. This does not
authorize a reviewer after each workorder or an automatic second broad final
reviewer. Gate commands come from the delivery brief; their full output goes
to log files, and only exit codes, executed/passed/failed/skipped counts,
failing lines, and log paths enter the conversation.

Required gates:

- project tests/lint/typecheck/build named in `08-quality-gates.md`;
- one broad `reviewer` with `$code-review-standards` loaded for waves that
  change code, configuration, schemas, or runtime behavior; a docs-only wave
  uses the mapped docs/link/render review instead;
- `qa` for behavioral acceptance criteria, edge cases, negative paths, and
  integration behavior; docs-only work uses QA only when `08-quality-gates.md`
  explicitly maps a behavioral or rendered-output gate.

Verifier context diet: a reviewer/QA agent receives the wave's diff scope, the workorder paths **for that wave only**, and the DoD lines its gate protects — not the whole `workorders/` dir, not `STATE.md` history, not the full package. The reviewer works **from the diff**: `git diff <base> -- <paths>` hunks first, opening only the specific line ranges needed to judge a hunk in context. Reading whole source files via `nl -ba`/full `sed` ranges is the reviewer equivalent of chunk-polling. Runtime verification is a separate execution responsibility and cannot be replaced by diff review.

Every verification pass must check four levels where applicable: **exists, substantive, wired, functional**. File existence alone is not implementation.

**Fail-closed rule:** a required gate is `pass` only when its expected checks actually executed and produced concrete evidence. Exit code 0 alone is insufficient: record executed, passed, failed, and skipped counts or an equivalent named assertion list. Any required check reported as skipped, not run, unavailable, blocked, or unverified makes the gate `blocked-no-evidence`, even when the command exits 0. Never translate this into `PASS with residual risk`, `evidence debt`, `wired-but-skipped`, or a reviewer waiver. Only the user may explicitly accept a required-gate waiver; a waiver keeps delivery `paused`/`NO-GO` and cannot produce `status: complete`. Record the exact command, runtime dependencies, evidence pointer, and DoD line next to every gate result.

Conditional gates are selected by accepted V4 workorder frontmatter, not by
unrelated package files or prose: run Backend Runtime Verification when a
completed backend/data/infra/mixed workorder has a runtime profile among
`service`, `database`, `migration`, `api`, `job`, `artifact`, or `external`;
run UI Verification when a completed frontend/mixed workorder selects the
`browser` runtime profile. UI specification/prototype files provide the
verification contract for such a workorder but do not route a backend-only
wave into browser verification. Use `cybersec` for named security risks and
`docs` when a mapped gate requires documentation.

### Backend Runtime Verification Protocol (mandatory for backend changes)

Read and execute `references/backend-runtime-gates.md`. Browser checks are not backend verification; they run only after this protocol passes.

1. **Run real dependencies.** Exercise the production database dialect and other changed runtime boundaries using disposable production-equivalent dependencies. Required suites must execute with zero skipped checks. Missing credentials/runner/container/DSN is `blocked-no-evidence`, not PASS.
2. **Prove migration paths.** For schema/migration changes, run both a fresh install and an upgrade from the last shipped schema plus representative data. Check migration idempotency and the package's rollback or fix-forward rule. Historical migration drift or an unavailable previous-release fixture blocks delivery.
3. **Build and start what ships.** For a deployable service, build the real container/binary/package, start it with production-like configuration, wait for readiness, assert health, and scan startup logs for migration/config/runtime failures.
4. **Exercise the contract without mocks.** Drive changed HTTP/API/job/queue or lifecycle behavior through its public runtime boundary, including the primary flow, one negative path, and the regression/lifecycle sequence most likely to expose persisted-state or wiring defects. Record request/response or equivalent runtime observations.
5. **Record deterministic evidence.** Write `10-backend-verification.md` from `assets/templates/backend-verification.md`, keep logs under package `evidence/`, and run `aird-validate.mjs`. The final evidence must have `result: pass`, `failed_checks: 0`, and `skipped_checks: 0`; required subtype results must be `pass`.

### UI Verification Protocol (mandatory for user-facing changes)

A delivered wave is **user-facing** when one of its completed accepted
workorders has `surface: frontend|mixed` and `runtime_profiles` includes
`browser`. `02-ui-spec.md` and `02-ui-prototype.md` define the contract but do
not independently classify a backend-only wave as user-facing. Browser
verification is then required; "I read the code and it looks right" is not
evidence. Do these steps; do not narrate them as done without running them:

1. **Launch a target.** Start the dev server / build a preview in the background with output to a log file, and get a concrete URL — or identify an already-running one. No running target → mark the gate `blocked-no-evidence`, escalate, do NOT mark complete. (This is the step the loop most often skips.)
2. **Drive it in a real browser — inside a QA subagent.** Spawn `qa` with the `verify-on-browser` (CDP) or `playwright` skill loaded. It navigates the URL, walks the primary flow from `02-ux-problem-framing.md`/`02-ui-spec.md` plus each required state (happy, empty, loading, error, permission-denied), and **saves a screenshot file per state**. Screenshots stay on disk; the subagent returns a per-state pass/fail verdict plus file paths. The orchestrator never loads image bytes into its own context.
3. **Usability check — route by target, and check the tooling first.** Compare
   the running UI against the accepted prototype direction and mock states,
   with intake from `02-ui-spec.md`/`02-ui-prototype.md`. Two routes, and only
   one of them works inside `qa`:
   - **Web UI (default):** the same or a second `qa` subagent walks the flow
     with `verify-on-browser`/`playwright` — the tools it already has — judging
     hierarchy, affordances, wording, error recovery, and state clarity, not
     just "did the click work". Record `usability_method: browser`.
   - **Desktop/native target:** this needs the `usability-tester` skill, which
     drives Computer Use. `usability-tester` is a skill, not an agent — never
     spawn it as an `agent_type` — and `qa` has no Computer Use tools, so a
     `qa` subagent **cannot** run it. Run it from a context that does have
     them, and record `usability_method: computer-use`.
   - **Neither available:** set `usability_result` accordingly and
     `blocked_reason` to the missing capability. Do not report a usability pass
     that no one performed.
4. **Record evidence.** Write `10-ui-verification.md` from
   `assets/templates/ui-verification.md`: fail-closed frontmatter, preview URL,
   supported browser tool, executed/passed/failed/skipped state counts,
   screenshot paths for every passed required state, usability verdict and
   method, and issues found/fixed. A concrete observation without a screenshot
   cannot pass a required UI state. This file is what the fail-closed rule and
   `aird-validate.mjs` require.

   Declared verdicts decide the gate, not narrative: unavailable or deferred
   evidence is expressed through `blocked_reason` and per-state
   `blocked-no-evidence` table rows. Write the real history in the prose,
   including problems you hit and fixed — describing a resolved failure is
   expected and never blocks completion.

If a live preview is unavailable, a `qa` review against the UI spec may record useful partial evidence, but the browser gate remains `blocked-no-evidence`. Record the fallback in `10-ui-verification.md`, set `STATE.md` to `paused`, and keep release `NO-GO`; never report delivery complete.

## Defect Loop

For each verification finding:

1. Classify severity and affected DoD item.
2. Create or update `fix-workorders/F-NNNN.md` from
   `assets/templates/fix-workorder.md`. Fix workorders obey the same sizing gate
   but live outside discovery's immutable `workorders/` and therefore do not
   invalidate the accepted-wave hash manifest.
3. Assign the smallest appropriate worker in a fresh context.
4. Re-run only impacted author tests after each fix. Do not spawn reviewer/QA
   while sibling fixes from the same finding group remain open. After the
   whole finding group is author-complete, run one restricted closure pass on
   the open IDs and fix-caused hunks, plus only the smallest required runtime
   gates for that group.
5. Repeat until no blocking findings remain, max 3 revision attempts per finding group.
6. Escalate to the user if the blocking count does not decrease between attempts or the third attempt still has blockers.

One execution slice may implement one finding group or perform its restricted
closure review, not both. Checkpoint after author fixes. The same root task may
then run the closure as the next slice with a fresh reviewer when no hard-stop
condition is true.

Bound the whole loop: at most 3 full verification cycles per delivery run. New blocking findings on cycle 3+ go straight to escalation with the remaining blockers and a recommended next step.

Do not mark delivery complete while reviewer, QA, browser, or usability gates have blocking findings.

On every context checkpoint, write `.continue-here.md` from
`assets/templates/continue-here.md` with `checkpoint_kind: routine|hard_stop`,
exact next action, completed work, blockers, and required reading. A routine
checkpoint does not set `STATE.md` to `paused`; a hard stop, external blocker,
or required user decision may do so when delivery genuinely cannot continue.

## Completion Criteria

Delivery is complete only when:

- all required implementation/spike workorders are done; release evidence and
  verification are satisfied through mapped gates rather than artificial
  implementation dependencies;
- tests and quality gates pass, each with evidence attached (fail-closed — no vacuous passes);
- the mapped broad reviewer or docs-review gate has no blocking findings;
- QA accepts the DoD against concrete evidence when a behavioral QA gate
  applies;
- backend changes have `10-backend-verification.md` with zero failed/skipped checks and all required runtime, upgrade, artifact, API, and business-flow results passing;
- for user-facing changes, `10-ui-verification.md` exists with a real preview URL and a per-state pass/fail table backed by screenshot paths;
- the usability check has no blocking UX findings for user-facing flows;
- security-sensitive changes have been reviewed;
- required docs updates are done; optional docs may be explicitly deferred
  with an owner and reason;
- `STATE.md` passed through `implementation_complete` → `verifying` → `ready_for_release` and now shows `status: complete`, with `ready_for_release: ready`; a required-gate waiver or deferred required work keeps `status: paused` and the release verdict `NO-GO`;
- final diff is scoped and explainable.

## Final Response

Summarize: AIRD path and workorders executed; waves and agents used with scopes; changed files; gates run with evidence pointers; remaining risks or deferred work; whether the DoD passed. Keep it a summary with pointers — the evidence lives in the package, not in the reply.

Routine nonterminal slice checkpoints are concise commentary updates, not final
responses. Use a final checkpoint response only when pausing for a hard context
boundary, an external blocker, or a required user decision; report only the
slice/workorder, verdict, evidence path, blockers, and exact next action. Do
not recap earlier closed workorders.
