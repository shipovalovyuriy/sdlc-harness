# Python Standards

## Checks

- Follow project formatter/linter first, then PEP 8 for readability and consistency.
- Keep public functions/classes typed when the project uses type hints.
- Validate runtime data; type hints do not enforce external input.
- Avoid mutable default arguments.
- Keep exceptions specific and preserve context.
- Use context managers for files, locks, DB sessions, and network resources.
- Keep imports organized according to project tooling.
- Write docstrings for public modules/classes/functions when local convention expects them.
- Avoid broad monkeypatching or global state in tests unless isolated and restored.

## Sources

- PEP 8: https://peps.python.org/pep-0008/
- PEP 257: https://peps.python.org/pep-0257/
- Google Python Style Guide: https://google.github.io/styleguide/pyguide.html

