---
name: aird-discovery-loop
description: "Explicit ARiD/AIRD discovery loop for turning a non-trivial feature, refactor, or product idea into an implementation-ready AIRD package. Use only when the user explicitly invokes $aird-discovery-loop, says AIRD/ARiD discovery, or asks for an AIRD/ARiD package. Produces interactive discussion notes with risk-driven questions and mitigation decisions, PRD, UX framing, UI spec, a runnable mock-data UI prototype (preview/sandbox) for UI work, risk register, TRD, API/data contracts, implementation plan, quality gates, DoD, and scoped workorders using independent subagents."
---

# AIRD Discovery Loop

## Operating Model: Context Is Disposable, Disk Is Memory

Run this as the main-session orchestration skill. The main session owns the loop, spawns independent subagents, integrates results, and decides when the AIRD package is ready. Do not create a separate permanent orchestrator unless the user asks for one.

Explicit invocation of this skill counts as an explicit request for delegation and parallel agent work: its spawning instructions have priority over the general no-delegation rule in `AGENTS.md`. Do not ask the user for permission before each spawn.

The same token model as `$aird-delivery-loop` applies: **no long-lived all-remembering orchestrator.** Everything durable lives in the package files; the orchestrator context is a disposable working buffer, and a fresh session must be able to continue from `STATE.md`, `00-discussion-log.md`, and—after wave acceptance—`REVIEW-MANIFEST.json`.

- **Phase boundaries are checkpoints.** After each discovery phase (intake, discussion, recon, product/UX, risks, TRD, plan), write the outcome into the package and `STATE.md`. 
- **The orchestrator holds decisions, not bulk.** Subagents (`explorer`, `product-analyst`, `architect`, `risk-analyst`, `uiux-designer`) read sources and write package files directly; they return verdicts, key facts, and paths — not transcripts or file dumps. The orchestrator's working memory is the running decision table plus `STATE.md`, not the docs' contents.
- **Runtime probing is explorer work.** ssh, kubectl, curl, deploy checks, and log reading during reconnaissance run inside a scoped `explorer` (or a dedicated recon subagent) whose findings land in `codemap.md`/AIRD docs as evidence pointers. The main session never accumulates raw remote output.

Use `references/gates.md` for gate behavior, `references/interview.md` for the discussion-gate questioning protocol (one decision at a time, A/B/C/D + recommendation, Normal/Grill), and `references/delivery-contract.md` as the canonical readiness/workorder contract. Maintain a small `STATE.md` after every meaningful phase transition; generated readiness belongs in `REVIEW-MANIFEST.json`, not duplicated prose.

Default output path:

```text
.agent/aird/<feature-slug>/
```

Use another path only when the repository already has a stronger convention or the user specifies one.

## Artifact Set And Scaling

Artifact filenames use a phase prefix, and some phases produce more than one file: `00-` groups intake documents (`00-intake.md`, `00-discussion-log.md`), and `02-` groups the UX block (`02-ux-problem-framing.md`, `02-ui-spec.md`, `02-ui-prototype.md`). Duplicated prefixes are intentional grouping, not a mistake.

**Order matters more than completeness.** Documents are produced in risk order,
not in filename order. While an existential assumption is unproven (phase 3.5),
the only legitimate artifacts are `00-*`, `codemap.md`, `03-risk-register.md`,
and the single spike workorder that tests it. A package that reaches an
11-workorder plan before its load-bearing external contract has been called once
is not "thorough" — it is a half-day that delivery will have to throw away.

Scale the package to the task. The full set is the ceiling, not a mandate for every feature:

- User-facing work: produce the UX block (`02-*`) and follow the UI prototype gate.
- Non-UI work (backend refactor, data/tooling change): skip the `02-*` UX block entirely — do not write a UX-framing filler. UX framing is required only for user-facing changes, same as the UI spec and prototype.
- Small, low-risk features: keep each document concise (a short PRD, a few risk lines, a lean TRD) rather than merging files. `$aird-delivery-loop` reads `01-prd.md`, `03-risk-register.md`, `04-trd.md`, `07-implementation-plan.md`, `08-quality-gates.md`, and `09-dod.md` by name, so keep those filenames even when their content is minimal. Concise is fine; shallow is not. Note the reduced scope in `STATE.md`.

This keeps discovery aligned with the `AGENTS.md` "keep it simple / minimum viable output" principle instead of generating documents for their own sake.

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

## Discovery Phases

### 1. Intake

