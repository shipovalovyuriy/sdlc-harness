# Forms And Choice Controls

Use this reference for creation flows, payment and checkout forms, option selection, pricing plans, and other interfaces where control geometry affects comprehension.

## Mirror The Result When It Reduces Uncertainty

- When submitted data becomes a visible artifact, such as a listing, profile, card, or page, arrange the form around the structure of that result or provide a live preview.
- Let the preview answer concrete questions: where the image will crop, how the title and price relate, what metadata will appear, and which content may overflow.
- Preserve a logical completion order, explicit labels, validation, and recovery. Visual resemblance must not turn the form into a guessing exercise.
- On narrow screens, use a staged preview, summary step, or view switch instead of compressing form and preview side by side.
- Skip result-shaped forms when the output has no meaningful visual structure or when a conventional sequence is faster and clearer.

## Let Field Geometry Signal Expected Input

- Use visible width as a secondary cue for stable formats: a card number can be wider than an expiry date or security code; a postal code can be narrower than a street address.
- Group related short fields when this improves scanning, but keep DOM order, tab order, errors, and mobile wrapping logical.
- Do not rely on width as validation. Also provide labels, examples where needed, appropriate `inputmode`, `autocomplete`, constraints, and inline errors.
- Keep the interactive area comfortable even when the expected value is short. A compact field must not become difficult to tap.
- Use full-width fields for variable-length content and on narrow layouts where mixed widths would create awkward wrapping.

## Use Selectable Cards For Context-Rich Choices

- Present mutually exclusive choices as selectable cards when users need to compare a small set of options across attributes such as price, limits, benefits, or imagery.
- Keep native radio semantics or an equivalent accessible radio-group pattern. Make the whole card clickable and expose a clear selected, focus, disabled, and error state.
- Keep the comparison dimensions consistent across cards so the treatment improves decisions rather than merely adding decoration.
- Stack or horizontally scroll with care on small screens; never force dense, unreadable cards into a narrow row.
- Prefer a plain radio list when the options are simple, numerous, or best scanned as text.

## Quick Checks

- Does the form help users predict the result without hiding labels or validation?
- Do field widths clarify expected content without becoming the only cue?
- Are selectable cards still operable as a real radio group with keyboard and assistive technology?
- Does the form preserve a clear reading and focus order when it wraps on mobile?
