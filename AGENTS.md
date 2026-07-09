# Global Codex Guidance

Keep this file limited to durable defaults that should apply across repositories.
Repository-specific commands, conventions, and ownership rules belong in the
closest repository or directory `AGENTS.md`.

# OpenAI Developer Tooling

Use the OpenAI developer documentation MCP server when working with the OpenAI
API, ChatGPT Apps SDK, Codex, or other OpenAI developer tooling, unless the user
provides a more specific source or instruction.

# Planning

- Use an ExecPlan only for complex features, significant refactors,
  multi-service changes, schema or API contract changes, migrations, or
  unresolved high-impact tradeoffs.
- ExecPlans must conform to
  `/Users/shipovalovyuriy/.codex/.agent/PLANS.md`.
- For normal non-trivial work, keep a brief implementation plan with explicit
  success criteria and verification steps.

# AIRD

`$aird-discovery-loop` and `$aird-delivery-loop` own their orchestration,
delegation, artifacts, workorders, and quality gates. Apply their rules only
when the user explicitly invokes an AIRD skill or the sibling AIRD skill hands
off to it.

Inside AIRD, `04-trd.md`, `07-implementation-plan.md`, and
`workorders/*.md` replace a standalone ExecPlan and remain the implementation
source of truth.

# Working Style

- State assumptions when they materially affect the solution.
- Surface materially different interpretations instead of choosing silently.
- Prefer the simplest approach that satisfies the request.
- Treat explicitly requested libraries, SDKs, frameworks, CLIs, models, and
  external tools as hard requirements. Verify the real dependency or API before
  substituting anything.
- Write the minimum code required. Do not add abstractions, configurability, or
  adjacent cleanup without a concrete need.
- Make surgical changes and preserve unrelated user work.
- Match the existing codebase style and conventions.
- Remove code only when the requested change makes it obsolete.

# Execution And Verification

- Convert the request into concrete success criteria before implementation.
- For bugs, reproduce the failure or add a focused failing test when practical.
- Test both valid and invalid paths that prove the requested behavior.
- Verify changes in proportion to risk and continue until the success criteria
  pass or a concrete blocker remains.
- Diagnose without implementing when the user asks only for analysis.
- Do not commit, push, deploy, publish, message external systems, or perform
  destructive operations unless the user requests that action.

# Delegation

Outside explicitly invoked AIRD skills, do not spawn subagents unless the user
explicitly asks for delegation or parallel work. Handle ordinary repository
searches and known-file reads directly.

When delegation is explicitly requested outside AIRD, send a compact,
self-contained task. Prefer `fork_turns = "none"` or `"1"`; pass more history
only when the subagent genuinely needs it.

# Validation

- Use focused tests or direct verification for low-risk localized changes.
- Use code review for meaningful regression or maintainability risk.
- Use browser or integration QA for user-visible, browser-driven, or
  integration-heavy changes.
- Keep validation proportional; do not add review layers mechanically.
