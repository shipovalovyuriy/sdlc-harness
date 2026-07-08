# Discussion Log Template

Use this to keep discovery interactive and decision-backed.

## Discussion Status

- Status: open / locked / blocked
- Last updated:
- User participants:

## Framing

- Feature or problem:
- Why this discussion is needed:
- What will change depending on the answer:

## Questions Asked

One row per question, asked one at a time (see the discovery skill's `references/interview.md`): each is a closed A/B/C/D question with a recommended default.

| Question | Options | Recommended Default | User Decision | Rationale | Affects | Evidence needed |
|---|---|---|---|---|---|---|

## Architectural Decisions

Enumerate the load-bearing decisions for this task (see the discovery skill's "Architectural Decisions To Surface"). One row per decision; status `open` until the user (or the recorded non-interactive assumption) resolves it.

| Category | Decision | Options | Recommended Default | User Decision | Rationale | Rejected Alternatives | Status (open/locked/unconfirmed) | Affects |
|---|---|---|---|---|---|---|---|---|

Categories: placement/boundaries, reuse-vs-build, data/state, api/contracts, failure/concurrency, security/access, rollout/reversibility, non-functional, tradeoffs/alternatives.

## Risk-Driven Questions And Mitigations

Use this section for risk questions generated during the discussion gate. A risk is mitigated only when the decision changes scope, design, gates, tests, rollout, or workorders.

| Risk / Assumption | Why It Matters | Options | Recommended Default | User Decision | Mitigation (avoid/reduce/accept/defer-spike/test) | Evidence Gate / Cheapest Test | Status (open/locked/unconfirmed) | Affects Artifacts |
|---|---|---|---|---|---|---|---|---|

## Locked Decisions

- Decision:
  - Rationale:
  - Evidence:
  - Alternatives rejected:
  - Applies to:
  - Affects artifacts:

## Locked Risk Mitigations

- Risk:
  - Decision:
  - Mitigation:
  - Evidence gate:
  - Affects artifacts/workorders:

## Deferred Ideas

- Idea:
  - Why deferred:
  - Revisit trigger:

## Must Not Constraints

- 

## Open Questions

- Question:
  - Blocking: yes / no
  - Owner:
  - Next action:

## Handoff Notes

- Product notes for PRD:
- UX/UI notes for UI spec:
- Technical notes for TRD:
- Risk notes for risk register:
- Workorder notes:
- Documentation gaps before `ready_for_delivery`:
