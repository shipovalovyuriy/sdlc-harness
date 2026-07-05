# Interview Protocol

How to run the discussion gate so the **user stays in control of the decisions**. This is the questioning mechanic for phase 2 (Discuss And Lock Decisions) and for surfacing the architectural decisions. The categories in the SKILL's "Architectural Decisions To Surface" are *what* to decide; this file is *how* to ask.

## Core rule: one decision at a time

Ask ONE question, get the answer, and let that answer decide the next question. It is a decision tree, not a form — never dump a batch of questions at once. Each answer prunes or opens the next branch (e.g. "no persistence" deletes every migration/backfill question that would have followed). Walking one at a time is what keeps the user feeling in control instead of handed a wall of choices.

**Non-interactive exception.** When the session is non-interactive (`codex exec` / no user present) you cannot walk a live tree. Record the recommended default for each load-bearing decision as an `unconfirmed` assumption in `00-discussion-log.md` and `STATE.md` (never fabricate a `User Decision`), and stop before delivery if any unanswered decision is load-bearing. This is the same fallback as the phase-2 gate.

## Question format (mandatory — closed, never open-ended)

```
N) <decision / category>?
   a) <option> — <one-line trade-off>
   b) <option> — <one-line trade-off>
   c) <option> — <one-line trade-off>
   d) <option> — <one-line trade-off>

Recommendation: <letter>) <option> — <one-line why>.
Your choice?
```

- **Number sequentially across the whole session** (1, 2, 3, 4 …) — do not restart numbering per category.
- **Always give a recommended default with a reason.** Never ask a bare open-ended question. If the user is unsure or says "your call", take your recommendation, state it, and move on.
- 2–4 options is typical. The user can always answer outside the options — the letters are a scaffold, not a cage.

## Order: highest-impact first

Walk the decision space starting with the choice that most constrains the rest — usually placement/boundaries or reuse-vs-build, then data and contracts, then failure/rollout, then the finer points. A wrong high-impact default silently reshapes everything downstream, so lead with those and let the cheap, reversible ones come last (or get skipped).

## Codebase-first

Before asking anything, check whether the codebase already answers it — grep/glob for existing patterns, dependencies, configs, and similar features, or delegate a scoped `explorer`. If the repo already decides it, say so and skip the question ("Socket.IO is already a dependency — using it for realtime, not asking"). Never make the user re-decide what the code has already decided.

## Two modes (detect from the user's first message; default Normal)

- **Normal** (default): collaborative. A short "ok / yes / your call" is a sufficient answer. Stop when the design is specified or the user says "that's enough".
- **Grill** (triggered by "grill me", "stress-test", "poke holes", "what am I missing"): relentless. After each answer, ask at least one "why / what if" follow-up before moving on. After the main tree is resolved, run an **edge-case pressure round** — large inputs, empty/error/loading states, concurrency, permissions, partial failure, rollback. Only stop when the user explicitly says "that's enough / ship it / final answer". If the user shows frustration, drop back to Normal immediately.

Grill mode is the tool for "I don't feel in control" — it forces the unasked questions to the surface.

## Running summary

Every 3–5 answers, show a compact table of the decisions so far so the user can see and correct the accumulating picture:

| # | Decision | Choice | Rationale |
|---|---|---|---|

Persist the same rows into `00-discussion-log.md` (the Questions Asked and Architectural Decisions tables). Do not proceed to the TRD (phase 6) while a load-bearing decision is still open or `unconfirmed`.

## Language

Conduct the whole dialogue in the user's language — options, categories, and recommendations included. Keep only established technical terms (API, JSON, TDD, migration) in English.
