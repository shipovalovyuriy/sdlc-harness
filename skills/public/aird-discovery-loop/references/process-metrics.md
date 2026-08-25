# AIRD Process Metrics And Continuous Improvement Contract

This is the canonical contract for the end-of-loop improvement phase that both
`/aird-discovery-loop` and `/aird-delivery-loop` run. Its purpose is the same
"flagged twice becomes a rule" mechanism that mature SDLC playbooks apply to
`CLAUDE.md`: every loop run leaves a machine-readable metrics record, the
current run is compared against previous AIRD runs, and any **systemic** failure
signal must produce a concrete skill-change proposal backed by an eval case.
Without this phase every delivery learns from zero; with it the loop itself is
under regression control.

Three honesty rules govern everything below:

- **Numbers are collected, never invented.** A metric the orchestrator cannot
  derive from `STATE.md`, package frontmatter, evidence files, or its own
  current-run slice index is recorded as `null`, not estimated.
- **Metrics never block the feature.** A failure to write metrics, read
  history, or generate proposals is logged and reported, but it cannot flip a
  ready package to blocked or a complete delivery to paused. The improvement
  loop is mandatory to *run*, not a release gate.
- **Bounded cost.** The whole phase is a handful of bash commands and one
  backlog edit: no subagents, no reviewer calls, history read only via
  `tail -n 20`. If any file is unreadable, skip comparison, keep the record,
  note the skip.

## Storage

Global, cross-repository, append-only, **shared by every runtime that runs the
AIRD loops** (Claude Code and Codex write to the same store, so their runs are
compared together):

```text
~/.agent/aird-metrics/
  history.jsonl            # one JSON line per finished loop run
  improvement-backlog.md   # proposals P-NNNN with status, in Russian
  evals/                   # eval cases E-NNNN.md, in Russian
```

Per package, a snapshot of the same record: `.agent/aird/<slug>/metrics/`
holding `discovery.json` and/or `delivery-<wave>.json`. The history line and the
snapshot are byte-identical JSON.

Create directories with `mkdir -p` as needed. Append with a single bounded
command, e.g.:

```bash
mkdir -p ~/.agent/aird-metrics/evals && \
  tr -d '\n' < .agent/aird/<slug>/metrics/delivery-W1.json >> ~/.agent/aird-metrics/history.jsonl && \
  printf '\n' >> ~/.agent/aird-metrics/history.jsonl
```

## When To Record

- **Discovery:** once, after `accept-wave` succeeds and `DISCOVERY-SUMMARY.md`
  is written — before the final response.
- **Delivery:** once per terminal outcome of the run — `status: complete`, or
  a terminal `paused`/`NO-GO` with an escalation. A failed run is recorded with
  the same schema; escalations are the most valuable data the loop produces.
  Routine mid-run checkpoints and fresh-task handoffs do **not** record: the
  continuation run records once at its terminal outcome, covering the whole
  delivery (read `.continue-here.md`/`STATE.md` counters to include prior
  slices).

## Finding Class Vocabulary (fixed)

Cross-run comparison only works over stable slugs. Classify every review/QA
finding and every proposal signal into exactly one of:

`correctness`, `wiring`, `contract`, `data`, `security`, `test-coverage`,
`ux`, `performance`, `docs`, `scope`, `evidence`, `process`, `other`.

`wiring` covers missed registration/export/error-mapper integration; `scope`
covers write-scope and sizing violations; `evidence` covers vacuous or missing
proof (skipped checks, screenshot-less states, proxy probes); `process` covers
loop-machinery failures (budget overruns, wrong gate routing, checkpoint
misuse).

## Record Schema (schema 1)

Shared header fields for both kinds:

```json
{
  "schema": 1,
  "kind": "discovery",
  "runtime": "claude",
  "ts": "2026-08-25T12:00:00Z",
  "repo": "<repo or dir basename>",
  "slug": "<feature-slug>",
  "profile": "lite|standard|deep",
  "package_class": "product|supporting",
  "outcome": "complete|escalated|abandoned",
  "duration_hours": 4.5,
  "root_handoffs": 0,
  "notes": null
}
```

`runtime` names the runtime that executed the loop (`claude` or `codex`).
`duration_hours` is wall clock from the first artifact write to the terminal
outcome, to one decimal; `null` when not derivable. `root_handoffs` counts
fresh-task handoffs consumed by the run.

