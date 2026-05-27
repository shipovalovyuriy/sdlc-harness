---
name: constraint-flow-thinking
description: "Use this skill when analyzing bottlenecks, slow delivery, overloaded work, recurring problems, queues, WIP, decision delays, productivity issues, local optimizations, process problems, or when asked to improve throughput using Theory of Constraints and Systems Thinking."
---

# Constraint-Flow Thinking

Analyze systems with Theory of Constraints plus Systems Thinking: TOC finds the constraint; systems thinking explains why it appears, returns, or moves.

## Core Principle

Do not optimize activity. Optimize global throughput through the constraint.

Do not treat symptoms. Find the stock, flow, feedback loop, delay, and policy structure that creates the symptom.

## Use For

Software engineering, architecture decisions, product/project/team management, personal productivity, decision making, operations, and incident/root-cause analysis.

## Operating Model

For every problem:

1. Define the system goal.
2. Define the system boundary.
3. Define throughput: valuable output per time.
4. Find stocks: what accumulates.
5. Find inflows and outflows.
6. Find the queue before the constraint.
7. Infer the constraint from accumulation and waiting.
8. Map feedback loops.
9. Find delays between action and result.
10. Detect local optimizations.
11. Choose the leverage point.
12. Recommend the smallest intervention with the largest throughput effect.
13. Predict second-order effects and where the constraint moves next.

Use `references/diagnostic-framework.md` for the full method, `references/examples.md` for sample diagnoses, `references/anti-patterns.md` to avoid common traps, and `references/intervention-playbook.md` for intervention options. Use templates in `assets/` when the user asks for an artifact or repeatable canvas.

## Definitions

- **System goal**: the real outcome the system exists to produce, e.g. "deliver valuable changes to production safely and predictably", not "finish more tasks".
- **Throughput**: rate of valuable output, such as shipped features, resolved incidents, validated decisions, completed customer requests, deployed changes, or closed high-value tasks.
- **Stock**: something that accumulates: backlog, WIP, PRs waiting for review, unresolved decisions, technical debt, defects, meetings, context debt, blocked tasks, unvalidated assumptions, open risks.
- **Flow**: a rate that increases or decreases a stock: requests added, tasks completed, PRs opened/reviewed, decisions made, bugs fixed, meetings added/removed.
- **Constraint**: the part that limits global throughput, often visible as a growing queue, repeated waiting, rework, overloaded owner, handoff latency, decision bottleneck, or slow feedback loop.
- **Feedback loop**: system state influencing future behavior, e.g. more WIP -> more context switching -> lower completion rate -> more WIP.
- **Delay**: gap between action and visible result that can make teams abandon good interventions early or overreact to late signals.
- **Local optimization**: improving one part while worsening the whole, e.g. increasing developer output while review is blocked, maximizing utilization while lead time grows, adding meetings when decision rights are unclear.

## Modes

- `quick_scan`: 5-10 bullets with likely constraint, visible stock, inflow/outflow mismatch, main feedback loop, best next intervention.
- `deep_diagnosis`: full system diagnosis using the required answer format.
- `decision_review`: test whether a proposed decision addresses the real constraint or only improves local efficiency.
- `daily_work`: analyze personal productivity through attention, WIP, request inflow, context switching, decision debt, backlog growth, deep work, kill-list, delegation, refusal rules.
- `engineering_flow`: analyze backlog, analysis, development, PR review, QA, CI/CD, deploy, incidents, rework, batch size, flaky tests, handoffs, blocked states.
- `management_flow`: analyze meetings, approvals, decision rights, escalation paths, overloaded leaders, unclear ownership, dependency queues, planning delays, priority churn.

If no mode is specified, choose `quick_scan` for small asks and `deep_diagnosis` for recurring or high-impact problems.

## Required Answer Format

Use this structure for full analysis:

```text
System goal:
System boundary:
Throughput:
Stocks:
Inflows:
Outflows:
Where stock is accumulating:
Likely constraint:
Evidence:
Feedback loops:
Delays:
Local optimizations:
Leverage points:
Recommended intervention:
Expected second-order effects:
Expected next constraint:
Assumptions:
Missing data:
```

## Rules

1. Never assume the most visible pain is the constraint.
2. Look for accumulation before declaring a constraint.
3. Do not increase inflow into a blocked system.
4. Do not maximize utilization as the default solution.
5. Prefer smaller batches and faster feedback.
6. Prefer removing queues before adding process.
7. Prefer clarifying decision rights before adding meetings.
8. Prefer reducing WIP before adding capacity.
9. Always distinguish local optimization from global throughput.
10. Always predict where the constraint may move next.
11. If data is missing, state assumptions and ask for the highest-leverage evidence.
12. Recommend the smallest intervention with the highest system-level impact.

## Intervention Patterns

Use when appropriate: WIP limit, reduce inflow, increase outflow, protect constraint, remove rework loop, shorten feedback loop, clarify decision rights, automate repetitive checks, reduce batch size, create buffer, change incentives, change information flow, kill low-value work, split large work, remove handoffs, create escalation policy.

## Final Response Style

Be practical, direct, and diagnostic. Avoid generic productivity advice and academic explanation.

Always connect the recommendation to the system goal, constraint, stock-flow structure, and expected throughput improvement.
