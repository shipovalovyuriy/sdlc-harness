# Interview Protocol

How to run the discussion gate so the **user stays in control of the important
business and product decisions**. This is the questioning mechanic for phase 2.
The categories in the SKILL's decision checklist are a scan space; ask every
material question that affects business value, user behavior, scope, policy,
economics, adoption, or acceptance, without inventing a numeric ceiling.

## No Numeric Question Limit (mandatory)

There is no maximum number of discovery questions in Normal or Grill mode.
Continue one question at a time until every material business/product decision
is answered, explicitly defaulted from evidence, or recorded as an unresolved
blocker. Do not stop because a count was reached. Do not merge distinct business
decisions merely to make the interview shorter.

Ask whenever the answer materially changes the target user, problem priority,
observable value, workflow, roles and permissions, policy, adoption path,
success measurement, cost/operational ownership, user-visible scope or
experience, irreversible interface/data contract, privacy, rollout/recovery
risk, or acceptance criteria. Prefer business questions before technical ones.
Do not ask about repository conventions, ordinary implementation details, or
cheap reversible choices with a clear evidence-backed default; record those as
`defaulted` and explain them later.

Stop the interview only when the material decision space is closed or the user
explicitly asks to stop. If the user stops while a high-risk or irreversible
decision remains open, record it as a blocker and explain the consequence.

Two decisions must always be asked when they
arise, because no default is safe and the package cannot honestly claim
readiness without an answer:

- any `STATE.md` blocker with `needs_user_decision: true` — a blocker on the
  only path to a user is a question, not a note;
- accepting a first wave whose outcome is a platform slice rather than
  something a PRD persona observes (`platform_slice_approved`).

Both are single closed questions with a recommendation, in the normal format.

## Core rule: one decision at a time

Ask ONE selected question, get the answer, and let that answer decide which
question is next. It is a decision tree, not a form: never dump a batch or
expose the unused candidate inventory. An answer may remove irrelevant branches,
but it must not erase a separate material business decision.

**Non-interactive exception.** When the session is non-interactive (`codex exec` / no user present), apply repository-backed or simple reversible defaults and mark consequential ones `defaulted` (never fabricate a `User Decision`). Mark only high-risk or irreversible choices that cannot be defaulted safely as `unconfirmed`, and stop before delivery only for those blockers. Do not materialize a full question inventory merely because no user is present.

## Question format (mandatory — closed, never open-ended)

```
N) <решение или категория>?
   а) <вариант> — <практическое последствие одной строкой>
   б) <вариант> — <практическое последствие одной строкой>
   в) <вариант> — <практическое последствие одной строкой>
   г) <вариант> — <практическое последствие одной строкой>

Рекомендация: <буква>) <вариант> — <почему это лучше одной строкой>.
Какой вариант выбираете?
```

- **Number sequentially across the whole session** (1, 2, 3, 4 …) — do not restart numbering per category.
- **Always give a recommended default with a reason.** Never ask a bare open-ended question. Explain how every option affects users, business value, cost,
  risk, or delivery. If the user is unsure or says "your call", take your
  recommendation, state it, and move on.
- 2–4 options is typical. The user can always answer outside the options — the letters are a scaffold, not a cage.

## Order: business impact first

Start with the business frame: who has the problem, which outcome matters, how
the current workflow fails, what must change for adoption, how success will be
measured, which roles/policies constrain behavior, and who owns ongoing cost or
operations. Then ask about user experience, irreversible data/interfaces,
security, rollout, and recovery. Skip only fine-grained reversible implementation
choices that evidence already decides.

## Codebase-first

Before asking anything, check whether the codebase already answers it — grep/glob for existing patterns, dependencies, configs, and similar features, or delegate a scoped `explorer`. If the repo already decides it, say so and skip the question ("Socket.IO is already a dependency — using it for realtime, not asking"). Never make the user re-decide what the code has already decided.

## Two modes (detect from the user's first message; default Normal)

- **Normal** (default): collaborative and thorough. Ask every material
  business/product question one at a time, then the technical decisions that
  cannot be safely defaulted. There is no numeric cap. A short
  "ok / yes / your call" is sufficient.
- **Grill** (triggered by "grill me", "stress-test", "poke holes", "what am I missing"): relentless. After each answer, ask at least one "why / what if" follow-up before moving on. After the main tree is resolved, run an **edge-case pressure round** — large inputs, empty/error/loading states, concurrency, permissions, partial failure, rollback. Only stop when the user explicitly says "that's enough / ship it / final answer". If the user shows frustration, drop back to Normal immediately.

Grill mode is the tool for "I don't feel in control" — it forces the unasked questions to the surface.

## Running summary

After every 3 answers, and once more when the interview closes, show one compact
table of the decisions so far so the user can correct the picture:

| № | Решение | Выбор | Почему |
|---|---|---|---|

Persist the same rows into `00-discussion-log.md` (the Questions Asked and Architectural Decisions tables). Also record consequential unasked choices as `defaulted` with evidence and rationale. Do not proceed to the TRD (phase 6) while a high-risk or irreversible decision is still open or `unconfirmed`; reversible defaults are not blockers.

## Language And Explanation (mandatory)

Conduct the whole dialogue in clear Russian: question, category, options,
trade-offs, recommendation, confirmation, and running summary. Prefer ordinary
Russian words over abbreviations and English terminology. If an exact technical
term or abbreviation is necessary, first write the Russian meaning and explain
it, then put the exact form in parentheses, for example «программный интерфейс
(API)». Do not use unexplained `API`, `UX`, `DoD`, `TDD`, rollout, fallback,
endpoint, migration, or similar shorthand in user-facing questions. Describe
each option as cause and effect so a non-technical business owner can choose it
without asking for a translation.
