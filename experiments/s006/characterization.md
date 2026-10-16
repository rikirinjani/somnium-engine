# S006 — Long-Horizon State Transmission: characterization & feasibility triage

## Part II — What P-005 state is declarative (by inspection of frozen code at 5b41ded)

| State component | Representation (frozen code) | Survives handoff via residue? | Verifiable how |
|---|---|---|---|
| Selected world/domain | `Canon.canonId` + `canonHash` | Yes — carried verbatim in residue | `derive(canon, ...)` determinism |
| Causal verdicts | `WorldState.judgments` (node→Judgment) | Yes — recomputed, not carried | `stateHash` equality on re-derive |
| Projected statuses | `WorldState.statuses` (lossy EventStatus map) | Yes — recomputed | `stateHash` equality |
| Effective facts | `WorldState.facts` (FactView[]) | Yes — recomputed from canon+interventions | `stateHash` equality |
| Work classifications | `WorldState.workStatuses` | Yes — recomputed | `stateHash` equality |
| Contradictions | `WorldState.contradictions` (records w/ provenance) | Yes — recomputed | `stateHash` equality |
| Temporal violations | `WorldState.temporalViolations` | Yes — recomputed | `stateHash` equality |
| World identity | `stateHash` | Yes — recomputed; equal iff same effective world | hash equality |
| Derivation identity | `identityHash` (stateHash + rpId + canonicalized interventions) | Yes — recomputed | hash equality |
| Intervention history | `WorldState.interventions` (full ordered chain) | Yes — carried verbatim in residue | array equality |
| Originating rewind point | `rpId` | Yes — carried verbatim | field equality |
| Occurrence membership | `instance_of` facts in `facts` | Yes — recomputed | `occurrencesOfType` / `occurrenceCount` |
| Canon source authority | `canonHash` | Yes — residue carries it; tamper ⇒ mismatch | tamper injection (Part VI) |
| Uncertainty (epistemic) | `truth: NEITHER` judgments (case-K UNKNOWN) | Yes — recomputed | status map UNKNOWN preservation |
| Current task/objective | **NOT represented** — no task concept in SE | No | — |
| Next lawful transition | **NOT represented** — SE has no "next step" primitive | No | — |
| Staleness | **NOT represented** — no "current vs historical" axis in WorldState | No | — |
| Authority | **NOT represented** — only `source: "canon"|"derived"` per fact | Partial | fact.source field |
| Cold/residual state | **NOT represented** — no cold-set concept | No | — |

**The compact residue is `(canonId, canonHash, rpId, interventions[])`.** Because
`derive()` is pure, that residue recomputes the ENTIRE WorldState bit-for-bit.
This is a measurement of the engine, not a claim about workers.

## Part III-X — feasibility triage (honest, before building)

This environment (verified in P-019) has **no working LLM worker path**: subagent
dispatches returned empty/failed repeatedly; there is no reproducible model
endpoint for blind-graded worker arms. Therefore:

- **Deterministically measurable (will run, no LLM):** Part III horizon sweep
  (residue size, world size, derive time, hash stability, active facts);
  Part IV handoff-depth as *mechanical re-derivation chain* (A→B→C… from residue
  only, stateHash/identityHash equality); Part V state-vector fidelity for the
  components SE *does* represent; Part VI error injection (canon tamper, illegal
  write, contradiction, source replacement); Part IX economy (transcript vs
  residue vs active state); Part X failure boundaries derivable from those.
- **NOT executable here (no LLM):** worker *cognition* arms — retention
  accuracy, task-use accuracy, P(state survives handoff) with an agent,
  transcript-vs-RAG-vs-Somnium worker arms. These require a graded LLM worker;
  absent that, any number would be fabricated. This report states that boundary
  explicitly rather than manufacturing numbers.

This is the deficiency-report branch of the task: the state *representation*
question is answerable mechanically; the *worker* question is not answerable in
this environment.
