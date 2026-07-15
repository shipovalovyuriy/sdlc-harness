# Mobile Interaction And Navigation

Use this reference for touch-first flows, mobile CTA placement, icon controls, top-navigation dropdowns, and mega menus.

## Design Frequent Actions For Reach

- Place frequent and primary mobile actions within an easy one-handed reach zone when the task and platform conventions allow it.
- Consider sticky bottom actions or lower-screen placement for repeated progression controls, especially in long forms and task flows.
- Account for device safe areas, browser chrome, virtual keyboards, scrolling, and system gestures before fixing controls to an edge.
- Do not hide essential actions solely to optimize one-handed use. Keep less frequent top-level navigation discoverable and make critical actions reachable through more than one posture when needed.
- Check both left- and right-handed use; a thumb-reach diagram is a heuristic, not a universal template.

## Size The Hit Area, Not Just The Icon

- Use a conservative default hit area of at least `48 × 48` CSS pixels for touch controls unless a stricter product or platform requirement applies.
- A small visual icon can sit inside a larger transparent hit area. The glyph does not need to fill the control.
- Leave enough separation between adjacent targets to prevent accidental activation, especially when actions conflict or one is destructive.
- Ensure invisible hit areas do not overlap and that focus indicators reveal the actual interactive boundary.
- Test with touch as well as mouse and keyboard; responsive layout alone does not prove mobile usability.

## Make Rich Dropdowns Scannable

- Give each destination a short descriptive title and add a brief explanation only when the title alone does not establish the outcome.
- Use icons as recognition aids when they meaningfully distinguish destinations. Do not add an icon or image to every item by default.
- Group related destinations under user-centered category headings. Use columns only when the grouping remains obvious and the reading order is predictable.
- Reserve imagery, a tinted column, or a distinct background for a small number of featured, frequent, or strategically important destinations.
- Collapse a desktop mega menu into a clear mobile disclosure, accordion, or destination page instead of shrinking the multi-column layout.
- Support pointer and keyboard operation, visible focus, predictable open and close behavior, `Escape`, and appropriate menu or disclosure semantics.

## Quick Checks

- Can a user reach the primary mobile action without changing grip in the common task posture?
- Are compact icons backed by generous, non-overlapping hit areas?
- Can users understand the dropdown structure by scanning titles and category headings?
- Does visual emphasis identify only a few important destinations rather than turning the entire menu into an advertisement?
- Does the navigation remain usable with keyboard input and on a narrow screen?
