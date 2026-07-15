---
name: frontend-design
description: Design and implement production-grade web interfaces using a feature-first, hierarchy-first workflow with explicit interaction patterns. Use when building or refactoring pages, dashboards, forms, navigation, mobile flows, landing pages, components, or any frontend UI that needs stronger layout, spacing, typography, color, usability, and finishing quality.
license: Complete terms in LICENSE.txt
---

# Frontend Design

Design and implement production-grade interfaces with a strong visual point of view and strong structural discipline.

This skill is for visual design work that must end in real frontend code. Use it for calm product UIs, polished dashboards, landing pages, dense internal tools, and expressive marketing surfaces. Do not default to maximalism; choose the level of personality that fits the product and audience.

## Execute This Workflow

1. Classify the surface and constraints.
- Identify the interface type: form, settings page, dashboard, landing page, empty state, data table, workflow tool, marketing section, or full application shell.
- Identify the real constraints before styling: audience, accessibility, responsiveness, existing design system, implementation stack, and whether the task is a new surface or a refactor.
- If the request is mostly about frontend architecture or performance rather than visual design, pair with `senior-frontend` instead of stretching this skill past its purpose.

2. Start from the feature, not the shell.
- Design the core user task and primary action flow first.
- Do not begin with navbar, sidebar, page chrome, or decorative layout scaffolding unless the task is explicitly about those surfaces.
- For new work, read [starting from scratch](references/starting-from-scratch.md).

3. Ground the art direction in visual evidence.
- For a new surface, redesign, or vague "make it better" request, read [visual exemplars](references/visual-exemplars.md) and inspect at least two relevant images with an image-viewing tool before coding. For a localized pattern change, inspect at least one.
- Load the matching Refactoring UI visual chapter for point-level before/after evidence. A red `X` is always a negative example, never a visual target; follow the green correction or the frame explicitly identified as intended in its caption.
- State a short design contract: primary task, hierarchy, density, personality, composition logic, one distinctive motif, and the generic patterns to avoid.
- Transfer principles from the exemplars; do not clone their branding, copy, palette, or exact component geometry.

4. Choose personality and density on purpose.
- Decide how the interface should feel: sober product UI, polished product UI with character, or expressive marketing/editorial UI.
- Make explicit choices for type direction, corner treatment, copy tone, visual density, and interaction energy.
- Personality is required, but "unexpected" is not the goal by itself. Fit and clarity come first.

5. Define systems before decoration.
- Reuse an existing design system when one already exists. If none exists, define a constrained set of values for spacing, type scale, weights, color shades, radius, and elevation before refining visuals.
- Avoid arbitrary one-off values unless there is a compelling visual reason.
- Read the references that match the task:
  - [layout and spacing](references/layout-and-spacing.md)
  - [text and typography](references/text-and-typography.md)
  - [color systems](references/color-systems.md)

6. Design interaction patterns around the user's decision and device.
- For forms or mutually exclusive choices, read [forms and choice controls](references/forms-and-choice-controls.md).
- For touch-first mobile flows or content-rich navigation dropdowns, read [mobile and navigation](references/mobile-and-navigation.md).
- Preserve semantic controls, keyboard access, focus visibility, and responsive behavior when changing the visual treatment.

7. Build hierarchy before polish.
- Identify one primary action, a small number of secondary actions, and any tertiary actions.
- Use contrast, weight, spacing, grouping, and placement before reaching for larger type, extra borders, or louder color.
- For dashboards, forms, settings, and data-heavy tools, always read [hierarchy and actions](references/hierarchy-and-actions.md).

8. Add depth, imagery, and finishing touches only after the structure works.
- Use shadows, overlap, accents, decorative backgrounds, and motion only when they strengthen emphasis, depth, or atmosphere.
- Empty states, loading states, and sparse datasets deserve as much care as the "happy path".
- Read [depth, images, and finishing](references/depth-images-and-finishing.md) before adding polish.

9. Render, inspect, and revise before delivery.
- Always read [anti-patterns](references/anti-patterns.md) before visual review.
- When the interface can run locally, render it in a real browser and inspect representative desktop and mobile screenshots. Use the relevant browser or screenshot tooling available in the environment.
- Compare the render with the design contract, the selected exemplars, and the mandatory quality bar. Check hierarchy, rhythm, alignment, content resilience, overflow, interaction states, and generic AI patterns.
- Revise the implementation when any quality-bar item fails. Do not treat the first render as the final design.

