# Examples

Use these examples as patterns, not templates to copy blindly.

## Team Slowly Ships Features

- Goal: deliver valuable production changes safely and predictably.
- Stock: features in progress, PRs waiting, QA queue, unclear requirements.
- Likely constraint: review, QA, decision clarification, or deployment confidence.
- Intervention: cap WIP, reduce batch size, protect review time, clarify ready criteria, shorten feedback loops.
- Next constraint may move to QA, product decisions, or deployment.

## Too Many Tasks, Nothing Gets Done

- Goal: complete the few high-value outcomes that matter.
- Stock: personal backlog, open loops, messages, half-started tasks, decision debt.
- Likely constraint: attention and selection, not effort.
- Intervention: WIP limit, daily kill-list, protected deep-work block, explicit refusal/defer rules.
- Next constraint may move to dependency waiting or decision clarity.

## Decisions Take Too Long

- Goal: make good-enough reversible decisions at the right level.
- Stock: unresolved decisions, escalations, meeting topics, blocked work.
- Likely constraint: unclear decision rights or missing input owner.
- Intervention: decision owner, deadline, reversible/irreversible classification, escalation policy.
- Next constraint may move to execution capacity.

## Architecture Gets More Complex But Speed Does Not Improve

- Goal: enable faster safe changes in important domains.
- Stock: abstractions, integration points, migration work, coupling, review burden.
- Likely constraint: unclear ownership, dependency flow, or validation feedback, not lack of architecture layers.
- Intervention: map change path, remove handoff, simplify ownership boundary, create test/deploy feedback.
- Next constraint may move to test reliability or team skill.

## Too Many Meetings

- Goal: make decisions and coordinate work with minimal attention tax.
- Stock: recurring meetings, unresolved topics, follow-ups, context switching.
- Likely constraint: decision rights and information flow.
- Intervention: cancel/merge low-value meetings, async status, decision log, owner-based escalation.
- Next constraint may move to written clarity or priority conflicts.

## PR Review Becomes The Bottleneck

- Goal: merge safe production-ready changes quickly.
- Stock: open PRs, review comments, stale branches, rework.
- Inflow: PRs opened; outflow: PRs reviewed and merged.
- Likely constraint: reviewer capacity, PR size, unclear review standards, or flaky CI.
- Intervention: smaller PRs, review WIP limit, protected review windows, ownership-based reviewers, automated checks.
- Next constraint may move to QA or deploy.
