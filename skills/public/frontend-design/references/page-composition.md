# Page Composition

Use this reference before arranging multi-section pages, dashboards, tables, lists, or detail
views. Resolve content relationships before choosing grid columns or card treatments.

## Map The Task And Content

Before coding, make a compact outline: primary task, section order and roles, default visible
content, and how to reach the rest. For each substantial region, identify:

- The user decision it supports and whether it is primary work, supporting context, or optional detail.
- What users need to see together versus what they can visit separately.
- Expected size and growth: rows, columns, text length, expanded details, and empty states.

Group around user goals and objects rather than creating a section for every API response.
Remove redundant presentations before adding containers. Do not add a KPI strip or card grid
unless those summaries help users decide what to do.

## Choose The Structure By Relationship

| User need | Useful composition | Decision boundary |
| --- | --- | --- |
| Understand status and decide where to act | Overview with focused summaries or bounded previews and links to full views | Avoid turning the overview into several complete workspaces. |
| Find, filter, edit, or process many records | One main table or list with nearby controls and suitable pagination or scrolling | Preserve a useful working set; do not shrink it to a decorative preview. |
| Switch between related datasets, statuses, or views | One working area with filters or a small, clearly labelled tab set | Filters narrow the same dataset; tabs switch distinct views. Neither is suitable for required simultaneous comparison. |
| Inspect items while keeping the list as context | Primary-detail layout: list plus selected-item details | Use it when moving between items matters; a dedicated detail page suits deeper work. |
| Compare values across groups | Shared comparison table, aligned sections, or readable side-by-side regions | Keep compared values together and preserve common labels and filter context. |
| Perform distinct jobs with independent controls | Separate destinations with clear navigation | Keep a local selector when the jobs are closely related and switching is frequent. |
| Read a sequence or complete a coherent form | Ordered sections in the page flow; section navigation when useful | Long pages are valid when their order supports the task. |
| Consult occasional supporting details | Inline disclosure or an optional panel | Keep required instructions, blocking errors, and decision-critical information visible. |

Two large tables do not automatically belong in two tabs or two columns. First ask whether
they represent alternate views, a comparison, a list and its details, or separate jobs.
Side-by-side placement works only when both regions retain enough width for their content.

## Budget Attention And Space

- Let the initial viewport establish the page purpose, essential context, relevant controls,
  and a useful start to the main task. Compact repeated chrome before compressing the data.
- Place related actions, filters, totals, and explanations near the content they affect. Make
  the scope of page-wide versus section-specific controls clear.
- Allocate width by content needs. Forms and prose benefit from constrained reading widths;
  wide tables need room for meaningful columns. Equal fractions are not a default hierarchy.
- A supporting rail should earn its space by helping the current task. Use a quieter summary,
  disclosure, or separate destination when its full contents compete with the main work.
- Give important sibling tasks a visible entry point before a large growing region. This
  can be a section link, selector, or summary; every section heading need not fit above the fold.

Scrolling is normal. The failure is making a user hunt through an unrelated dataset to find
another task, not the mere existence of content below the fold.

## Set Table And List Extent Deliberately

- Distinguish an overview preview from a working table. A few rows can illustrate a summary;
  processing records usually needs more. Choose extent from the task, row height, viewport,
  and content; there is no universal 3-5-row limit.
- For a preview, explain which items are shown, the ordering, and how to open the full set.
  Include accurate counts when available; never imply that the preview is the complete set.
- For large working datasets, choose pagination or scrolling deliberately. Keep result scope
  and continuation controls understandable. Virtualization improves rendering performance;
  it does not make sibling tasks more discoverable.
- Pagination alone does not repair the page if its default page size still buries the next
  important region. Recheck the composition at realistic volume.
- Expand rows for supporting detail, not for information users need to compare across rows.
  A separate card for every record can greatly increase page height without improving the task.
- When navigating into details or switching views, preserve relevant filters, selection, and
  return position where users expect to resume work.

## Design Scrolling And Responsive Behavior Together

Prefer one main vertical page scroll. Independently scrolling panes can suit a primary-detail
workspace or editor, but should be intentional, visibly bounded, and usable with keyboard
and touch. Avoid scroll regions inside scroll regions added merely to fit more panels.

Use sticky headers or controls when they preserve needed context. Check that combined sticky
areas leave a useful content window and do not cover focused controls or anchor destinations.
Keep horizontal table overflow local and discoverable rather than making the whole page pan.

On narrow screens, reconsider composition instead of stacking every desktop panel in full.
For primary-detail work, show one pane at a time with clear return navigation. For independent
datasets, retain a discoverable selector or navigation. For comparisons, preserve meaningful
labels and access to compared values; converting everything into cards may break comparison.
Keep reading, visual, and keyboard order coherent when regions move.

## Verify With Real Content And Tasks

When a runnable interface exists, inspect an ordinary laptop viewport and a narrow mobile
viewport. A full-page screenshot can conceal the effort needed to discover lower content.

- Use realistic large datasets, not only three clean sample rows. For a page with two large
  datasets, grow the first and verify that the second remains discoverable and directly reachable.
- Start at the initial viewport and find each important sibling task without traversing the
  unrelated records first. Check that navigation actually works, not just that it is visible.
- Try the main task: compare values without repeatedly switching hidden panels, reach table
  controls, open details, and return to the previous working context as applicable.
- Check long labels and wrapped rows, expanded content, empty or filtered results, and loading
  or error states for displaced controls, misleading counts, and unnecessary blank space.
- On mobile and with keyboard navigation, verify access to selectors, off-screen columns,
  disclosure controls, and any intentional scroll regions. Check zoom if sticky chrome crowds the work.

Revise a failing structure before adding visual polish. Do not replace normal page scrolling
with tabs, accordions, or nested scroll regions unless that choice improves the actual task.

## Sources And Visual References

These sources inform the choices above; the decision table is a synthesis, not a universal
layout standard. Use their illustrated examples for relationships, not branding or pixel values.

- [Carbon: data table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines) — illustrated placement, column space, toolbars, pagination, and row expansion.
- [PatternFly: primary-detail](https://www.patternfly.org/patterns/primary-detail/design-guidelines/) — illustrated list-detail relationships and transition to one pane on mobile.
- [PatternFly: dashboards](https://www.patternfly.org/patterns/dashboard/design-guidelines/) — task-oriented overview composition, prioritization, and content-led sizing.
- [NN/g: Tabs, Used Right](https://www.nngroup.com/articles/tabs-used-right/) — when tabs suit grouped content and when they impede comparison or discovery.
- [NN/g: Scrolling and Attention](https://www.nngroup.com/articles/scrolling-and-attention/) — research on attention by page depth; not a requirement to fit all content above the fold.
- [GOV.UK: accordion](https://design-system.service.gov.uk/components/accordion/) — disclosure tradeoffs and alternatives such as headings, anchor links, or separate pages.
