---
name: aird-delivery-loop
description: "Explicit ARiD/AIRD delivery loop for implementing an existing AIRD package through lean orchestration and independent verification subagents. Use only when the user explicitly invokes $aird-delivery-loop, says AIRD/ARiD delivery, or asks to execute workorders from an existing AIRD package. The orchestrator implements sequential slices itself and starts implementation workers only on two justifications: actual parallel execution of large, dependency-ready slices with disjoint write sets, or its own context reaching 60% with substantive work left. Runs fail-closed backend runtime and migration-upgrade checks, tests, code review, QA, browser checks for web apps, usability checks for UX flows, and fix loops until DoD/quality gates pass. Context is disposable, disk is memory: checkpoint every slice and proactively hand the root task over after six slices or near 70% context."
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
permission to spawn sequential isolated workers for its workorders.

The core rule that keeps token spend sane: **no long-lived all-remembering orchestrator.** Everything durable lives in files (`STATE.md`, `REVIEW-MANIFEST.json`, `.continue-here.md`, workorders, evidence files); the orchestrator context is a disposable working buffer. A fresh session continues from `STATE.md`, the review manifest, and the selected wave—not parent chat history.

- **Checkpoint, don't compact.** After pre-flight, after every execution slice,
  and after each verification gate, write the durable outcome into `STATE.md`.
  A checkpoint is a durability boundary, not automatically a user-visible
  stop. Continue with the next lean-routed executor after the checkpoint when the compact
  orchestrator still has budget. Proactively hand over the root task after six
  execution slices in one root session or when context reaches about 70%,
  whichever comes first. At that planned boundary, at 100% of the context
  window, after auto-compaction, or when another hard-stop condition below is true, write
  `.continue-here.md` (from `assets/templates/continue-here.md`) and end the
  current root task. The next task continues from disk. Never rely on
  compaction to carry state.
- **Workers exist for actual parallelism, or for context headroom.** The orchestrator implements slices itself; the two spawn justifications are defined once, in Independence Rules below. Give a justified worker the workorder file, named AIRD doc paths, and standards refs—never the parent transcript.
- **The orchestrator never holds raw bulk.** Full logs, screenshots, and file contents live on disk; the orchestrator holds verdicts, counts, and paths.

Explicit invocation counts as permission for the delegation this skill actually needs; it is not permission to spawn an agent for every edit or finding. Its lean-routing rules have priority over the general no-delegation rule in `AGENTS.md`. Do not ask before each justified spawn.

Use the discovery skill's `references/gates.md` (one taxonomy for both loops) for gate behavior, `references/revision-loop.md` for bounded defect loops, `references/verification-patterns.md` for real-implementation checks, `references/backend-runtime-gates.md` when accepted workorder frontmatter selects backend runtime profiles, the discovery skill's `references/language.md` for the language rule, and its `references/process-metrics.md` for the end-of-loop metrics and improvement phase. `surface` and `runtime_profiles` are authoritative; never infer gate routing from arbitrary workorder prose.

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

## Language And Clarity Standard

Write every human-readable AIRD explanation, deviation record, status update,
verification interpretation, and user-facing report in clear Russian — also
when Delivery edits Discovery artifacts — and repeat that requirement in every
worker, reviewer, QA, or specialist prompt that can create or edit AIRD text.
The full rule is `../aird-discovery-loop/references/language.md`; the short
form: ordinary Russian terms first with the exact term in parentheses on first
use; results as cause and effect (what changed, why, how it behaves, what
evidence proves it, what stays blocked), never filenames or raw output in place
of an explanation; and **template headings, frontmatter keys, enum tokens, IDs,
commands, and paths are contract keys** that the validator reads literally —
keep them verbatim and write the content under them in Russian.

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
- impact-radius paths that lock or consume the changed contract (tests, snapshots, fixtures, enum/schema locks, generated expectations, and direct consumers);
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
   prefer 2–4K. Never request 20K–50K output "just in case". Keep source
   inspection bounded and put full logs in an evidence file; never spawn a
   worker solely to offload reading or log inspection.
2. **No chunk-polling of long-running processes.** For builds, test suites, deploys, and remote scripts: redirect full output to a log file, run to completion (in the background if needed), then read the verdict once — exit code, counts, `tail -30`, and the log path. Never stream 30-second output chunks into the conversation, never poll a running process with repeated reads. If a process needs watching, a single wait-then-tail beats N polls.
   The same rule applies to agents: do not call `list_agents` repeatedly and do
   not issue 30-second status polls. Wait on the intended target; request at
   most one compact progress update when it changes a decision. Once an agent
   final is delivered, never fetch the same result again through an agent
   listing.
