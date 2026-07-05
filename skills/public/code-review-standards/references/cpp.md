# C++ Standards

## Checks

- Follow project formatter, compiler warnings, clang-tidy, and C++ Core Guidelines where applicable.
- Prefer RAII for resource management.
- Avoid raw owning pointers; make ownership explicit.
- Keep lifetime, aliasing, and concurrency assumptions clear.
- Avoid undefined behavior, unchecked casts, buffer overflows, and data races.
- Prefer standard library facilities over custom low-level code unless justified.
- Keep exception/noexcept behavior consistent with project policy.
- Add tests for boundary values, ownership, and error paths.

## Sources

- C++ Core Guidelines: https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines

