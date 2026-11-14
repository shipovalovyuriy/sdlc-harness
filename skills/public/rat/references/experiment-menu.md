# RAT Experiment Menu

Choose a method after selecting the risk. Evidence strength depends on the claim, real execution, sample and context; a method name never guarantees high-quality evidence. Complete the test card in [rat-framework.md](rat-framework.md).

| Method | Can answer | Does not establish on its own |
|---|---|---|
| Desk research | Documented market bounds, alternatives, pricing, provider limits or constraints | This customer's need, willingness to switch/pay, or actual runtime compatibility |
| Customer interview | Past episodes, current workflow/alternatives, expenditure, roles and switching barriers | Future behavior, population prevalence, or payment without commitment |
| Smoke / landing-page test | Response to a particular offer, price and acquisition route; waitlist/demo/pricing clicks with a qualified denominator | Retention, delivered value, profitable scale, or payment from a click |
| Fake-door test | Observed intent in a defined existing-product context | Successful use or value of the missing capability; avoid misleading commitments and explain availability |
| Clickable prototype | Comprehension and observed task completion | Production reliability, paid demand, or long-term adoption |
| Concierge MVP | Whether a manually delivered outcome meets the user's criteria; response to a concrete offer | Automated quality, repeatable unit economics, or capacity at scale |
| Wizard-of-Oz test | Interaction and usefulness when a human produces the apparent automation | The actual AI's accuracy, latency, cost, or failure behavior; disclose consequential limits |
| Technical spike | A specific integration, permission, data, model, performance or runtime claim | Desirability or demand; a substitute proves only the narrower substituted setup |
| Paid pilot | Actual commitment, buying process and use at stated terms in those accounts | Broad market size, representative conversion, sustainable margin or renewal without evidence |
| Full MVP | Integrated behavior that smaller probes cannot credibly test | General validation of every assumption; name the exact risks it tests |

## Interview Evidence

Recruit people who performed the relevant task and record concrete past episodes, their alternatives, actual time/money spent, and who decided or blocked the purchase. Keep reports and interpretations distinct. Assess leading-question contamination and missing context before aggregating; retain `n/N` with eligible population and source IDs. Treat promises as reported intent.

## Technical And AI Evidence

Drive the boundaries and terminal observable required by the exact claim. For end-to-end compatibility, use the actual producer/client and its emitted payload at the real endpoint/runtime, not a corrected reconstruction; a `200` without the needed output or persisted state is insufficient. Record command, relevant versions, evidence location, measured outcome, and simulated boundaries. Missing credentials or permission leaves the claim open.

For model-quality claims, specify model/prompt/config versions, a representative held-out corpus, labels or reference answers, failure classes, baseline, and acceptance threshold. Include latency/cost if part of the claim. An attractive hand-produced demo cannot close a model-quality risk.

Prototype or mock tests can answer appropriately narrow interaction/component claims; do not promote them to proof of production behavior. Inside AIRD, apply [aird-handoff.md](aird-handoff.md) and the existing real-boundary contract.
