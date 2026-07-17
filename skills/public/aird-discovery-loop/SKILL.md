---
name: aird-discovery-loop
description: "Explicit ARiD/AIRD discovery loop for turning a non-trivial feature, refactor, or product idea into an implementation-ready AIRD package. Use only when the user explicitly invokes $aird-discovery-loop, says AIRD/ARiD discovery, or asks for an AIRD/ARiD package. Produces interactive discussion notes with risk-driven questions and mitigation decisions, PRD, UX framing, UI spec, a runnable mock-data UI prototype (preview/sandbox) for UI work, risk register, TRD, API/data contracts, implementation plan, quality gates, DoD, and scoped workorders using independent subagents."
---

# AIRD Discovery Loop

## Operating Model: Context Is Disposable, Disk Is Memory

Run this as the main-session orchestrator. Durable decisions live in the package;
a fresh session must resume from `STATE.md` and `00-discussion-log.md`.

- Checkpoint every phase. At 60 percent observed context, 45 minutes in the
  session, or two phases/cycles since the user's last checkpoint choice, update
  `STATE.md` and show a warn-only checkpoint. Do not stop automatically or
  choose a fresh session for the user. Offer `continue_current` and
  `start_fresh`; write `.continue-here.md` only if the user chooses fresh.
- Let scoped discovery agents write artifacts and return verdicts plus paths,
  never transcripts or bulk output.
- Keep runtime probing and raw logs inside scoped explorer contexts.
- Batch checks, cap listings, store long logs/screenshots on disk, and read each
  reference once.
- Run the discussion gate early from intake plus a recon summary.

Explicit invocation of this skill counts as an explicit request for delegation and parallel agent work: its spawning instructions have priority over the general no-delegation rule in `AGENTS.md`. Do not ask the user for permission before each spawn.

Use `supervisor` only when the discovery will require more than 3 agents running in parallel at the same time or needs active collision/progress management. Otherwise, the main session coordinates fan-out/fan-in directly.

Use `references/gates.md` for gate behavior and `references/interview.md` for the discussion protocol. Read `references/profiles-and-schema.md` at intake; it is the single source for readiness, product-first, detour, and Workorder Frontmatter V3. Maintain `STATE.md` after every meaningful phase transition so a fresh session can resume without parent chat history.

Default output path:

```text
.agent/aird/<feature-slug>/
```

Use another path only when the repository already has a stronger convention or the user specifies one.

## Artifact Set And Scaling

Artifact filenames use a phase prefix, and some phases produce more than one file: `00-` groups intake documents (`00-intake.md`, `00-discussion-log.md`), and `02-` groups the UX block (`02-ux-problem-framing.md`, `02-ui-spec.md`, `02-ui-prototype.md`). Duplicated prefixes are intentional grouping, not a mistake.

Scale the package to the task. The full set is the ceiling, not a mandate for every feature:

- User-facing work: produce the UX block (`02-*`) and follow the UI prototype gate.
- Non-UI work (backend refactor, data/tooling change): skip the `02-*` UX block entirely — do not write a UX-framing filler. UX framing is required only for user-facing changes, same as the UI spec and prototype.
- Small, low-risk features: keep each document concise (a short PRD, a few risk lines, a lean TRD) rather than merging files. `$aird-delivery-loop` reads `01-prd.md`, `03-risk-register.md`, `04-trd.md`, `07-implementation-plan.md`, `08-quality-gates.md`, and `09-dod.md` by name, so keep those filenames even when their content is minimal. Concise is fine; shallow is not. Note the reduced scope in `STATE.md`.

This keeps discovery aligned with the `AGENTS.md` "keep it simple / minimum viable output" principle instead of generating documents for their own sake.

### Choose A Discovery Profile At Intake

Record `discovery_profile: lite|standard|deep` in `STATE.md` using
`references/profiles-and-schema.md`:

- `lite`: localized, reversible, low/medium risk;
- `standard`: cross-layer or material single-service contracts/rollout;
- `deep`: security boundary, infrastructure, migration, multi-service, or
  high-impact rollout.

Risk and irreversibility override size. The profile controls artifact depth,
recon fan-out, packet review, and execution-wave requirements; it never weakens
the documentation depth floor or a security gate.

### Product-First Is A Blocking Invariant

Plan the first implementation wave around the smallest working public product
flow. Before that vertical slice is functional, permit at most one small
supporting workorder and at most 20 percent supporting delivery effort without
explicit user approval. Stop when either limit is exceeded.

Do not create a separate supporting AIRD package before the first functional
slice unless the user explicitly approves that package. Runtime-evidence
projects, harnesses, and tooling packages are supporting work. Record product
files, supporting WIP, and time/cycles without user value in `STATE.md`.

## Documentation Depth Standard

Every AIRD document must be useful to a fresh delivery agent that has no parent transcript. Do not pad documents with generic prose, but do make the load-bearing reasoning explicit. A document is deep enough only when it answers:

- **What is decided:** the exact product, UX, technical, contract, data, rollout, or verification decision.
- **Why this is the decision:** repo evidence, user decision, risk mitigation, or constraint that justifies it.
- **What alternatives were rejected:** at least the serious alternatives and why they lost.
- **What remains uncertain:** open assumptions, confidence, and whether they block delivery.
- **What delivery must do:** workorder, gate, test, or artifact that proves the decision was implemented.

Apply this depth floor proportionally. For a trivial change, one terse bullet may satisfy a section. For multi-service, API/data, migration, security, rollout, or unfamiliar-code work, each key document needs concrete evidence from reconnaissance and enough detail that a worker can implement from the AIRD package alone.

Use specific paths, symbols, endpoints, tables, commands, screenshots, or runtime observations where they exist. If a claim cannot be tied to evidence yet, label it as an assumption and put the evidence-gathering step in `03-risk-register.md`, `08-quality-gates.md`, or a spike workorder.

Never mark a document complete when it only restates headings, contains generic best-practice filler, or depends on the parent chat for context.

## Independence Rules

- Spawn one independent subagent per discrete discovery task.
- Spawn bounded tasks with `fork_turns: none` or `fork_turns: "1"`. Put the
  working role (`explorer`, `architect`, reviewer, and so on) in the task name
  and message; pass only the request, relevant paths, this skill name, and the
  precise scope.
- Run several same-role agents when scopes are independent, for example one `explorer` per service, layer, package, or suspected code path.
- Do not ask one subagent to solve product, architecture, code discovery, and risk analysis together.
- Subagents must return evidence and artifacts, not broad essays.
- Never accept an empty or bare-"done" subagent result. Every subagent returns at minimum: what it did, the files/artifacts it produced or changed, and a one-line summary. If it could not do the task (missing file, blocked access, ambiguous brief), it returns that as an explicit blocker with the reason — silence or a vacuous "ok" is treated as a failure, not success.
- Fan-in is owned by the main session: reconcile conflicts, mark assumptions, and decide whether another loop is needed.
- Workorder review is packetized by write seam. A reviewer reads at most 7
  workorders plus named plan/gate sections. Never ask one reviewer to absorb the
  whole deep package.
- Run deterministic lint before each packet review. Human review must spend
  context on semantics, not missing headings, bad counts, stale IDs, or cycles.

## Discovery Phases

### 1. Intake

In a git repository, first create or switch to the `aird/<feature-slug>` branch to isolate the AIRD change and make its package easy to resume. The branch name does not activate AIRD behavior: only the user's explicit invocation of this skill does. Ordinary tasks remain ordinary even when they run in the same repository or on an `aird/*` branch. During discovery, keep writes inside the package directory until delivery starts.

Create or update `00-intake.md` and initialize `STATE.md` from `assets/templates/state.md` with:

