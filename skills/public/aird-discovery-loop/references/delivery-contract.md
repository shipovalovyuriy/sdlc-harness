# AIRD Delivery Contract V4

This file is the single canonical contract for AIRD readiness, package state,
and workorder schema. Templates, scripts, and skill prose may explain it, but
must not redefine it. It supersedes the former `profiles-and-schema.md` (V3);
nothing in either loop should still reference V3 frontmatter, `aird-lint.mjs`,
`review_packet`, `vertical_slice_id`, `runtime_boundaries`, or
`acceptance_scenario_count`.

## Contents

- The Three Sources Of Truth
- Discovery Profiles And Budgets
- Readiness Contract
- Existential Risk Contract
- Workorder Frontmatter V4
- Consumed-Input Contract
- Coherent Sizing
- Product-First And Detour Contract
- Blocker Contract
- Wave Readiness
- Base And Review Manifest
- Session Checkpoint Contract
- Review Budget And Finding Cutoff

## The Three Sources Of Truth

- Workorder frontmatter owns work type, wave, dependencies, surface, runtime
  profiles, scope, and lifecycle status.
- `REVIEW-MANIFEST.json` owns the reviewed Git base, accepted waves, and the
  SHA-256 contract digest of every workorder accepted in each wave. The mutable
  lifecycle `status` field is excluded from that digest.
- `STATE.md` owns only the current workflow position, active wave, blockers,
  next action, and delivery/verification results. Do not copy generated counts
  or accepted-workorder lists into prose.

Run `aird-validate.mjs` to derive counts and readiness. A Markdown statement
never overrides frontmatter or the review manifest.

## Discovery Profiles And Budgets

Choose one profile at intake. Risk and irreversibility override change size.

| Profile | Use when | Active implementation budget |
|---|---|---|
| `lite` | Localized reversible change in one ownership boundary | At most 5 implementation/spike workorders |
| `standard` | Material cross-layer or single-service contract | At most 12 implementation/spike workorders |
| `deep` | Security, infrastructure, migrations, multi-service/API/data, or high-impact rollout | At most 25 total; no accepted wave dependency closure may exceed 12 |

These are limits, not quotas. Do not create workorders to fill a range. When a
deep package needs more than 25 executable workorders, finish a value-producing
slice and run a new progressive discovery pass from the implemented state.

`evidence`, `verification`, and `review` workorders do not consume the
implementation budget and never block implementation readiness. Prefer
quality-gate rows in `08-quality-gates.md` over separate verification
workorders unless independent execution or ownership genuinely requires one.
During migration from an older package, legacy backlog files are not eligible
and do not consume the V4 budget. Normalize only the selected wave and its
dependency closure; do not rewrite the entire backlog before implementation.

## Readiness Contract

`STATE.md` frontmatter tracks three independent readiness fields. They are
independent on purpose: a missing test database must not retroactively make
reversible code work unsafe to start.

- `ready_for_implementation`: `blocked` or `ready`. Set `ready` when product
  decisions, contracts, workorder sizing, write scopes, and focused test plans
  are sufficient for reversible implementation.
- `ready_for_runtime_verification`: `blocked`, `ready`, or `not_required`. Set
  `ready` only when the actual environment, credentials, production-equivalent
  dependencies, and fixtures needed by required runtime checks are available.
- `ready_for_release`: `blocked` or `ready`. Set `ready` only after every
  required static, review, QA, browser, security, migration, and runtime gate
  has passed with concrete evidence.

`aird-validate.mjs` enforces all three: each field must be present with a
valid value, `ready_for_delivery`/`in_delivery`/`implementation_complete`
require `ready_for_implementation: ready`, `verifying` requires
`ready_for_runtime_verification: ready|not_required`, and
`ready_for_release`/`complete` require `ready_for_release: ready`.

Runtime dependency types, versions/dialects, boundaries, and intended commands
must be known before implementation. Actual environment access and fixtures do
not block reversible implementation. Missing runtime access blocks runtime
verification, `ready_for_release`, and `status: complete`.

Lifecycle statuses, and who writes each:

