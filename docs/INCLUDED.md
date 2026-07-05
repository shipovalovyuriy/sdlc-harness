# Included Skills And Agents

## Skills

### `aird-discovery-loop`

Interactive AIRD discovery loop for feature planning. It produces PRD/TRD/UI/risk/workorder artifacts and keeps risk discussion active with the user instead of silently drafting specs.

Use it when you need to clarify business intent, UX, UI, technical plan, DoD, and quality gates before implementation.

### `aird-delivery-loop`

Implementation and verification loop for an AIRD package. It reads the package, spawns independent workers per discrete workorder, integrates changes, and runs quality gates.

Use it when discovery is complete and the goal is to deliver working code.

### `code-review-standards`

Standards-backed review and implementation guidance for reviewers, backend workers, frontend workers, and general workers.

It covers:

- project structure
- function/module design
- reuse and abstraction
- performance
- API contracts
- testing
- security
- language-specific guidance
- community Awesome Lists as secondary discovery sources

### `improve-my-code`

Codebase improvement loop. It scans a repo, proposes prioritized improvement candidates, performs focused refactors, verifies behavior, runs review/QA when needed, and optionally commits.

Use it when the user asks to improve, clean up, optimize, or refactor an existing codebase.

## Agents

### `product-analyst`

Supports AIRD discovery by clarifying user value, workflows, product risks, scope, edge cases, and acceptance criteria.

### `risk-analyst`

Supports AIRD discovery and delivery by identifying risky assumptions, failure modes, cheap validation tests, and mitigation decisions.

## Typical Flow

1. Run `$aird-discovery-loop`.
2. Discuss assumptions, risks, UI, and technical shape with the user.
3. Produce the AIRD package and workorders.
4. Run `$aird-delivery-loop`.
5. Workers implement discrete workorders.
6. Reviewer, QA, browser, security, and usability gates run as required.
7. Fixes loop back to workers until the DoD is satisfied.
