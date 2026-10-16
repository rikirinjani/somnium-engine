# S008 — Incremental Derivation Equivalence

**Verdict: PASS** (semantic equivalence fully established; prefix-walk scaling materially improved — with documented caveats)

**Branch:** `s008` (isolated worktree `Somnium-s008`) · **Ancestor:** `443d3d9` (frozen P-007)
**Report artifacts:** `experiments/s008/results/*.json`

---

## 1. Starting commit and environment

| Field | Value |
|---|---|
| Branch | `s008` |
| Starting commit | `443d3d9` (frozen P-007 — NOT S007) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s008` |
| Status at start | clean (fresh worktree) |
| CPU | AMD Ryzen 3 4300U |
| vCPU | 4 |
| RAM | 7.9 GB |
| OS | win32 / x64 |
| Node | v22.23.2 |
| TypeScript | 5.9.3 |

S007 (`967f82f` / tag `s007-final`) was not modified. P-007, P-005, S006 untouched.

## 2. Baseline verification

From `443d3d9`, before any experiment code:

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624 pass** (24 files) |
| `npx tsx scripts/verify-facts.ts` | **3 / 3 PASS** |
| Frozen Verrin hash | `e4c79cec` ✅ |
| Frozen Ordos hash | `51f32b2e` ✅ |

## 3. Existing `derive()` dependency map

Read from source (`src/derive/world-state.ts`, `src/derive/propagation.ts`), not inferred.

`derive(canon, interventions, rp?)` runs, in order:

| # | Stage | Owner | Cost |
|---|---|---|---|
| 1 | `assertCanonIdSpace` (memoized) | world-state.ts:428 | O(model), memoized |
| 2 | `buildModel` → `resolveEdges` + intervention fold | propagation.ts:193 | **O(model + H)** |
| 3 | `propagateJudgments` (Phase A positive fixpoint, Phase B greatest unfounded set, Phase C soft support, Phase D conflicts) | propagation.ts:643 | O(model × passes) |
| 4 | status projection | world-state.ts:463 | O(model) |
| 5 | `computeEffectiveFacts` + `applyFactInterventions` | world-state.ts:157/226 | O(model) + **O(H)** |
| 6 | `computeWorkStatuses` | world-state.ts:273 | O(model) |
| 7 | `detectContradictions` | contradictions.ts:107 | O(conflicts) |
| 8 | `temporalViolations` | propagation.ts:832 | O(model) |
| 9 | `evaluateConstraints` | constraints.ts:48 | O(model) |
| 10 | `effectiveSemanticState` (7 dimensions) | semantic.ts:150 | O(model) |
| 11 | `stateHash` (O(model)) + `identityHash` (**O(H)**) | world-state.ts:530 | mixed |

**The O(H) parts are exactly four:** the `buildModel` fold, the `resolveEdges` scan, the `applyFactInterventions` fold, and `canonicalInterventions` for `identityHash`. Everything else is O(model).

**Order dependencies identified (these bound what a reduction may do):**
- `resolveEdges` — last `severEdge`/`addEdge` per edge id wins (sorted at the end).
- `overriddenCells` — last `setFact`/`relocate` per `(subject, predicate)` cell wins.
- `negated`/`forcedBy`/`retracted` — set-like, idempotent.
- **`applyFactInterventions` reuses the replaced fact's id** (`overrideFact`), and a `retractFact` permanently removes an id — a later write to that cell mints a synthetic `derived:<cell>` id. This is the subtle one.
- **Rejected writes** (`fact-write-illegal`) produce contradiction records whose id is `contra:<subject>:fact-write-illegal:<reason>` — which does **not** include the value, so `detectContradictions` keeps the **first** per id.

## 4. Incremental design

```
W0 = derive(canon, [])
W_{k} = step(W_{k-1}, I_k)
```

`step` is defined in `experiments/s008/incremental.ts`:

```ts
step(canon, prev, iv) = {
  chain: reduceChain(canon, [...prev.chain, iv]),
  world: derive(canon, chain),          // <-- derive stays the SOLE oracle
}
```

**Architectural rule honoured.** There is no second semantic engine. `derive` computes every semantic fact; `step` only *re-encodes the accumulated history* so that `derive` sees a bounded chain. The carried state is the reduced chain.

`reduceChain` is a **subsumption** encoding (order-preserving — survivors keep their relative order):

| kind | rule | why |
|---|---|---|
| `setFact`/`relocate` (legal) | keep **last** per cell | last-write-wins |
| `setFact`/`relocate` (rejected) | keep **first** per contradiction id | `detectContradictions` keeps first per id |
| `negateEvent` / `forceEvent` | keep **last** per target | set-like accumulators |
| `retractFact` | keep **first** per fact id | a retracted id can never return |
| `severEdge` / `addEdge` | keep **last** per edge id | `resolveEdges` is last-op-wins |

### Documented duplication (per the S008 spec)

The reduction encodes the *subsumption* consequences of the fold — it is **not** a semantic rule (it never decides what a world means), but it does mirror four fold facts: last-write-per-cell, last-op-per-edge, first-retract-per-id, first-rejected-per-id. If any of those fold rules changed, the reduction could silently diverge. Mitigation: the differential harness (`equivalence.ts`) compares against `derive` on every run, so any drift is caught as a failure rather than hidden. **No source file was modified** — the duplication is confined to `experiments/s008/`.

## 5. Differential-equivalence results

Required invariant, checked on every case:
`semanticState(legacy) === semanticState(incremental)` ∧ `stateHash` equal ∧ `worldDiff(legacy, incremental)` empty.

| Suite | Cases | Passed |
|---|---|---|
| Constructed + random (verrin) | 527 | **527** |
| Constructed + random (ordos) | 527 | **527** |
| Adversarial matrix (verrin) | 297 | **297** |
| Adversarial matrix (ordos) | 281 | **281** |
| **Total** | **1,632** | **1,632** |

Lineage (`identityHash`, `WorldState.interventions`) is deliberately **not** compared — the incremental path carries a reduced chain by design, and `stateHash` excludes provenance.

**One divergence was found and fixed during development** (recorded honestly): a `write+retract+write` case where both writes were *rejected* (`instance_of` with a non-EventType value). The first reduction dropped the earlier write, changing the contradiction record from `V1` to `V2`. Root cause: the contradiction id omits the value, so the **first** rejected write per id is the one that survives. Fixed by splitting legal writes (keep last per cell) from rejected writes (keep first per contradiction id).

## 6. Adversarial results

Every dimension of the P-007 declaration table exercised, plus constraints, causal structure, temporal behaviour and convergence:

| Dimension | Coverage | Result |
|---|---|---|
| statuses | negate/force each event, pairs, sequences | ✅ |
| facts | retract/rewrite each fact, new cells, relocate | ✅ |
| edges | sever/readd each edge, order pairs | ✅ |
| workStatuses | via fact/event changes | ✅ |
| contradictions | forced-vs-negated, forced-vs-refuted, excludes, invariant | ✅ |
| temporalViolations | forced PRECEDES endpoints, validity windows | ✅ |
| constraintViolations | AT_MOST_ONE force-both, force-one, force-then-negate | ✅ |
| causal | grouped/disjunctive support, propagation, bootstrap | ✅ |
| convergence | idempotent, commutative, redundant rewrites | ✅ |

## 7. Invalid-input results

`legacy rejects I ⇔ incremental rejects I`. In Somnium a rejected intervention is a recorded `fact-write-illegal` contradiction (not an exception); thrown errors must also match.

| Case | throw-equal | semantic | hash | diff |
|---|---|---|---|---|
| illegal subject | ✅ | ✅ | ✅ | ✅ |
| illegal id-shaped object | ✅ | ✅ | ✅ | ✅ |
| illegal-then-legal | ✅ | ✅ | ✅ | ✅ |
| legal-then-illegal | ✅ | ✅ | ✅ | ✅ |
| force-undeclared event | ✅ | ✅ | ✅ | ✅ |

Validation was **not weakened** — the reduction reuses `factAssertionError` + `buildFactVocabulary`, the same functions `buildModel` and `validateCanon` use.

## 8. Branch-isolation results

| canon | branches | depth | isolation | legacy match | convergence | distinct hashes |
|---|---|---|---|---|---|---|
| verrin | 6 | 12 | ✅ | ✅ | ✅ | 6 |
| ordos | 6 | 12 | ✅ | ✅ | ✅ | 6 |

Each branch was advanced in lockstep and re-checked against `derive` at every step: stepping one branch never changed a sibling, and no shared mutable state was observed. Convergence behaviour is preserved (identical histories share a hash).

## 9. Determinism results

| canon | trials | horizon | legacy stable | incremental stable | cross-equal | diff empty |
|---|---|---|---|---|---|---|
| verrin | 5 | 200 | ✅ | ✅ | ✅ | ✅ |
| ordos | 5 | 200 | ✅ | ✅ | ✅ | ✅ |

Repeated identical inputs produce identical semantic state, `stateHash` and `WorldDiff`. No parallelism was introduced.

## 10. Performance comparison

Legacy `derive(canon, history[0..k])` vs incremental `step` fold. Times in ms unless noted.

### verrin

| H | legacy final | incr final | legacy walk | incr walk | reduced chain | hashes match |
|---|---|---|---|---|---|---|
| 10 | 0.5 | 3.8 | 3 | 3 | 10 | ✅ |
| 100 | 1.3 | 80.7 | 97 | 82 | 71 | ✅ |
| 1,000 | 15.2 | 3,212 | 6,680 | 3,389 | 210 | ✅ |
| 10,000 | 179.7 | 55,381 | *infeasible* | 55,381 | **228** | ✅ |
| 100,000 | 1,870.8 | 564,700 | *infeasible* | 564,700 | **228** | ✅ |

### ordos

| H | legacy final | incr final | legacy walk | incr walk | reduced chain | hashes match |
|---|---|---|---|---|---|---|
| 10 | 0.5 | 4.0 | 3 | 3 | 9 | ✅ |
| 100 | 1.4 | 75.5 | 75 | 71 | 73 | ✅ |
| 1,000 | 11.8 | 2,292 | 5,494 | 2,276 | 171 | ✅ |
| 10,000 | 136.0 | 32,659 | *infeasible* | 32,659 | **174** | ✅ |
| 100,000 | 1,422.0 | 328,890 | *infeasible* | 328,890 | **174** | ✅ |

**The reduced chain saturates**: verrin 228, ordos 174 at both H=10,000 and H=100,000 — independent of H. This is the property that makes the step O(model).

**Prefix-walk speedup** (legacy is O(H²); extrapolated for the infeasible rows):

| H | legacy walk (measured/extrapolated) | incremental walk | speedup |
|---|---|---|---|
| 1,000 | 6,680 ms | 3,389 ms | **2.0×** |
| 10,000 | ≈ 668 s | 55.4 s | **≈ 12×** |
| 100,000 | ≈ 18.5 h | 564.7 s | **≈ 118×** |

**Important caveat — the one-shot final derive is NOT improved.** `incrementalDerive(H)` folds all H steps, so it costs O(H × model); a single `derive(canon, history)` costs O(H) and is far cheaper (verrin H=100,000: 1.87 s vs 564.7 s). The incremental path wins only when the *intermediate* worlds are needed (the walk).

## 11. Long-horizon results

H=100,000 completed for both canons. The incremental fold produced the same `stateHash` as the legacy final derive at every horizon (`hashesMatch=true` throughout), including H=100,000. The legacy **walk** is infeasible at H=10,000 (≈11 min extrapolated) and H=100,000 (≈18.5 h) — recorded as a limit, not redesigned around. The incremental walk at H=100,000 is 564.7 s (verrin) / 328.9 s (ordos).

## 12. Regression results

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Frozen Verrin hash | `e4c79cec` unchanged |
| Frozen Ordos hash | `51f32b2e` unchanged |
| `src/` diff vs `443d3d9` | **empty** |
| S007 modified | **no** |
| New files | only `experiments/s008/` |

No frozen test was weakened. No source file was modified.

## 13. Architectural implications

- **The P-007 principle holds**: `stateHash` and `worldDiff` still derive from one canonical semantic representation; S008 adds no second authority. `derive` remains the only thing that defines what a world means.
- **The bounded semantic state S007 measured is directly exploitable.** S007 showed the *representation* saturates; S008 shows the *intervention history* can be reduced to the same bounded size without changing meaning. The reduction saturates at exactly the model's operation space (verrin 228, ordos 174).
- **The remaining per-step cost is O(model), not O(1).** `step` still re-runs the full propagation fixpoint every step. A genuinely O(1)-amortised step would require an incremental fixpoint (a much larger architectural change) and is out of scope here.
- **The one real architectural cost** is the documented subsumption duplication. It is confined to the experiment and continuously checked against `derive`.

## 14. Verdict: PASS

| Success condition | Met? |
|---|---|
| Incremental derivation is **semantically equivalent** | ✅ 1,632 / 1,632 differential cases |
| It **materially improves prefix scaling** | ✅ O(H) vs O(H²); 2× at H=1,000 → ≈118× at H=100,000 |

With two explicit caveats:
1. The **one-shot final derive is slower** incrementally (the fold does H steps); the win is confined to the prefix walk.
2. The step is **O(model), not O(1)** — it still re-derives the full semantic state; only the history scan is eliminated.

## 15. Recommendation for future production implementation

1. **Adopt chain reduction as a production optimisation only where the walk is needed** — e.g. interactive timeline scrubbing, branch genealogy, experiment sweeps that materialise every prefix. It is *not* a win for a single `derive(canon, history)` call.
2. **If adopted, move `reduceChain` into `src/` and drive it from the same fold** — expose `foldInterventions`/`buildModelFromFolded` in `propagation.ts` and have `reduceChain` consume the model's accumulators, removing the documented duplication entirely. This is the clean end-state and was deliberately **not** done here to keep S008 non-invasive (no source modification).
3. **Next optimisation, if desired:** an incremental propagation fixpoint (recompute only the affected subgraph) would reduce the per-step constant from O(model) toward O(delta). That is the change that would make the one-shot case competitive too — but it is a much larger, higher-risk change and should be its own experiment.

---

## Appendix — reproducing

```bash
# baseline (from 443d3d9)
npm run check && npm test && npx tsx scripts/verify-facts.ts

# full experiment (all phases, H up to 100,000)   ~20 min on the baseline host
npx tsx experiments/s008/run-all.ts
npx tsx experiments/s008/run-all.ts --quick      # bounded smoke run

# focused diagnostics
npx tsx experiments/s008/smoke.ts                # equivalence smoke
npx tsx experiments/s008/reduction-scale.ts      # reduced-chain saturation
npx tsx experiments/s008/debug-case.ts           # the write+retract+write counterexample
```

**Result JSONs:** `experiments/s008/results/{equivalence,matrix,branching,determinism,performance}.json`.

**Isolation:** all S008 code lives under `experiments/s008/`. `src/` is unmodified from `443d3d9`; S007, P-007, P-005 and S006 are untouched; frozen canon hashes unchanged.