| `status` | Meaning | Set by |
|---|---|---|
| `discovery` | Package design is in progress. | discovery, at intake |
| `ready_for_delivery` | At least one wave is accepted; `ready_for_implementation: ready`. | discovery, at exit |
| `in_delivery` | Implementation work is running. | delivery, at pre-flight |
| `implementation_complete` | Required implementation workorders are done; release evidence may still be blocked. | delivery, after the last wave integrates |
| `verifying` | Required runtime/browser/release checks are running. | delivery, entering the verification phase |
| `ready_for_release` | All required gates passed with evidence. | delivery, after release readiness |
| `complete` | Delivery is closed with release-ready evidence. | delivery, at completion |
| `paused` | Progress stopped with a recorded blocker or approval request. | either loop |

`ready_for_delivery` and `in_delivery` require only
`ready_for_implementation: ready`. `verifying` requires
`ready_for_runtime_verification: ready|not_required`. `ready_for_release` and
`complete` require `ready_for_release: ready`. Do not jump straight from
`in_delivery` to `complete`: the intermediate statuses are what make a resumed
session able to tell finished code from finished evidence.

## Workorder Frontmatter V4

Every workorder in a V4 package begins with:

```yaml
---
aird_workorder_schema_version: '4.0'
id: WO-01
kind: implementation
status: ready
wave: W1
surface: backend
work_class: product
runtime_profiles: [database, api]
depends_on: []
risk_ids: [R-01]
gate_ids: [G-01]
dod_ids: [DOD-01]
allowed_write_paths: [service/path.go, service/path_test.go]
docs_to_read: [04-trd.md#Target Architecture]
---
```

Enums:

- `kind`: `implementation`, `spike`, `evidence`, `verification`, or `review`;
- `status`: `draft`, `ready`, `in_progress`, `done`, `blocked`, or `deferred`;
- `wave`: `W1`, `W2`, and so on for implementation/spike work; `none` for
  evidence, verification, and review work;
- `surface`: `backend`, `frontend`, `data`, `infra`, `mixed`, `docs`, or
  `tooling`;
- `work_class`: `product`, `supporting`, or `verification`. Omitted means
  `product`, so the detour budget below cannot be dodged by leaving it out;
- `runtime_profiles`: any of `unit`, `service`, `database`, `migration`, `api`,
  `job`, `artifact`, `browser`, `external`, or `none`.

For `kind: spike`, three more fields are required:

```yaml
spike_question: Can the selected runtime execute the build flow?
on_pass: unblock WO-03
on_fail: return_to_discovery
```

A spike answers one fixed question. `on_fail` must fail closed (block, stop,
escalate) or return to discovery; a spike may not silently select unreviewed
architecture or implement a fallback.

One optional field exists for deliberate exceptions:

```yaml
oversize_justification: one migration that cannot split without a half-applied schema
```

`aird-validate.mjs` enforces these enums, the 1–3 atomic-task sizing rule,
non-empty bounded `allowed_write_paths`, non-empty `docs_to_read`, the
dependency graph (missing dependencies, cycles, and dependencies on
non-implementation work), write-scope collisions inside one wave, the
`## Consumes` producer closure below, the `## Scope Evidence` section (a
search command per row, or an explicit `None`), and that
`risk_ids`/`gate_ids`/`dod_ids` resolve to IDs the package actually defines —
in workorder frontmatter and in every package document, so a dangling ID in
prose is caught too. In `08-quality-gates.md` it checks the `Gate -> DoD
Mapping` table and, when `01-prd.md` declares `EC-NN` edge cases, the
`Edge Case -> Gate Mapping` table; a gate counts as defined only outside those
two tables.

## Consumed-Input Contract

Every executable workorder carries a `## Consumes` table naming each input it
needs that the repository does not already contain:

```markdown
| Input | Kind | Produced by |
|---|---|---|
| ontology release v1 | artifact | WO-00-ontology-baseline |
| `src/app/settings.py` | file | WO-01-core |
| approved gateway endpoint | config | release-binding |
```

`Kind` is `file`, `artifact`, `config`, `data`, or `code`. `Produced by` is a
workorder ID, `exists-in-repo`, `release-binding`, or `none`. A workorder-ID
producer must also appear in `depends_on`. An explicit `None.` is valid; an
absent section is an unanswered question and is reported.

