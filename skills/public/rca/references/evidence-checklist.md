# RCA Evidence Checklist

Use this checklist when the problem statement is vague, the team is arguing from memory, or a full RCA needs an auditable evidence base.

## 5W1H Frame

- **What**: what exactly happened; what metric, behavior, customer complaint, defect, or process failure changed.
- **Where**: system, screen, funnel step, team boundary, CRM stage, operational workflow, geography, customer segment, or environment.
- **When**: first detected, likely start, last known good state, recurring windows, relation to changes or seasonality.
- **Why it matters**: money, customer harm, SLA, churn, wasted work, risk, compliance, team load.
- **How**: how it was detected, how the issue propagated, how users/teams experienced it.
- **Who, split by role**:
  - who detected it;
  - who participated in the process;
  - who was affected;
  - who made key decisions;
  - who had relevant information that did not reach others.

## Evidence Types

- System evidence: logs, traces, metrics, alerts, dashboards, database records, config, deploy history, feature flags, queue states.
- Work evidence: tickets, specs, PRs, release notes, incident channels, meeting notes, approvals, runbooks, checklists.
- Customer/user evidence: support tickets, calls, interviews, session recordings, NPS/comments, churn reasons, sales notes.
- Product and go-to-market evidence: funnel analytics, campaign/ad changes, landing copy, lead quality, CRM stages, sales follow-up timing, onboarding steps, pricing/offers.
- Process evidence: handoff points, ownership map, review cadence, escalation route, training material, data freshness, recurring manual work.
- Visual evidence: screenshots, screen recordings, photos, exported reports, before/after examples.

## Hypothesis Table

Use a table like this when there are multiple candidate causes:

| Candidate cause | Mechanism | Supporting evidence | Contradicting evidence | Missing proof | Confidence | Next check |
|---|---|---|---|---|---|---|
| | How it creates the symptom | Facts | Facts | What to collect | Low/Med/High | Owner/date |

Promote a hypothesis to a confirmed root cause only when the mechanism and timing are supported by evidence.

## Product, Marketing, And Sales Buckets

When the symptom is a metric drop or revenue problem, check beyond the visible surface:

- Traffic/source quality and segment fit.
- Offer, promise, pricing, trust, and expectation mismatch.
- Landing/app first step, onboarding, activation, and perceived value.
- CRM routing, stale warm leads, follow-up timing, sales script, qualification.
- Support handoffs, objections, delivery experience, refunds, churn reasons.
- Data instrumentation, attribution, cohort mix, seasonality, campaign changes.
- Ownership of the end-to-end path from first touch to payment/value.

## Anti-Patterns To Catch

- First plausible explanation accepted without checks.
- "Human error" used as a final answer.
- One linear 5 Whys chain used for a multi-factor problem.
- No timeline or last-known-good state.
- No contradictory evidence considered.
- Action plan contains vague items like "communicate better" or "be more careful".
- No owner, deadline, or verification metric.
- No knowledge-base update, so the organization relearns the same lesson later.