3. **Images never enter the orchestrator context.** Screenshots are evidence files: save to disk, record the path in `10-ui-verification.md`. Only a QA subagent (fresh context, discarded after the verdict) opens pixels. The orchestrator receives pass/fail per state plus paths.
4. **Subagent results use six fixed fields.** A worker or verifier returns
   exactly six one-line fields, in this order: `status`, `paths`, `commands`
   with exit codes, `numbers`, `evidence`, `blockers`. The `numbers` field
   points to the count section in evidence instead of copying the values. No
   tables, transcripts, logs, file contents, or seventh field are allowed.
   Read only those first six fields; if the response overflows, do not read or
   summarize the overflow and do not ask the agent to resend it. Detailed
   material belongs in the referenced evidence file.
5. **Read once, brief forward.** AIRD docs, skill references, and standards files are read once at the phase that needs them. If you notice yourself re-reading the same reference, the delivery brief is missing a line — fix the brief, don't re-read.
6. **Verify per wave, not per twitch.** Gate commands run once after a wave
   integrates (plus targeted tests the slice implementer runs on its own diff). Re-running
   the full gate set after every micro-fix is the second-biggest token sink
   after polling. The validator runs at pre-flight, after an accepted-contract
   or manifest change, at a checkpoint when AIRD artifacts changed, and at
   final verification—not after every source edit.
7. **Checkpoint routinely; transfer before an expensive context boundary.** Checkpoint
   after every execution slice, but do not end the root task merely because a
   slice finished. After checkpointing, discard slice-local details, rebuild
   the next compact brief from disk, and continue with the next lean-routed executor when the
   next dependency is ready. End and hand over the root task after six slices
   since the last handoff or at about 70% context, even when delivery is smooth;
   write `checkpoint_kind: proactive_handoff`. Also end when one of these
   hard-stop conditions is true: context usage reaches 100%; auto-compaction
   or summary injection occurred; or delivery state/evidence remains ambiguous
   after one narrow recovery attempt. For any truncated read, first
   retry once by reading only the missing named section(s), each with a strict
   output cap. Truncation alone is not a stop while a bounded recovery is
   available. When a hard stop is reached, the **very next action** is writing
   `STATE.md` + `.continue-here.md` and ending the current root task.
8. **STATE is a bounded index, not a transcript.** Append slice outcomes only
   with `assets/templates/state-slice-entry.md`; each entry has exactly eight
   non-empty lines. Before adding the first entry for a new active wave, move
   every older-wave slice entry to `evidence/state-archive.md`, leaving only
   the current wave in `STATE.md`. Keep current position, evidence pointers,
   blockers, and exact next action. After pre-flight, read only STATE
   frontmatter, Current Position, the current-wave entry, and Exact Next
   Action; never dump the whole file back into context.
9. **Numbers have one home.** Counts, durations, pass/fail totals, and other
   slice measurements live only in the evidence file. `STATE.md` and a worker's
   `numbers` field point to its count section. User commentary states meaning
   and verdict, never repeats the measurements.
10. **No duplicate transport.** Do not both print a report in commentary and
   later repeat it in final. Do not copy an evidence file into chat. One-line
   progress updates may name only the changed state, blocker, or gate verdict.
11. **Bound every command result at the command.** Every verification or
   exploratory command that can produce variable output must redirect its raw
   stdout/stderr to an evidence log and end the chat-visible result with a
   counter or `tail -N`. Use `rg -c`, tool-native summary flags, or a bounded
   `tail`; never emit raw `tsc`, test, build, recursive search, or migration
   output and try to trim it after it entered context.

### Mandatory Slice Checkpoint

At the end of every execution slice (implementation, finding-group author
work, restricted closure, or verification gate):

1. inspect only the slice's scoped diff and author evidence;
2. update `STATE.md` with the eight-line slice template and update
   `.continue-here.md` with paths and exact next action;
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
new disposable root context from the checkpoint after the proactive six-slice
or 70% handoff, a hard-stop condition, an external blocker, or a required user decision. A new turn in the
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

A workorder is executable only if one executor can complete it in one bounded context without degradation (the orchestrator by default; a worker only under Independence Rules). At pre-flight, check workorders in the selected accepted dependency closure, not later draft waves, against:

