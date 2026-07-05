# Rust Standards

## Checks

- Follow `rustfmt` and `clippy` gates when available.
- Use the type system to make invalid states hard to represent.
- Prefer explicit error types or contextual errors according to project style.
- Avoid `unwrap`/`expect` in production paths unless the invariant is local, certain, and documented by surrounding code.
- Keep ownership/lifetime choices simple; avoid unnecessary clones where they hide design issues.
- Preserve `Send`/`Sync` and async cancellation assumptions.
- Keep public APIs clear: naming, builders for complex construction, newtypes for meaningful distinctions.

## Sources

- Rust API Guidelines: https://rust-lang.github.io/api-guidelines/about.html
- Rust API Guidelines checklist: https://rust-lang.github.io/api-guidelines/checklist.html

