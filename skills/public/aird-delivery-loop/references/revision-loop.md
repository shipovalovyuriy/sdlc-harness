# Bounded Revision Loop

Use this when reviewer, QA, browser, usability, security, or test gates find issues.

Rules:

1. Group related findings by affected DoD item or workorder.
2. Record the starting issue count.
3. Create a scoped fix workorder and spawn the smallest suitable worker.
4. Re-run impacted checks first, then the required gate set.
5. Stop as passed when no blocking findings remain.
6. Escalate when the blocking issue count does not decrease between attempts.
7. Escalate after 3 attempts even if progress was made.

Escalation output:

- finding group;
- attempts made;
- remaining blockers;
- recommended next option;
- whether to continue, narrow scope, change approach, defer, or abort.
