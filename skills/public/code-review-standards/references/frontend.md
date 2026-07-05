# Frontend Standards

Use with `typescript-react.md` for React/TypeScript UI work.

## Implementation Checks

- Reuse existing design-system components, icons, tokens, routes, loaders, and data hooks before adding new primitives.
- Place code in the existing UI ownership structure: page/route for composition, component for reusable view, hook for reusable state/effects, service/client for I/O.
- Keep UI state explicit: loading, empty, error, permission-denied, partial data, success, and optimistic states when relevant.
- Avoid side effects during render. Put effects in the proper lifecycle/hook and make dependencies intentional.
- Preserve accessibility: semantic controls, labels, focus order, keyboard access, visible error text, and sufficient contrast.
- Avoid layout shifts from dynamic labels, hover states, async data, or long text.
- Keep data fetching, transformation, and view rendering separated according to local project patterns.
- Do not hardcode mock data in production paths unless the workorder explicitly calls for fixture/demo mode.
- Avoid unnecessary render churn from unstable object/function props, broad context updates, or expensive work inside render.
- Extract shared components only when there are at least two real uses or a clear domain boundary.

## Review Checks

- Does the UI match `02-ui-spec.md` and accepted `02-ui-prototype.md` states?
- Does browser verification cover the primary flow and required states?
- Are forms validated on client and server where applicable?
- Are destructive actions confirmed or reversible according to product requirements?
- Are hidden/disabled controls still protected by backend permissions?
- Is new UI code using existing components/hooks/services instead of duplicating behavior?
- Does the implementation avoid obvious unnecessary re-renders or repeated data transformations?

## Sources

- React docs: https://react.dev/learn/keeping-components-pure
- React ESLint plugin: https://react.dev/reference/eslint-plugin-react-hooks
- WCAG quick reference: https://www.w3.org/WAI/WCAG22/quickref/
