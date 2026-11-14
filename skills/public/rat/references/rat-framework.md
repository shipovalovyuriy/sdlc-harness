# RAT Framework

## Assumption Categories

Use the categories as coverage prompts, not six separate copies of the same risk:

| Category | Look for |
|---|---|
| Desirability | Desired outcome, frequency, success criteria, current alternatives, pain when present, willingness to change behavior |
| Viability | Price and payment, market access/size, margin and cost-to-serve, sales motion, channel economics |
| Feasibility | Buildability, data/API access, permissions, model quality, latency, reliability, infrastructure, scale |
| Usability | Comprehension, workflow completion, trust in the output, fit with current habits |
| Adoption | Buyer/user/approver/blocker, incentives, procurement, switching costs, integrations and organizational constraints |
| Compliance / trust | Privacy, security, legal constraints, reputation, explainability, correction and oversight |

## Assumption Record

Each row has a stable `R-01` ID, one positively stated claim, the conditions under which it must hold, category, criticality, dependencies, evidence for and against, outcome, and the decision/owner it affects.

- Make a claim falsifiable: identify the relevant user/system, context or version, observable, and required level. Price, channel, geography, and timeframe belong only when they matter.
- A risk is **critical** when failure defeats the decision or changes its necessary design, contract, or operating model. Record that consequence; a label alone is not justification.
- `depends_on` names only real prerequisite claims. A parent's failure invalidates the dependent recommendation, not automatically every unrelated observation.
- Reuse existing IDs and preserve links across PRD, research, RAT, and AIRD. Never renumber an existing package. A materially changed claim receives a new ID with `replaces: R-xx`; preserve the prior result.
- Removing a dependency is a recorded change in scope or approach, not a successful test. Retain the ID with its disposition and list any replacement risk.

## Evidence Contract

Every material factual claim has a source pointer or is explicitly an assumption. Use source IDs such as `E-01` with a message/quote, file/row/line, interview timestamp, experiment record, or verifiable URL; include date and relevant version/population where known. Do not invent missing pointers.

Distinguish **observed/measured**, **reported by someone**, **derived from named evidence**, and **proposed hypothesis**. A quote proves what a person said, not automatically that their explanation or market estimate is true. Data found in a deck or codebase keeps its provenance and limitations.

Record supporting and opposing evidence separately, including failures, missing cases, stale data, selection effects, and changes of scope. If none is available, say so. Several retellings of the same event are not independent support. Uncertainty is not the probability the claim is false.

For interview aggregates, report `n/N`, who was eligible for the denominator, source IDs, and the unit counted (people, accounts, or episodes). Repeated mentions from one person do not add people. A qualitative convenience sample does not yield a population rate. Check that respondents describe their own past episodes and expenditure; leading questions, hypotheticals, and feature wishes give weak support. A single observation may motivate a test or refute an appropriately universal claim, but cannot establish how common a need is.

## Ranking: Risk First, Test Second

1. **Resolve disproof.** Do not score an already refuted claim as merely uncertain. Pause dependent decisions and choose a revision, scope change, or stop; preserve unrelated evidence.
2. **Select the open critical dependency.** Prioritize unresolved prerequisites whose failure would defeat the decision. Do not let an easy secondary experiment hide them. If a critical check is unavailable, record the blocker, missing access/evidence, and owner rather than proceed as if it passed.
3. **Rank within the applicable group.** Use consequences, dependency order, opposing evidence, and remaining uncertainty. `Uncertainty x Impact` may aid this comparison; explain ties or overrides. Scores are ordinal judgments, not calibrated probabilities or expected monetary loss.
4. **Choose the test for that claim.** Compare methods by what they can establish, required time/cost/sample/access, and the decision their result changes. Testability is a constraint on test selection, not a multiplier in risk priority. An independent secondary check can proceed while the critical one is blocked, but cannot unlock its dependents.

Use scores only when they help, with a short evidence-based reason:

| Score | Uncertainty (within the stated scope) | Impact if false |
|---|---|---|
| 1 | Strong direct support covers the conditions; limited residual uncertainty | Minor inconvenience |
| 2 | Direct support with a small relevant gap | Local rework or limited loss |
| 3 | Partial, mixed, or incomplete support | Material loss; approach remains workable |
| 4 | Mostly indirect/weak support or a large coverage gap | Major redesign or substantial loss |
| 5 | No relevant evidence | Decision or essential approach fails |

Record criticality separately even when a coarse score understates a structural dependency. A supported claim is closed only in its tested scope; new conditions reopen the uncertainty. Do not manufacture numerical probabilities from these scores.

## Test Card (Design Mode)

For each selected risk:

- **Risk ID, claim, scope, locked at:** fix the assertion before execution. If reviewing an unregistered past test, disclose that thresholds were chosen retrospectively and do not present them as predeclared.
- **Method and setup:** why this observation can answer this claim; what result could refute it; actual versus simulated boundaries.
- **Audience/sample or corpus:** inclusion/recruitment rules, eligible denominator, target sample/evidence sufficiency, and its justification. State missing sample-design inputs instead of inventing a universal minimum.
- **Observable and baseline/comparison:** the actual behavior, commitment, output, or measurement; baseline where relevant.
- **Support threshold / refutation threshold / insufficient-data conditions:** predeclare numeric or observable criteria and the exact decision each outcome permits. Keep ambiguous regions explicit; a pass must cover the complete claim.
- **Owner, budget, timebox, access:** who gathers evidence, permitted effort, and what would block the test.
- **Next decision:** continue within stated limits, revise/pivot, stop, or gather a specific missing observation. Explain when to stop repeating an inconclusive test (time/cost limit or no decision-changing evidence).

## Actual Results And Outcomes

Keep the original test card and attach an execution record: what actually ran, when, exact source/evidence locations, observed values and denominator, deviations, and conditions covered. Expected learnings are not actual results. Synthetic examples are not collected evidence.

| Outcome | Meaning | Next decision |
|---|---|---|
| `untested` | Only a plan exists, or there is no evidence execution occurred | Gather evidence; dependent critical decisions remain open |
| `supported` | Valid execution met the predeclared support criteria for the complete stated claim | Continue only within those conditions; other risks stay open |
| `refuted` | Valid evidence met the refutation criterion or contradicted a necessary condition | Pause dependent decisions; revise, remove the dependency, pivot, or stop |
| `insufficient_data` | Execution occurred but sample, measurement, contradictory evidence, or scope mismatch cannot answer the claim | Name what is missing and a bounded follow-up; no pass |

Conflicting valid evidence against a necessary condition is not averaged away into support. If its relevance or measurement validity is unresolved, record `insufficient_data` and the uncertainty. Missing a support threshold is not automatically refutation when the predefined rule leaves an ambiguous region.

Reassess affected dependencies after each result. Show the IDs/count of open critical assumptions and carry them forward; one supported risk never approves the entire product. AIRD-specific mapping lives in [aird-handoff.md](aird-handoff.md).
