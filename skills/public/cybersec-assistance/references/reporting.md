# Reporting Guide

## Finding Write-up Template

- Title
- Severity (Critical/High/Medium/Low/Info)
- Affected component(s)
- Description (what/where)
- Impact (why it matters)
- Evidence (redacted logs, requests, screenshots, file/line references)
- Reproduction steps (safe, minimal)
- Remediation (specific changes + defense-in-depth)
- Verification (how to confirm the fix)
- References (CWE, vendor advisory, OWASP, etc.)

## Severity (Pragmatic)

Use a consistent rubric; document assumptions.

- Critical: direct compromise of sensitive data/privileged access or leaked secrets usable in prod.
- High: likely exploit with meaningful impact (authz bypass, SSRF to metadata, RCE paths).
- Medium: requires specific conditions or limited impact; still worth fixing.
- Low: best practice gaps; hard to exploit; defense-in-depth.
- Info: observations and hygiene improvements.

## Redaction Rules

- Never include live credentials, tokens, private keys, or full PII.
- Redact to `abcd…wxyz` form; keep only what’s needed for uniqueness.

## Deliverables

- Executive summary (1 page)
- Findings table + detailed findings
- Prioritized remediation plan (quick wins + longer-term)
- Appendix: tool outputs, scope, test dates, versions
