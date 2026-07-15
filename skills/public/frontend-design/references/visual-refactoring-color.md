# Visual Atlas: Color Systems

Use these plates to build palettes, preserve hierarchy, and avoid color-only communication.

## Reading rule

- Red `X` = negative example only; green check = corrected reference.
- Diagrams and swatches are system evidence. Do not lift their exact palette unless it fits the product and passes contrast checks.

## 28. Prefer HSL for systematic adjustment

![A UI palette mapped to an HSL color wheel](../assets/refactoring-ui/28-prefer-hsl.png)

- **Read:** This is an explanatory relationship, not a prescribed palette.
- **Transfer:** Adjust hue, saturation, and lightness intentionally when building related shades and states.

## 29. Use enough colors, not every color

![A rainbow interface compared with a constrained functional palette](../assets/refactoring-ui/29-use-enough-colors.png)

- **Read:** The red rainbow frame is the failure. The green frame uses enough distinct roles without making every region compete.
- **Transfer:** Define primary, neutral, accent, and semantic families; add a role only when the UI needs it.

## 30. Define shades up front

![Primary neutral and accent ramps with a tinted notice](../assets/refactoring-ui/30-define-shades-upfront.png)

- **Read:** The organized ramps are the positive reference; individual hex values are illustrative.
- **Transfer:** Create named shade steps before component styling so hover, subtle backgrounds, borders, and text stay related.

## 31. Preserve perceived saturation

![Constant saturation compared with a corrected saturation curve across lightness](../assets/refactoring-ui/31-preserve-saturation.png)

- **Read:** The straight upper relationship can look washed out at extremes. The curved lower relationship preserves perceived colorfulness.
- **Transfer:** Tune saturation as lightness changes; do not generate a palette by changing only one channel mechanically.

## 32. Use tinted greys

![Neutral greys compared with cool greys used in a finance interface](../assets/refactoring-ui/32-tinted-greys.png)

- **Read:** Both ramps are diagnostic; the cool ramp demonstrates how a subtle hue can unify a product surface.
- **Transfer:** Give neutrals a restrained warm or cool bias that matches the brand, while keeping text contrast strong.

## 33. Verify accessible color contrast

![Contrast grades above a table containing failing low-contrast combinations](../assets/refactoring-ui/33-accessible-color.png)

- **Read:** In the upper diagnostic table, only rows graded AA or AAA are positive references. The lower red table is a failure and must never be copied.
- **Transfer:** Test text and essential controls at their actual size and weight; fix every failing combination rather than trusting visual taste.

## 34. Do not rely on color alone

![Red and green status chips that collapse under color blindness compared with a distinguishable chart](../assets/refactoring-ui/34-dont-rely-on-color.png)

- **Read:** The upper red status cards are the negative example. The lower green chart remains distinguishable through lightness, separation, labels, and ordered values.
- **Transfer:** Pair color with text, icons, patterns, position, or value labels for every essential distinction.
