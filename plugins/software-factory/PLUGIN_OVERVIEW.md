# Software Factory

AIRD discovery and delivery as a bb page. Projects → AIRDs, each with its
status, stage graph, workorder DAG (bug / not-bug marking), quality gates
(risk → gate → DoD), agent threads and commits. "Создать AIRD" starts
`aird-discovery-loop` in the chosen folder; every subagent the skills name runs
as its own child thread on the role's model, effort and skills.
