# RAT Handoff To AIRD

Use this reference only inside an invoked AIRD workflow or when the user requests a handoff. RAT does not start AIRD, accept waves, or set package readiness. Follow the target package's actual contract:

- [Discovery delivery-contract: Existential Risk Contract](../../aird-discovery-loop/references/delivery-contract.md#existential-risk-contract) is authoritative for machine fields, eligibility, status and probe requirements.
- [AIRD discovery](../../aird-discovery-loop/SKILL.md#35-existential-probe-gate-blocking) owns the probe gate and risk register.
- [AIRD delivery](../../aird-delivery-loop/SKILL.md#1-pre-flight-and-waves) owns pre-flight and acceptance of execution inputs.

If those sources are unavailable or the package has a different schema, report the missing or conflicting contract. Supply a handoff draft without inventing fields or declaring readiness.

## Carry The Existing Record

For each risk, keep its `R-01` ID, exact claim and scope, dependencies, source/evidence pointers, opposing evidence, outcome, consequence if false, owner, mitigation decision, and affected documents/workorders. Preserve unresolved critical risks even if another test passed.

Map these into `03-risk-register.md` using its existing columns: Risk, Category, Severity, Confidence, Discussion decision / assumption, Mitigation, Evidence gate / cheapest test, Decision rule, and Affects. Link the existing workorder `risk_ids`, `gate_ids`, and `dod_ids`; if not assigned yet, say so. Do not manufacture IDs for workorders that do not exist or overwrite the package's numbering.

The handoff distinguishes a planned probe from its collected evidence. Keep the claim and thresholds recorded before execution; preserve their history if the proposed approach changes. A claim revised to fit a result must be reassessed rather than silently inherit its prior support.

## Only Qualifying Risks Enter Existential Frontmatter

A standalone critical business risk is not automatically an AIRD existential risk. Use the contract's three conditions: outside control, changes the solution's shape if false, and cheaply testable. All other risks remain in the ordinary register with their owner and decision gate.

For qualifying risks, the existing schema uses:

```yaml
existential_risks:
  - id: R-01
    claim: <fixed assertion covering the required behavior>
    claim_locked_at: <timestamp recorded before the probe>
    real_boundaries: [<actually exercised boundary>]
    faked_boundaries: []
    status: unproven
    probe: <actual package-relative evidence file, or empty while untested>
```

Use actual values when transferring a record. These placeholders are not evidence. Record substitutes honestly; `[]` asserts that none were used, not that none were mentioned.

| RAT outcome | AIRD existential status |
|---|---|
| `untested` or `insufficient_data` | `unproven`; retain missing evidence/access and affected decisions |
| `supported` | Eligible for `proven` only if the complete locked claim was tested through the required real path, `faked_boundaries` is explicitly `[]`, and the contract's non-empty probe and timestamp requirements pass; otherwise `unproven` |
| `refuted` | `refuted`; route the dependent decision back to discovery |

A qualifying `unproven` risk permits only the spike-only wave described by the contract; it does not permit implementation workorders depending on its hoped-for answer. A qualifying `refuted` risk blocks package readiness until discovery replaces the decision. The probe and its dependents cannot share a wave.

Do not classify every unavailable runtime check as existential: delivery distinguishes a missing release-verification environment from a missing prerequisite contract. Report the affected stage and follow the existing contract instead of adding a blanket stop to unrelated reversible work.
