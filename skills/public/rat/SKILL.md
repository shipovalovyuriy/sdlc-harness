---
name: rat
description: "Use for Riskiest Assumption Test work: identify, rank, pressure-test, and test risky assumptions behind a product, feature, startup idea, pricing model, GTM plan, technical architecture, AI workflow, or business hypothesis. Trigger on RAT, risk assumption, riskiest assumption, assumption testing, validate idea, de-risk, hypothesis test, stress-test this, pressure-test this, or what can kill this idea. Do not use for generic code review unless the task is about validating assumptions behind the change."
---

# RAT

## Purpose And Fit

RAT means Riskiest Assumption Test. Find the assumption that could invalidate a meaningful decision, then choose the cheapest test capable of answering it. Preserve the user's goal; a proposed solution may be only one way to reach it.

Use RAT for a bet with uncertainty and a material cost of being wrong. Skip factual lookups, pure creation without a decision to de-risk, casual low-stakes choices, and requests for encouragement alone.

## Resources

- Read [references/rat-framework.md](references/rat-framework.md) for the assumption record, evidence rules, ranking, and result states. This is the canonical contract for RAT outputs.
- Read [references/experiment-menu.md](references/experiment-menu.md) when selecting a test. Match the test to the claim; there is no universal cheapest-first ladder of methods.
- Use [assets/rat-canvas.md](assets/rat-canvas.md) when a reusable or saved artifact is requested.
- Read [references/aird-handoff.md](references/aird-handoff.md) when RAT is invoked inside AIRD or a handoff to AIRD is requested. Standalone RAT does not launch AIRD.

## Workflow

### 0. Frame The Decision

Start with a short scan of the 2-3 highest-signal authorized sources: named files, relevant repo docs, PRD, roadmap, research, metrics, pricing, existing experiments, and `AGENTS.md`. Inspect code only when feasibility, integration, permissions, security, reliability, scale, or AI quality depends on it.

State the decision, user/system, desired outcome, current alternative, evidence, missing information, and cost of being wrong. Capture deadline and constraints; market, price, and channel only when relevant.

Ask a targeted question when its answer could change the first risk, the test threshold, or safe execution. Otherwise state the assumption and continue. Missing facts remain missing; do not invent evidence, a budget, or a measured failure probability.

Restate the bet in one sentence, for example:

> In [context], [user or system] can achieve [outcome and success criterion] through [approach], compared with [current alternative].

Choose **design a test** or **assess supplied results**. Respect existing task authorization; analysis alone does not launch probes, spending, contacts, or data transfers.

### 1. Map Assumptions And Evidence

Cover desirability, viability, feasibility, usability, adoption, and compliance/trust using the framework. Include product-specific risks at actor, data, integration, and operational boundaries.

Use the framework's assumption record: stable IDs, falsifiable claims, scope, dependencies, and evidence for/against. Reuse upstream IDs and retain the history of changed claims and open risks.

### 2. Pressure-Test From Five Lenses

Review the map yourself unless the user explicitly requests parallel agents:

- **Contrarian:** What hidden blocker or false premise defeats the bet?
- **First principles:** What outcome matters, and is this approach necessary?
- **Expansionist:** What stronger offer or adjacent opportunity is being missed?
- **Outsider:** What is confusing or obvious only to insiders?
- **Executor:** What credible check could happen Monday with little build or coordination?

Use the lenses to find missing assumptions and contradictions. They do not supply evidence.

### 3. Select The First Risk

Apply the framework's order: resolve disproof, identify open critical dependencies, then rank uncertainty. `Uncertainty x Impact` is an ordinal aid within that order; testability is not a risk multiplier.

Pick the first risk and, when useful, up to two independent follow-ups. Explain consequences, evidence gaps, and dependencies before cost. Check for easy-test bias, ignored opposing evidence, and affected downstream decisions.

### 4. Try Removing The Dependency

Before designing a probe, ask whether the risky dependency can be removed while retaining the essential outcome: reduce the promise, use a manual step, drop an integration, reuse an existing capability, or choose another approach. State the tradeoff and any replacement risk. Do not silently redefine the user's goal or claim that a removed dependency was validated.

### 5. Design Or Assess The Test

For design, complete the framework's test card before execution, including thresholds, sample/evidence sufficiency, owner, budget, and ambiguous outcomes. Choose the lightest credible method from the menu; a smaller adequate test takes precedence over a full MVP.

For results, attach the actual execution record and judge it against the card and tested scope. Missing execution evidence leaves a plan `untested`; an executed test unable to answer the claim is `insufficient_data`. Feedback or command success cannot close a different claim.

A refuted critical dependency pauses dependent decisions. Inconclusive evidence needs a bounded follow-up, scope change, or decision owner; preserve independent decisions and evidence.

### 6. Return A Compact Decision

Lead with the decision being examined, the first risk and reason, the next action, and the number/IDs of open critical assumptions. Scale confidence to the evidence and name the most useful missing input.

Include a concise assumption table:

| ID | Claim and scope | Category | Critical / depends on | Evidence for / against (source IDs) | Uncertainty / Impact | Outcome | Decision / owner |
|---|---|---|---|---|---|---|---|

Show the selected test card, actual result if available, material blind spots, and continue/pivot/stop conditions. Define whether "continue" permits another test, a constrained trial, or implementation. Give the next action once; use the canvas for a larger artifact.

When handing off to AIRD, carry the same IDs, evidence, and open critical risks through the handoff reference. Do not change package readiness or mark risks proven from a test plan.

## Domain Checks And Interview Questions

- **B2B:** distinguish user, buyer, approver, and blocker; inspect commitment, procurement, incentives, and switching costs.
- **AI:** consider data access, representative evaluation data, error/hallucination classes, trust, model/prompt versions, latency, and cost. A manual simulation can test usefulness without proving model quality.
- **Technical:** inspect integration contracts, permissions, reliability, scalability, security, maintenance, and dependency assumptions.

Interviews ask about actual episodes, outcomes, alternatives, expenditure, and commitments. Prefer "When did this last happen?", "What did you do instead?", "What did it cost?", "Who was involved?", "What happened if it stayed unresolved?", and "Have you paid for a workaround?" Avoid "Would you use/pay for this?" or "Do you like this idea?" as validation.