- it has a **Task Breakdown of 1–3 atomic tasks** (an atomic task = one coherent edit unit: one endpoint, one component, one migration, one config surface — roughly one commit);
- the executor can finish it while staying within about half of its context window (inputs + files it must open + its own diff);
- its docs-to-read list names specific files/sections, not "the whole package".

An oversized workorder blocks only its affected wave. Route that wave back to
discovery; do not invalidate unrelated accepted waves. Prefer one coherent
runnable ownership slice over mechanical one-file fragmentation.

## Independence Rules

- Do not spawn an implementation worker for a single ready workorder or a sequence of workorders. The orchestrator executes that work directly.
- Spawn an implementation worker on either of exactly two justifications:
  1. **Actual parallelism.** At least two large, substantive slices are dependency-ready and can run concurrently with disjoint write sets. The orchestrator may execute one concurrent slice; run at most two implementation workers at once. Stop spawning as soon as only one ready slice remains.
  2. **Context headroom.** The orchestrator's own context is at or above 60% and a substantive slice remains — spawn even though that slice is the only one ready. Executing slices in the orchestrator is what keeps sequential work cheap, and it is also what accumulates the diffs, opened files, and test output the operating model says must not be held. Checkpointing tells you to discard slice-local detail; a fresh worker context is what actually guarantees it. The hard stops at 100% context and auto-compaction are recovery, not routing: by then the expensive part already happened.
- Below 60% with one ready slice, the orchestrator implements it. Above 60%, hand it off and keep the orchestrator as a compact router. Record which of the two justifications applied in the delivery brief.
- Do not spawn a worker for a purely mechanical closure: exact lock/count updates, snapshots, fixtures, imports, formatting, deterministic test expectation updates, AIRD evidence/checkpoints, or an adjacent path-scope correction that changes no production behavior. The orchestrator handles one coherent mechanical finding group as its own bounded slice and records the same evidence.
- A fix is not mechanical when it changes production source behavior, architecture, auth/security/privacy, persisted data or migrations, public/runtime contracts, concurrency, or requires domain judgment. That classification increases review and verification depth; it does not by itself justify a worker. Keep the fix with the orchestrator unless it satisfies one of the two spawn justifications.
- If an impact-radius omission is discovered only after a worker ran, do not spawn another agent merely to compensate. Record a fix workorder and repair the scoped test/fixture closure locally when deterministic; return to discovery when the missing scope changes the accepted product or architecture contract.
- Pass only the workorder path, the named AIRD doc paths, and standards refs; never pass the parent transcript. Spawn it with `fork_turns: "none"` (`fork_turns`, not `fork_context`, is the supported spawn field).
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

Use the validator's `waveDigest` as the pre-flight brief for surface,
dependencies, write scope, impact radius, and runtime profiles. Do not scan all
workorder bodies or rebuild their frontmatter with `awk`; open only the selected
wave's workorder body and its named `docs_to_read` sections when its slice starts.

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

Impact radius is decided in discovery, and delivery verifies it rather than
discovers it. Every contract-changing workorder carries an `impact_radius` list
naming the enum/schema/count locks, snapshots, fixtures, generated expectations,
and direct consumer tests it touches, all inside its write scope;
`aird-validate.mjs` fails the workorder otherwise, so pre-flight already caught
an undeclared or out-of-scope radius.

Before implementing or spawning a contract-changing slice, spot-check that
declared radius with one bounded search from the symbols actually being changed,
and enumerate or run the relevant existing regressions. A correct declaration
costs one command to confirm. If the search finds a lock the radius missed,
that is a discovery defect: repair the package before acceptance, or route an
already-accepted wave through the smallest scoped contract revision before
starting. Do not manufacture a later fix-agent cycle. Record the searched paths
and the result in the delivery brief.

For an auth/API/protocol/restart-sensitive workorder, perform one bounded
plumbing check before spawning implementation. Record a four-column table in
the delivery brief: required datum, trusted source, durable restart source, and
server-side recheck. Missing project/build/tenant IDs, credentials, cursor
state, or restart bindings are contract blockers; route them to one scoped
revision before code. This is not a broad semantic re-review.

