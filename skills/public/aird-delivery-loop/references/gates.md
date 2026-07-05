# Gate Taxonomy

Use gate types to make delivery decisions predictable.

| Gate | Purpose | Failure behavior |
|---|---|---|
| Pre-flight | Validate AIRD package, workorders, allowed paths, and commands before workers start. | Block entry; if the minimum package (workorders + quality gates + DoD) is missing, stop and recommend `$aird-discovery-loop` to the user rather than silently re-running discovery. |
| Revision | Check worker output, reviews, tests, QA, browser, and usability results. | Create a scoped fix workorder from `assets/templates/fix-workorder.md`; cap retries. |
| Escalation | Surface ambiguity, stalled revision loops, or conflicting findings to the user. | Pause with clear options and recommended default. |
| Abort | Stop when continuing would be unsafe, destructive, or meaningless. | Preserve state, write `.continue-here.md` (`assets/templates/continue-here.md`), and report why. |

Selection rule:

- Use pre-flight before spawning workers.
- Use revision after any artifact, patch, or verification gate is produced.
- Use escalation when the blocking issue count does not decrease or the user must decide.
- Use abort for invalid state, unsafe commands, destructive risk, or broken prerequisites.
