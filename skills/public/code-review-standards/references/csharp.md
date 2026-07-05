# C# And .NET Standards

## Checks

- Follow project `.editorconfig`, analyzers, and Microsoft conventions.
- Keep nullable reference type warnings meaningful; do not suppress without reason.
- Use async/await without blocking (`.Result`, `.Wait`) on request paths.
- Dispose resources with `using`/`await using` where applicable.
- Keep dependency injection lifetimes safe.
- Avoid broad catch blocks that hide failures.
- Preserve DTO/domain/entity boundaries by local architecture.
- Cover behavior with unit/integration tests using the project's test framework.

## Sources

- Microsoft C# coding conventions: https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/coding-style/coding-conventions

