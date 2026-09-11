# S016 — Propagation Observability / Reference Re-evaluation Footprint

**Verdict: HOLD**

The authoritative propagation engine **can** be instrumented without semantic change: a per-stage footprint (considered / recomputed / changed) is exposed deterministically, and all 624 tests plus verify-facts and the frozen hashes are unchanged. But the footprint it exposes is **global, not local**: Phase A scans every node on every pass and its from-scratch fixpoint moves ≈ the **entire model** on every intervention (verrin 14/14, ordos 16/17). The S015 reverse-dependency closure, by contrast, was local (0.4–5.2 nodes). So the reference does **not** expose a local invalidation boundary as implemented — the boundary is an artifact of *how the fixpoint is executed*, not of what the change affects.

Per the brief, a HOLD is acceptable and preferable to forcing an incremental algorithm from insufficient observability.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **HOLD** |
| Instrumentation semantics-preserving? | **yes** (624/624, verify-facts 3/3, hashes frozen) |
| Footprint deterministic? | yes |
| Footprint **local**? | **no — global** |
| Useful incremental boundary exposed? | **no, not without changing execution** |
| Semantic authority | singular — observation only, no alternative evaluator |

## 2. Research question

> Can the authoritative `propagateJudgments` expose, per intervention and per stage, which judgments were *considered*, *recomputed*, and *changed*, without changing semantics?

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `dabc4a1` (frozen S012) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s016` |
| Branch | `s016` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Verrin / Ordos | `e4c79cec` / `51f32b2e` ✅ |
| Working tree | clean |

Re-verified **after** instrumentation: identical.

## 5. Reference propagation map

| Stage | Scope | Behaviour |
|---|---|---|
| Phase A `positiveFixpoint` | **all nodes, every pass** | sticky three-valued closure; each node starts NEITHER and is decided once |
| Phase B `unfoundedSet` | NEITHER candidates only | global candidate-shrink loop; survivors → FALSE |
| Phase C `softSupported` | per node | ENABLES → SOFT support only |
| Phase D conflicts | per node + edge lists | `forcedBy`/`negated`/`excludes`/`invariant` |

## 6. Observability definitions

```
considered ⊇ recomputed ⊇ changed
```

- **considered** — nodes inspected by the stage's scan.
- **recomputed** — nodes for which the stage actually re-evaluated a judgment (Phase A: `current === "NEITHER"`; Phase B: each candidate visited).
- **changed** — nodes whose resulting value differs from the stage's **prior value in this run** (Phase A: from NEITHER; Phase B: candidate removal).

Measured: the `⊇` chain holds in both stages.

## 7–8. Phase A / Phase B instrumentation

Added to `src/derive/propagation.ts` (observation only):

- `StageFootprint { considered, recomputed, changed, iterations, globalScan, changedNodes }`
- `positiveFixpoint(model, fp?)` and `unfoundedSet(model, truth, fp?)` record into an optional sink; evaluation logic is untouched.
- `propagateJudgments(model, footprint?)` threads the sink; new `propagateJudgmentsWithFootprint(model)` returns `{ judgments, conflicts, footprint }`.

`buildModel` and the default `propagateJudgments(model)` path are unchanged.

## 9. Reference footprint model

Per-intervention averages (200-step random histories):

| Canon | Kind | n | A.considered | A.recomp | **A.changed** | B.considered | B.changed | closure | **footprint-changed outside closure** | A.iters |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| verrin (14) | setFact | 70 | 30 | 14.7 | **13.9** | 0.1 | 0.1 | 0.9 | **14.0** | 2.2 |
| verrin | negateEvent | 29 | 30 | 14.9 | **13.8** | 0.2 | 0.2 | 4.2 | **9.8** | 2.1 |
| verrin | retractFact | 33 | 31 | 14.8 | **13.9** | 0.1 | 0.1 | 0.7 | **13.7** | 2.2 |
| verrin | addEdge | 15 | 30 | 14.9 | **13.8** | 0.2 | 0.2 | 0.4 | **14.0** | 2.1 |
| verrin | forceEvent | 25 | 31 | 14.5 | **14.0** | 0.0 | 0.0 | 5.2 | **8.8** | 2.2 |
| verrin | severEdge | 28 | 32 | 14.6 | **14.0** | 0.0 | 0.0 | 0.8 | **14.0** | 2.3 |
| ordos (17) | setFact | 70 | 40 | 19.5 | **15.9** | 0.9 | 0.9 | 0.9 | **16.8** | 2.4 |
| ordos | negateEvent | 29 | 38 | 19.2 | **15.8** | 0.9 | 0.9 | 1.4 | **15.2** | 2.2 |
| ordos | retractFact | 33 | 40 | 19.3 | **15.9** | 0.8 | 0.8 | 0.6 | **16.4** | 2.4 |
| ordos | addEdge | 15 | 38 | 19.3 | **16.1** | 0.7 | 0.7 | 0.4 | **16.9** | 2.3 |
| ordos | forceEvent | 25 | 40 | 19.1 | **16.0** | 0.8 | 0.8 | 1.7 | **15.2** | 2.4 |
| ordos | severEdge | 28 | 41 | 19.5 | **15.8** | 0.9 | 0.9 | 0.7 | **16.7** | 2.5 |

## 10. S015 closure comparison

1. **Correctly predicted:** the *directly* changed node and, for `negateEvent`/`forceEvent`, a real chunk of the cascade (closure 4.2–5.2 vs 0.4–0.9 for facts/edges).
2. **Missed:** essentially the whole model — because the reference fixpoint is recomputed from NEITHER and therefore *changes* nearly every node every run.
3. **Over-approximated:** nothing; the closure is strictly smaller than the footprint.
4. **From Phase A:** all of it. Phase A's `considered` = node count × passes (30/14 ≈ 2.2 passes) and `changed` ≈ node count.
5. **From Phase B:** almost nothing — Phase B is genuinely cheap here (0–1 candidates changed).
6. **Inherently global:** Phase A (and Phase B's candidate set).

## 11. S015 counterexample reproduction

S015's mismatches (1–3 nodes outside the closure whose judgment changed *versus the previous prefix*) are explained by the same fact: **the reference has no notion of "unchanged since last time"** — it recomputes the whole fixpoint from NEITHER. S015 compared *previous-prefix judgment vs current-prefix judgment* (the true semantic delta, small); S016 measures *this-run initial NEITHER vs final* (the footprint delta, ~whole model). The closure was never an over-approximation of the *footprint*; it approximates the *semantic delta*, and misses it because the reference exposes no semantic-delta signal.

The dependency graph was not patched, per the brief.

## 12. Vocabulary coverage

All seven operations exercised; the table above is the coverage matrix. `relocate` was not separately exercised (thin evidence, consistent with prior experiments). No operation produced a local footprint — the global behaviour is operation-independent.

## 13. Adversarial topology results

Not built (budget). The seed canons already contain fan-in (`REQUIRES` groups), fan-out, diamonds, shared support and a bootstrap cycle; the global footprint appears on all of them. Chains/trees/disconnected components are recorded as **not tested**.

## 14. Global-stage characterization

| Global stage | Why global | Does it change globally? | Can it be skipped safely? | What would be needed? | Exposed today? |
|---|---|---|---|---|---|
| Phase A `positiveFixpoint` | iterates `model.nodeIds` until sticky convergence | **yes** — from-scratch run redecides ~all nodes | only if the previous truth were reused (a semantic change) | a delta vs the previous run's truth | **no** |
| Phase B `unfoundedSet` | candidate set spans all NEITHER nodes | here, rarely (0–1 nodes) | sometimes, but knowing when needs cycle info | cycle membership | **no** |

**Key distinction:** *global scan* ≠ *global semantic change*. Phase B scans globally but changes little; Phase A both scans **and** changes globally — but only because it restarts from NEITHER.

## 15. Fixpoint boundary

No useful boundary exists in the current implementation:

```
local invalidation → local recomputation → global closure check → expansion
```

is **not** what the reference does. It does:

```
full reset (all NEITHER) → global sticky scan to fixpoint → global candidate shrink
```

So there is no local invalidation frontier to expose. A boundary would only appear if the engine were changed to seed from the previous truth — which is a **semantic-execution change**, explicitly out of scope here.

## 16. Semantic preservation

| Check | Result |
|---|---|
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Frozen hashes | unchanged |
| `buildModel` default | unchanged |
| `propagateJudgments(model)` default path | unchanged |

## 17. Determinism

The footprint is a pure function of the model: `positiveFixpoint`/`unfoundedSet` iterate `model.nodeIds` (sorted) and `[...candidates].sort()`, so `considered`/`recomputed`/`changed` and `changedNodes` are deterministic. Repeated runs produced identical statistics.

## 18. Instrumentation overhead

Not separately benchmarked (budget); the instrumentation adds three integer increments and one `push` per decided node in Phase A, and one increment per candidate visit in Phase B. It is O(1) per already-performed operation and does not add passes. Measured runs at H=200 showed no perceptible slowdown.

## 19. Long-horizon observation

Not run (budget). The global footprint is structural (Phase A restarts from NEITHER), so it does not depend on history length; the model size is bounded by the canon (S007), so the footprint is bounded too.

## 20. Branch behavior

Not separately run; the footprint is a pure function of `model`, and `model` is per-prefix, so two branches with the same prefix produce the same footprint for that prefix and independent footprints thereafter. No shared mutable state was introduced.

## 21. Future incremental design inputs

An incremental engine would need, from the reference:

1. **A semantic-delta signal, not a from-scratch footprint.** The reference must report *what changed relative to the previous prefix's truth*, not *what differs from this run's initial NEITHER*. That is the missing observation.
2. **Cycle membership** for Phase B, so a local change can know whether a bootstrap cycle is at risk without a global candidate scan.
3. **A stage-level "reconsidered" frontier** that is computed *against a prior state*.

**None of these are exposed today**, and (1) cannot be obtained without either changing the fixpoint's starting state or adding a comparison against a retained prior truth — the latter is pure observation and is the natural next step.

## 22. Limitations

- Only the seed canons + 200-step random histories; no synthetic topologies.
- The `changed` definition is *within-run* (vs initial NEITHER), which is why it is global; a *cross-run* delta was not instrumented.
- No overhead benchmark, no long-horizon run, no branch run (budget).
- Empirical only; no Big-O claim.

## 23. Productionization recommendation

**Instrumentation is safe to keep; an incremental engine is not yet justified.**

1. The instrumentation is a semantics-preserving, deterministic observation — a reasonable permanent addition.
2. The **missing signal** is a *cross-prefix* judgment delta (current truth vs previous truth). That is pure observation (no semantic change) and is the correct next experiment.
3. Only after that signal exists can a local invalidation boundary be defined; S015 already showed a dependency-only closure is unsound.

**Recommended next experiment:** *propagation delta observability* — instrument the fixpoint to report, per node, the change relative to a supplied prior judgment map (previous prefix). If that delta is small and matches the true semantic change, it is the boundary an incremental engine needs.

## 24. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s016
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s016/probe.ts
```

| Run | Result |
|---|---|
| Baseline / post-instrumentation | 624/624, verify-facts 3/3, hashes frozen |
| Phase A considered | all nodes × ~2.2–2.5 passes |
| Phase A changed | ≈ whole model (14/14 verrin, 16/17 ordos) |
| Phase B changed | 0.0–0.9 |
| S015 closure | 0.4–5.2 (local) |
| Footprint local? | **no** |

## 25. Files changed

**`src/` (instrumentation only — permitted):**

```
src/derive/propagation.ts   StageFootprint + PropagationFootprint; optional sinks in
                            positiveFixpoint/unfoundedSet/propagateJudgments;
                            new propagateJudgmentsWithFootprint
```

**Experiment (isolated):**

```
experiments/s016/probe.ts
experiments/s016/REPORT.md
```

No incremental implementation, no cache, no alternative evaluator. `buildModel` default unchanged. P-007 and frozen S005–S015 untouched; nothing merged.

## 26. Commit hashes

| | |
|---|---|
| Ancestor | `dabc4a1` |
| S016 experiment commit | `{{S016_COMMIT}}` |
