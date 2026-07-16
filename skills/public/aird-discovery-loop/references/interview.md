# Interview Protocol

How to run the discussion gate so the **user stays in control of the important decisions without being over-interviewed**. This is the questioning mechanic for phase 2. The categories in the SKILL's "Architectural Decisions To Surface" are a scan space, not a mandate to ask about each category.

## Question budget (mandatory)

In **Normal mode**, ask only the highest-impact material questions needed for the entire discovery, with a hard cap of 10 user-facing questions. Stop earlier as soon as the remaining choices have safe defaults; 10 is a ceiling, not a target. Never generate or walk a comprehensive question inventory. Before asking, rank and merge candidates; one question should resolve a decision cluster where possible.

Ask only when the answer materially changes user-visible scope or UX, an irreversible API/data contract, security/privacy, rollout/recovery risk, or acceptance criteria. Do not ask about repository conventions, ordinary implementation details, or choices that are cheap to reverse and have a clear recommended default. Infer those from evidence, record them as `defaulted`, and summarize them without seeking approval.

Exceed 10 questions only when the user explicitly invokes **Grill** mode or explicitly asks to continue the interview. If another critical decision cannot be safely defaulted after the cap, record it as a blocker and explain it concisely rather than continuing automatically.

## Core rule: one decision at a time

Ask ONE selected question, get the answer, and let that answer decide whether another budgeted question is still necessary. It is a short decision tree, not a form — never dump a batch or expose the unused candidate inventory. Each answer should prune branches aggressively (e.g. "no persistence" deletes every migration/backfill question that would have followed).

**Non-interactive exception.** When the session is non-interactive (`codex exec` / no user present), apply repository-backed or simple reversible defaults and mark consequential ones `defaulted` (never fabricate a `User Decision`). Mark only high-risk or irreversible choices that cannot be defaulted safely as `unconfirmed`, and stop before delivery only for those blockers. Do not materialize a full question inventory merely because no user is present.

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

Rank the candidate decisions by how strongly they constrain the result — often scope/UX first, then irreversible data/contracts, security, and rollout. Ask from the top of that ranking and stop when the remaining candidates are safe defaults. Skip fine-grained, reversible choices rather than walking the whole decision space.

## Codebase-first

Before asking anything, check whether the codebase already answers it — grep/glob for existing patterns, dependencies, configs, and similar features, or delegate a scoped `explorer`. If the repo already decides it, say so and skip the question ("Socket.IO is already a dependency — using it for realtime, not asking"). Never make the user re-decide what the code has already decided.

## Two modes (detect from the user's first message; default Normal)

- **Normal** (default): collaborative and focused. Ask only as many highest-impact questions as necessary, never more than 10 total, and stop earlier when the remaining choices have safe defaults. A short "ok / yes / your call" is sufficient.
- **Grill** (triggered by "grill me", "stress-test", "poke holes", "what am I missing"): relentless. After each answer, ask at least one "why / what if" follow-up before moving on. After the main tree is resolved, run an **edge-case pressure round** — large inputs, empty/error/loading states, concurrency, permissions, partial failure, rollback. Only stop when the user explicitly says "that's enough / ship it / final answer". If the user shows frustration, drop back to Normal immediately.

Grill mode is the tool for "I don't feel in control" — it forces the unasked questions to the surface.

## Running summary

At the end of the short interview (or after 3 answers), show one compact table of the decisions so far so the user can correct the picture:

| # | Decision | Choice | Rationale |
|---|---|---|---|

Persist the same rows into `00-discussion-log.md` (the Questions Asked and Architectural Decisions tables). Also record consequential unasked choices as `defaulted` with evidence and rationale. Do not proceed to the TRD (phase 6) while a high-risk or irreversible decision is still open or `unconfirmed`; reversible defaults are not blockers.

## Language

Conduct the whole dialogue in the user's language — options, categories, and recommendations included. Keep only established technical terms (API, JSON, TDD, migration) in English.
