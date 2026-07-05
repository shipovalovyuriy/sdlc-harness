# Security Review Standards

Use for auth, permissions, secrets, payments, PII, external callbacks, file handling, admin operations, data export/import, multi-tenant data, and any untrusted input boundary.

## Checks

- Authenticate the caller and authorize the specific operation on the specific resource.
- Enforce authorization server-side; UI hiding is not a control.
- Validate, normalize, and bound all untrusted inputs.
- Use parameterized queries/ORM safe APIs; avoid string-built SQL or command execution.
- Protect secrets: no logs, errors, snapshots, fixtures, client bundles, or repo commits containing secrets.
- Avoid unsafe deserialization, path traversal, SSRF, open redirects, XSS, CSRF, and injection classes.
- Use secure defaults for cookies, tokens, session duration, CORS, and callback signatures.
- Keep audit/log events useful without leaking sensitive values.
- Check tenant/user scoping on every read/write query.

## Sources

- OWASP Secure Coding Practices: https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/
- OWASP Secure Code Review Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html

