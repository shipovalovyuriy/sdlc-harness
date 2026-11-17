---
name: software-factory
description: Software Factory plugin — AIRD discovery/delivery runs launched from the Software Factory page. Use when a thread was started by Software Factory (an aird-discovery-loop or aird-delivery-loop orchestrator, or one of its agent threads), or when asked about AIRD status across projects.
---

# Software Factory

Software Factory shows every AIRD package (`.agent/aird/<slug>/`) of every bb
project: status, stage track, workorders with bug / not-bug marking, quality
gates, agent threads and commits. It starts the AIRD skills in threads that run
in the chosen project folder.

## Worktree

Every AIRD runs in its own git worktree on branch `aird/<slug>` (under
`~/.aird-worktrees/<repo>/<slug>` by default). The orchestrator prompt names
the worktree and the working folder; stay inside it, do not switch branches,
and do not edit the main checkout.

## Orchestrator threads (aird-discovery-loop · <slug>, aird-delivery-loop · <slug>)

These threads get these tools:

- `sf_spawn_agent({ role, task, label?, workorders? })` — launch a subagent the skill names
  (`explorer`, `product-analyst`, `risk-analyst`, `architect`, `reviewer`, `qa`,
  `backend-worker`, `test-author`, …) as a separate child thread titled with the role name. The
  thread runs on the selected provider's role model/effort (`~/.claude/agents/<role>.md` or `~/.codex/agents/<role>.toml`)
  (or the override set in Software Factory → Роли агентов) and is told the role's
  skills. Use it instead of the in-process Agent/Task tool.
- `sf_wait_agents({ threadIds, timeoutSeconds? })` — wait for those threads and
  get their final reports. Call again when it says some are still running.
- `sf_agent_roles()` — list roles with model, effort and description.
- `sf_ask_user({ question, topic?, number?, context?, options?, recommended?, recommendationReason?, kind? })`
  — ask the user ONE question as a card: an interview decision, an approval
  or a blocker decision. Options carry their practical consequence in
  `detail`; `recommended` is the option index. The user answers in the thread
  or in the Software Factory inbox; the answer comes back as the tool result.
  Do not write such questions as chat text.

Pass `workorders` (e.g. `["WO-03", "F-0025"]`) whenever the agent works on
specific workorders or fixes: Software Factory shows the running agents on
those items and on their wave, and the user opens the agent's session from
there. Launch independent agents first, then wait for all of them with one
call.

## Blind acceptance

When `09-dod.md` has `Acceptance Scenarios` rows, launch `test-author` at
wave pre-flight, before the first implementation slice. Set `active_wave` in
STATE.md. Its base commit is recorded once per wave; the separate acceptance
worktree is updated with earlier delivered waves only before a new wave starts.
The author defaults to a different provider, configurable under agent roles.
Its brief names only scenario rows, the public contracts they cite and service
start commands; no workorders, implementation evidence, diffs or delivery code.

`sf_run_acceptance({ baseline: true })` executes on a temporary checkout of that
recorded commit. New scenarios must fail, or stay passed with an explicit
`note: "pre-existing: <reason>"`; prior-wave scenarios must pass. Skipped,
missing or duplicate results block the gate. A scenario shared by waves first
belongs to its earliest owning wave and remains a regression check thereafter.
`sf_run_acceptance()` after integration requires this red-first evidence and
returns only scenario/expected/actual verdicts. Future-wave scenarios are not
required yet. Nonzero or interrupted wave runs cannot pass even if results say
passed. Full logs are available to the user on the acceptance tab only.

Failed scenarios are code defects unless a restricted reviewer rules otherwise
against the package text. Follow the six-field report format from the task;
the implementer must not inspect the suite. Keep its branch separate from delivery.

## Reserve models

The role settings and discovery/delivery orchestrator settings may contain one
reserve provider/model/effort, disabled by default. Factory owns automatic
recovery for those tasks: a structured rate limit switches immediately;
transient availability failures get two delayed retries before switching.
Authorization, billing, spending controls, policy and unknown failures require
a user decision. Never start your own retry or duplicate agent while Factory
reports recovery pending. Keep calling `sf_wait_agents` with the original ids:
it follows provider transfers and returns the current session's report. Use
`sf_continue_agent` with the original id as well. A blocked recovery is a
user decision in the inbox, not a successful agent report.

A provider transfer preserves the task's working environment, role, brief,
attachments, workorder links, and slice budget. The old thread is superseded;
do not continue work in it. The new role receives only its own previous session
history; test-author isolation still applies. Before resuming, inspect files
and the results of unfinished operations and do not repeat completed actions.
An uncertain dispatch after a crash stops for inspection instead of being
blindly submitted twice. The current task stays on its reserve; a newly
spawned task starts with the configured primary model.

## Agent threads

A thread started by `sf_spawn_agent` is one role. Do the task from its first
message, do not start other threads, and follow the task report format. If none is given, return a short report
(verdict, key facts, paths).

## CLI

- `bb software-factory list [--json]` — AIRDs by project with status and stage.
- `bb software-factory show <aird-id|slug> [--json]` — one AIRD in detail.
