---
name: code-review-standards
description: Standards-backed code review and implementation guidance for reviewer, backend-worker, frontend-worker, and worker agents. Use when reviewing code, preparing to implement code from a workorder, checking diffs against language/framework best practices, or producing review findings with evidence. Covers universal review rules, the build-less ladder for minimal diffs and over-engineering findings, project structure, function design, reuse, optimization, community Awesome List discovery, plus Go, TypeScript/React, Python, Java, Kotlin, Rust, C#, C++, backend, frontend, API, testing, and security references.
---

# Code Review Standards

Use this skill to ground implementation and review in project conventions plus established language, framework, structure, reuse, performance, testing, API, and security standards.

## Priority Order

Apply standards in this order:

1. Existing project conventions, nearby code, architecture docs, and AIRD decisions.
2. Project tooling configs such as formatter, linter, typechecker, test runner, CI, or static analyzer.
3. This skill's standards references.
4. Reviewer judgement for risks not covered above.

Do not fight project tooling over style. Prefer findings about correctness, contracts, maintainability, security, tests, observability, performance, accessibility, and operational risk.

## Routing

Always read `references/universal.md` and `references/structure-reuse-performance.md` first.

Then load only the relevant references:

- Frontend TypeScript/React: `references/frontend.md`, `references/typescript-react.md`, `references/testing.md`.
- Backend services/APIs: `references/backend.md`, `references/api-design.md`, `references/testing.md`.
- Security-sensitive work: `references/security.md`.
- Tooling/library/static-analysis discovery or missing project gates: `references/community-awesome.md`.
- Language-specific work:
  - Go: `references/go.md`
  - Python: `references/python.md`
  - Java: `references/java.md`
  - Kotlin: `references/kotlin.md`
  - Rust: `references/rust.md`
  - C#: `references/csharp.md`
  - C++: `references/cpp.md`
- If the stack is unclear, inspect manifests/configs first, then load the smallest matching set.

Use `community-awesome.md` only as a discovery index for tools, libraries, and ecosystem references. It is not normative: verify any discovered tool against its official docs/repo activity/license before recommending it, and never make a blocking finding solely because an Awesome List mentions something.

## Worker Mode

When coding as `backend-worker`, `frontend-worker`, or `worker`:

1. Read the workorder and required AIRD docs.
2. Read `references/universal.md`, `references/structure-reuse-performance.md`, plus the stack references from Routing.
3. Identify project-local conventions and tooling configs before editing.
4. Climb the Build-Less Ladder in `references/structure-reuse-performance.md` before writing: skip, reuse what is already here, standard library, native platform feature, already-installed dependency, one line, then minimum code.
5. Decide where the code belongs, what existing functions/types/hooks/services to reuse, and whether optimization is required by the workorder or current code path.
6. If adding a tool, dependency, linter, formatter, SAST check, or major library, consult `references/community-awesome.md` as discovery and then verify the chosen tool from primary sources.
7. Implement the smallest scoped change.
8. Run the workorder's required checks. A test covers the change only if it ran and an assertion observes the changed output, branch, or contract (see Reviewer Mode item 9 for what does not count).
9. Report changed files, commands run, standards-sensitive decisions, reuse/structure choices, and blockers.

If the workorder conflicts with the standards or project conventions, stop and report the conflict instead of silently choosing a new design.

## Reviewer Mode

When reviewing:

1. Read the diff hunks first and trace them (paths, callers, implicit branches, deleted handling). Open the workorder, DoD, quality gates, and relevant standards only after the trace, then try to falsify each checkable claim they make against what you traced. The workorder is testimony, not evidence.
2. Lead with findings ordered by severity.
3. Cite the file/line, the violated local convention or standards principle, and the behavioral risk.
4. Avoid style-only comments already enforced by formatter/linter unless the tooling is missing or misconfigured.
5. Check structure, function boundaries, reuse, duplication, and optimization before style comments.
6. Run an over-engineering pass against the Build-Less Ladder and name what to cut: reinvented standard library, a dependency doing what the platform already does, an abstraction with one implementation, config nobody sets, dead flexibility, or the same logic in fewer lines. One line per finding: location, what to cut, what replaces it. Say the diff is already lean when there is nothing to cut, and never flag a required test or a single smoke check as bloat.
7. Use `community-awesome.md` only to suggest missing tooling or alternatives; do not treat community curation as a pass/fail rule.
8. Mark a finding blocking only when it can affect correctness, security, data integrity, compatibility, reliability, UX/accessibility, test validity, maintainability, or performance of the delivered change.
9. Judge test coverage by one question: if the changed behavior broke where it is used, would a check fail? A test counts only if it ran and an assertion observes the changed output, branch, or contract. These do not count: a test that was not executed; success/no-throw/snapshot-only checks; assertions on mock or log calls; tests that mock away the integration under change; e2e paths that pass through without checking the changed output; `expect(x ?? DEFAULT)`-style assertions that pass when the value is missing; stale fixtures. Read the test before claiming what it covers, and search by symbol and import before claiming no test exists. Do not report cases the compiler or type-checker already enforces, or untested legacy code the change did not touch.

Use `assets/review-report.md` when a structured review artifact is needed.
