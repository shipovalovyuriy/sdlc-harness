# Java Standards

## Checks

- Follow project formatter/checkstyle first; Google Java Style is the fallback baseline.
- Keep nullability explicit by local convention: annotations, Optional, guards, or documented contracts.
- Avoid broad checked/unchecked exception swallowing.
- Keep resource handling safe with try-with-resources where applicable.
- Preserve thread-safety assumptions for shared services, caches, and static state.
- Keep DTOs, entities, and domain models separated when the project architecture does.
- Avoid adding framework magic where an existing local pattern is clearer.
- Cover API/service behavior with unit and integration tests as appropriate.

## Sources

- Google Java Style Guide: https://google.github.io/styleguide/javaguide.html
- Oracle code conventions archive: https://www.oracle.com/java/technologies/javase/codeconventions-contents.html

