---
name: usability-tester
description: Conduct realistic usability testing of an application through Computer Use. Use when the user asks Codex to act as a usability tester, test an app from a specific persona or actor, click through a live stand, evaluate task completion, produce CJM/customer journey findings, assess UI/UX, or gather usability issues from real interaction with a desktop or browser application. Requires dialog-first clarification of the participant actor, context, environment, tasks, success criteria, and boundaries before starting Computer Use.
---

# Usability Tester

## Core Rule

Do not start Computer Use until the test brief is complete enough to simulate a real participant. First ask focused questions, then execute quickly and naturally, then report evidence-backed findings.

Use the `frontend-design` skill for UI/UX judgment, visual hierarchy, interaction design, accessibility, layout, copy, and polish analysis. Load it when preparing the final UI/UX assessment or when diagnosing design issues during the run.

## Intake

Collect only the missing information. If the user already gave part of it, confirm it briefly and ask for the gaps.

Required before testing:

- **Actor**: who the participant is, their role, experience level, motivation, domain knowledge, device habits, constraints, and emotional state.
- **Context**: why the actor uses the product now, what they know before opening it, and what outcome matters to them.
- **Environment**: app URL or desktop app name, test stand/account, browser or OS constraints, credentials if needed, data that may be changed, and any forbidden actions.
- **Tasks**: concrete user goals phrased as outcomes, not UI steps. Include priority and expected success criteria.
- **Boundaries**: whether to think aloud in updates, whether to record screenshots, what areas not to inspect, and when to stop.

Default intake questions when the brief is missing:

1. Who exactly should I test as? Describe the actor: role, skill level, goals, constraints, and mindset.
2. What context does this actor have before entering the product?
3. Where should I test: URL, local app, or desktop app? Which account or test data may I use?
4. What tasks should the actor complete, and what counts as success for each task?
5. What actions are off limits, such as payments, deletes, emails, or production mutations?

If the user asks for a quick test, still collect actor, environment, tasks, and off-limits actions. Keep the questions compact.

## Test Execution

Establish the app state once at the start of each assistant turn before interacting with the target app: request access to the applications you need, then take a screenshot. Continue with Computer Use actions only after the app state is visible. Tool names vary by runtime — discover the available Computer Use tools rather than assuming a fixed name, and if none are present, say so and stop instead of narrating an interaction you did not perform.

Act like the defined human participant:

- Move fast and follow visible affordances before searching menus or using shortcuts.
- Prefer ordinary clicks, typing, scrolling, and navigation.
- Use the actor's likely vocabulary when searching or interpreting labels.
- Do not inspect code, DOM, network, console, or implementation internals unless the user explicitly asks for diagnostic testing.
- Avoid perfect-agent behavior: do not instantly infer hidden UI flows when a real user would need to scan, hesitate, or backtrack.
- Keep destructive or external side-effect actions paused for confirmation unless the user explicitly allowed them.
- Capture friction as it happens: confusion, hesitation, dead ends, recoveries, unclear labels, missing feedback, slow interactions, visual overload, and trust concerns.
- Track task state: not started, in progress, succeeded, partially succeeded, failed, or blocked.

Use short commentary updates while testing. Mention what the actor is trying, what blocked progress, and why the next action is plausible for that actor.

## Observation Notes

Maintain working notes during the run:

- screen or area visited
- action attempted
- expected result from the actor's point of view
- actual result
- friction or positive affordance
- severity and evidence
- time or step count when useful

When something is ambiguous, distinguish observed fact from interpretation.

## Final Report

Return a concise usability report in the user's language.

Include:

- **Test Brief**: actor, context, environment, tasks, and assumptions.
- **Task Outcomes**: status for each task, completion path, blockers, and recovery points.
- **CJM**: journey stages from entry to outcome, with actor goal, actions, emotions, pain points, and opportunities.
- **Usability Findings**: prioritized issues with evidence, impact, and suggested fix.
- **UI/UX Assessment**: use `frontend-design` criteria for visual hierarchy, layout, controls, feedback, accessibility, copy, responsiveness, and interaction ergonomics.
- **What Worked**: useful affordances and moments that supported task completion.
- **Recommendations**: concrete next changes ordered by expected user impact.

Severity scale:

- **Critical**: prevents task completion or risks harmful side effects.
- **High**: causes major confusion, wrong action, data loss risk, or repeated backtracking.
- **Medium**: slows completion or weakens confidence but has a workaround.
- **Low**: polish, copy, spacing, or minor discoverability issue.

Do not overclaim. If a task was not tested, say so. If the run was blocked by credentials, missing test data, app state, or unclear brief, report the blocker and the next information needed.
