# TypeScript And React Standards

## TypeScript

- Prefer project-configured `tsconfig` strictness and existing typing style.
- Avoid `any` unless it is isolated at an external boundary and documented by the surrounding code pattern.
- Validate untrusted runtime data; TypeScript types do not validate JSON, URL params, storage, or API responses at runtime.
- Model state and API results with explicit unions where that reduces invalid combinations.
- Avoid non-null assertions when control flow can prove the value or when an explicit guard is safer.
- Keep public types stable when other modules consume them.

## React

- Follow the Rules of Hooks and project lint rules.
- Keep components pure during render.
- Keep effects minimal and explain external synchronization.
- Avoid overusing memoization; use it when there is a real identity/performance reason or project convention.
- Keep controlled/uncontrolled form behavior consistent.
- Prefer accessible native controls before custom interaction widgets.

## Sources

- TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/intro.html
- ESLint rules: https://eslint.org/docs/latest/rules/
- typescript-eslint rules/configs: https://typescript-eslint.io/rules/
- React pure components: https://react.dev/learn/keeping-components-pure
- React hooks linting: https://react.dev/reference/eslint-plugin-react-hooks

