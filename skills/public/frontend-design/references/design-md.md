# DESIGN.md

Use this reference when the project carries a `DESIGN.md`, or when you are defining a design system from scratch and want the next session to inherit it instead of re-deriving it.

`DESIGN.md` is a format for describing a visual identity to coding agents: YAML front matter holds machine-readable tokens, the Markdown body holds the reasoning behind them.

## Look For It Before Inventing Anything

Check `DESIGN.md`, `docs/DESIGN.md`, and `.design/DESIGN.md`. Also check whether something already plays that role — a Tailwind theme, CSS custom properties, a tokens package, a Figma variable export.

If a `DESIGN.md` exists, it replaces guessing the system from screenshots and component archaeology. Read it before styling anything.

## Read The Front Matter First

The front matter is the cheap part and usually the part you need:

```yaml
name: Acme Console
colors:
  surface: "#0B0F14"
  primary: "oklch(62% 0.19 258)"
typography:
  heading: { fontFamily: Inter, fontSize: 1.5rem, fontWeight: 600, lineHeight: 1.25 }
spacing: { 1: 4px, 2: 8px, 3: 12px }
rounded: { md: 8px }
components:
  button: { background: "{colors.primary}", radius: "{rounded.md}" }
```

Values in curly braces are token references — resolve `{colors.primary}` through the `colors` map rather than copying the literal.

Read only the body sections that match the surface you are building. The body is ordered Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts. Do not pull the whole file into context to change one button.

## Treat The Token Set As A Contract

- Compose from the tokens that exist. A value the system already names is always preferable to a nearby hand-picked one.
- If the design genuinely needs a value the system lacks, that is a **system change**, not a local exception. Name it, justify it, and add it to `DESIGN.md` — do not inline a one-off and move on.
- An explicitly `omitted` section means the system deliberately leaves that decision open: decide it yourself. A section that is simply absent is a gap — flag it.
- Honour Do's and Don'ts as hard constraints. They are the project's accumulated corrections, and re-litigating them silently is how a codebase drifts.

## Conflicts Are Drift, Not A Tiebreak

`DESIGN.md` is authoritative for intent. The running code is authoritative for what actually ships. When they disagree, you have found drift — report it and say which direction should win. Do not silently pick a side, and do not "fix" the file to match sloppy code.

## Keep One Direction Of Truth

A `DESIGN.md` that diverges from the code is worse than none: it is a confidently wrong source. Prefer generating the consumable config from it (`export` produces Tailwind or W3C design-token output) over maintaining a parallel description by hand. If generation is not possible in this project, say so and treat the file as documentation that needs an explicit sync step.

## Generating One For A Project

There is no `init` or `generate` command — the CLI only validates and converts. Authoring the file is the agent's job, and it is what this reference is for.

### From an existing codebase (the common case)

1. **Find the real source of truth and pick one.** In priority order: Figma variables if a Figma integration is connected, then a Tailwind theme or `@theme` block, then CSS custom properties on `:root`, then a theme object (MUI, styled-components, Chakra). Only fall back to reading components when none of those exist.
2. **Extract what is used, not what is declared.** Count occurrences across the real components. A color that appears twice is a one-off, not a token; a declared palette entry nothing references is dead. The system you write down must be the system that ships.
3. **Name by role, not by value.** `surface`, `on-surface`, `primary`, `danger` — not `blue-500` and never `color-2`. Roles are what make the file useful to the next agent.
4. **Scope it.** Capture the ramps, scales, radii, and elevation that genuinely repeat. An extraction that dumps sixty colors has recorded the mess rather than the system; when the codebase really is that inconsistent, write the intended system and record the cleanup as drift.
5. **Write the body last, and write the why.** Rationale is the part that cannot be extracted mechanically, and it is the only reason this file beats reading the config directly. State the personality, the density, and the constraints that produced these values.

### Verify the extraction by round-tripping

Do not trust an extraction you have only eyeballed. Export it back into the project's own format and diff:

```bash
npx @google/design.md export --format json-tailwind DESIGN.md > /tmp/extracted.json
# compare with the project's real tailwind theme
```

Every difference is either an extraction error or genuine drift between the declared system and the shipped one. Both are worth knowing; neither should be silently smoothed over. Then run `lint` — `contrast-ratio` surfaces inaccessible pairs you just inherited, `orphaned-tokens` catches tokens nothing references, `missing-primary` and `missing-typography` catch an incomplete pass.

### From a system you just defined

When the skill's system-definition step produces a spacing scale, type scale, shade ramps, radii, and elevation, write the result to `DESIGN.md` instead of leaving it in the conversation. Keep it minimal and true: `name`, the scales you actually committed to, an Overview stating personality and density, and the Don'ts you already know. An aspirational file full of unused tokens is noise, and `orphaned-tokens` will say so.

### Then decide the direction and write it down

Generate the consumable config from `DESIGN.md`, or keep the config as the source and regenerate `DESIGN.md` from it. Either is defensible; maintaining both by hand is not. The upstream examples ship `DESIGN.md` alongside a generated `tailwind.config.js` and `design_tokens.json`, which is the shape to copy.

## What It Does Not Answer

`DESIGN.md` says which values are legitimate. It says nothing about hierarchy, composition, emphasis, or interaction. Keep using [hierarchy and actions](hierarchy-and-actions.md), [layout and spacing](layout-and-spacing.md), and the visual atlases for those decisions — a design built only from valid tokens can still bury its primary action.

## Optional Tooling

The file is plain YAML and Markdown; read it directly when tooling is unavailable. When it is available:

```bash
npx @google/design.md lint DESIGN.md                 # structure, section order, WCAG contrast
npx @google/design.md lint --format json DESIGN.md   # machine-readable, for a quality gate
npx @google/design.md diff old new                   # token-level regressions between versions
npx @google/design.md spec                           # current schema, for when this reference lags
```

Export targets: `json-tailwind` (Tailwind v3 `theme.extend`), `css-tailwind` (Tailwind v4 `@theme` block), `dtcg` (W3C Design Tokens). There is no `--fix`; lint reports, you repair.

The format is at version `alpha` and the schema is still moving, so prefer `spec` output over any schema quoted here, and do not make the CLI a hard dependency of the work.

## Quick Checks

- Did you look for a `DESIGN.md` before deriving the system yourself?
- Does every value you introduced resolve to a token, or is it a justified, recorded system change?
- Did you resolve `{token.references}` rather than duplicating literals?
- If the file and the code disagreed, did you report the drift instead of quietly choosing?
- If you generated one, did you extract from what ships rather than what is declared, and round-trip it back to catch your own mistakes?
- If you defined a new system, is it written down where the next session will find it?