- user request and goal;
- target users and affected workflows;
- business/product outcome;
- constraints, non-goals, and open questions;
- repo, service, or surface boundaries if known;
- initial success criteria.

Also choose the discovery profile and initialize the three readiness fields from
`references/profiles-and-schema.md`. `status: ready_for_delivery` means only
`ready_for_implementation: ready`. Missing runtime environment access or
fixtures may block runtime verification and release, but not reversible product
implementation when contracts and verification plans are known.

At intake, collect open questions into `00-intake.md`/`00-discussion-log.md` but do not ask them yet, unless a missing answer would make even reconnaissance unsafe or meaningless. Surface them one at a time at the phase-2 discussion gate via the interview protocol (`references/interview.md`) — only those that would change product scope, UX flow, API shape, data model, rollout risk, or quality gates.

### 2. Discuss And Lock Decisions

Discovery is interactive. Do not silently generate a full specification when important choices are still open.

Create or update `00-discussion-log.md` from `assets/templates/discussion-log.md` with:

- options considered;
- user decisions;
- risk-driven questions and mitigation decisions;
- tradeoffs and rationale;
- deferred ideas;
- explicit non-goals and "must not" constraints;
- questions that remain open.

Use a discussion gate only when user input would materially change product scope, UX flow, an irreversible API/data decision, security/privacy, rollout risk, or acceptance criteria. Run it as a **focused one-decision-at-a-time interview** — see `references/interview.md`: closed A/B/C/D questions with a recommended default, highest-impact first, codebase-first, and a hard Normal-mode cap of 10 user-facing questions for the entire discovery. Stop earlier as soon as the remaining choices have safe defaults; 10 is a ceiling, not a target. Do not turn every architectural category or open detail into a question. Infer conventional, low-risk, reversible implementation choices from the repository, record them as agent defaults, and keep moving. Grill mode may expand the interview only when the user explicitly asks for it.

#### Risk-Driven Questions And Mitigations

Run a bounded risk-analysis task inside the discussion gate, not only after the
PRD/TRD are drafted. Load `rat` for riskiest assumptions and `rca` when the
request is driven by an incident, regression, recurring defect, or process
failure.

Ask the risk-analysis task for at most the top 2 risk-driven decisions that
genuinely need user input before the design can be trusted. Merge duplicates
with product or architecture questions and default the rest into
mitigations/evidence gates without asking. It must produce:

- risk or assumption;
- why it matters;
- closed A/B/C/D options with a recommended default;
- mitigation decision to lock (avoid, reduce, accept, defer/spike, or test);
- cheapest invalidating test or evidence gate;
- affected artifacts (`01-prd.md`, `02-ui-spec.md`, `04-trd.md`, `08-quality-gates.md`, `09-dod.md`, or a workorder).

Surface only the highest-impact questions through `references/interview.md`, one at a time, within the same 10-question Normal-mode cap shared by product and architecture. Record each resolved risk in `00-discussion-log.md` under `Risk-Driven Questions And Mitigations`; unresolved high-severity risks remain `open`/`unconfirmed` and block TRD/workorders unless explicitly accepted by the user with a mitigation or spike.

Risk question categories to scan: value/adoption, UX comprehension, data correctness, API/contract compatibility, security/access, operational failure, rollout/reversibility, performance/cost, observability, and verification evidence. A risk is "mitigated" only when the decision changes scope/design/gates/workorders, not when it is merely listed.

#### Architectural Decisions To Surface

The point of the discussion gate is to keep the user in control of the few decisions that shape the outcome, without making them design every implementation detail. Before writing the TRD, scan the categories below, collapse related decisions, and rank them. Ask only decisions that cannot be safely inferred and that materially affect user-visible scope, irreversible contracts/data, security/privacy, rollout risk, or acceptance criteria. Resolve conventional, repository-established, low-risk, and reversible choices as documented agent defaults.

