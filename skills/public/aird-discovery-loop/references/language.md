# Language And Clarity Standard

Shared by `$aird-discovery-loop` and `$aird-delivery-loop`. Both SKILL files
carry the short form; this file is the full rule and the only place that lists
what must never be translated.

## Prose is Russian

Write every human-readable AIRD artifact, specification, workorder explanation,
decision or deviation record, status update, verification interpretation, and
user-facing report in clear Russian. The main orchestrator and every subagent
that can create or edit AIRD text follow this; repeat the requirement in each
such subagent prompt.

- Prefer ordinary Russian terms over unexplained English terminology: write
  «требования к продукту», «техническое решение», «программный интерфейс»,
  «пользовательский интерфейс», «критерии готовности», «рабочее задание»,
  «проверка», «поэтапное включение», «запасной путь», «контрольная точка»
  in prose instead of relying only on PRD, TRD, API, UI/UX, DoD, workorder,
  gate, rollout, fallback, checkpoint.
- Spell out and explain every necessary abbreviation or borrowed term on first
  use, Russian meaning first, exact form in parentheses: «программный
  интерфейс (API)». A short form later is allowed only when it cannot confuse.
- Explain behavior as cause and effect: who acts, what the system does, what
  data changes, what the user sees, what happens on an error, what evidence
  proves it, what remains blocked. Do not hide meaning behind labels, status
  codes, raw command output, or lists of filenames.
- Interview questions and options must be understandable to a business owner:
  state the practical consequence before any exact technical term.

## Machine-read strings stay verbatim

This is a documentation-language rule, not a request to translate identifiers
or localize the product. The validator and the acceptance script read the
following literally; a translated key is a structural failure, not a style
choice. Keep each exactly as the templates print it and write the *content*
under it in Russian.

| Kind | Examples |
|---|---|
| Frontmatter keys and enum values | every key in `STATE.md`, workorder, `03-risk-register.md`, `09-dod.md`, `10-*-verification.md` frontmatter; values such as `ready`, `blocked`, `not_required`, `sealed`, `proven`, `unproven`, `refuted`, `routine`, `proactive_handoff`, `hard_stop` |
| Section headings the validator locates | `## Artifact Progress`, `## Current Wave Slice Index`, `### Gate -> DoD Mapping`, `### Edge Case -> Gate Mapping`, `## Task Breakdown`, `## Consumes`, `## Scope Evidence`, `## Shared Error And Public Wiring Pre-flight`, `## Verification`, `## Must Haves` |
| Field labels inside those sections | the four pre-flight labels (`Error/public surface introduced or changed`, `Shared service error renderer/mapper`, `Public route/export/registration root`, `Evidence command`); `Negative/edge cases:` |
| Table tokens | `Kind` values `file`, `artifact`, `config`, `data`, `code`; `Produced by` values `exists-in-repo`, `release-binding`, `none`; the explicit `None.` answer |
| Identifiers | `WO-`, `R-`, `G-`, `DOD-`, `EC-`, `F-`, `B-`, `W1`…, `S-` slice ids; finding classes `correctness`, `wiring`, `contract`, `data`, `security`, `test-coverage`, `ux`, `performance`, `docs`, `scope`, `evidence`, `process`, `other` |
| Everything executable or external | commands, paths, filenames, schema and column names, protocol names, third-party product names, raw log fragments, source-code identifiers |

Rule of thumb: a heading or column name that appears in a template is a key;
a sentence is prose. When the templates offer a Russian heading (the slice
entry, the review plan, the discovery summary) use it exactly as printed too.

Non-functional targets in a `deep` package are recognised in both languages
(«бюджет задержки», «ожидаемый масштаб», «бюджет стоимости», or their English
equivalents); use those phrasings so the gate can find them.

## Interview dialogue

Conduct the whole discussion gate in Russian: question, category, options,
trade-offs, recommendation, confirmation, running summary. Do not use
unexplained `API`, `UX`, `DoD`, `TDD`, rollout, fallback, endpoint, migration
or similar shorthand in a user-facing question; describe each option as cause
and effect so a non-technical owner can choose without asking for a
translation.