In a git repository, first identify the target base ref (normally the repository's remote-tracking default branch), fetch it when it is remote-tracking, then create or switch to `aird/<feature-slug>`. Record the target ref through the generated review manifest when a wave is accepted. Branch naming may activate local AIRD guard hooks, but hooks never replace the deterministic base check. During discovery all writes stay inside the package dir.

Create or update `00-intake.md` and initialize `STATE.md` from `assets/templates/state.md`. Two frontmatter fields are chosen here and nowhere else — `aird-validate.mjs` hard-errors without them:

- `discovery_profile`: `lite` (localized reversible change, ≤5 implementation workorders), `standard` (cross-layer or single-service contract, ≤12), or `deep` (security, infrastructure, migrations, multi-service/API/data, high-impact rollout; ≤25 with no accepted closure over 12). Risk and irreversibility override change size — see `references/delivery-contract.md`.
- `package_class`: `product` or `supporting`.

Then record:

- user request and goal;
- target users and affected workflows;
- business/product outcome;
- constraints, non-goals, and open questions;
- repo, service, or surface boundaries if known;
- initial success criteria.

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

Use a discussion gate when user input would change product scope, UX flow, API shape, data model, rollout risk, or quality gates. Run it as a **one-decision-at-a-time interview** — see `references/interview.md` for the protocol: closed A/B/C/D questions each carrying a recommended default, highest-impact decision first, codebase-first (skip what the repo already decides), and Normal/Grill modes. Do not dump a batch of questions — each answer decides the next one, and a running summary table keeps the user oriented.

#### Risk-Driven Questions And Mitigations

Run risk analysis inside the discussion gate, not only after the PRD/TRD are drafted. Use `risk-analyst` when available; load `rat` for riskiest assumptions and `rca` when the request is driven by an incident, regression, recurring defect, or process failure.

Ask `risk-analyst` for a short ranked list of risk-driven decisions that need user input before the design can be trusted. It must produce questions, not a standalone report:

- risk or assumption;
- why it matters;
- closed A/B/C/D options with a recommended default;
- mitigation decision to lock (avoid, reduce, accept, defer/spike, or test);
- cheapest invalidating test or evidence gate;
- affected artifacts (`01-prd.md`, `02-ui-spec.md`, `04-trd.md`, `08-quality-gates.md`, `09-dod.md`, or a workorder).

Surface those questions through `references/interview.md`, one at a time, mixed into the same decision walk as product and architecture. Record each resolved risk in `00-discussion-log.md` under `Risk-Driven Questions And Mitigations`; unresolved high-severity risks remain `open`/`unconfirmed` and block TRD/workorders unless explicitly accepted by the user with a mitigation or spike.

Risk question categories to scan: value/adoption, UX comprehension, data correctness, API/contract compatibility, security/access, operational failure, rollout/reversibility, performance/cost, observability, verification evidence, and — whenever a model, sampler, or any non-deterministic service sits in the path — output determinism and reproducibility. A risk is "mitigated" only when the decision changes scope/design/gates/workorders, not when it is merely listed.

Determinism deserves naming because it is the category most often proven away by
a test double. If any identity, dedupe key, cache key, or idempotency contract is
derived from model output, ask directly: what happens on retry when the model
answers differently? A design that is deterministic only while the provider is
faked has an unproven assumption, not a proven one.

#### Architectural Decisions To Surface

The point of the discussion gate is to keep the user in control of the shape of the solution. Before writing the TRD, actively enumerate the load-bearing decisions for *this* task — do not let them get decided silently inside `architect` or a worker. Scan these categories and surface every decision that is expensive to reverse or that changes the shape of the solution:

- **Placement & boundaries** — which service/module/layer this lives in; new component vs extend an existing one; in-process vs network call; sync vs async/eventual.
- **Reuse vs build** — an existing library/pattern/service vs something new (honor any library the user named as a hard requirement); what to explicitly not reinvent.
- **Data & state** — new entities vs extend schema; source of truth; migration and backfill strategy; transactions/consistency; retention and privacy.
- **API & contracts** — new endpoint/event vs extend; versioning and backward compatibility; breaking changes; error/pagination shape.
- **Failure & concurrency** — error handling, idempotency, retries, timeouts, partial-failure and race behavior.
- **Security & access** — authz model, sensitive-data handling, secrets, external callbacks (route these to `cybersec`).
- **Rollout & reversibility** — feature flag, phased rollout, fallback, how to roll back, what to observe/measure.
- **Non-functional targets** — expected scale, latency/performance budget, cost.
- **Tradeoffs & alternatives** — simplest viable vs extensible-now; what is a non-goal; which alternatives were considered and why they were rejected.

Record each surfaced decision in `00-discussion-log.md` (Architectural Decisions section) as: decision, options, recommended default, user decision, rationale, and what it affects.

**What blocks the TRD.** Do not proceed to phase 6 while a **high-risk or irreversible** decision is still unstated or `unconfirmed`. A reversible decision recorded as an explicit `defaulted` assumption with its evidence is not a blocker — otherwise every unanswered minor choice would stall discovery. This is the same rule as `references/interview.md`; the two must not drift apart.

Non-interactive fallback: if the session is non-interactive or the user does not answer, record the recommended default as an explicit **assumption** (not a user decision) and never fill the `User Decision` column yourself. Mark reversible ones `defaulted` and continue. Mark a high-risk or irreversible one `unconfirmed`, write `.continue-here.md`, and stop instead of assuming.

#### A blocker that needs a decision is a question, not a note

Blockers live in `STATE.md` frontmatter as contract data, never as prose in a
Blockers section — prose blocks nothing, and a readiness status written above it
silently wins:

```yaml
blockers:
  - id: B-01
    statement: the console repository has no reviewable git baseline
    blocks: [W2]
    owner: user
    needs_user_decision: true
    resolved: false
```

Any blocker with `needs_user_decision: true` goes through the interview gate
before `status: ready_for_delivery`, and no blocker may block a wave you are
accepting. The failure this prevents is a package that is genuinely ready by
every structural measure while the only path to a user runs through a decision
nobody was ever asked to make.

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

For UI work, frontend reconnaissance is a blocking design-grounding step. Before
drafting the UI spec or prototype, map and cite:

- the current application shell, navigation, layout, and responsive behavior;
- design-system packages, tokens, primitives, icons, typography, and state
  patterns;
- the closest implemented pages/components for the requested workflow;
- approved design sources supplied by the user (for example Figma nodes or
  screenshots), when available;
- the cheapest existing prototype host: local mock route, Storybook,
  playground, or the application itself.

Capture current screenshots when the app can run. If the design system or
relevant application surface cannot be inspected, record that as an explicit
design-evidence gap in `STATE.md` and `02-ui-spec.md`; do not silently invent a
replacement visual language.

### 3.5 Existential Probe Gate (blocking)

This gate exists because the expensive AIRD failure is not a missing document —
it is a **structurally perfect package built on an unverified assumption**. A
package can pass schema validation, dependency checks, hash acceptance, and
semantic review while resting on an external contract nobody ever called. The
cost lands at delivery, after the whole design has been written.

Recording a risk is not testing it. Before any design document beyond
`00-*`/`codemap.md`/`03-risk-register.md` exists, enumerate the **existential
assumptions** and run a real probe for each one.

An assumption is existential when all three hold:

- **Outside your control**: an external API's shape or semantics, a third-party
  limit/quota, a runtime capability, data that must already exist, a
  performance or cost envelope, a permission or license.
- **Shape-changing if false**: it would invalidate the chosen architecture, a
  layer, a contract, or more than a couple of workorders — not just an
  implementation detail.
- **Cheaply falsifiable**: a real call, query, or run answers it in minutes.

If it is cheap to test and expensive to be wrong about, it is existential. Test
it now.

Enumerate with `risk-analyst` loading `rat`: ask for the assumptions that would
kill or reshape the solution, ranked, each with the cheapest test that could
disprove it. Keep the list short — usually one to three. Then run the probes
inside a scoped `explorer` or `debugger` subagent so raw request/response output
lands in `evidence/` rather than the orchestrator context. Probes are
independent; run them in parallel.

Budget this gate in minutes, not phases. Its whole value is that it fails before
you have written anything expensive.

#### The probe must exercise the real path

This is the rule that the gate lives or dies by, and the one most easily faked.
A probe is valid only when it drives **the actual production code path, with the
actual producer's payload, against the actual external boundary, through to the
terminal observable**.

A hand-written request that is *equivalent to what the code would send* is not a
probe — it is a proxy, and a proxy answers the wrong question. "The endpoint
accepts a well-formed request" and "the endpoint accepts what our serializer
actually emits" are different claims, and only the second one is load-bearing.
Proxy probes are how a package earns a green gate and a `400` at delivery.

Concretely, the probe must:

- call the real serializer/builder/client the feature will use, not a
  reconstruction of it;
- send the unmodified payload that code produces, not a corrected one;
- reach the real endpoint/database/runtime, not a mock or a documentation
  example;
- assert the **terminal** observable the feature depends on — the final value,
  persisted row, or usage record — not merely a `200`;
- record the exact command, the payload, the raw response, and the exit status
  into `evidence/`, and cite that path.

If the probe needs a credential or environment you do not have, the risk stays
`unproven`. Say so and stop; do not substitute a reachability check for a
compatibility check.

#### Lock the claim before you probe it

The gate's real failure mode is not a missing probe — it is a claim quietly
rewritten to fit whatever the probe managed to run. Someone cannot reach the
provider, swaps in a deterministic double, discovers the local half works, and
edits the claim to be about the local half. The evidence file is honest, the
frontmatter says `proven`, and the boundary that could kill the design was never
called.

So:

- **Write the claim, and `claim_locked_at`, before the probe runs.** After it
  runs, the only edit allowed is `status: refuted`. Narrowing a claim to match a
  partial result is not proving it — the risk stays `unproven`.
- **Name every boundary you drove for real, and every one you substituted.** A
  non-empty `faked_boundaries` and `status: proven` are contradictory by
  definition: keep the risk `unproven` and cap the package at its spike, or go
  probe the real boundary.
- **`faked_boundaries: []` is an assertion, not a formality.** The validator
  scans probe evidence for substitution markers (`mock`, `double`, `stub`,
  `live_*: false`) and fails when it finds one with no declaration. Writing `[]`
  puts your claim that nothing was substituted on the record where a reviewer
  can challenge it.

A partially proven assumption is worth recording — as `unproven` with the proven
part described in `claim`. It is not worth pretending about.

#### Record it machine-readably

`03-risk-register.md` opens with frontmatter that the validator reads:

```yaml
---
existential_risks:
  - id: R-01
    claim: The provider's count endpoint accepts the body our serializer emits.
    claim_locked_at: '2026-08-03T09:10:00Z'   # before the probe runs; never edited after
    real_boundaries: [provider-http-api]       # what the probe actually drove
    faked_boundaries: []                       # [] asserts nothing was substituted
    status: unproven                           # unproven | proven | refuted
    probe: evidence/r-01-token-count.log
---
```

`claim_locked_at` must be older than the probe evidence file. A claim newer than
its own result is the narrowing this gate exists to stop.

#### What is blocked while an existential risk is `unproven`

- no `04-trd.md`, `05-api-contracts.md`, `06-data-models.md`,
  `07-implementation-plan.md`, or UI block beyond what the probe itself needs;
- at most **one** executable workorder in the package — the spike that runs the
  probe — and it owns wave `W1` alone;
- `status: ready_for_delivery` only for that spike-only wave;
- semantic review may **not** accept the assumption conditionally. "Accepted,
  pending confirmation" is exactly the verdict that produced the failure this
  gate prevents. The only acceptable outcomes are: proven, or a spike-only wave.

`status: refuted` stops discovery immediately: return to the phase-2 discussion
gate with the disproof and pick a different contract or approach. Do not repair
downstream documents that were written on the dead assumption — they were never
valid.

Once every existential risk is `proven` with cited evidence, continue to phase 4
and let the package go as deep as the work actually warrants. **Discovery depth
is earned by retired risk**, not spent in advance.

### 4. Product, UX, And UI Spec

Use `product-analyst` when available. For user-facing flows, spawn `uiux-designer` when available and load/use the `frontend-design` skill when relevant; if `uiux-designer` is not available, the main session drafts the UI spec using the `frontend-design` skill.

Produce:

- `01-prd.md`;
- `02-ux-problem-framing.md` for user-facing UI, dashboards, forms, workflows, or visual changes;
- `02-ui-spec.md` for user-facing UI, dashboards, forms, workflows, or visual changes.

Cover the user problem, core flow, expected states, user-visible edge cases, value, adoption blockers, and measurable acceptance.

The UI spec must define layout intent, information hierarchy, interaction states, responsive behavior, accessibility expectations, empty/loading/error states, and browser/usability verification notes. Use `assets/templates/ui-spec.md`.

The UI spec must include a **Design Grounding** section with exact evidence
paths/links and an explicit reuse map. Use this source priority:

1. user-approved design or connected Figma source;
2. the current application's design system and implemented UI;
3. the closest implemented product pattern;
4. a new visual system only when reconnaissance proves the earlier sources do
   not exist or cannot satisfy the workflow.

The existing application wins over generic dashboard conventions and visual
exemplars. `frontend-design` improves hierarchy and usability inside that
product language; it does not authorize a new shell, palette, typography,
component geometry, or interaction vocabulary by default. Any intentional
deviation must be named, justified by the feature, and included in the
prototype review.

The PRD and UX docs must name the target workflow, the user-visible behavior delta, the non-goals, the acceptance signals, and the risks that could make the feature feel wrong even if the code works. For non-UI technical work, the PRD can be short, but it must still explain the operational or product outcome that makes the technical change worth doing.

### 4.5 UI Prototype Gate

For UI work, build a mock-data prototype before TRD/workorders are finalized. The goal is to validate UX and business meaning early, not to sneak production implementation into discovery.

Produce `02-ui-prototype.md` from `assets/templates/ui-prototype.md` and, when useful, a prototype under:

```text
.agent/aird/<feature-slug>/prototype/
```

Prototype rules:

- use mocked data and realistic states from PRD/UI spec;
- prototype inside the existing application, Storybook, local mock route, or
  project playground when one is available; use isolated static HTML/React only
  when the existing host is unavailable or disproportionately expensive, and
  record that reason;
- reuse the real design-system primitives, tokens, shell, typography, icons,
  responsive rules, and component states whenever they are accessible; a
  visually convenient substitute is not acceptable merely because it is
  faster;
- when an isolated prototype cannot import the real system, reproduce only the
  evidenced tokens and patterns needed for the flow, cite their sources in
  `02-ui-prototype.md`, and list every material fidelity gap;
- do not create a new navigation shell, palette, type scale, component style,
  or decorative motif unless the UI spec contains an accepted deviation;
- avoid production data, real side effects, migrations, or auth changes;
- include at least happy, empty, loading, error, permission, and edge states when relevant;
- start or identify a preview URL when possible and validate it with a browser-capable `qa` subagent; state screenshots are saved as files and referenced by path in `02-ui-prototype.md` — image bytes never enter the orchestrator context (the user is shown the preview URL and screenshot files, not inline dumps);
- discuss the prototype with the user and update `00-discussion-log.md`, `02-ui-spec.md`, and `02-ui-prototype.md` until the UX/business direction is accepted.

Prototype review is a product-fidelity gate as well as a flow gate. Compare the
prototype with current application screenshots/design sources at representative
desktop and mobile viewports. Do not mark it `accepted` while an unexplained
shell, token, component, spacing, typography, or interaction mismatch remains.

If the session is non-interactive or the user does not review the prototype, apply the same non-interactive fallback as the phase-2 discussion gate: record the direction as an `unconfirmed` assumption in `STATE.md`/`02-ui-prototype.md` (do not mark it `accepted`), and stop before delivery if the open UX/business questions are load-bearing.

Do not start delivery while a UI prototype has unresolved product, flow, hierarchy, or state-model questions.

Mark the prototype `accepted` only when a workorder exists that can consume it.
UX accepted against a wave nobody has decomposed — or one sitting behind a
blocker — is work that will be re-reviewed anyway by the time delivery reaches
it. Keep it `reviewing`, and say in `STATE.md` which wave it is waiting on.

### 5. Risks And Assumptions

This phase consolidates the risk work already used during discussion and the probe results from phase 3.5. Do not wait until phase 5 to discover the important risks. If new high-impact risks appear here, return to the phase-2 discussion gate and ask the user the needed mitigation question before finalizing TRD/workorders. If a **new existential** assumption appears here, go back to phase 3.5 and probe it before continuing — reaching phase 5 does not grant an exemption.

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

Use `architect` for normal non-trivial design. Use `architect-deep` only when the task crosses the ExecPlan threshold: complex feature, significant refactor, multi-service change, schema/API contract change, migration, or unresolved high-impact tradeoff.

If `architect`/`architect-deep` surfaces a load-bearing decision that is not yet locked in `00-discussion-log.md`, stop and return to the phase-2 discussion gate before finalizing the TRD. `architect` proposes options with a recommended default; the user (or an explicitly recorded non-interactive assumption) locks the choice. Do not let a TRD silently encode an unmade architectural decision.

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
- non-functional targets: expected scale, latency/performance budget, and cost
  envelope, with the numbers written down rather than referenced;
- rejected alternatives and why they were not chosen.

If any of those sections is not applicable, say why. Do not silently omit it.
This is enforced for `deep` packages: the validator fails a deep package that
states no non-functional targets anywhere in the PRD or TRD. A later risk that
cites "the PRD latency budget" when no budget was ever written is a gap that
surfaces at release, when the measurement is expensive and the design is fixed.

### 7. Implementation Plan And Quality Gates

Produce:

- `07-implementation-plan.md`;
- `08-quality-gates.md`;
- `09-dod.md`;
- `workorders/*.md`.

In `08-quality-gates.md`, fill the `Gate -> DoD item` mapping table so every DoD item in `09-dod.md` is covered by at least one gate, and every gate points to the DoD item it protects. This mapping is what the `quality gates are mapped to the DoD` exit criterion checks.

Build the smallest value-producing implementation wave first. Do not fully
decompose a deep roadmap before Wave 1 can be reviewed and delivered. Later
waves may stay draft while the first wave is accepted. Follow the profile
budgets, V4 frontmatter, typed surfaces/runtime profiles, and accepted-wave
rules in `references/delivery-contract.md`.

#### Name who observes the wave

`work_class: product` is a label the author writes about their own work, so it
proves nothing on its own — four workorders can all declare `product` while the
wave's only exit is an internal API that no persona in the PRD touches. State
the outcome instead, in `09-dod.md` frontmatter:

```yaml
---
wave_outcomes:
  - wave: W1
    user_observable_outcome: A steward approves a proposal and the cited claim appears in search.
    persona: Knowledge steward
---
```

The persona must be one the PRD defines. A wave whose honest outcome is "an
authenticated client can call a new endpoint" is a **platform slice** — often the
right call, and always the user's call, not yours. Take it through the discussion
gate as one question, and record the answer as `platform_slice_approved: true`
in `STATE.md` with the reason in Decisions. Do not paper over it by declaring the
workorders `product`; that is the same evasion the detour budget already forbids
for supporting work.

#### Workorder Sizing (blocking rule)

Workorders are sized as coherent independently testable ownership slices, not
as individual files or evidence chores. Delivery spawns one worker with a clean
context per implementation workorder. Rules:

- **1–3 atomic tasks per workorder, listed in a `Task Breakdown` section.** An atomic task is one coherent edit unit — one endpoint, one component, one migration, one config surface, one test suite — roughly one commit.
- **Fits in about half of a fresh worker context.** Count what the worker must load: the workorder itself, the named AIRD doc sections, the files it will open, and its own diff. If the honest estimate exceeds that, split.
- **Split by real seams, sequence by dependency.** Keep together the smallest set of edits needed for runnable behavior. Split at ownership, runtime, or integration boundaries, keep write sets disjoint, and express ordering through frontmatter `depends_on`.
- **Name sections, not packages.** The docs-to-read list points at specific files and sections; a workorder that says "read the whole AIRD package" is oversized by definition.
- **Do not turn gates into implementation work.** Reviews, screenshots,
  evidence summaries, and ordinary verification commands live in
  `08-quality-gates.md`. Create a `verification` or `evidence` workorder only
  for genuinely independent credentials, scheduling, ownership, or reusable
  fixtures; it never blocks implementation readiness.

The bullet count is a floor, not the measure. Three sentences can hide eighteen
edits, and a wave whose write scopes are disjoint can still be deadlocked. Two
checks close those gaps:

**Declare what the workorder consumes.** Every workorder carries a `## Consumes`
table naming each input it needs that the repository does not already contain,
and who produces it:

```markdown
## Consumes

| Input | Kind | Produced by |
|---|---|---|
| ontology release v1 (predicate allowlist) | artifact | WO-00-ontology-baseline |
| `src/app/settings.py` (feature flag) | file | WO-01-core |
| approved gateway endpoint/region | config | release-binding |
| `core.ids.encode` | code | exists-in-repo |
```

Kinds are `file`, `artifact`, `config`, `data`, `code`. Producers are a
workorder ID, `exists-in-repo`, `release-binding`, or `none`. A workorder ID
producer must also appear in `depends_on` — a consumed input is a dependency,
not a note. This is what catches the two failures the dependency graph cannot
see: a versioned artifact, seed dataset, or ontology that every workorder
references and none creates, and a file one workorder must edit to satisfy its
own acceptance criteria while another workorder owns the write scope. Disjoint
write scopes achieved by cutting a coupled seam produce two blocked workorders,
not two independent ones. An explicit `None.` is a valid answer.

**Soft sizing proxies.** The validator warns — fatal under the `--strict` run
discovery must use — when a workorder exceeds six non-test `allowed_write_paths`,
three `dod_ids`, or ten negative cases. These measure the load the worker
actually carries. Split at a real seam, or record `oversize_justification` in
frontmatter saying why the slice cannot be cut without leaving something
half-applied.

Each workorder must be independently executable and include:

- V4 frontmatter from `references/delivery-contract.md`, including `kind`,
  `wave`, `surface`, `work_class`, `runtime_profiles`, non-empty bounded
  `allowed_write_paths`, and section-level `docs_to_read`;
- objective;
- task breakdown (1–3 atomic tasks, per the sizing rule above);
- a `## Consumes` table (or an explicit `None.`);
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

#### Deterministic Validation And One Semantic Review

Run the validator with `--strict` while `STATE.md` is still `discovery`, before
semantic review:

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/public/aird-delivery-loop/assets/scripts/aird-validate.mjs" \
  ".agent/aird/<feature-slug>" --strict
```

`--strict` is not optional here. Findings on workorders outside an accepted
closure are warnings by design, and before the first `accept-wave` *every*
workorder is outside a closure — so a bare run reports `PASS` on a structurally
broken package. Strict mode promotes those warnings to failures.

Fix structural errors without opening a review loop. Then run one semantic
review for the earliest dependency-ready wave. Use monotonic finding IDs
(`F-0001`, `F-0002`, ...). A finding-closure review sees only the changed
workorders and open IDs; it may add a new blocker only when the changed diff or
an advanced target base caused it.

#### Whole-package integrity pass (before `accept-wave`)

Closure reviews are narrow by design — they see the changed workorders and the
open finding IDs, nothing else. That is correct for iteration and useless for
systemic gaps: an ontology every workorder references and none produces, a
capability used in an authorization matrix but missing from the capability list,
a risk ID cited in the PRD that the register never defined. No closure reviewer
can see any of those, so they survive to delivery.

Run exactly one integrity pass over the whole package, after findings are closed
and before `accept-wave`. It is a fixed checklist, not another opinion round:

1. **Reference integrity.** Every `R-`, `G-`, `DOD-`, and `WO-` ID cited in any
   document resolves to a definition. The validator checks this; read its output
   rather than re-deriving it.
2. **Producer closure.** Every `## Consumes` row resolves, and every named
   versioned artifact, ontology, policy version, seed dataset, fixture realm, or
   config contract appearing in the contracts has a producing workorder or a
   release-binding row with an owner.
3. **Vocabulary closure.** Every capability, flag, state, and enum value used in
   a matrix, contract, or acceptance criterion is defined somewhere in the
   package. Flag the reverse too: a term defined and never used is usually a
   decision that moved without the document following.
4. **Runtime-requirement ownership.** Every observability signal, metric, alert,
   limit, and quota the TRD states as required maps to a workorder or is
   explicitly deferred to a named later wave. "Specified but unowned" is the
   most common silent gap in a technically strong package.
5. **Blocker reality.** Every `STATE.md` blocker has an owner, the waves it
   blocks, and a resolution action — and none of them blocks a wave you are
   about to accept.

Findings here are ordinary blocking findings with new `F-` IDs. This pass runs
once per package, not once per wave; later waves inherit it unless they
introduce new contracts.

After the reviewer accepts the wave, fetch the target base again and record the
acceptance:

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/public/aird-delivery-loop/assets/scripts/aird-contract.mjs" \
  accept-wave ".agent/aird/<feature-slug>" --wave W1 --base origin/main
```

Use the actual target ref and wave. This command fails on a stale/diverged
branch and writes `REVIEW-MANIFEST.json` with per-workorder hashes. If a base or
workorder changes, re-review only the invalidated wave. Do not semantically
review the same unchanged hash again during delivery.

Use `assets/templates/state.md`, `assets/templates/aird-package.md`, `assets/templates/discussion-log.md`, `assets/templates/ui-spec.md`, `assets/templates/ui-prototype.md`, `assets/templates/workorder.md`, and `assets/templates/continue-here.md` when creating artifacts or pausing.

## Loop Exit Criteria

The AIRD package is ready for delivery when at least the earliest useful wave
meets all of these conditions:

- every risk listed in `existential_risks` is `proven`, with a probe evidence file that exercised the real production path (a spike-only wave is the one exception, and it may contain nothing but the spike);
- every proven risk names its `real_boundaries`, declares `faked_boundaries` (`[]` counts, and asserts nothing was substituted), and has a `claim_locked_at` older than its probe evidence;
- intake, discussion log, PRD, risk register, TRD, implementation plan, quality gates, and DoD exist;
- UX framing and UI spec exist for user-facing UI, dashboards, forms, workflows, or visual changes;
- UI prototype notes and mock-state acceptance exist for user-facing UI, dashboards, forms, workflows, or visual changes;
- UI spec/prototype cite the current design system and application evidence,
  include a component/token reuse map, and list accepted deviations; no
  unexplained parallel visual language remains;
- every implementation slice in the wave's dependency closure has a V4 workorder with allowed write scope;
- every workorder in that closure passes the sizing rule and profile budget;
- every workorder in that closure has its `Must Haves` sections filled (Truths, Artifacts, and Key Links where wiring matters);
- every workorder in that closure declares `## Consumes`, and every `Produced by` resolves to a workorder it depends on, to `exists-in-repo`, or to an owned `release-binding` row;
- the accepted wave names a `user_observable_outcome` and a PRD persona in `09-dod.md`, or `platform_slice_approved: true` records the user's decision to accept a platform slice;
- `STATE.md` declares structured `blockers:`; none is unresolved with `needs_user_decision: true`, and none blocks the accepted wave;
- a `deep` package states non-functional targets (scale, latency/performance budget, cost) or records why they do not apply;
- UX artifacts are `accepted` only when a workorder exists that can consume them; otherwise they stay `reviewing` so they do not go stale waiting for a blocked wave;
- the whole-package integrity pass ran and its findings are closed;
- API/data/model changes are explicit;
- quality gates are mapped to the DoD;
- documentation passes the depth standard: key docs record decisions, rationale, evidence, rejected alternatives, assumptions, and delivery implications proportional to risk;
- every medium/high risk has a mitigation owner and evidence gate;
- open questions are non-blocking or assigned to a workorder/spike;
- no worker in the accepted wave needs the full parent conversation to understand its task;
- the target base is current and `REVIEW-MANIFEST.json` contains an accepted,
  hash-matching entry for the wave.

Later draft, blocked, unreviewed, verification, evidence, and review workorders
do not block this transition. Set `STATE.md status: ready_for_delivery` once at
least one wave qualifies. `$aird-delivery-loop` derives the actual ready waves
from the manifest and frontmatter.

Before setting `status: ready_for_delivery`, set `ready_for_implementation: ready` and run the deterministic state check — this proves `STATE.md` matches the filesystem instead of rubber-stamping it:

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/public/aird-delivery-loop/assets/scripts/aird-validate.mjs" ".agent/aird/<feature-slug>"
```

The validator proves structure, typed routing, sizing, write-scope collisions,
the dependency graph, risk/gate/DoD wiring, Gate→DoD coverage, the product-first
detour budget, profile budgets, accepted hashes, and Git-base freshness. It does
not replace the one semantic discovery review.

If these conditions are not met, run another scoped discovery loop instead of starting implementation. Cap discovery at 3 iterations; if conditions still are not met after the third, escalate to the user with the remaining gaps and a recommended default rather than looping again.

On pause or blockage, write `.continue-here.md` from `assets/templates/continue-here.md` with exact next action, completed work, blockers, and required reading.

## Scoped Correction (a late-discovered wrong assumption)

When delivery disproves an assumption the package was built on, the default
reaction — rerun discovery — is almost always wrong and expensive. Correct one
decision, not the whole package:

1. Record the disproof: set the risk to `refuted` in `existential_risks` with
   the probe evidence path, and log the real contract in `00-discussion-log.md`.
2. Take the replacement decision through the phase-2 discussion gate as a single
   question with options and a recommendation. One decision, not a re-interview.
3. Probe the replacement through phase 3.5 **before** editing any document, with
   the same real-path rule. A second wrong assumption costs more than the first.
4. Compute the blast radius from the risk's `Affects` column plus
   `grep`-able references: usually a section of `04-trd.md`/`05-api-contracts.md`
   and the workorders whose `risk_ids` include it. Edit only those.
5. Re-run the validator with `--strict`, then re-accept only the invalidated
   wave. Unchanged accepted waves keep their hashes and are not re-reviewed.

Everything the disproof did not touch stays accepted. Rewriting a valid PRD
because an API contract changed is the same waste in the opposite direction.

## Final Response

Summarize:

- AIRD path;
- agents used and scopes;
- highest risks;
- workorders created;
- whether delivery can start;
- any blockers or assumptions.