- **Placement & boundaries** — which service/module/layer this lives in; new component vs extend an existing one; in-process vs network call; sync vs async/eventual.
- **Reuse vs build** — an existing library/pattern/service vs something new (honor any library the user named as a hard requirement); what to explicitly not reinvent.
- **Data & state** — new entities vs extend schema; source of truth; migration and backfill strategy; transactions/consistency; retention and privacy.
- **API & contracts** — new endpoint/event vs extend; versioning and backward compatibility; breaking changes; error/pagination shape.
- **Failure & concurrency** — error handling, idempotency, retries, timeouts, partial-failure and race behavior.
- **Security & access** — authz model, sensitive-data handling, secrets, external callbacks (route these to `cybersec`).
- **Rollout & reversibility** — feature flag, phased rollout, fallback, how to roll back, what to observe/measure.
- **Non-functional targets** — expected scale, latency/performance budget, cost.
- **Tradeoffs & alternatives** — simplest viable vs extensible-now; what is a non-goal; which alternatives were considered and why they were rejected.

Calibration: these 9 categories are a **scan checklist, not a question checklist**. In Normal mode, rank all candidate decisions, merge overlaps, and ask only as many highest-impact questions as remain necessary, up to a hard cap of 10 user-facing discovery questions total. Stop earlier when remaining choices are safe defaults. Do not exceed 10 unless the user explicitly requests Grill mode or explicitly agrees to continue the interview. For every unasked choice, use repository evidence plus the simplest reversible default and record it in `00-discussion-log.md` as an agent default, not a user decision. If an unasked choice is too high-risk or irreversible to default safely, record it as the blocking open decision instead of compensating with a long interview. When the surface is unfamiliar, run a scoped `architect` pass to rank and collapse candidates before selecting the few questions; `architect` proposes and defaults implementation details, but does not fabricate user decisions.

Record asked decisions and material agent-defaulted decisions in `00-discussion-log.md` (Architectural Decisions section) with rationale and impact. Keep `User Decision` blank for agent defaults and mark them `defaulted`. Do not proceed to the TRD (phase 6) while a high-risk or irreversible decision is still open or `unconfirmed`; ordinary reversible implementation details do not require user confirmation.

Non-interactive fallback: if the session is non-interactive or the user does not answer, record the recommended default as an explicit **assumption** (not a user decision), mark it `unconfirmed` in `STATE.md` and `00-discussion-log.md`, and continue if it is safe to do so. Never fill the `User Decision` column yourself. If the unanswered choice is high-risk or irreversible, write `.continue-here.md` and stop instead of assuming.

If exploration is needed before a useful discussion, do a narrow reconnaissance pass first, then return to the discussion gate before writing final PRD/TRD/workorders.

### 3. Current-State Reconnaissance

For repository, codebase, file, or current-behavior tasks, run `explorer` first. Split exploration by bounded scope:

- frontend surface;
- backend/API/service;
- data/storage/migrations;
- integration/external dependency;
- existing tests/quality gates;
- deployment/runtime behavior when relevant.

Each explorer output must answer: where, what connects, what matters next, and exact file paths.

Reconnaissance that touches a running system — ssh into hosts, `kubectl` inspection, hitting endpoints, reading remote logs, deploy checks — happens **inside the explorer subagent**, never in the main session. The explorer records observations (commands run, exit codes, key lines, log file paths) into `codemap.md` or the relevant AIRD doc and returns a summary with pointers. Raw remote output in the orchestrator context is the single biggest discovery token sink observed in practice.

For any non-trivial change, reconnaissance produces a `codemap.md` (via `explorer`) that becomes the map delivery and verification work from — a hierarchical tree with a one-line purpose per node plus a `Cross-cutting` section for shared infrastructure (DB, auth, test runner, config). Agents work from the codemap and load raw files only when a task needs a direct edit, which keeps context lean. For broad or multi-layer codebases, additionally split the deeper `codebase/` map files across scoped explorers. Use `references/codebase-map.md` for both shapes. Skip only for tiny changes confined to already-known files.

