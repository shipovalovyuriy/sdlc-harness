# Worker Prompt Template

Copy the fixed prompt below verbatim. Replace only the ten one-line values in
`Slice fields`; do not expand them with copied AIRD prose.

## Slice fields (the only per-worker text)

1. Workorder/finding path: `<path>`
2. AIRD sections: `<exact file#section paths>`
3. Standards refs: `<2-4 exact paths, within the skill cap>`
4. Objective and behavior delta: `<one line>`
5. Allowed read/write scope: `<one line>`
6. Locked decisions and known background: `<one line>`
7. Runtime/dependency/DSN source: `<one line; never paste secrets>`
8. Required live and targeted checks: `<one line>`
9. Evidence directory: `<path>`
10. Out of scope and stop conditions: `<one line>`

## Fixed instructions (do not rewrite per slice)

Work from a fresh context and read only the paths above. Use Worker Mode from
the selected code standards before editing. Write every AIRD explanation and
report in clear Russian; preserve exact technical identifiers where needed.
Edit files directly, keep the accepted architecture and scope fixed, and do
not add adjacent cleanup or choose a new design. If the inputs do not determine
the implementation, stop and report the blocker.

Run the required checks against real dependencies and public runtime boundaries
when the workorder requires them. Required checks may not be replaced with
mocks, skipped, or downgraded. Redirect raw command output to the evidence
directory. Every chat-visible command result must end in a count or `tail -N`;
never return raw test, typecheck, build, recursive-search, or migration output.

Write detailed results, matrices, counts, and logs to evidence. Return exactly
these six one-line fields, with no table and no extra prose:

1. `status: <done | blocked | revise>`
2. `paths: <changed paths | none>`
3. `commands: <command labels + exit codes | none>`
4. `numbers: <evidence/path#counts | none>`
5. `evidence: <paths | none>`
6. `blockers: <none | concise blocker>`
