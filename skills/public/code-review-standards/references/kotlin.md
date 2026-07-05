# Kotlin Standards

## Checks

- Follow project ktlint/detekt/formatter first, then Kotlin coding conventions.
- Prefer null-safety types and explicit guards over unsafe `!!`.
- Keep extension functions scoped and discoverable; avoid global cleverness.
- Use data classes, sealed types, and value classes when they make invalid states harder to represent.
- Keep coroutine scopes, cancellation, and dispatcher choices explicit.
- Avoid blocking calls inside coroutine contexts unless isolated.
- Preserve Java interop contracts where public APIs cross languages.

## Sources

- Kotlin coding conventions: https://kotlinlang.org/docs/coding-conventions.html

