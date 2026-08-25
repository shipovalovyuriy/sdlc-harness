# Codex Security Method

Use this reference for full security scans, high-confidence validation, attack-path analysis, final reports, and fixing concrete findings. It distills the useful workflow from the Codex Security plugin into the broader `cybersec-assistance` skill.

## When to Use

Use this method when the user asks for a security scan or security code review of:

- a PR, commit, branch diff, local patch, or working tree diff
- a whole repository
- one or more candidate findings that need validation
- a validated or plausible finding that should be fixed

For light best-practices reviews, checklist audits, dependency triage, or safe pentest planning, the main `SKILL.md` workflow can be enough.

## Scan Artifacts

Keep scan evidence together unless the user provides another path:

- `repo_name=<basename of repo_root>`
- `security_scans_dir=/tmp/codex-security-scans/<repo_name>`
- `scan_id=<commit>_<timestamp>`
- `scan_dir=<security_scans_dir>/<scan_id>`
- `artifacts_dir=<scan_dir>/artifacts`

Default outputs:

- repo threat model: `<security_scans_dir>/threat_model.md`
- per-scan threat model: `<artifacts_dir>/threat_model.md`
- runtime inventory: `<artifacts_dir>/runtime_inventory.md`
- advisory seed research: `<artifacts_dir>/seed_research.md`
- discovery report: `<artifacts_dir>/finding_discovery_report.md`
- repository coverage ledger: `<artifacts_dir>/repository_coverage_ledger.md`
- validation report: `<artifacts_dir>/validation_report.md`
- validation artifacts: `<artifacts_dir>/validation_artifacts/`
- attack-path report: `<artifacts_dir>/attack_path_analysis_report.md`
- final report: `<scan_dir>/report.md`
- fix report, when using a scan bundle: `<artifacts_dir>/fix_report.md`

## Full Scan Phases

Run these phases in order. Do not collapse them into one pass.

1. Threat model
2. Finding discovery
3. Validation
4. Attack-path and severity analysis
5. Final report

Resolve the scan target before starting:

- PR: compare base branch against current `HEAD`
- commit: compare target commit against parent or requested baseline
- branch diff: compare merge-base to head
- local patch: compare working tree against requested base
- repository-wide: scan the checked-out repository

Phase 1 is repository-scoped by default. For PR/commit/branch/patch scans, later phases are diff-focused and use supporting files only as needed. For repository-wide scans, later phases remain repository-wide and must use a runtime inventory plus a coverage ledger.

## Threat Model Phase

If a repository-scoped threat model already exists, copy it into the per-scan artifacts and use it as source of truth. If the user provides authoritative scan guidance, persist it unchanged. `AGENTS.md` can serve when it is specific enough about product surfaces, trust boundaries, attacker inputs, assumptions, or scan guidance.

If no threat model exists, generate one that covers:

- primary runtime/product surfaces
- assets and privileges that matter
- trust boundaries and attacker-controlled inputs
- security invariants the code must preserve
- repository-wide failure modes that matter most

Do not let the current diff become the threat model unless the user explicitly asks for a narrower model.

## Finding Discovery Phase

Discovery is about technically plausible candidates, not final severity.

For diff-scoped scans:

- inspect changed files and the minimum supporting files needed to understand the security behavior
- distrust commit titles and descriptions; trust code paths
- follow changed routes, handlers, helpers, guards, wrappers, parsers, serializers, query builders, file/network sinks, templates, configs, and auth controls far enough to understand impact
- stay anchored to the diff and its dependencies
- use unchanged siblings as context or negative controls, but report them only when the diff makes them newly vulnerable or changes a shared control/sink they rely on

For repository-wide scans:

- create a runtime inventory before deep review
- maintain a coverage ledger, not just a findings list
- close each in-scope row as `reportable`, `suppressed`, `not_applicable`, or `deferred`
- seed advisory/CVE/GHSA/package-version work from authoritative sources when relevant, and close the exact seeded file/function/class/hunk
- do not let one obvious hotspot cluster consume the whole review; inspect disjoint high-impact or low-salience controls too

Preserve independent instances. Do not collapse separate routes, templates, query builders, parser operations, auth/object endpoints, shared-helper callers, or request-selected operations into one candidate when they can be attacked independently. For wrapper-to-shared-sink paths, keep both the wrapper/entrypoint and the shared root control or sink addressable.

Each candidate should include:

- title
- affected locations with labels such as `entrypoint/wrapper`, `root_control`, `sink`, `concrete_implementation`
- instance key for repository-wide scans: `<family>:<file>:<line>`
- attacker-controlled source
- vulnerable sink or broken control
- closest apparent control and why it is absent, bypassed, mis-scoped, or incomplete
- impact and why the issue is plausible
- validation recommendation
- CWE IDs when known

## Validation Phase

Build a short validation rubric before testing a candidate. Identify attacker input, vulnerable sink or broken control, preconditions, expected impact, and relevant controls.

Prefer the strongest feasible evidence:

