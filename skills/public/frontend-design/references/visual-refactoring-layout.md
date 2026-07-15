# Visual Atlas: Layout and Spacing

Use these plates to diagnose density, grouping, width, and responsive composition.

## Reading rule

- Red `X` = negative example only. Green check = corrected reference.
- Unmarked diagrams explain a system; copy the relationship, never the exact measurements blindly.

## 14. Start with too much whitespace

![Cramped settings and table layouts compared with roomier versions](../assets/refactoring-ui/14-start-with-whitespace.png)

- **Read:** Discard the red cramped frames. The green or blue-marked frames show the intended breathing room and grouping.
- **Transfer:** Begin spacious, then tighten deliberately; recovering clarity from a cramped layout is harder.

## 15. Establish a spacing and sizing system

![Interface measurements and component sizes drawn from a small scale](../assets/refactoring-ui/15-spacing-sizing-system.png)

- **Read:** The scale relationships are the positive reference; the printed pixel values are illustrative, not mandatory.
- **Transfer:** Use a small nonlinear token scale for gaps, padding, control heights, and icon sizes.

## 16. Do not fill the whole screen by default

![A stretched checkout layout compared with a content-sized composition](../assets/refactoring-ui/16-dont-fill-screen.png)

- **Read:** The red frame stretches sparse content across the viewport. The green frame limits width and keeps related information close.
- **Transfer:** Size containers to the content's reading and comparison needs, not to available pixels.

## 17. Grids are overrated

![Grid columns demonstrating flexible combinations rather than fixed equal spans](../assets/refactoring-ui/17-grids-overrated.png)

- **Read:** This is a neutral explanatory diagram, not a final screen. It shows that relationships can use different fractions within one layout.
- **Transfer:** Use grid when it clarifies alignment, but let content needs determine track sizes and exceptions.

## 18. Relative sizing does not scale automatically

![An oversized em-based mobile heading compared with a controlled fixed step](../assets/refactoring-ui/18-relative-sizing-doesnt-scale.png)

- **Read:** The upper red phone is the failure; the lower green phone is the target relationship with a deliberate mobile heading size.
- **Transfer:** Do not assume a desktop type ratio remains usable at every breakpoint; tune important steps explicitly.

## 19. Avoid ambiguous spacing

![Equal label gaps compared with a smaller label-to-field gap](../assets/refactoring-ui/19-avoid-ambiguous-spacing.png)

- **Read:** The red form uses equal gaps above and below a label, making ownership unclear. The green form keeps the label closer to its field.
- **Transfer:** Spacing must reveal grouping: intra-group gaps should be visibly smaller than inter-group gaps.
