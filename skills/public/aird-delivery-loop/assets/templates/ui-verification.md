---
result: pending
blocked_reason: none
preview_url: ''
browser_tool: ''
required_states: 0
passed_states: 0
failed_states: 0
skipped_states: 0
usability_result: pending
usability_method: browser
screenshot_paths: []
---

# UI Verification

Browser + usability evidence for a user-facing change. Written during the
delivery UI Verification Protocol. The frontmatter is authoritative for
fail-closed completion and must match the detailed rows below.

Declared verdicts, not prose, decide the gate: set `blocked_reason` to the
reason whenever evidence is unavailable or deferred, and record a state's
verdict as `blocked-no-evidence` in its own table row. Describing a problem you
then solved is expected and does not block completion — write the real history.

## Runtime

- Preview mode: dev-server / static-preview / already-running / none (blocked)
- Preview URL (must match `preview_url`):
- Launched with:
- Checked at:
- Browser tool (must match `browser_tool`): verify-on-browser / playwright

## State Checks

One row per required state. Every pass requires its own screenshot path listed
both in the row and in `screenshot_paths`; a note or observation alone cannot
satisfy a required state.

| State | Flow / route | Result (pass/fail) | Evidence (screenshot path / note) |
|---|---|---|---|
| Happy path | | | |
| Empty | | | |
| Loading | | | |
| Error | | | |
| Permission denied | | | |

## Usability Findings

- Result (must match `usability_result`): pass / fail
- Compared against accepted `02-ui-prototype.md` direction: yes / no
- Blocking UX findings:
- Non-blocking notes:

## Issues Found And Fixed

- 

## Remaining Gaps / Deferred

- 

## Fallback (only if live preview or browser automation was unavailable)

- Set frontmatter `result: blocked-no-evidence`; never use `pass`.
- Why browser verification could not run:
- What was checked instead (qa vs UI spec / prototype states):
- Browser evidence still owed:
