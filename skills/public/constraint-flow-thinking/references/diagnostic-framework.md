# Diagnostic Framework

Use this method when the user asks for a deep diagnosis or when the problem is recurring, cross-functional, or politically noisy.

## 1. Define Goal

State the real system-level outcome. Avoid proxy goals like utilization, number of tasks, number of meetings, story points, or volume of output that is not valuable.

## 2. Define System Boundary

Name what is inside and outside the analysis: people, teams, tools, queues, decision points, vendors, customers, policies, and time horizon.

## 3. Map Stocks

List what accumulates. Common stocks: backlog, WIP, waiting PRs, unresolved decisions, defects, tech debt, incident load, meetings, dependencies, context debt, blocked tasks, open risks, unvalidated assumptions.

## 4. Map Flows

For each stock, identify inflow and outflow. Example: PR stock increases by PRs opened and decreases by PRs reviewed/merged.

## 5. Identify Accumulation

Find where the stock grows, waits, ages, or repeatedly returns. A growing queue often points to a constraint nearby.

## 6. Infer Constraint

Infer the constraint from accumulation, waiting, overload, rework, handoff latency, or low outflow. Do not declare a constraint from annoyance alone.

## 7. Map Feedback Loops

Look for reinforcing or balancing loops. Examples:

- More WIP -> more context switching -> slower completion -> more WIP.
- Slow review -> larger PRs -> harder review -> slower review.
- More meetings -> less deep work -> more unresolved issues -> more meetings.

## 8. Find Delays

Identify delays between cause and visible effect: feedback delay, review delay, deploy delay, decision delay, learning delay, reporting delay.

## 9. Detect Local Optimization

Ask what looks efficient locally but hurts throughput. Examples: maximizing utilization, pushing more tasks to a blocked queue, creating status meetings instead of decision rights, building architecture layers when ownership is unclear.

## 10. Select Leverage Point

Choose the place where a small intervention changes flow through the constraint. Prefer reducing WIP, batch size, rework, handoffs, or decision latency before adding capacity.

## 11. Design Intervention

Make the intervention small, time-boxed, measurable, and reversible when possible. Define owner, trigger, expected stock-flow change, success metric, and review date.

## 12. Predict Constraint Shift

After the intervention, predict where the bottleneck may move. A useful fix usually reveals the next constraint.
