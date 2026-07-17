# Gate Taxonomy

Use gate types to make delivery decisions predictable.

| Gate | Purpose | Failure behavior |
|---|---|---|
| Implementation readiness | Validate `ready_for_implementation`, V3 sizing, product-first order, write scopes, and verification plans before workers start. | Block implementation only for an unsafe or underspecified product contract. Missing runtime access/fixtures blocks later verification, not this gate. |
| Runtime-verification readiness | Validate actual environment, credentials, dependencies, and fixtures before runtime gates. | Preserve implementation completion; block runtime verification and release. |
| Product-first / detour | Keep the first wave on the product slice and supporting work inside one small workorder/20 percent. | Block the supporting spawn or package until explicit user approval. |
| Release readiness | Validate all required evidence before completion. | Keep `ready_for_release: blocked` and prevent `complete`. |
| Session checkpoint | Surface context/time/cycle degradation while preserving user control. | WARN only; ask `continue_current` or `start_fresh`. Never auto-interrupt or create a chat. |
| Revision | Check worker output, reviews, tests, QA, browser, and usability results. | Create a scoped fix workorder from `assets/templates/fix-workorder.md`; cap retries. |
| Escalation | Surface ambiguity, stalled revision loops, or conflicting findings to the user. | Pause with clear options and recommended default. |
| Abort | Stop when continuing would be unsafe, destructive, or meaningless. | Preserve state, write `.continue-here.md` (`assets/templates/continue-here.md`), and report why. |

Selection rule:

- Use implementation readiness before spawning product workers.
- Use product-first/detour before every supporting spawn or package creation.
- Use runtime-verification readiness before backend/browser runtime gates.
- Use release readiness before `ready_for_release` or `complete`.
- Use revision after any artifact, patch, or verification gate is produced.
- Use escalation when the blocking issue count does not decrease or the user must decide.
- Use abort for invalid state, unsafe commands, destructive risk, or broken prerequisites.
