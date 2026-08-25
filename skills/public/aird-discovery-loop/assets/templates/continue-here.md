---
# routine: a durability checkpoint, discovery continues automatically.
# proactive_handoff: six phases/slices or about 70% context; resume fresh.
# hard_stop: context boundary, external blocker, or a required user decision.
checkpoint_kind: routine
status: discovery
last_updated: ''
---

# Continue Here

A routine checkpoint does not pause discovery and must not tell the user to open
a new task. A proactive handoff ends only the current root task and preserves
the workflow status. Set `checkpoint_kind: hard_stop` and `status: paused`
together only when discovery genuinely cannot continue.

## Current State

- Feature:
- AIRD path:
- Active phase:
- Current gate:
- Root slices since handoff:

## Completed Work

- 

## Remaining Work

- 

## Decisions Made

- 

## Blockers

- 

## Required Reading

- 

## Exact Next Action

Start with:
