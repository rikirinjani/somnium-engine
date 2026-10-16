# EXPERIMENT S006 — Long-Horizon State Transmission

**Frozen baseline:** `somnium-p005-final` → `5b41deda54076b2212c5877e95892be8c19cb6cc`
**Experiment branch:** `experiment/long-horizon-state`
**Status:** COMPLETE (deterministic arms); worker-cognition arms DECLARED NOT EXECUTABLE here (see §17).

---

## 1. Research questions

1. What state does the frozen P-005 engine make declarative, and what survives reconstruction from a compact residue?
2. Does the residue stay compact as the intervention history grows, or does it grow with history?
3. Is reconstruction deterministic and replay-stable at every horizon?
4. Does the engine distinguish "same world, different history" from "different world, different history"?
5. Does the engine detect injected error classes, and which classes remain undetectable?

## 2. Frozen baseline

- Tag `somnium-p005-final` → commit `5b41ded` (verified dereference).
- Branch at freeze: `occurrence`; worktree clean; 479/479 tests; tsc exit 0; verify-facts 3/3; retrace clean.
- Verifier history: 7 L2 gates (6 REJECT + APPROVE-WITH-RESIDUAL). See `qms/records/verifications/...-ver-005-p005-l2-gate.json`.
- The tagged commit is untouched by this experiment. Experiment code lives under `src/experiment/s006/` and `experiments/s006/`, out of the engine tree except as a compile-included import.

## 3. Experimental apparatus

- `src/experiment/s006/long-horizon.ts` — deterministic harness. Imports frozen engine; modifies nothing.
- Deterministic canon generator (`mulberry32` seeded PRNG, no Math.random): synthetic chain DAG, 140 events / 6 characters / 4 locations / 4 EventTypes / 139 REQUIRES edges / 150 facts.
- Deterministic intervention-chain generator: mixed negate/force/setFact/relocate, seeded per run.
- Outputs: `experiments/s006/results/s006-results-seed20260831.json` (plus ad-hoc probes in the transcript).

## 4. Operational definitions

- **History item** = ONE ordered `Intervention` in the chain. Horizon = chain length.
- **Horizons measured:** H0, H1, H10, H50, H100, H500, H1000.
- **Residue** (what a receiving worker would need to reconstruct the world) = `{ canonId, canonHash, rpId, interventions[] }`. This is exactly the input tuple of `derive()`.
- **World projection** = `{ judgments, statuses, facts, workStatuses, contradictions, temporalViolations }` (everything `stateHash` folds).
- **Replay-stable** = re-deriving from the same residue yields identical `stateHash` and `identityHash`.

## 5. Experimental arms

| Arm | Description | Ran? |
|---|---|---|
| A | Horizon sweep (H0–H1000), residue size, world size, derive time, replay stability | YES |
| B | Handoff chain (50 handoffs), residue-only re-derivation, hash stability | YES |
| C | Convergence: same world, different provenance | YES |
| D | Error injection (canon tamper, illegal write, contradiction, unknown-preservation) | YES |
| E | Determinism across seeds (7, 424242, 20260831) | YES |
| — | Worker *cognition* arms (retention/task-use accuracy with an LLM worker; transcript vs RAG vs Somnium) | **NOT EXECUTABLE in this environment** (no reproducible LLM worker path — P-019 finding). Declared, not fabricated. |

## 6. Horizon definition

Horizon = number of ordered interventions applied to the same frozen canon. The chain is generated from a fixed seed so the *content* is identical across horizons up to the truncation point; only length differs. (This is why H1000 inherits H500's interventions, etc.)

## 7. State vector

| Component | In residue? | Deterministically reconstructed? | Measured |
|---|---|---|---|
| canonId / canonHash | yes (verbatim) | yes | hash equality |
| rpId | yes (verbatim) | yes | field equality |
| interventions (full history) | yes (verbatim) | yes | array equality |
| judgments (truth×support×forced×negated) | no — recomputed | yes | stateHash equality |
| statuses (projected) | no — recomputed | yes | stateHash equality |
| facts (effective) | no — recomputed | yes | stateHash equality |
| workStatuses | no — recomputed | yes | stateHash equality |
| contradictions | no — recomputed | yes | stateHash equality |
| temporalViolations | no — recomputed | yes | stateHash equality |
| occurrence membership / counts | no — recomputed | yes | `occurrencesOfType`/`occurrenceCount` equality |
| **task/objective** | — | **NOT REPRESENTED** | absent from engine |
| **next lawful transition** | — | **NOT REPRESENTED** | absent from engine |
| **staleness/currentness** | — | **NOT REPRESENTED** | absent from engine |
| **authority** | — | **PARTIAL** (fact.source only) | absent as an axis |
| **cold/residual state** | — | **NOT REPRESENTED** | absent from engine |

## 8. Handoff protocol

Worker B receives ONLY the residue. Worker B's reconstruction = `derive(canon, interventions)` — the same pure function the originating worker used. The 50-handoff chain measures whether each step re-derives the identical world (stateHash/identityHash stability). This is mechanical reconstruction; it does not measure worker *cognition* (that arm is not executable here).

## 9. Ground-truth construction

Ground truth = the frozen engine's own `derive()` applied to the residue. Because `derive` is a pure function, the ground truth is independent of any particular worker; `stateHash` is the equality oracle. This is valid for the *representation* question but cannot validate worker comprehension.

## 10. Metrics

Residue bytes, world bytes, derive time, active events/facts, contradictions, unresolved (UNKNOWN) count, replay stability, stateHash/identityHash per handoff, growth slopes (OLS fit), error-injection detection.

## 11. Results

### Horizon sweep (seed 20260831)

| H | residue B | world B | derive ms | events | facts | contra | unknown | replay |
|---|---|---|---|---|---|---|---|---|
| 0 | 79 | 33,226 | 37.0 | 140 | 144 | 0 | 0 | ✓ |
| 1 | 246 | 33,246 | 7.8 | 140 | 144 | 0 | 0 | ✓ |
| 10 | 1,210 | 33,738 | 10.0 | 46 | 144 | 2 | 0 | ✓ |
| 50 | 6,179 | 34,552 | 9.4 | 58 | 144 | 6 | 0 | ✓ |
| 100 | 12,394 | 35,840 | 10.9 | 68 | 144 | 13 | 0 | ✓ |
| 500 | 59,102 | 46,486 | 24.3 | 19 | 144 | 72 | 0 | ✓ |
| 1000 | 117,596 | 54,446 | 78.7 | 3 | 144 | 117 | 0 | ✓ |

- **Residue growth: exactly linear** — 117.46 bytes/intervention, R² = 1.0000. (By construction: the residue *is* the serialized intervention list.)
- **World growth: sublinear** — 21.81 bytes/intervention. The derived state saturates; adding history does not add unbounded world.
- **At H1000 the residue is 2.16× the world projection.** The "compact state" is compact only at small horizons.
- **Replay stable at every horizon.**
- Contradictions grow with horizon because the seeded chain force/negates events whose REQUIRES spine is disrupted — a property of the stress generator, not a defect.

### Handoff chain (50 handoffs, seed 20260831)

Every handoff recomputed identical stateHash/identityHash from residue only; residue grew 246 → 6,179 bytes across H1→H50. Mechanical reconstruction is perfect and stable to depth 50.

### Convergence

- `setFact(c0, located_in, l1)` vs `relocate(c0, l1)` → **same stateHash, different identityHash** (P-004/P-005 distinction preserved).
- Same history on a canon with 141 vs 140 events → **different stateHash** (canon change detected).

### Determinism across seeds

Seeds 7, 424242, 20260831 — H500 re-derive byte-identical hashes in every case.

## 12. Failure cases

- **Residue is not compact at scale.** The linear residue growth means "transmit state without history" fails economically by H500–H1000; you are transmitting history.
- **World saturates, residue does not.** The engine is cheap to re-derive from full history but does not itself emit a *state-only* artifact smaller than history.

## 13. Ablation results

Not executable here (no LLM worker). The only ablation performed is the natural one inside the engine: full-history derive vs residue-only derive — identical by construction, which is the engine's guarantee and the boundary of what this environment can test.

## 14. State-size/performance relationship

| H | residue B | derive ms |
|---|---|---|
| 10 | 1,210 | 10.0 |
| 100 | 12,394 | 10.9 |
| 1000 | 117,596 | 78.7 |

Time grows ~7.9× for ~9.5× size from H100→H1000; the dominant cost is the intervention list, not the world.

## 15. State-transmission fidelity

P(component survives mechanically) = 1.0 for every component the engine represents (recomputed bit-identically). P(survives) is undefined for components the engine does not represent (task/objective, staleness, authority, next-transition). This is the load-bearing finding: **fidelity is total for represented state, and there is no representation at all for the agent-level components the brief asks about.**

## 16. Error-correction results

| Scenario | Detected? | Via |
|---|---|---|
| Canon tamper (source replacement) | ✓ | stateHash/canonHash mismatch |
| Illegal fact write (undeclared type object) | ✓ | fact-write-illegal contradiction record |
| Force-vs-negated on declared event | ✓ | CONTRADICTORY status |
| Unknown preservation (undeclared id object) | ✓ | write rejected, contradiction record |

**Not detectable by the engine:** authority changes (no authority axis), staleness (no currentness axis), changed source *that re-hashes identically* (canonHash is content-addressed — a semantically changed canon with a different hash is detected; a "change of authority" with same content is not representable), targeted recomputation (no partial-invalidation primitive; only full re-derive).

## 17. Threats to validity

1. **The worker-cognition question is NOT answered.** All "accuracy" metrics in the brief (retention, task-use, P(receiver acts correctly)) require an LLM worker; no reproducible worker path exists in this environment (P-019). Any number reported would be fabricated. The honest classification is that the *representation* question is answered; the *worker* question is not.
2. Synthetic canon is a stress corpus, not a story — the 117-contradiction H1000 result is a generator property.
3. Single machine, single run per seed; timing is noisy (H0's 37ms is a cold-start outlier).
4. `stateHash` as ground-truth oracle is circular with respect to `derive` (both are the same pure function) — valid for *reconstruction* equality, not for semantic correctness.

## 18. What the experiment DOES NOT establish

- Does not establish that any worker can *comprehend* the reconstructed state.
- Does not establish that PM-1 (the trace protocol) transmits anything — this experiment is about SE's `derive` residue, which is a different artifact entirely.
- Does not establish that the engine is a memory system; it is a deterministic world-derivation system.

## 19. Deficiency report (the "STOP and report" branch)

The brief's state vector includes **task/objective, authority, staleness/currentness, next lawful transition, cold state**. **None of these exist in the frozen P-005 representation.** The engine is a world-state derivator, not a task-state holder. A worker handed the residue can recover the world *but cannot recover the task*, because the task was never in the residue. This is not a bug and not fixable by more transmission; it is an absence of representation. The failure boundary is therefore: **the engine transmits world state perfectly, and task/agent state not at all** — and the two must not be conflated.

## 20. Conclusions

- The frozen P-005 engine deterministically reconstructs its full world state from the compact residue `(canonId, canonHash, rpId, interventions[])` — bit-identical, replay-stable, to handoff depth 50, across horizons 0–1000 and seeds 7/424242/20260831.
- The distinction the architecture claims (same world/different history vs different world) is real and measured.
- **The residue grows exactly linearly with history (R² = 1.0); the world grows sublinearly; by H1000 the residue exceeds the world 2.16:1.** "Transmit state, not history" is false for this engine at scale — the residue IS the history.
- **The state vector the brief requires is only ~60% representable.** The world components survive perfectly; the agent/task components (objective, authority, staleness, next transition, cold state) do not exist in the representation.
- **The state-transmission hypothesis (as a worker-comprehension claim) is NOT TESTED and NOT SUPPORTED by this environment.** The representation half is SUPPORTED; the cognition half is INCONCLUSIVE-for-environmental-reasons, which the brief's own discipline requires distinguishing.

### Classification

- State *representation* transmission: **SUPPORTED** (measured).
- State *economy* (compactness independent of history): **FALSIFIED** (residue grows linearly with history).
- Worker *comprehension* of transmitted state: **NOT TESTED** (no worker available; reported as an environment boundary, not a number).

### Is any architectural change justified?

No change to the frozen P-005 semantics is justified by these results, and none was made. The deficiency (no task/agent-state representation) is a *scope* boundary, not a defect in the world-derivation engine. If the experiment is to be continued, the next experiment needs (a) a reproducible LLM worker path, and (b) an explicit decision on whether "Somnium state" means the world-derivation residue or an added task-state layer — adding the latter is a new feature, not a measurement, and must not touch the frozen tag.
