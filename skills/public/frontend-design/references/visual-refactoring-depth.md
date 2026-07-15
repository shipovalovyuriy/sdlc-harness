# Visual Atlas: Depth

Use these plates to add spatial meaning without turning every component into a floating card.

## Reading rule

- Red `X` = failure only; green check = corrected reference.
- Unmarked diagrams explain lighting or elevation relationships rather than a style to reproduce literally.

## 35. Emulate a consistent light source

![Raised and inset surfaces lit from a consistent direction](../assets/refactoring-ui/35-emulate-light-source.png)

- **Read:** The useful reference is the consistency between highlights and shadows across raised and inset controls.
- **Transfer:** Pick one light direction and keep shadow offsets, inset highlights, and surface edges coherent.

## 36. Use shadows to show elevation

![Elevation diagrams and a flat menu compared with a raised menu](../assets/refactoring-ui/36-shadows-show-elevation.png)

- **Read:** The lower red menu lacks separation; the lower green menu uses shadow to explain that it sits above the page.
- **Transfer:** Map a small elevation scale to real spatial relationships such as dropdowns, sticky bars, and modals.

## 37. Build two-part shadows

![A component shadow combining broad ambient and tight direct-light layers](../assets/refactoring-ui/37-two-part-shadows.png)

- **Read:** The formula and object example are a positive construction reference, not required numeric values.
- **Transfer:** Combine a soft low-opacity ambient shadow with a tighter directional shadow for believable depth.

## 38. Create depth in flat design

![Flat surfaces separated by color and restrained shadow](../assets/refactoring-ui/38-flat-design-depth.png)

- **Read:** Both examples demonstrate restrained separation rather than decorative floating cards everywhere.
- **Transfer:** Prefer surface color, overlap, and subtle edge contrast before increasing shadow intensity.

## 39. Use overlap to communicate layers

![Disconnected hero content compared with panels that overlap adjacent surfaces](../assets/refactoring-ui/39-overlap-for-layers.png)

- **Read:** Ignore the red disconnected frame. The green frames use controlled overlap to connect content across layers.
- **Transfer:** Let one purposeful element cross a boundary when it clarifies hierarchy; protect clipping and responsive behavior.
