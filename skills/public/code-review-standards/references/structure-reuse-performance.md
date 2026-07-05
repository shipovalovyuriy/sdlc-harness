# Structure, Reuse, And Optimization Standards

Use for every implementation and review. This file covers engineering shape beyond syntax.

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

