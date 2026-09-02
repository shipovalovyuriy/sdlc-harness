# Bounded Revision Loop

Use this when reviewer, QA, browser, usability, security, or test gates find issues.

Rules:

1. Group all findings from one wave/final verification pass by affected DoD
   boundary, dependency, and overlapping write set.
2. Record the starting issue count.
3. Create the smallest coherent fix workorder(s) or finding notes, then apply
   the delivery skill's Independence Rules: the orchestrator executes the
   finding group itself unless one of the two spawn justifications holds.
4. Run impacted author checks after each fix, but do not spawn a reviewer while
   sibling fixes in the same finding group remain open.
5. After the whole finding group is author-complete, run one restricted
   closure review over the open finding IDs and fix-caused hunks, followed by
   only the required runtime gates for that group.
6. Stop as passed when no blocking findings remain.
7. Escalate when the blocking issue count does not decrease between closure
   attempts.
8. Escalate after 3 closure attempts even if progress was made.

Escalation output:

- finding group;
- attempts made;
- remaining blockers;
- recommended next option;
- whether to continue, narrow scope, change approach, defer, or abort.
