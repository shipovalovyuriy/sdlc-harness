# Anti-Patterns

Read this before final delivery. If the design depends on several of these mistakes, rework it instead of polishing harder.

## Structural Anti-Patterns

- Starting with the navbar, sidebar, or page shell before the core feature is clear
- Filling the whole screen because the display is large
- Making every section equally loud
- Giving several actions "primary" treatment on the same surface
- Using borders everywhere instead of grouping with spacing and background contrast

## Hierarchy Anti-Patterns

- Solving hierarchy only with larger font sizes
- Using gray text on saturated or tinted backgrounds where contrast collapses
- Making labels as visually strong as the values they describe
- Letting semantic heading levels dictate visual size in app UI

## System Anti-Patterns

- Choosing spacing, font sizes, radii, or shadows one pixel at a time
- Mixing unrelated radii, shadow styles, or color ramps without a system
- Creating ad hoc lightened and darkened colors instead of stable shade tokens

## Readability Anti-Patterns

- Center-aligning long-form text
- Stretching forms or prose too wide
- Using too many font sizes
- Relying on accent-colored links everywhere in interfaces where almost everything is interactive

## Feedback And State Anti-Patterns

- Communicating success and failure only with color
- Treating empty states as an afterthought
- Assuming clean marketing imagery or perfect user-uploaded images

## Form And Interaction Anti-Patterns

- Mirroring the final output so literally that the form loses labels, validation, logical order, or mobile usability
- Using identical field widths when they actively misrepresent the expected length of stable inputs
- Styling selectable cards without preserving radio-group semantics, focus visibility, or a clear selected state
- Treating a small icon as the entire touch target
- Placing a frequent mobile CTA in a hard-to-reach area without a task or platform reason

## Navigation Anti-Patterns

- Adding icons, descriptions, or images to every dropdown item until nothing is visually prioritized
- Building a multi-column menu without clear category headings or predictable reading order
- Shrinking a desktop mega menu onto mobile instead of designing a mobile disclosure pattern

## AI Slop Anti-Patterns

- Defaulting to the same centered hero, soft gradient blob, and three-card feature grid regardless of context
- Reaching for novelty before the task flow is understandable
- Adding decorative motion, glass effects, or glow to disguise weak information architecture

If the interface still looks exciting after muting the accents and removing the polish, the structure is probably strong.