1. crashing PoC for crash, parser-confusion, memory-safety, or DoS candidates
2. ASan, valgrind, or non-interactive debugger trace when useful
3. focused unit or integration test
4. realistic interface reproduction through HTTP, CLI, file parser, RPC, queue, plugin hook, or package API
5. focused code trace when runtime validation is blocked or disproportionate

Do not imply validation happened when it did not. Setup, dependency, compile, or service errors are proof gaps to record, not counterevidence. Make a bounded effort to consult `AGENTS.md`, README/setup docs, test docs, build files, and package metadata before falling back to code understanding.

For repository-wide scans, validation also closes coverage. Preserve each candidate or ledger row independently as `reportable`, `suppressed`, `not_applicable`, or `deferred`. A same-family neighboring finding supports confidence but does not close a seeded row or sibling root-control row without exact evidence.

Validation output should include:

- candidate id, instance key, and ledger row id when available
- root-control `file:line` and affected-location labels
- confidence level
- validation method
- rubric checklist
- evidence observed and commands/artifacts used
- remaining uncertainty and minimal next step
- closure table for repository-wide scans

Confidence should come from evidence, not bug-class severity. Reproduced PoCs, sanitizer/debugger evidence, focused tests, realistic interface reproduction, and code understanding should be clearly distinguished.

## Attack-Path and Severity Phase

Convert validated or still-plausible candidates into explicit attacker stories and final reportability decisions. Use repository evidence first.

Establish:

- product/runtime surface and whether it is in scope
- exposure and entry points
- identity, privilege, and trust boundaries
- attacker-controlled source
- reachability to the sink or broken control
- sensitive data, secrets, state changes, or privileged actions involved
- existing controls and mitigations
- strongest counterevidence and why it does or does not defeat the finding

Keep attack-path analysis, severity calibration, and final policy suppression separate.

High or critical severity requires a realistic in-scope attacker path plus major security impact such as account takeover, auth bypass, meaningful privilege escalation, significant sensitive-data exposure, credible RCE, signing/identity/control-plane compromise, cross-tenant impact, or similarly severe compromise. A scary sink, scanner label, odd bug, missing header, internal-only defect, self-only path, or speculative chain is not enough.

Use this final priority mapping:

- `critical` -> `P0`
- `high` -> `P1`
- `medium` -> `P2`
- `low` -> `P3`

Set final policy decision to `ignore` when repository evidence shows the issue is self-only, unrealistic, privileged/operator/developer-only without a privilege-escalation delta, not part of a real product surface, or lacking a realistic lower-privileged in-scope attacker path. Missing ingress/deployment evidence should lower confidence or stay unknown; it should not automatically suppress an otherwise well-evidenced trust-boundary issue.

## Final Report Contract

Only report findings that survive validation and attack-path policy checks. If nothing survives, include a short `No findings` section explaining where candidates were suppressed or why discovery found no plausible candidates. For repository-wide scans with a coverage ledger, include `Coverage Closure` so suppressed, not-applicable, and deferred rows stay auditable.

Order findings by severity: critical, high, medium, low.

Use one final finding per independently attackable source/control/sink instance. Group related prose only after the separate instances are emitted.

Each finding should include:

- `Priority: P0|P1|P2|P3`
- `Severity: critical|high|medium|low`
- `Confidence: high|medium|low` or a calibrated label
- `CWE: <id/name list, or none>`
- `Affected lines: <path:line-range>`
- summary
- validation evidence
- reachability analysis
- attack path
- severity analysis
- remediation

Affected lines must include the root broken control or dangerous sink when identifiable, not only a public wrapper. For wrapper-to-shared-helper issues, list both the reachable wrapper/entrypoint and the underlying parser, deserializer, path/archive helper, expression evaluator, auth/authz control, or sink line. Preserve seeded file/class/package anchors when they share the proof tuple.

When returning Codex app review comments, emit one `::code-comment{...}` directive per surviving finding and none when there are no findings. Keep the directive pointed at the tightest root-cause line.

## Fix Finding Workflow

Use this when the user asks to fix a validated or plausible finding.

1. Extract the source, sink or broken control, attacker input, security invariant, impact, preconditions, PoC/reproducer, and file/line references.
2. Inspect the affected files plus the smallest supporting set needed to understand the path.
3. Identify the narrowest existing boundary where the invariant should be enforced.
4. Reproduce or encode the issue before fixing when feasible.
5. Make the smallest behavior change that enforces the invariant.
6. Add focused regression coverage for the exploit condition and positive coverage for legitimate behavior.
7. Run the original PoC/reproducer or focused test and confirm it no longer succeeds.
8. Re-check nearby call sites or variants that might bypass the new control.
9. Run the relevant repository checks for touched files.

Do not broaden into unrelated cleanup, weaken security controls to make tests pass, or claim the issue is fixed until both changed code and original vulnerable path have been checked. If no code change is needed because the issue is already fixed or not reproducible, preserve the validation evidence and say that directly.
