# Security Trends “Radar” (How to Stay Current)

This file is a workflow, not a news feed. Use it to quickly check what’s changing and reflect it in reviews.

## Weekly Sources (High Signal)

- CISA Known Exploited Vulnerabilities (KEV)
- Vendor security advisories for your stack (OS, cloud provider, Kubernetes, databases)
- GitHub Security Advisories (GHSA) / OSV entries for dependencies in use
- OWASP updates (Top 10, ASVS), CWE highlights for recurring bug classes

## What to Look For

- Actively exploited issues (KEV / “in the wild”) → prioritize patching or mitigations.
- Supply-chain patterns: dependency confusion, typosquatting, compromised maintainers, poisoned CI.
- Identity-centric attacks: OAuth/OIDC misconfig, session fixation, JWT key confusion.
- Cloud/K8s misconfigs: exposed dashboards, overly broad IAM/RBAC, metadata SSRF.
- Secrets hygiene: leaked tokens, long-lived credentials, missing rotation.

## Triage Workflow

1. Map the issue to your assets (repo/dependency/container/service).
2. Confirm version exposure (lockfiles, image tags/digests, runtime versions).
3. Decide response: upgrade, config mitigation, feature flag, WAF rule, temporary block.
4. Document: impact, fix, verification, timeline.