The dependency graph proves ordering between workorders that exist. It cannot
see an input nobody produces, and it cannot see a coupled seam that was cut to
make write scopes disjoint — which yields two blocked workorders that pass every
other check. This table is what makes both visible.

`surface` and `runtime_profiles` are explicit routing data. Validators and
delivery agents must never infer them from arbitrary body text. Use `mixed`
only when the work cannot be split without losing one coherent runtime slice.

Implementation/spike dependencies may point only to implementation/spike
workorders. Required release evidence belongs to quality gates and may block
verification or release, but it must not be placed in the dependency chain that
authorizes reversible implementation.

## Coherent Sizing

A workorder is one independently testable ownership slice, not one file and not
one architectural noun. It has one write seam, one primary runtime boundary,
one focused test command, and at most three atomic tasks. Keep together the
smallest set of edits needed to produce a runnable behavior; split only at a
real ownership, dependency, or integration boundary.

The atomic-task count is a floor: three sentences can hide eighteen edits. Three
soft proxies measure the load the worker actually carries, warned by the
validator and therefore fatal under the `--strict` run discovery must use:

| Proxy | Soft limit |
|---|---|
| non-test entries in `allowed_write_paths` | 6 |
| `dod_ids` | 3 |
| items in the `Negative/edge cases` list | 10 |

Exceeding one is not forbidden; passing it silently is. Split at a real seam, or
state `oversize_justification` in frontmatter.

Do not create ordinary workorders whose only outcome is a report, review,
screenshot, or evidence file. Express those as gates by default. A separate
non-implementation workorder is justified only when it needs independent
credentials, scheduling, ownership, or a reusable fixture/tool.

## Existential Risk Contract

`03-risk-register.md` opens with frontmatter listing every assumption that is
outside your control, shape-changing if false, and cheaply falsifiable:

```yaml
---
existential_risks:
  - id: R-01
    claim: The provider's count endpoint accepts the body our serializer emits.
    claim_locked_at: '2026-08-03T09:10:00Z'   # fixed before the probe runs
    real_boundaries: [provider-http-api]      # what the probe actually drove
    faked_boundaries: []                      # [] asserts nothing was substituted
    status: unproven        # unproven | proven | refuted
    probe: evidence/r-01-token-count.log
---
```

`aird-validate.mjs` enforces:

- `proven` requires a non-empty `probe` file inside the package — a claim with
  no probe output is the conditional acceptance this contract forbids;
- `proven` with a non-empty `faked_boundaries` is rejected: substituting a
  boundary answers a different question than the gate asked;
- `proven` with no `faked_boundaries` field at all is rejected when the probe
  evidence contains substitution markers (`mock`, `double`, `stub`,
  `live_*: false`). Writing `faked_boundaries: []` is an explicit, auditable
  assertion that nothing was substituted; omitting the field is not;
- `claim_locked_at` must be older than the probe evidence file. A claim newer
  than its own result was narrowed to fit that result;
- `refuted` blocks the package outright;
- while any risk is `unproven`, the package may hold exactly one executable
  workorder, and it must be `kind: spike`;
- a spike may not share a wave with workorders that depend on it, in any state.

That last rule is structural, not stylistic: accepting a fail-closed spike and
its dependents in one closure is what allows ten workorders to be designed and
hash-accepted against an answer nobody has yet.

A valid probe drives the real production path — the real serializer, the
unmodified payload the code emits, the real external boundary, asserted through
to the terminal observable. An equivalent hand-written request is a proxy and
does not close the risk.

The claim is fixed before the probe runs and, afterwards, may change only to
`refuted`. Rewriting a claim to describe the part that happened to work is the
single cheapest way to earn a green gate on an untested contract, and it is what
`claim_locked_at`, `real_boundaries`, and `faked_boundaries` exist to make
visible. A partially proven assumption is recorded as `unproven` with the proven
part described in `claim`.

## Product-First And Detour Contract

Classify the package as `product` or `supporting` in `STATE.md`, and every
workorder through `work_class`.

Before the first vertical slice is `functional`:

