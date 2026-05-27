# RAT Framework

RAT means Riskiest Assumption Test.

The purpose is to test the assumption that could destroy the idea before spending time building the full solution.

## Assumption Categories

### Desirability

Do users want this?

Examples:

- Users have this problem often.
- The problem is painful.
- Users are unhappy with current alternatives.
- Users will change behavior.

### Viability

Can this become a business?

Examples:

- Users or buyers will pay.
- Pricing is acceptable.
- Sales motion is realistic.
- Market is big enough.

### Feasibility

Can we deliver it?

Examples:

- Required data is available.
- APIs are reliable.
- Model quality is good enough.
- Latency is acceptable.
- Engineering complexity is manageable.

### Usability

Can users use it successfully?

Examples:

- Workflow is understandable.
- Users know what action to take.
- Output is trusted.
- Product fits current habits.

### Adoption

Can it spread or get approved?

Examples:

- Buyer approves.
- Legal/security approves.
- Integrations are not blockers.
- Team incentives support usage.

### Compliance / Trust

Can users, buyers, approvers, and the organization trust it?

Examples:

- Privacy constraints are acceptable.
- Security risk is manageable.
- Legal/compliance review can pass.
- Reputational downside is understood.
- AI or recommendation outputs can be explained, evaluated, and corrected.

## Scoring

Use 1-5 scores.

Uncertainty:

- 1 = already proven.
- 5 = no evidence.

Impact:

- 1 = minor inconvenience.
- 5 = idea fails if false.

Testability:

- 1 = hard or expensive to test.
- 5 = can test quickly and cheaply.

Risk Score:

```txt
Uncertainty x Impact
```

Priority Score:

```txt
Uncertainty x Impact x Testability
```

Prioritize high priority score, but use judgment. A slightly lower score can be the better first RAT if it is much cheaper, faster, or clarifies several downstream assumptions at once.