**The plumbing check tests the real payload, not an equivalent one.** Discovery
proved the external contract at its phase-3.5 probe gate; pre-flight confirms
that the code path still emits what that probe accepted: drive the actual
serializer/client with its unmodified output against the real boundary and
assert the terminal observable. The proxy-probe red flags are in
`references/verification-patterns.md`. If an existential risk in
`03-risk-register.md` is `proven` while its probe substituted a boundary or its
claim was narrowed after the fact (the validator checks `faked_boundaries` and
`claim_locked_at`, per the discovery contract's Existential Risk Contract), the
assumption is unproven regardless of the `status` field: delivery does not
re-litigate design, but it does not implement against an untested contract
either — stop and route it back through the discovery probe gate.

When `02-ui-prototype.md` exists and the selected wave has `surface: frontend`
or `mixed`, its `docs_to_read` and acceptance evidence must name the prototype
contract and declared artifacts. Browser/usability verification stays a gate,
not a prerequisite workorder in the implementation dependency chain.

Set `STATE.md` to `in_delivery`, set `active_wave`, and write the one-page
delivery brief. Do not regroup or semantically re-review the accepted wave.

### 2. Route Implementation Execution

Apply the spawn gate (Independence Rules) before role routing; the orchestrator implements a sole ready slice itself. For a slice eligible under either justification, route by frontmatter `surface`: `backend-worker` for backend/data/infra runtime work, `frontend-worker` for frontend, and `worker` for mixed/tooling/docs. Use `debugger` for a required bug-isolation pass and `cybersec` for an explicitly required security review; those specialist gates do not turn a sequential implementation workorder into a worker spawn. Do not route by keyword matches in the body.

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

The Build-Less Ladder lives inside `structure-reuse-performance.md`, an always-loaded file, so it costs nothing against the cap. Instruct every implementer — orchestrator included — to climb it before writing: skip what is not needed, reuse what already exists, standard library, native platform feature, already-installed dependency, one line, then minimum code. Instruct every reviewer to run the over-engineering pass from the skill's Reviewer Mode as part of its existing pass, not as an extra spawn. The ladder governs how much code a slice writes, never how much it verifies: required tests, gates, and evidence stay exactly what the accepted workorder, DoD, and runtime profiles demand, and a fix still targets the root cause across all callers rather than the reported path alone.

Build every implementation-worker prompt from
`assets/templates/worker-prompt.md`. Fill only its ten slice-specific lines;
do not recreate the fixed language, runtime, evidence, scope, command-output,
or reporting rules in chat. The worker writes detailed results to the
workorder evidence directory and returns exactly the template's six report
fields.

### 3. Integrate (per wave)

After an execution slice finishes: inspect only its targeted diff; resolve
conflicts; ensure no changes escaped allowed scope unless justified; update
AIRD notes on deviations; update `STATE.md` with completed workorders,
blockers, evidence pointers, and exact next action; create follow-up workorders
for unresolved blockers. This ends the slice, not automatically the root task.
If no hard-stop condition is true, rehydrate the compact next-slice brief from
disk and continue with the next dependency-compatible workorder or wave
verification, spawning a worker only when one of the two spawn justifications
is satisfied.

### Review Scheduling Policy

Run at most one **broad** reviewer pass per integrated wave, never
automatically per workorder. The slice implementer runs targeted tests on its diff; the
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

Closure is deliberately asymmetric between the loops: discovery closes its
own findings without a reviewer because their criteria are deterministic
(validator output, a named command), while a code fix is judged by a fresh
restricted closure reviewer because its correctness is not. Do not import the
discovery rule here.

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

Read order is part of the diet: the reviewer traces the hunks **before** it opens the workorder, DoD lines, or gate mapping, then reads those and tries to falsify each checkable claim against the trace. The workorder is the change's own account of itself — testimony, not evidence — and a claim read first steers where the reviewer looks. This is an ordering rule inside the existing pass, not a second reviewer.

Test-coverage verdicts follow the "a test counts only if" rule in `$code-review-standards` Reviewer Mode: a test that did not run, or whose assertion cannot observe the changed output, does not close a `test-coverage` or `evidence` finding. Those two classes were half of all classified delivery findings; the rule is what stops them from being re-found on every wave.

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

1. Classify severity, affected DoD item, `class:` from the fixed finding
   vocabulary, and `root_cause:` — `code` when the accepted workorder was
   sufficient and the implementation deviated, `workorder` when the
   workorder/DoD/gate was silent or wrong on the point, `intent` when the
   user's request itself did not settle it. All three go into the finding
   file's frontmatter; the metrics script reads nothing else. A `workorder`
   or `intent` root cause still gets fixed here — it changes what the
   improvement phase learns, never the routing.
2. For a transport/wiring residual that only restores an already accepted
   contract (shared error mapping, route/export registration, import, or an
   equivalent one-location closure), create `finding-notes/F-NNNN.md` from
   `assets/templates/finding-note.md`. It contains only finding, file, expected
   behavior, and evidence. Use the full
   `fix-workorders/F-NNNN.md` template only when the repair changes accepted
   product behavior, architecture, security, persisted data, or requires a
   multi-step implementation slice. Both locations stay outside discovery's
   immutable `workorders/` and do not invalidate accepted hashes.
3. Choose the smallest executor per Independence Rules: the orchestrator fixes the coherent finding group locally, mechanical or not; a production-behavior change or specialist judgment raises review depth, it does not justify a worker.
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
`assets/templates/continue-here.md` with
`checkpoint_kind: routine|proactive_handoff|hard_stop`,
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

## Process Metrics And Loop Improvement

At the terminal outcome of the delivery run — `status: complete`, or a terminal
`paused`/`NO-GO` with an escalation — run the end-of-loop improvement phase
from the discovery skill's `references/process-metrics.md` (the canonical
contract):

