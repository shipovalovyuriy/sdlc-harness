# Security Review Checklists

Use these checklists to structure a review. Prefer high-signal checks first; tailor to scope and stack.

## 0) Scope & Authorization

- Confirm written authorization and test window.
- Define targets: repos/services/URLs/images/accounts.
- Define constraints: rate limits, no-DoS, no brute force, safe payloads only.
- Confirm data handling: what can be stored in artifacts; redaction requirements.

## 1) Repo / Code Review (High Signal)

### Secrets & Sensitive Data
- Search for credentials: API keys, JWT signing keys, private keys, DB passwords.
- Check docs/assets for accidental leaks (README, screenshots, exported configs). Treat images/PDFs as potential secret carriers.
- Ensure secrets are not logged or sent to analytics/telemetry.
- Ensure secret rotation + incident process exists if a leak is found.

### AuthN / Session
- Password policy, MFA, SSO/SAML/OIDC configs.
- Session cookie flags: `HttpOnly`, `Secure`, `SameSite`.
- Token lifetimes, refresh handling, revocation.

### AuthZ / Access Control
- Enforce authorization server-side (not only in UI).
- Check for IDOR patterns (predictable IDs, missing tenant checks).
- Ensure admin-only actions are protected and audited.

### Input Validation / Injection
- SQL injection: parameterized queries, ORM safe APIs.
- Command injection: avoid passing user input to shell; validate/escape.
- SSRF: restrict outbound requests, block link-local/metadata IPs.
- Deserialization: avoid unsafe loaders; validate schema.

### Crypto & Transport
- No TLS verification bypass (`verify=False`, `InsecureSkipVerify`, `NODE_TLS_REJECT_UNAUTHORIZED=0`).
- Password hashing: bcrypt/argon2 with sane parameters.
- Use modern ciphers; avoid homegrown crypto.

### Logging & Monitoring
- Security-relevant events logged: auth failures, privilege changes, sensitive actions.
- Logs are protected (PII redaction, access control).
- Alerts for suspicious patterns; rate limiting for abuse.

## 2) Dependencies / Supply Chain

- Pin dependencies; avoid floating tags (e.g., `latest`).
- Run vulnerability triage (OSV/GHSA); track KEV items.
- If Trivy is available, use it to scan the repo/lockfiles: `scripts/trivy_scan.py --mode fs --target .`.
- Verify integrity: lockfiles, checksums, signed releases where possible.
- SBOM generation for production builds.

## 3) Container / Image

- Run as non-root; drop capabilities; read-only FS if possible.
- Minimal base images; remove build tools from runtime layers.
- No secrets baked into images (ENV/ARG layers).
- Scan image for CVEs (Trivy/Grype) and base image updates (e.g., `scripts/trivy_scan.py --mode image --target my-image:tag`).

## 4) IaC / K8s

- Kubernetes: no privileged pods, hostPath, hostNetwork unless justified.
- IAM: least privilege policies; avoid `*` actions/resources; restrict assume-role trust and conditions.
- Kubernetes RBAC: avoid `cluster-admin` and broad `ClusterRoleBinding`; restrict access to `secrets`, `pods/exec`, `pods/portforward`, and wildcard rules.
- Separate namespaces; enable audit logs where applicable.
- External exposure: inventory Ingress/LoadBalancer/NodePort and exposed dashboards/metrics; require auth + network controls for admin/ops surfaces.
- Secrets encryption at rest; avoid plaintext in Git.
- NetworkPolicies (default deny) where applicable.
- Egress controls where applicable; block access to cloud metadata endpoints (`169.254.169.254`) unless explicitly required.

## 5) Web / API (Safe Pentest)

- Map roles and permissions; try cross-role access.
- Validate input; try common injection vectors with safe payloads.
- Test file uploads: type enforcement, content scanning, storage isolation.
- External exposure: verify admin/ops endpoints (`/admin`, `/health`, `/metrics`, `/debug`, Swagger/OpenAPI) are authenticated, not publicly reachable, and don't leak sensitive data.
- Metadata SSRF: if the app fetches URLs (webhooks, proxies, importers), enforce allowlists and block link-local/internal ranges (e.g., `169.254.169.254`) and DNS rebinding.
- Check CORS, CSRF, clickjacking headers where relevant.
