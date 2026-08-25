---
name: cybersec-assistance
description: >
  Cybersecurity assistance for authorized work: repo-grounded threat modeling (trust boundaries, assets, abuse paths,
  mitigations), security best-practices review & secure-by-default guidance (Go, Python, JavaScript/TypeScript),
  secure code review (SAST), dependency & supply-chain triage, secret scanning, container/IaC review, safe web app/API
  pentest planning/checks, and producing structured security reports with remediation guidance. Use when the user asks
  for a security review/report, "security best practices", "threat model", or other AppSec help.
---

# Cybersec Assistance

## Overview

Run a pragmatic security review on codebases, configs, and deployments, then deliver actionable findings, validated attack paths, and a clear remediation plan.

## Safety & Guardrails (Always)

- Only act on systems/repos you own or have explicit written authorization to test.
- Prefer non-destructive checks first; ask before any active scanning that could impact availability.
- Do not exfiltrate secrets; redact sensitive values in notes, logs, and reports.
- If a step requires network access or installing tools, ask for approval in this environment.

## Workflow Decision Tree

0. **Full security scan / security code review**
   - If the user asks to scan a PR, commit, branch, patch, working tree diff, or whole repository.
   - Use the phased Codex Security method in `references/codex-security-method.md`.
   - Keep phases separate: threat model -> finding discovery -> validation -> attack-path/severity analysis -> final report.
   - For diff scans, stay anchored to changed code plus required supporting files. For repository-wide scans, use an explicit runtime inventory and coverage ledger.

1. **Threat model / abuse-path analysis (repo-grounded)**
   - If the user asks to threat model a codebase, enumerate threats/abuse paths, or analyze trust boundaries.
   - Follow "Threat Model Workflow" below and use:
     - Output contract + prompt template: `references/threat-model-prompt-template.md`
     - Controls/assets checklist: `references/threat-model-security-controls-and-assets.md`
   - Write the final Markdown report to `<repo-or-dir-name>-threat-model.md` (or a user-provided path).

2. **Security best practices / secure-by-default guidance**
   - If the user asks for "security best practices", secure-by-default coding help, or a best-practices review.
   - Identify languages/frameworks in scope, then load matching docs from:
     - `~/.codex/skills/security-best-practices/references/`
     - File pattern: `<language>-<framework>-<stack>-security.md` and `*-general-*-security.md`
   - If asked for a report, write to `security_best_practices_report.md` (or a user-provided path).

3. **Source code / repo audit**
   - Run local, offline scans first (secrets + insecure patterns): `scripts/repo_audit.py`
   - Then run best-available SAST/dependency tools (only if installed): Semgrep, OSV, govulncheck, etc.

4. **Container image / Dockerfile / IaC**
   - Review Dockerfile/K8s/Terraform configs with the checklist: `references/checklists.md`
   - If Trivy is installed, run `scripts/trivy_scan.py` for filesystem/config and/or container images.

5. **Web app / API pentest (authorized only)**
   - Start with passive recon + auth/role checks + input validation probes.
   - Avoid brute force and destructive payloads unless explicitly in-scope.
   - Use `references/web-pentest.md` for a safe checklist and reporting structure.

6. **Fix a validated or plausible security finding**
   - If the user asks to fix a concrete finding, use the minimal-fix workflow in `references/codex-security-method.md`.
   - Reproduce or encode the issue before fixing when feasible, enforce the invariant at the narrowest existing boundary, add focused regression coverage, and verify the original path no longer works.

7. **Reporting**
   - Use `scripts/make_report.py` + `assets/report-template.md` to produce a consistent report.
   - Use `references/reporting.md` for severity and write-up standards.
   - For full scans, follow the final report contract in `references/codex-security-method.md`: only report findings that survive validation and attack-path policy checks.

## Phased Security Scan Workflow

Use `references/codex-security-method.md` for full PR/commit/branch/patch/repository scans. The useful additions from Codex Security are:

- repository-scoped threat model first, independent of the specific diff unless the user asks for narrower scope
- separate discovery, validation, attack-path analysis, and final report phases
- explicit scan artifacts under `/tmp/codex-security-scans/<repo>/<scan_id>/`
- instance-preserving discovery and validation for repeated routes, templates, parser operations, query builders, auth/object endpoints, and shared-helper callers
- reportability and severity based on repository evidence, counterevidence, realistic reachability, and impact, not scanner labels
- final reports that keep exact affected `file:line` evidence, including root controls and wrapper/sink pairs

## Threat Model Workflow (Repo-grounded)

Deliver an actionable threat model that is specific to the repository or a requested sub-path (not a generic checklist). Anchor every architectural claim to evidence in the repo, and keep assumptions explicit.

1. Scope and extract the system model
   - Identify primary components, data stores, and external integrations from repo evidence.
   - Identify how the system runs (server, CLI, library, worker) and its entry points.
   - Clearly separate runtime behavior from CI/build/dev tooling and from tests/examples.

