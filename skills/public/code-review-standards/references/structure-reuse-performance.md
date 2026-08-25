# Structure, Reuse, And Optimization Standards

Use for every implementation and review. This file covers engineering shape beyond syntax.

## Build-Less Ladder

Run this before deciding what to write. Stop at the first rung that holds.

1. Does this need to exist at all? Speculative need: skip it and say so in one line (YAGNI).
2. Does it already exist in this codebase? Reuse the helper, util, type, component, hook, or pattern that already lives here.
3. Does the standard library do it? Use it.
4. Does a native platform feature cover it? A native input type over a picker library, CSS over JS, a DB constraint over app-level checks.
5. Does an already-installed dependency solve it? Use it. Never add a new dependency for what a few lines cover.
6. Can it be one line? Make it one line.
7. Only then write the minimum code that works.

The ladder shortens the solution, never the reading. Understand the task and trace the real flow through the files the change touches first, then climb. The smallest change in the wrong place is a second bug, not a lean diff.

A bug fix targets the root cause, not the symptom. A report names a symptom: check the callers of the function you are about to touch and fix the shared function once. One guard where all callers route through is a smaller diff than one guard per caller, and patching only the path the ticket names leaves sibling callers broken.

- No abstraction that was not requested: no interface with one implementation, no factory for one product, no config for a value that never changes, no scaffolding for later.
- Deletion over addition. Boring over clever. Fewest files possible.
- Two options of the same size: take the one that is correct on edge cases. Less code never means the flimsier algorithm.
- Mark a deliberate simplification with a known ceiling (global lock, quadratic scan, naive heuristic) with a `ponytail:` comment naming the ceiling and the upgrade path, for example `// ponytail: global lock, per-account locks if throughput matters`.
- When the workorder or brief asks for more structure than the problem needs, implement it as assigned and record the leaner alternative in the Decision Log or the report. Never silently narrow assigned scope, and never re-argue a decision the user already confirmed.

Never simplify away input validation at trust boundaries, error handling that prevents data loss, security controls, accessibility basics, calibration that real hardware needs, or anything explicitly requested. Required verification is out of scope for the ladder: test depth comes from the workorder, DoD, and `testing.md`, and non-trivial logic still leaves a runnable check behind.

Adapted from ponytail (MIT, https://github.com/DietrichGebert/ponytail).

## Project Structure

- Put new code in the layer/module that already owns the behavior: route/controller, service/use-case, repository/store, UI component, hook, domain model, job, or adapter.
- Extend an existing local pattern before introducing a new abstraction, folder, naming scheme, dependency, or cross-layer call.
- Keep ownership boundaries clear. UI should not own server truth; transport code should not own domain rules unless the project already does that.
- Avoid cross-module imports that bypass public APIs or established boundaries.
- Keep generated, fixture, migration, test, and runtime code in their existing project locations.
- If the right location is unclear, stop and report a design blocker rather than scattering code.

## Function And Type Design

- One function should have one primary reason to change.
- Keep functions small enough to read, but do not split logic into tiny wrappers that hide the flow.
- Prefer names that describe domain intent over implementation mechanics.
- Keep side effects visible at boundaries: I/O, DB writes, network calls, time, randomness, global state, DOM, storage.
- Represent invalid states with types, guards, or validation instead of comments.
- Avoid boolean flag parameters when separate functions, explicit options, or domain types communicate intent better.
- Keep public interfaces stable and narrow.

## Reuse And Duplication

- Search for existing helpers, components, hooks, services, validators, mappers, DTOs, clients, and test fixtures before adding new ones.
- Reuse only when the abstraction already matches the domain. Do not force unrelated behavior into a shared helper.
- Remove meaningful duplication when it reduces risk in the touched scope.
- Leave broader duplicate cleanup as a note unless it is required to complete the workorder safely.
- Avoid copy-paste with hidden divergence: if two paths must stay equivalent, share behavior or add tests proving both.

## Optimization

- Optimize only when the workorder, profiling, scale risk, or current code path justifies it.
- First preserve correctness and clarity; then reduce unnecessary I/O, queries, renders, allocations, locks, or repeated transformations.
- Prefer algorithmic and data-access improvements over micro-optimizations.
- For frontend, prevent avoidable re-renders only when the data flow or component cost makes it meaningful.
- For backend, watch for unbounded queries, N+1 calls, missing indexes, serial external calls, and retry storms.
- Attach evidence for performance-sensitive claims: benchmark, profiler, query plan, render count, or before/after measurement when practical.