Reconnaissance is not complete until the AIRD docs cite the evidence that matters. After explorers return, propagate relevant paths, existing patterns, constraints, fragile areas, and verification commands into `01-prd.md`, `03-risk-register.md`, `04-trd.md`, `07-implementation-plan.md`, `08-quality-gates.md`, and each affected workorder. Do not leave evidence trapped only in `codemap.md`.

### 4. Product, UX, And UI Spec

Use `product-analyst` when available. For user-facing flows, spawn `uiux-designer` when available and load/use the `frontend-design` skill when relevant; if `uiux-designer` is not available, the main session drafts the UI spec using the `frontend-design` skill.

Produce:

- `01-prd.md`;
- `02-ux-problem-framing.md` for user-facing UI, dashboards, forms, workflows, or visual changes;
- `02-ui-spec.md` for user-facing UI, dashboards, forms, workflows, or visual changes.

Cover the user problem, core flow, expected states, user-visible edge cases, value, adoption blockers, and measurable acceptance.

The UI spec must define layout intent, information hierarchy, interaction states, responsive behavior, accessibility expectations, empty/loading/error states, and browser/usability verification notes. Use `assets/templates/ui-spec.md`.

The PRD and UX docs must name the target workflow, the user-visible behavior delta, the non-goals, the acceptance signals, and the risks that could make the feature feel wrong even if the code works. For non-UI technical work, the PRD can be short, but it must still explain the operational or product outcome that makes the technical change worth doing.

### 4.5 UI Prototype Gate

For UI work, build a mock-data prototype before TRD/workorders are finalized. The goal is to validate UX and business meaning early, not to sneak production implementation into discovery.

Produce `02-ui-prototype.md` from `assets/templates/ui-prototype.md` and, when useful, a prototype under:

```text
.agent/aird/<feature-slug>/prototype/
```

Prototype rules:

- use mocked data and realistic states from PRD/UI spec;
- prefer an isolated static HTML/React preview, Storybook story, local mock route, or existing project playground;
- reuse existing design-system primitives when cheap, but avoid production data, real side effects, migrations, or auth changes;
- include at least happy, empty, loading, error, permission, and edge states when relevant;
- start or identify a preview URL when possible and validate it with a browser-capable `qa` subagent; state screenshots are saved as files and referenced by path in `02-ui-prototype.md` — image bytes never enter the orchestrator context (the user is shown the preview URL and screenshot files, not inline dumps);
- discuss the prototype with the user and update `00-discussion-log.md`, `02-ui-spec.md`, and `02-ui-prototype.md` until the UX/business direction is accepted.

If the session is non-interactive or the user does not review the prototype, apply the same non-interactive fallback as the phase-2 discussion gate: record the direction as an `unconfirmed` assumption in `STATE.md`/`02-ui-prototype.md` (do not mark it `accepted`), and stop before delivery if the open UX/business questions are load-bearing.

Do not start delivery while a UI prototype has unresolved product, flow, hierarchy, or state-model questions.

### 5. Risks And Assumptions

This phase consolidates the risk work already used during discussion. Do not wait until phase 5 to discover the important risks. If new high-impact risks appear here, return to the phase-2 discussion gate and ask the user the needed mitigation question before finalizing TRD/workorders.

Produce `03-risk-register.md` with:

- top assumptions;
- risk severity and confidence;
- linked discussion decision or unconfirmed assumption;
- mitigation decision (avoid, reduce, accept, defer/spike, or test);
- cheapest invalidating test;
- technical, UX, adoption, data, security, and operational failure modes;
- decision rules for continue, pivot, or stop;
- quality gate or workorder that will prove the mitigation.

Each high or medium risk must be tied to one of: a locked discussion decision, an explicit assumption, a quality gate, or a spike/workorder. A risk with no owner, no mitigation, and no evidence gate is still open and may block `ready_for_delivery`.

### 6. Technical Design

Use a bounded architecture task for normal non-trivial design. Give it a deeper
scope only when the task crosses the ExecPlan threshold: complex feature,
significant refactor, multi-service change, schema/API contract change,
migration, or unresolved high-impact tradeoff.

If the architecture task surfaces a load-bearing decision that is not yet
locked in `00-discussion-log.md`, stop and return to the phase-2 discussion gate
before finalizing the TRD. It proposes options with a recommended default; the
user (or an explicitly recorded non-interactive assumption) locks the choice.
Do not let a TRD silently encode an unmade architectural decision.

Produce:

- `04-trd.md`;
- `05-api-contracts.md` when APIs or events change;
- `06-data-models.md` when data shape, persistence, migrations, or analytics change.

The TRD must include architecture, boundaries, interfaces, sequence/data flow, rollout/fallback, observability, and compatibility notes.

For multi-service, API/event, persistence, migration, security-sensitive, or rollout-sensitive work, the TRD must include:

- current-state evidence with file paths, endpoints, tables, commands, or runtime observations;
- proposed-state data/control flow, including sync/async behavior and ownership boundaries;
- failure modes, idempotency/concurrency behavior, and compatibility constraints;
- rollout, fallback, backfill, retention, and privacy notes where relevant;
- observability and debugging signals that prove the feature works after delivery;
- rejected alternatives and why they were not chosen.

If any of those sections is not applicable, say why. Do not silently omit it.

### 7. Implementation Plan And Quality Gates

Produce:

- `07-implementation-plan.md`;
- `08-quality-gates.md`;
- `09-dod.md`;
- `workorders/*.md`.

Name the first vertical slice in `07-implementation-plan.md`. Its dependency
spine must reach a focused, wired public product flow before optional tooling or
runtime-evidence packages. Classify every workorder as product, supporting, or
verification and initialize the detour counters in `STATE.md`.

Draft the dependency spine and gate/DoD IDs first. Treat shared tables as draft
until workorder packets pass lint and independent review. After all packets are
accepted, reconcile `07-implementation-plan.md`, `08-quality-gates.md`,
`09-dod.md`, and `STATE.md` once from the accepted frontmatter. This avoids
rebuilding every shared document after an oversized workorder is split.

In `08-quality-gates.md`, fill the `Gate -> DoD item` mapping table so every DoD item in `09-dod.md` is covered by at least one gate, and every gate points to the DoD item it protects. This mapping is what the `quality gates are mapped to the DoD` exit criterion checks.

#### Workorder Sizing (blocking rule)

Apply every blocking rule in `references/profiles-and-schema.md`. In particular,
reject before review or spawn any workorder with more than one runtime boundary,
more than 8 implementation scenarios, the full
build/start/health/live/rollback/cleanup lifecycle, or more than one ownership
seam. There is no high-risk exception: split and sequence it.

#### Workorder Frontmatter (blocking rule)

Create workorders from `assets/templates/workorder.md` and follow
`references/profiles-and-schema.md`. Frontmatter V3 is authoritative for
lifecycle, work class, vertical slice, runtime boundaries, scenario count,
lifecycle operations, dependencies, gates, write scope, and required reading.
Use spikes only for one fixed evidence question with a fail-closed outcome.

Each workorder must be independently executable and include:

- objective;
- task breakdown of 1–3 atomic tasks;
- allowed read paths and write paths;
- required AIRD docs to read;
- `$code-review-standards` references to load before coding/review (`universal.md`, `structure-reuse-performance.md`, plus stack-specific refs);
- exact behavior delta;
- contracts to preserve or change;
- `must_haves` with observable truths, required artifacts, and key links;
- acceptance criteria;
- verification steps;
- recommended agent role.

Workorders are the final test of AIRD depth. A delivery agent must be able to start with only the workorder and listed AIRD docs, then know exactly what to read, what to change, what not to change, and how to prove success. If a workorder still requires the parent conversation or asks the worker to decide architecture, return to discovery instead of starting delivery.