## Reference Routing

- Use [starting from scratch](references/starting-from-scratch.md) for new surfaces, redesigns, or when the request is vague and the structure needs to be discovered.
- Use [visual exemplars](references/visual-exemplars.md) for every new surface, redesign, visual-quality improvement, or task where art direction is under-specified.
- Use the [starting visual atlas](references/visual-refactoring-starting.md) to inspect task-first composition, iterative design, personality, and constrained systems.
- Use the [hierarchy visual atlas](references/visual-refactoring-hierarchy.md) to inspect corrected emphasis, action priority, label removal, and visual hierarchy.
- Use the [layout visual atlas](references/visual-refactoring-layout.md) to inspect corrected spacing, container width, grouping, grids, and responsive sizing.
- Use the [typography visual atlas](references/visual-refactoring-text.md) to inspect type scales, line length, alignment, line height, links, and tracking.
- Use the [color visual atlas](references/visual-refactoring-color.md) to inspect palette construction, shade ramps, contrast, and non-color cues.
- Use the [depth visual atlas](references/visual-refactoring-depth.md) to inspect lighting, elevation, two-part shadows, surface separation, and overlap.
- Use the [images visual atlas](references/visual-refactoring-images.md) to inspect photography, image overlays, icon sizing, and user-uploaded media.
- Use the [finishing visual atlas](references/visual-refactoring-finishing.md) to inspect refined defaults, accents, empty states, fewer borders, and deliberate composition studies.
- Use [hierarchy and actions](references/hierarchy-and-actions.md) for forms, settings pages, dashboards, tables, CRUD tools, and any interface with competing actions or lots of information.
- Use [layout and spacing](references/layout-and-spacing.md) when the layout feels messy, crowded, over-stretched, or inconsistently grouped.
- Use [text and typography](references/text-and-typography.md) when readability, copy presentation, labels, headings, metrics, or table text need work.
- Use [color systems](references/color-systems.md) when defining or cleaning up palettes, neutral ramps, accents, status colors, or contrast handling.
- Use [forms and choice controls](references/forms-and-choice-controls.md) for creation forms, payment or checkout forms, live previews, expected input lengths, radio groups, pricing choices, and other mutually exclusive options.
- Use [mobile and navigation](references/mobile-and-navigation.md) for thumb reach, touch-target sizing, mobile CTA placement, top-navigation dropdowns, and mega menus.
- Use [depth, images, and finishing](references/depth-images-and-finishing.md) for shadows, overlap, image handling, empty states, accent borders, background treatment, and the last 10 percent of polish.
- Always end with [anti-patterns](references/anti-patterns.md).

## Mandatory Quality Bar

- The main user task must be obvious within a few seconds.
- The primary action must be visually dominant without making every other action loud.
- Spacing must show grouping clearly; adjacent groups should not feel ambiguous.
- Typography must be readable and intentional, not an accumulation of random sizes.
- Color must come from a system of neutrals, core accents, and state colors instead of ad hoc picks.
- Forms must set accurate expectations about the resulting content and preserve usable semantics, validation, and focus order.
- On touch surfaces, frequent actions must be comfortably reachable and interactive hit areas must be large enough for reliable input.
- Rich navigation must be scannable, grouped by user intent, keyboard-operable, and able to collapse cleanly on smaller screens.
- Depth, borders, motion, and decoration must add meaning, not noise.
- Empty, loading, error, and user-generated-content states must be handled intentionally.
- The design must hold together on both desktop and mobile.
- When a runnable interface exists, its final desktop and mobile renders must be visually inspected and any failed quality-bar item must be revised.

## Default Visual Philosophy

- Calm, clear product UI is as valid as expressive UI.
- Neutral fonts are acceptable when they serve readability and product fit.
- Distinctiveness comes from composition, hierarchy, restraint, and consistency as much as from novelty.
- "Beautiful" is not enough; the interface should communicate what matters, what belongs together, and what to do next.