- keep the first implementation wave on the smallest public product flow;
- allow at most **one** `work_class: supporting` workorder in that wave, and at
  most **20 percent** supporting share of the wave, without explicit user
  approval;
- record an approval by setting `supporting_detour_approved: true` in
  `STATE.md` frontmatter, together with the reason in the Decisions section;
- never create a separate supporting AIRD package without explicit user
  approval. A runtime-evidence or tooling project is a supporting package.

`aird-validate.mjs` enforces the one-workorder and 20-percent limits on the
earliest wave and treats a missing `supporting_detour_approved` as "not
approved". Documentation, tooling, and evidence-file changes do not count as
product files or user value.

`work_class` is a label the author writes about their own work, so the budget
above proves only that nothing was declared supporting. The outcome is what
makes the gate real. Each accepted wave declares one in `09-dod.md` frontmatter:

```yaml
---
wave_outcomes:
  - wave: W1
    user_observable_outcome: A steward approves a proposal and the cited claim appears in search.
    persona: Knowledge steward
---
```

The persona must be one `01-prd.md` defines. A `product` package may not accept
a wave without this, unless `STATE.md` records `platform_slice_approved: true` —
the user's explicit decision that a platform slice (an internal API or tool
surface with no persona behind it) is the right first wave. That is frequently
the correct call; it is never the author's call to make silently.

## Blocker Contract

`STATE.md` frontmatter owns blockers as data:

```yaml
blockers:
  - id: B-01
    statement: the console repository has no reviewable git baseline
    blocks: [W2]
    owner: user
    needs_user_decision: true
    resolved: false
```

`blockers: []` is a valid and explicit answer; an absent key is reported. An
unresolved blocker with `needs_user_decision: true` prevents every gated status,
and a blocker naming an accepted wave invalidates that acceptance. Prose in a
`## Blockers` section is context for a reviewer, never the authoritative list —
a status line written above prose silently outranks it.

## Deterministic Validation Modes

```bash
# discovery: nothing is accepted yet, so most findings are warnings.
# --strict promotes them to failures, which is what a pre-review lint needs.
node "${CODEX_HOME:-$HOME/.codex}/skills/public/aird-delivery-loop/assets/scripts/aird-validate.mjs" \
  ".agent/aird/<feature-slug>" --strict

# delivery pre-flight and checkpoints: accepted-wave findings are already
# errors, so run it plain and keep warnings advisory for the untouched backlog.
node "${CODEX_HOME:-$HOME/.codex}/skills/public/aird-delivery-loop/assets/scripts/aird-validate.mjs" \
  ".agent/aird/<feature-slug>"
```

Findings on workorders that are not in an accepted closure are warnings, because
a draft backlog must not block a ready wave. Before acceptance *every* workorder
is outside a closure, so a bare run at `status: discovery` reports `PASS` on a
structurally broken package. Always pass `--strict` during discovery.

## Wave Readiness

A wave may be accepted when:

1. every implementation/spike workorder in its dependency closure is `ready`
   or `done`;
2. the closure fits the profile budget and has no dependency on evidence,
   verification, or review work;
3. deterministic validation passes;
4. one broad final combined review has inspected target-wave semantics and
   whole-package integrity against the current target base, and every finding
   registered in that response meets its original closure criterion; and
5. `aird-contract.mjs accept-wave` records the base and hashes.

Later waves may remain `draft`, `blocked`, or unreviewed. They do not block the
earliest accepted wave. Set `status: ready_for_delivery` when at least one wave
meets this contract, not when the whole possible roadmap is fully decomposed.

## Base And Review Manifest

After the final combined review and deterministic finding closure, run:

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/public/aird-delivery-loop/assets/scripts/aird-contract.mjs" \
  accept-wave ".agent/aird/<feature-slug>" --wave W1 --base origin/main