#### Packet Lint And Review

For each write-seam packet:

1. create/update workorders;
2. run `node <skill>/scripts/aird-lint.mjs <package> --strict-schema`;
3. fix all deterministic errors;
4. run an independent semantic/sizing review of that packet only;
5. mark its review artifact current or superseded;
6. reconcile shared docs only after every packet passes.

Legacy packages may run the linter without `--strict-schema`; missing V3
frontmatter is then a warning, while headings, task counts, references, cycles,
counts, and Gate↔DoD integrity remain enforced.

Use `assets/templates/state.md`, `assets/templates/aird-package.md`, `assets/templates/discussion-log.md`, `assets/templates/ui-spec.md`, `assets/templates/ui-prototype.md`, `assets/templates/workorder.md`, and `assets/templates/continue-here.md` when creating artifacts or pausing.

## Loop Exit Criteria

The AIRD package is ready for delivery when all of these conditions hold:

- intake, discussion log, PRD, risk register, TRD, implementation plan, quality gates, and DoD exist;
- UX framing and UI spec exist for user-facing UI, dashboards, forms, workflows, or visual changes;
- UI prototype notes and mock-state acceptance exist for user-facing UI, dashboards, forms, workflows, or visual changes;
- every implementation slice has a workorder with allowed write scope;
- every new workorder has valid Workorder Frontmatter V3 and belongs to a
  reviewed packet;
- every workorder passes every deterministic and semantic sizing rule with no
  high-risk exception;
- every workorder has its `Must Haves` sections filled (Truths, Artifacts, and Key Links where wiring matters);
- the first implementation wave advances the named first vertical slice;
- supporting work stays within one small workorder and 20 percent or has an
  explicit user-approved overrun;
- a supporting package has explicit user approval;
- API/data/model changes are explicit;
- quality gates are mapped to the DoD;
- documentation passes the depth standard: key docs record decisions, rationale, evidence, rejected alternatives, assumptions, and delivery implications proportional to risk;
- every medium/high risk has a mitigation owner and evidence gate;
- open questions are non-blocking or assigned to a workorder/spike;
- no worker needs the full parent conversation to understand its task;
- the machine-readable dependency graph is complete and acyclic;
- packages with more than 12 workorders define execution waves;
- `STATE.md` tracks the three readiness fields plus product files, supporting
  WIP, and time/cycles without user value.

`STATE.md status: ready_for_delivery` is the consequence of the above. Set it
only when `ready_for_implementation: ready`. Runtime environment/fixtures and
runtime evidence may remain blocked; record those blockers under
`ready_for_runtime_verification` and `ready_for_release` instead of preventing
implementation.

Before setting `status: ready_for_delivery`, run both deterministic checks and
make sure they pass — this proves workorder semantics, mappings, state and the
filesystem agree instead of rubber-stamping them:

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/public/aird-discovery-loop/scripts/aird-lint.mjs" ".agent/aird/<feature-slug>" --strict-schema
node "${CODEX_HOME:-$HOME/.codex}/skills/public/aird-delivery-loop/assets/scripts/aird-validate.mjs" ".agent/aird/<feature-slug>"
```

The AIRD linter validates schema, sizing, dependency graph, coverage, counts and
Gate↔DoD transpose. The delivery validator checks state/filesystem structure.
Neither replaces independent semantic review; semantic reviewers should not
redo defects the linter can prove.

If these conditions are not met, run another scoped discovery loop instead of starting implementation. Cap discovery at 3 iterations; if conditions still are not met after the third, escalate to the user with the remaining gaps and a recommended default rather than looping again.

On pause or blockage, write `.continue-here.md` from `assets/templates/continue-here.md` with exact next action, completed work, blockers, and required reading.

## Final Response

Summarize:

- AIRD path;
- agents used and scopes;
- highest risks;
- workorders created;
- whether delivery can start;
- any blockers or assumptions.
