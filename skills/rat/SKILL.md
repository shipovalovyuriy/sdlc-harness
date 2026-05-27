---
name: rat
description: "Use for Riskiest Assumption Test work: identify, rank, and test risky assumptions behind a product, feature, startup idea, pricing model, GTM plan, technical architecture, AI workflow, or business hypothesis. Trigger on RAT, risk assumption, riskiest assumption, assumption testing, validate idea, de-risk, hypothesis test, or what can kill this idea. Do not use for generic code review unless the task is about validating assumptions behind the change."
---

# RAT

## Purpose

Help the user apply RAT: Riskiest Assumption Test.

The goal is not to build the full product or feature. The goal is to find the assumption that could kill the idea fastest, then design the cheapest credible test for it.

## Core Principle

Always prioritize the assumption that is both:

1. Highly uncertain.
2. Highly damaging if false.

A risky assumption is not just something unknown. It is something that, if false, would make the whole idea, feature, or plan fail.

## Inputs To Inspect

If available, inspect:

- product description, user problem, target customer, current repo docs, roadmap, requirements, PRD, UX mocks;
- metrics, existing experiments, pricing or business model, GTM plan, technical design, user research notes;
- code or architecture only when assumptions depend on feasibility, integrations, scale, security, reliability, data access, or AI/model quality.

If information is missing, infer reasonable assumptions and mark them as assumptions. Ask questions only if the task is blocked.

Use `references/rat-framework.md` for category definitions and scoring rules. Use `references/experiment-menu.md` when choosing a test type. Use `assets/rat-canvas.md` when the user wants a reusable canvas or artifact.

## RAT Workflow

### 1. Restate The Idea

Summarize the idea in one clear sentence:

> We believe [target user] has [problem] and will use/pay for [solution] because [reason].

If the idea is unclear, create the best possible version from available context and mark assumptions.

### 2. List Assumptions

Generate assumptions across:

- **Desirability**: real problem, pain frequency/intensity, current alternatives, behavior change.
- **Viability**: willingness to pay, pricing, market size, value capture, sales motion.
- **Feasibility**: buildability, data/API access, permissions, infrastructure, model quality, accuracy, latency, reliability, scalability.
- **Usability**: comprehension, workflow completion, trust, fit with current process.
- **Adoption**: buyer, user, approver, blocker, habits, incentives, integrations, politics.
- **Compliance / trust**: privacy, security, legal, reputation, explainability, data/model trust.

### 3. Score Assumptions

Score each assumption from 1 to 5:

- `Uncertainty`: how little evidence exists.
- `Impact`: how badly the idea fails if false.
- `Testability`: how quickly and cheaply it can be tested.

Calculate:

```txt
Risk Score = Uncertainty x Impact
Priority Score = Risk Score x Testability
```

### 4. Pick The RAT

Choose the top 1-3 assumptions. The #1 RAT should be the assumption that gives the most learning with the least building.

Prefer tests that can be done before implementation. Do not recommend a full MVP if a cheaper RAT can test the same assumption.

### 5. Design Tests

For each top assumption, define:

- assumption;
- why it is risky;
- test type and setup;
- target audience;
- success metric and failure metric;
- timebox;
- required sample size or evidence level;
- decision rule;
- what to do if the test passes;
- what to do if the test fails.

### 6. Choose Test Type

Prefer the lightest credible test, roughly in this order:

1. Desk research.
2. Customer interview.
3. Smoke test.
4. Fake-door test.
5. Landing page test.
6. Clickable prototype.
7. Concierge MVP.
8. Wizard-of-Oz test.
9. Technical spike.
10. Paid pilot.
11. Full MVP.

## Output Format

Always return this structure:

```md
## RAT Summary

One-paragraph summary of the idea and the biggest risk.

## Assumption Map

| # | Assumption | Category | Uncertainty 1-5 | Impact 1-5 | Testability 1-5 | Priority |
|---|---|---|---:|---:|---:|---:|

## Top RAT

### Assumption

State the riskiest assumption.

### Why This Can Kill The Idea

Explain clearly.

### Fastest Credible Test

Describe the test.

### Test Design

- Test type:
- Audience:
- Setup:
- Success metric:
- Failure metric:
- Timebox:
- Decision rule:

### Expected Learnings

Explain what the team will know after the test.

## Next 3 Actions

Give concrete next steps.

## Kill / Pivot / Continue Rule

- Continue if:
- Pivot if:
- Kill if:
```

End with the single best next test.

## Rules

- Be skeptical but useful.
- Do not validate the idea just to be nice.
- Do not say "build MVP" unless necessary.
- Prefer evidence over opinions.
- Separate facts from assumptions.
- Make tests cheap, fast, and concrete.
- If the user already has data, use it.
- If data is missing, say exactly what evidence is needed.
- Avoid vague experiments like "ask users if they like it".
- Interviews must test behavior, pain, current alternatives, and willingness to commit.
- For B2B ideas, include buyer, user, approver, and blocker assumptions.
- For AI products, include trust, accuracy, latency, evaluation, data access, and hallucination-risk assumptions.
- For technical ideas, include integration, scalability, maintainability, security, and dependency assumptions.

## Interview Question Rules

Good questions ask about past behavior.

Prefer:

- "When was the last time this happened?"
- "What did you do instead?"
- "How much time or money did it cost?"
- "Who else was involved?"
- "What happens if this problem is not solved?"
- "What tool do you use now?"
- "Have you paid for a workaround?"

Avoid:

- "Would you use this?"
- "Would you pay for this?"
- "Do you like this idea?"
- "Does this sound useful?"
