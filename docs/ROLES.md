# Subagent Roles

The harness ships the same role set in two formats: `agents/*.toml` for Codex
and `claude/agents/*.md` for Claude Code. The role names, purposes, and output
contracts are identical; only the definition format and model bindings differ.

Roles are grouped by where they act in the AIRD SDLC. The orchestrator (the
main session running a loop skill) spawns them with clean contexts and receives
compact verdicts — never transcripts.

## Routing

| Role | Purpose |
|---|---|
| `triage` | Cheap router that picks the smallest correct next agent — or decides direct handling is enough. Use first when the correct route for a non-trivial task is unclear. |
| `supervisor` | Orchestrates multi-agent execution from task split to final integration. Used when a plan needs more than ~3 agents or parallel workstreams. |

## Discovery (AIRD Discovery Loop)

| Role | Purpose |
|---|---|
| `explorer` | Inspects the codebase and runtime, traces relevant files and behavior, returns concise current-state findings with exact paths. Produces `codemap.md`. Runs all remote probing (ssh, kubectl, curl) so raw output never enters the orchestrator. |
| `product-analyst` | Clarifies user value, workflows, product risks, scope, edge cases, and acceptance criteria. Turns feature intent into a crisp PRD, problem framing, and Definition of Done. |
| `risk-analyst` | Identifies risky assumptions, failure modes, cheap invalidating tests, and mitigation decisions. Loads `rat` for riskiest-assumption work and `rca` for incident-driven requests. Feeds the discussion gate with ranked risk questions. |
| `uiux-designer` | Owns UI/UX framing: layout, hierarchy, interaction flow, responsiveness, accessibility. Drafts the UI spec and mock-data prototype grounded in the existing design system. |
| `architect` | Produces implementation-ready design decisions for normal non-trivial tasks: decomposition, interfaces, constraints, risks, acceptance criteria. Ends with an Implementation Brief. |
| `architect-deep` | Full ExecPlan-grade design for work crossing the deep threshold: complex features, significant refactors, multi-service changes, schema/API contract changes, migrations, unresolved high-impact tradeoffs. |

## Delivery (AIRD Delivery Loop)

| Role | Purpose |
|---|---|
| `backend-worker` | Implements backend, API, data, and service-layer changes with minimal scope creep. Accepts only work with a concrete workorder/Implementation Brief. |
| `frontend-worker` | Implements frontend behavior and UI code with strong attention to existing product patterns. Accepts only work with a concrete workorder/Implementation Brief. |
| `worker` | Generalist implementer for small, mixed-scope, or fallback changes when a domain-specific worker is unnecessary. |
| `debugger` | Isolates why something fails once the relevant area is roughly known. Used before implementation for bugs and regressions. |

## Verification And Gates

| Role | Purpose |
|---|---|
| `reviewer` | Code review focused on correctness, regressions, missing tests, and maintainability risk. Loads `code-review-standards`. One broad pass per integrated wave; restricted closure passes for finding groups. |
| `qa` | Validates behavioral acceptance criteria, edge cases, negative paths, and integration behavior — including browser verification of user-facing states with per-state screenshot evidence. |
| `cybersec` | Threat-models and reviews security-sensitive changes: auth, permissions, secrets, PII, callbacks, multi-tenant boundaries. |
| `docs` | Writes and refines concise technical documentation and maintains existing plans; used for mapped documentation gates. |

## Spawn Discipline

The loops are deliberately stingy about spawning:

- The orchestrator implements sequential slices itself; implementation workers
  exist only for actual parallelism (two dependency-ready slices with disjoint
  write sets) or context headroom (orchestrator at/above ~60% context).
- Workers receive the workorder path, named AIRD doc sections, and standards
  references — never the parent transcript.
- Verifiers work from diffs and return fixed-field verdicts; screenshots and
  logs stay on disk as evidence files.
- A worker that cannot reach a verdict returns an explicit blocker; empty
  results are treated as failures, not passes.