1. Run the metrics script; it derives what the package on disk can prove
   (slices from `STATE.md` and `evidence/state-archive.md`, gates, findings,
   hard stops, verification evidence), writes
   `.agent/aird/<feature-slug>/metrics/delivery-<wave>.json`, appends the
   same line to `~/.agent/aird-metrics/history.jsonl`, and prints the
   comparison and fired signals:

   ```bash
   node "${CODEX_HOME:-$HOME/.codex}/skills/public/aird-delivery-loop/assets/scripts/aird-metrics.mjs" \
     ".agent/aird/<feature-slug>" --kind delivery --wave W1 --runtime codex --outcome complete \
     --extra '{"workers_spawned": 0, "worker_reasons": {"parallelism": 0, "context": 0}, "gates": {"first_pass": 6}, "findings": {"fix_cycles": 1, "max_revision_attempts": 1, "escalations": 0}, "discovery_defects": {"impact_radius_misses": 0, "proxy_probes": 0, "oversized_workorders": 0, "consumes_gaps": 0}, "package_rework_files": 0, "plan_deviations": 0, "auto_compactions": 0}'
   ```

   Pass through `--extra` only what the orchestrator alone knows from its
   delivery brief and slice log; a value nobody can derive stays `null`,
   never an estimate. An escalated or paused run records the same schema
   with `--outcome escalated`: failed runs are the most valuable records.
2. Read the printed comparison (`tail -n 20`, same kind; same profile when at
   least 3 records share it). Any nonzero `discovery_defects` value is a
   **discovery-skill** signal — the proposal it produces targets the discovery
   skill's rules, not this file.
3. A systemic signal (fired in this run and in a compared previous run, or any
   ⚠-signal) must append a proposal to
   `~/.agent/aird-metrics/improvement-backlog.md`; a first-time signal becomes
   a watch item. Deduplicate against existing entries. Never edit skill files,
   references, templates, or validator scripts yourself — proposals wait for
   an explicit user decision, and an accepted proposal is applied to both the
   Claude and Codex skill copies with its eval case per the contract.

Routine slice checkpoints and fresh-task handoffs do **not** record — only the
terminal outcome does, once. The phase is bounded like everything else here: a
few compound bash commands, no subagents, no extra reviewer calls, and it never
blocks completion or changes the release verdict. If the store is unreadable,
record what you can, note the skip, and continue.

## Final Response

Write the final response in clear Russian. Explain which implementation stages
and workorders were completed, how the delivered behavior now works from start
to finish, which files and system boundaries changed, which checks ran and what
their evidence proves, which risks or deferred items remain, and whether all
completion criteria passed. Include AIRD and evidence paths as references, but
do not replace the explanation with paths or raw status labels.

Avoid unexplained abbreviations and English terminology. Preserve an exact
technical name only when needed and explain it in Russian on first use. Keep
the response proportionate to the delivery, while still making the result
understandable without reading raw logs.

A terminal final response ends with the «Улучшение процесса» block required by
`references/process-metrics.md`: the few metrics most worth attention with
their comparison against previous AIRD runs, fired signals, and the generated
proposals that need a user decision — or an explicit «системных отклонений
нет».

Routine nonterminal slice checkpoints are concise commentary updates, not final
responses. Use a final checkpoint response only when pausing for a hard context
boundary, an external blocker, or a required user decision; report only the
slice/workorder, verdict, evidence path, blockers, and exact next action. Do
not recap earlier closed workorders.