2. Derive boundaries, assets, and entry points
   - Enumerate trust boundaries as concrete edges between components and note the protocol/auth/validation/rate limits.
   - List assets that drive risk (credentials, PII, integrity-critical state, availability-critical components).
   - Identify entry points (endpoints, upload surfaces, parsers/decoders, job triggers, admin tooling).

3. Calibrate attacker model
   - Describe realistic attacker capabilities based on exposure and intended usage.
   - Explicitly note non-capabilities to avoid inflated severity.

4. Enumerate threats as abuse paths
   - Prefer small sets of high-quality, system-specific abuse paths mapped to assets and boundaries.

5. Prioritize with explicit likelihood and impact reasoning
   - Use qualitative likelihood/impact (low/medium/high) with short justifications.
   - Set overall priority (critical/high/medium/low) using likelihood x impact, adjusted for existing controls.

6. Validate assumptions with the user (required)
   - List 3–6 key assumptions that materially affect scope/ranking.
   - Ask 1–3 targeted questions (deployment model, internet exposure, authn/authz, data sensitivity, multi-tenancy).
   - Wait for user feedback before producing the final report (if the user can’t answer, proceed with explicit assumptions).

7. Recommend mitigations and focus paths
   - Tie mitigations to concrete locations (component, boundary, entry point) and control types (authZ, schema validation, rate limits, secrets isolation, audit logging).
   - Output focus paths (files/dirs) to review, with one sentence each on why.

8. Run a quality check before finalizing
   - Confirm all discovered entry points are covered.
   - Confirm each trust boundary is represented in threats.
   - Confirm runtime vs CI/dev separation.
   - Confirm the report matches the required output contract in `references/threat-model-prompt-template.md`.

## Quick Start (Repo → Report)

1. Clarify scope
   - Target(s), environments (prod/stage/local), auth model, timebox
   - Explicitly confirm what is allowed (active scans, credential testing, rate limits)

2. Run offline repo audit (safe default)
   - `python3 "$CODEX_HOME/skills/cybersec-assistance/scripts/repo_audit.py" --repo . --out security-artifacts/repo-audit.json`
   - If `$CODEX_HOME` is not set: `python3 ~/.codex/skills/cybersec-assistance/scripts/repo_audit.py --repo . --out security-artifacts/repo-audit.json`

3. (Optional) Run Trivy scan (if installed)
   - Filesystem/IaC scan (offline by default): `python3 "$CODEX_HOME/skills/cybersec-assistance/scripts/trivy_scan.py" --mode fs --target . --out security-artifacts/trivy-fs-summary.json`
   - If `$CODEX_HOME` is not set: `python3 ~/.codex/skills/cybersec-assistance/scripts/trivy_scan.py --mode fs --target . --out security-artifacts/trivy-fs-summary.json`
   - Container image scan example: `python3 "$CODEX_HOME/skills/cybersec-assistance/scripts/trivy_scan.py" --mode image --target my-image:tag --out security-artifacts/trivy-image-summary.json`
   - If Trivy needs to download DB/checks, rerun with `--online` (may require network access).

4. Generate a draft report
   - Repo-only: `python3 "$CODEX_HOME/skills/cybersec-assistance/scripts/make_report.py" --findings security-artifacts/repo-audit.json --out SECURITY_REPORT.md`
   - Repo + Trivy: `python3 "$CODEX_HOME/skills/cybersec-assistance/scripts/make_report.py" --findings security-artifacts/repo-audit.json --findings security-artifacts/trivy-fs-summary.json --out SECURITY_REPORT.md`
   - If `$CODEX_HOME` is not set, replace the path with `~/.codex/skills/cybersec-assistance/scripts/make_report.py`.

5. Add manual findings
   - Fill in missing context (attack paths, affected roles, screenshots/logs, proof of impact).

## Staying Current (Trends)

- Use `references/trends.md` to quickly check: CISA KEV, vendor advisories, OWASP, supply-chain and CI/CD attack patterns.
- When triaging a dependency, prefer OSV/GHSA and map to CWE; include upgrade paths and compensating controls.

## Resources

- `scripts/repo_audit.py`: Offline scan for secrets + insecure patterns → JSON findings.
- `scripts/trivy_scan.py`: Trivy wrapper (fs/image) → summarized JSON findings + raw Trivy JSON.
- `scripts/make_report.py`: Convert findings JSON → Markdown report.
- `references/checklists.md`: Review checklists (repo, Docker, IaC, authz, logging).
- `references/codex-security-method.md`: Phased scan, validation, attack-path, severity, report, and fix workflow distilled from Codex Security.
- `references/web-pentest.md`: Safe, authorized web/API testing checklist.
- `references/reporting.md`: Severity, evidence, remediation, and report conventions.
- `references/trends.md`: “What to check this week” sources and triage tips.
- `references/threat-model-prompt-template.md`: Output contract and prompt template for repo-grounded threat models.
- `references/threat-model-security-controls-and-assets.md`: Asset/control checklist to keep threat models consistent.
- `assets/report-template.md`: Report template with placeholders.