### kind: discovery — additional fields

```json
{
  "discovery_iterations": 1,
  "interview_questions": 9,
  "decisions": { "locked": 7, "defaulted": 3, "unconfirmed": 0 },
  "existential_risks": { "total": 2, "proven": 2, "refuted": 0, "unproven": 0 },
  "waves_total": 3,
  "accepted_waves": ["W1"],
  "workorders_total": 8,
  "workorders_accepted_wave": 3,
  "review": {
    "calls": 1,
    "coverage": "complete",
    "findings_total": 4,
    "findings_by_class": { "wiring": 2, "contract": 1, "docs": 1 }
  },
  "strict_validator_fixes": 3,
  "platform_slice": false,
  "scoped_corrections": 0
}
```

Sources: `STATE.md` frontmatter (`review_calls_used`, `review_coverage`,
`findings`, `blockers`), `03-risk-register.md` frontmatter, validator output
(`waveDigest`, wave/workorder counts), `00-discussion-log.md` (question and
decision counts), the orchestrator's own phase log. `strict_validator_fixes`
counts distinct `--strict` failures fixed before the final review.
`scoped_corrections` counts late wrong-assumption corrections (the Scoped
Correction procedure) triggered during this discovery.

### kind: delivery — additional fields

```json
{
  "waves_delivered": ["W1"],
  "slices_total": 5,
  "workers_spawned": 1,
  "worker_reasons": { "parallelism": 1, "context": 0 },
  "gates": { "total": 6, "first_pass": 4, "blocked_no_evidence": 1, "waived": 0 },
  "findings": {
    "total": 3,
    "by_class": { "test-coverage": 1, "wiring": 2 },
    "fix_cycles": 1,
    "max_revision_attempts": 2,
    "escalations": 0
  },
  "package_rework_files": 1,
  "plan_deviations": 1,
  "discovery_defects": {
    "impact_radius_misses": 0,
    "proxy_probes": 0,
    "oversized_workorders": 0,
    "consumes_gaps": 0
  },
  "hard_stops": 0,
  "auto_compactions": 0
}
```

Definitions:

- `gates.first_pass` — required gates whose first execution passed with
  evidence; `gates.total` — required gates executed. The ratio is the loop's
  first-pass rate.
- `package_rework_files` — AIRD package files edited after `status:
  in_delivery` (spec-rework analog); count via `git log`/diff over the package
  dir when versioned, else count edited package files from slice records.
- `plan_deviations` — workorders whose implementation recorded a contract
  deviation in AIRD notes.
- `discovery_defects` — defects delivery found in the *package*, not the code:
  impact-radius locks the search missed, existential probes that turned out to
  be proxies, workorders failing the sizing gate at pre-flight, unresolved
  `## Consumes` inputs. Every nonzero value here is a discovery-skill signal,
  not a delivery-skill signal.
- Sources: the delivery brief, `STATE.md` slice index plus
  `evidence/state-archive.md`, `10-*-verification.md` frontmatter,
  finding-notes/fix-workorders, `.continue-here.md` counters.

## Comparison And Signals

Read history with `tail -n 20 ~/.claude/aird-metrics/history.jsonl`, keep
records of the same `kind`; when at least 3 share the current `profile`,
compare within the profile, otherwise across all of the kind. Fewer than 2
comparable records → record only, propose only on hard signals (marked ⚠
below), and note "insufficient history".

A **signal** fires for the current run when:

Discovery:

- ⚠ `existential_risks.unproven > 0` at acceptance, or `review.coverage` is not
  `complete`, or `decisions.unconfirmed > 0` — these mean a gate was walked
  around;
- `discovery_iterations >= 2`;
- `review.findings_total / max(workorders_total,1)` exceeds the history median
  by more than 50%;
- `scoped_corrections >= 1` (an assumption survived discovery and died in
  delivery);
- the top `findings_by_class` slug equals the top slug of any previous run.

Delivery:

- ⚠ any `discovery_defects` value > 0 (route the proposal at the *discovery*
  skill);
- ⚠ `gates.blocked_no_evidence > 0`, `gates.waived > 0`, or
  `findings.escalations > 0`;
