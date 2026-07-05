# Verification Patterns

Treat implementation as four levels. Do not accept lower levels as proof of higher levels.

| Level | Question | Examples |
|---|---|---|
| Exists | Is the file, endpoint, component, migration, or test present? | File exists, export exists, route exists. |
| Substantive | Is it real implementation rather than placeholder/stub? | No TODO-only body, no empty handler, no hardcoded fake data where dynamic data is required. |
| Wired | Is it connected to the rest of the system? | UI calls the API, API uses service/store, route is registered, migration is applied. |
| Functional | Does it work when exercised? | Unit/integration tests, browser flow, QA scenario, API request, user-visible behavior. |

Common red flags:

- placeholder text such as `TODO`, `coming soon`, `lorem ipsum`, `not implemented`;
- empty handlers such as `return null`, `return {}`, `return []` with no data source;
- log-only actions or click handlers that do nothing;
- files created but never imported, registered, routed, or called;
- tests that only assert existence and not behavior.

Map verification to `must_haves`:

- truths require functional evidence;
- artifacts require exists and substantive checks;
- key links require wired checks;
- high-risk flows require browser, QA, or usability evidence.