```

Use the repository's actual target ref when it is not `origin/main`. Fetch a
remote-tracking ref immediately before this command. The script rejects a
branch that is behind or diverged from the target base and atomically writes
`REVIEW-MANIFEST.json`.

An advance of the target base invalidates all accepted waves. A changed
workorder contract invalidates only the wave containing that workorder. Normal
`status: ready` → `in_progress` → `done` transitions do not. Delivery may consume
every unchanged accepted wave without another review.

## Session Checkpoint Contract

Checkpointing is a durability boundary, not a user-visible stop. Both loops
checkpoint after every phase or execution slice by writing `STATE.md` and
`.continue-here.md`, then continue automatically.

- Routine checkpoint: `checkpoint_kind: routine`. Do not change delivery status,
  do not ask the user for anything, do not tell the user to open a new task.
- Proactive root handoff: `checkpoint_kind: proactive_handoff`. After six
  bounded phases/slices since the last fresh root task, or at about 70 percent
  context, write `STATE.md` + `.continue-here.md` and end the current root task
  even when work is smooth. Reset `root_slices_since_handoff` only in the fresh
  task that resumes from disk.
- Hard stop: `checkpoint_kind: hard_stop`. Only these conditions qualify —
  context usage reaches 100 percent, auto-compaction or summary injection
  occurred, an external blocker appeared, a required user decision is pending,
  or state/evidence stayed ambiguous after one narrow recovery attempt. Write
  `STATE.md` + `.continue-here.md` as the very next action and end the root task.

Track monotonic elapsed minutes, workflow cycles, and completed workorders since
the last checkpoint so a resumed session can see drift. These counters do not
change readiness. `root_slices_since_handoff` is the sole operational threshold:
six triggers a proactive root handoff; auto-compaction does not reset it.
Structural sizing, safety, readiness, and release gates remain blocking and are
not downgraded by any checkpoint policy.

## Review Budget And Finding Cutoff

Discovery permits one reviewer-agent call at the end of discovery, immediately
before `accept-wave`. It is a broad combined review of target-wave semantics and
whole-package integrity. This is a hard budget. Do not invoke reviewers during
intake, discussion, reconnaissance, product/UX work, risk analysis, technical
design, prototyping, or workorder drafting. Do not add separate semantic,
architecture, risk, security, UX, integrity, closure, or sanity review calls.
Specialist work during authoring, probing, and scoped quality gates is not a
license to inspect the completed package for new findings.

The ledger is `STATE.md` frontmatter, not a prose section: `review_calls_used`,
`finding_cutoff` (`open`/`sealed`), `review_coverage`
(`unverified`/`partial`/`complete`), `review_exception`, and a `findings:`
block list. `aird-validate.mjs` enforces every one of them — it rejects a second
call, and it refuses `ready_for_delivery` while the cutoff is open, coverage is
short, or a registered finding is still open. This mirrors `blockers:` for the
same reason: prose blocks nothing.

Use package-wide monotonic IDs such as `F-0001`; never reuse or renumber them.
The final combined reviewer response must register all of its findings at once,
covering semantics, reference and producer closure, vocabulary, runtime
requirement ownership, blockers, and applicable security/UX boundaries. Every
finding carries `closure_criterion` and a runnable `evidence_command`; the
validator rejects one without them, because the orchestrator that writes the fix
is the same one that judges it. The finding-registration window closes when that
response returns.

The reviewer also reports coverage — which workorders and documents it actually
read. A one-shot whole-package review fails by exhausting context, not by
returning a wrong opinion, and nothing else would surface that. Record
`review_coverage: partial` when the pass did not reach the whole package; that
earns exactly one continuation over the unread remainder, counted as the same
call, never a fresh opinion round. Readiness stays blocked until coverage is
`complete`.

Do not run a closure reviewer. The main orchestrator fixes and closes all IDs in
one batch, inspecting only the changed diff, the original closure criteria, the
named evidence, and deterministic validator output. Closure cannot search for
unrelated coverage or register another finding.

After the cutoff, defer newly noticed non-critical issues to a later wave or
backlog; they cannot block the current acceptance. Only concrete evidence of a
critical exploitable security exposure or irreversible data loss/corruption
introduced by the closure diff may interrupt acceptance. Record the exception
and ask the user whether to reopen discovery or defer the change; never spawn a
reviewer automatically. A tool failure that returned no usable verdict may be
retried, but a disagreement or desire for extra confidence does not reset the
budget. A later wave that changes contracts gets one final combined review when
that wave reaches its own end-of-discovery boundary; unchanged accepted hashes
are never reviewed again.