- `gates.first_pass / max(gates.total,1)` below the history median;
- `findings.fix_cycles >= 2` or `findings.max_revision_attempts >= 3`;
- `package_rework_files > 0`;
- `hard_stops > 0` or `auto_compactions > 0` (context economy failed);
- the top `findings.by_class` slug equals the top slug of any previous run.

**Systemic rule (the "twice" rule):** a signal that fires in the current run
and also fired in at least one of the compared previous runs is *systemic* and
**must** produce a proposal in `improvement-backlog.md`. A signal firing for
the first time is recorded as a watch item (a one-line `W-` entry under the
backlog's watch section) — no proposal yet, but the next occurrence promotes
it. ⚠-signals are severe enough to propose on first occurrence.

## Proposals

Proposals are appended to `~/.claude/aird-metrics/improvement-backlog.md`, in
clear Russian per the AIRD language standard, one entry per proposal:

```markdown
## P-NNNN — <короткое имя проблемы>

- Статус: proposed        # proposed | accepted | applied | rejected
- Дата: 2026-08-25
- Сигнал: <метрика, значения, ts затронутых запусков из history.jsonl>
- Правило, которое не сработало: <файл скилла и раздел, который должен был это предотвратить, либо «правила нет»>
- Предлагаемое изменение: <конкретная правка: какой раздел, какое новое правило или порог>
- Эвал-кейс: evals/E-NNNN.md   # существующий или «создать»
- Ожидаемый эффект: <какая метрика и в какую сторону должна сдвинуться>
```

Proposal discipline:

- Every proposal names the **exact skill file and section** to change and the
  metric that will prove the change worked. "Be more careful" is not a
  proposal.
- Proposals are **presented to the user in the final response** of the loop
  run that generated them. The orchestrator never edits `SKILL.md`,
  references, templates, or validator scripts on its own initiative — status
  moves to `accepted` only on an explicit user decision, in this or a later
  session.
- Deduplicate: before appending, `grep` the backlog for the same signal; an
  existing `proposed` entry gets the new run's ts appended to its Сигнал line
  instead of a duplicate entry. An existing `applied` entry whose signal fires
  again means the fix did not work — reopen it as a new proposal referencing
  the old one.

## Continuous Evals

The eval store is the regression suite for the loop itself. An eval case is a
recorded real failure scenario plus the behavior the skills must mandate to
prevent it:

```markdown
# E-NNNN — <короткое имя>

- Источник: <ts запуска из history.jsonl, слаг пакета, F-/P-идентификаторы>
- Класс: <slug из фиксированного словаря>
- Сценарий: <входные условия, при которых луп раньше ошибался>
- Ожидаемое поведение лупа: <что обязан сделать оркестратор/гейт>
- Какое правило это гарантирует: <файл скилла § раздел>
```

Eval cases are created from: every accepted proposal (mandatory), every
delivery escalation, every `discovery_defects` occurrence, every vacuous-pass
or waiver event, every refuted existential risk. Keep them short — a case is a
scenario and an expectation, not an essay.

**Eval check on skill change.** Whenever an AIRD skill file, reference,
template, or validator script is edited (typically when applying an accepted
proposal), before finishing:

1. list the eval cases whose "Какое правило" points at an edited file
   (`grep -l` over `evals/`);
2. re-read each matched case against the new text and record pass/fail — the
   new text must still mandate the expected behavior;
3. for validator/script edits, also run `node --test` on the delivery skill's
   `assets/scripts/aird-validate.test.mjs`;
4. record the check result in the proposal entry when applying it. A failed
   eval check blocks the skill edit, not any feature work.

**Two runtimes, one contract.** The AIRD skills exist as parallel adapted
copies for Claude Code (`~/.claude/skills/`) and Codex
(`~/.codex/skills/public/`). An applied proposal must be applied to **both**
copies of the affected file (adapting wording to each runtime where they
diverge), and the eval check runs against both. A rule fixed in one runtime and
not the other will resurface in the metrics under the other `runtime` value —
treat that as a reopened proposal, not a new signal.

## Reporting

The loop's final response includes a short «Улучшение процесса» block, in
Russian: the 3–5 metrics most worth the user's attention with their history
comparison, fired signals, and either the generated proposals (id + one-line
essence + what user decision is needed) or an explicit «системных отклонений
нет». Numbers live in the metrics record; the block states meaning, not tables
of raw values.
