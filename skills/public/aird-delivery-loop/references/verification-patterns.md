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
- required tests reported as skipped, not discovered, unavailable, or not run even when the runner exits 0;
- clean-install-only migration tests with no previous-release upgrade fixture;
- edits to already-shipped migration files instead of a new forward migration;
- source tests without building and starting the deployable artifact;
- static reviewer parity or mocked UI responses used as backend runtime evidence;
- verdicts such as `PASS with residual risk`, `evidence debt`, or `wired-but-skipped`.

Proxy-probe red flags — a check that answers an easier question than the one
that matters. Each of these has passed while the real path was broken:

- a hand-written request "equivalent to what the code sends", instead of the
  payload the real serializer actually emits;
- a reachability or auth check (`the endpoint is up`, `the credential works`)
  standing in for a compatibility check (`the endpoint accepts our body`);
- a documentation example or SDK sample used as the probe body;
- asserting a `200`/exit-0 instead of the terminal observable the feature
  depends on — the final value, the persisted row, the usage record;
- probing a different shape/version/mode of the API than production uses;
- a mock, fixture, or recorded response used to close an external-contract risk;
- "the types line up" or "the docs say it accepts this" as evidence of runtime
  acceptance.

The test: if the probe would still pass after deleting the production code path
it is supposed to validate, it proves nothing about that path.

Map verification to `must_haves`:

- truths require functional evidence;
- artifacts require exists and substantive checks;
- key links require wired checks;
- high-risk flows require browser, QA, or usability evidence.
