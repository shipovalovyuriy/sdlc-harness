---
name: rca
description: "Run root cause analysis (RCA, анализ корневых причин) for incidents, regressions, recurring defects, operational failures, product/marketing/sales metric drops, support patterns, process breakdowns, and postmortems. Use when the user asks to find why a problem happened, distinguish symptoms from root causes, write an RCA/post-incident report, build CAPA actions, or prevent a repeated issue."
---

# RCA

## Core Stance

Use RCA to reconstruct how the problem became possible, not to hunt for a single guilty person. Keep people in the analysis as actors with partial information, incentives, constraints, handoffs, and decision context, but phrase findings around systems, processes, tooling, data, governance, and feedback loops.

Separate:

- **Facts**: directly observed evidence.
- **Inferences**: conclusions supported by multiple facts.
- **Hypotheses**: plausible causes that still need proof.
- **Actions**: concrete changes with owners, dates, and success checks.

Do not stop at the first plausible explanation. Many product, marketing, sales, operations, and engineering problems are chains of contributing factors rather than one isolated root cause.

When a problem is active or severe, separate **containment now** from **RCA later**. Preserve evidence early: logs, metrics, decisions, screenshots, tickets, chats, deploy/config history, user reports, and timeline notes.

Preserve the user's language in the final RCA unless they ask otherwise.

## Intake

Collect only missing information. Ask compact questions if the problem statement is too vague.

Minimum facts:

- What happened, where it appeared, when it started, and how it was detected.
- Business/customer/team impact and severity.
- Affected users, systems, teams, funnel stages, or process steps.
- Relevant changes before the issue: releases, campaigns, handoffs, process changes, load, staffing, data/import changes.
- Evidence already available and evidence that is missing.
- Output needed: quick diagnosis, full RCA report, postmortem, CAPA plan, or experiment/research plan.

## Workflow

### 1. Define The Problem Precisely

Write a specific problem statement with observable facts: metric, scope, time window, location, scale, and consequence. Replace vague labels like "slow", "bad leads", or "sales are broken" with measurable behavior.

Use `references/evidence-checklist.md` for 5W1H prompts and role separation when facts are thin.

### 2. Build Timeline And Evidence Base

Create a chronological sequence from the last known good state through detection, response, and current status. Mark gaps explicitly. Prefer primary evidence over recollection, but include interviews when they explain decision context.

### 3. Map The Causal Space

List candidate contributing factors across levels:

- technical system, data, configuration, infrastructure, monitoring;
- process, handoffs, documentation, approval path, ownership;
- people context: who saw what, who decided, who was affected, who had missing information;
- product/customer journey: promise, expectation, onboarding, support, sales, pricing, CRM, activation;
- governance and management: incentives, prioritization, change control, review cadence;
- environment: load, seasonality, external dependencies, vendor behavior.

Look for repeated work, information loss between teams/tools, upstream/downstream effects, and recurring patterns.

### 4. Choose Analysis Methods

Use methods based on shape of the problem:

- **5 Whys** for simple linear chains. Stop when a "why" is not evidence-backed, or when the chain is forcing a single story too early.
- **Fishbone/Ishikawa** when there are many possible causes. For production use 6M/8M categories; for product and go-to-market use people, process, tools, message/offer, data, governance, environment, and customer context.
- **Post-incident review** for outages and reliability events: impact, timeline, detection, response, contributing factors, prevention, owner follow-up.
- **Opportunity/solution framing** for product metric drops: desired outcome, opportunity space, candidate causes, solutions/experiments, and evidence needed.

### 5. Validate Root Causes

Treat a root cause as valid only when it:

- explains the observed problem and timing;
- is supported by facts, not only opinions;
- can reproduce or plausibly allow recurrence;
- sits at a level where a system/process/product change can reduce recurrence;
- has no stronger contradictory evidence.

If a suspected cause cannot be tied to evidence, label it as a hypothesis and state the next check.

### 6. Build CAPA Actions

Separate actions by purpose:

- **Immediate**: contain impact or stop spread.
- **Corrective**: remove or reduce confirmed causes.
- **Preventive**: stop similar issues before they happen.
- **Systemic**: change ownership, workflow, standards, automation, monitoring, training, or knowledge base.

Every action needs owner, deadline, expected effect, verification metric, and failure mode.

### 7. Verify And Close The Loop

Define how the team will know the fix worked: target metrics, monitoring window, recurrence checks, customer/support signal, QA/regression checks, or experiment result. Add follow-up dates and a place where the RCA learning will live.

## Report Output

For a full RCA or postmortem, load `references/rca-report-template.md` and fill it with the available evidence. Keep summaries concise but make causality traceable.

Default final shape:

1. Executive verdict.
2. Problem and impact.
3. Evidence and timeline.
4. Root cause and contributing factors.
5. Why simpler explanations are insufficient.
6. CAPA plan.
7. Verification and follow-up.
8. Open questions and evidence gaps.

## Quality Bar

Reject blame language unless the user explicitly asks for accountability analysis; even then, separate accountability from causality.

Do not present a cause as confirmed without evidence. Do not recommend generic "improve communication" actions unless they are rewritten into a specific process, artifact, owner, trigger, and review mechanism.

For product, marketing, and sales cases, avoid treating visible symptoms as causes. A bad creative, weak landing page, lost lead, churn complaint, or slow sales response may be downstream of segment, offer, expectation, CRM, ownership, or onboarding problems.
