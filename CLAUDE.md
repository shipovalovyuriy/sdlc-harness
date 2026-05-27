# ExecPlans

Always use the OpenAI developer documentation MCP server if you need to work with the OpenAI API, ChatGPT Apps SDK, Codex, or other OpenAI developer tooling unless a more specific user instruction overrides it.

Use an ExecPlan only for complex features, significant refactors, multi-service changes, schema or API contract changes, migrations, or unresolved high-impact tradeoffs.

Use `architect` for normal non-trivial design that can be handed off as an Implementation Brief.

Use `architect-deep` only when the task crosses the ExecPlan threshold above. In those cases, `architect-deep` must produce a full ExecPlan that conforms to `/Users/shipovalovyuriy/.codex/.agent/PLANS.md`.

# Working Style

These rules reduce common LLM coding mistakes. They bias toward caution over speed; for trivial tasks, use judgment.

Think before coding:
- Do not assume silently. State assumptions when they affect the solution.
- If a request has multiple plausible interpretations, surface the options instead of choosing invisibly.
- If a simpler approach exists, mention it and push back when the requested path looks overbuilt.
- If the missing context makes a reasonable implementation risky, stop, name the uncertainty, and ask.

Keep it simple:
- Write the minimum code that solves the requested problem.
- Do not add features, abstractions, configurability, or defensive branches that were not asked for or justified by the existing system.
- If a solution grows much larger than the problem, simplify before proceeding.

Make surgical changes:
- Touch only what is required for the user's request.
- Do not refactor, reformat, or "improve" adjacent code unless it is needed for the task.
- Match existing style even when a different style would be preferable in isolation.
- Mention unrelated dead code or cleanup opportunities instead of deleting them.
- Remove imports, variables, functions, or files only when your own change made them unused or obsolete.
- Every changed line should trace back to the request.

Execute against a goal:
- Convert the task into concrete success criteria before implementing.
- For bugs, prefer a reproducing test or direct reproduction before the fix when practical.
- For validation, test invalid and valid paths that prove the requested behavior.
- For refactors, verify behavior before and after when the cost is reasonable.
- For multi-step tasks, keep a brief plan with the verification attached to each step.
- Loop until the agreed or inferred success criteria are verified, or clearly state what could not be verified.

# Agents

Primary rule:
- Spawn or delegate to agents only when the user explicitly asks for delegation, sub-agents, or parallel agent work.
- Without that explicit request, handle the task in the main thread, even when the task is non-trivial or a specialist agent could help.

Direct handling is preferred when:
- the work is trivial: one command, one factual answer, one small patch, one file read, or one short explanation
- the task is tightly scoped and already specifies the target files or directories, the exact behavior change, constraints or non-goals, acceptance criteria, and verification steps
- the change is limited to a small number of files or a single clear bugfix

When the user explicitly requests delegation:
- every response that delegates MUST include at least one agent in `agents`
- delegate each non-trivial task to the smallest appropriate specialist instead of defaulting to broad or expensive agents
- apply the routing guidance below

Use `triage` first when the correct route is unclear.
Use `debugger` first for bugs or regressions in a roughly known area before implementation begins.
Use `explorer` to map relevant files, code paths, and current behavior before design or implementation when the implementation surface is not yet concrete.
Use `architect` for normal non-trivial design and decomposition that should end in an Implementation Brief rather than a full ExecPlan.
Require `architect` to produce an Implementation Brief before implementation begins on a non-trivial task unless the user already provided exact files, the exact behavior delta, constraints, acceptance criteria, and verification steps.
Use `architect-deep` only when the task crosses the ExecPlan threshold above.
The main thread MUST NOT spawn `worker`, `backend-worker`, or `frontend-worker` directly for a non-trivial task unless an Implementation Brief already exists or the user already provided:
- explicit target files or directories
- the exact requested behavior change
- constraints or non-goals
- acceptance criteria
- tests or verification steps
Prefer `backend-worker` or `frontend-worker` when a specialization clearly fits. Use `worker` only when the task is already concrete but does not map cleanly to a more specialized implementation role.
Use `supervisor` immediately when the plan or task scope indicates more than 3 agents or parallel workstreams will be needed.
Do not directly manage more than 3 non-supervisor agents in parallel from the main thread.
Skip `explorer` and `architect` when a task is already implementation-ready: known target files or directories, exact requested behavior change, constraints or non-goals, acceptance criteria, and verification steps are all present.
Use `explorer` only when a quick local scan still leaves the relevant files, code paths, or ownership boundaries unclear.

Default routing guidance for delegated non-trivial tasks:
- trivial, one-shot, or tiny concrete patch: direct handling
- known files plus exact requested delta, constraints, acceptance, and verification: direct handling for a tightly scoped small change, otherwise specialized worker or worker
- bug or regression in a roughly known area: debugger, then specialized worker or worker
- unclear implementation surface: explorer, then architect
- normal non-trivial design: architect
- plan-worthy change at the ExecPlan threshold: architect-deep, then ExecPlan-guided implementation
- more than 3 parallel workstreams: supervisor

Validation guidance:
- use `reviewer` for code-centric risk, regressions, missing tests, and maintainability review
- use `qa` for browser, integration, and user-visible acceptance validation
- use both only for high-risk user-facing changes
- skip `reviewer` for trivial or tightly scoped low-risk changes that are already covered by focused tests or direct verification
- skip `qa` unless the change is user-visible, browser-driven, integration-heavy, or the user explicitly asks for acceptance validation
