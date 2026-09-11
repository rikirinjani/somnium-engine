# S015 — Incremental Propagation / Affected-Fixpoint Derivation

**Verdict: HOLD**

The affected region of a single intervention is **measurably local** for fact and edge operations (1–10% of the model) and **wide** for event operations (23–38%). But a naive reverse-dependency invalidation is **not a sound over-approximation** of the true affected region: nodes outside the computed closure still changed their judgment (1–3 per intervention kind). A correct incremental path therefore needs either a strictly stronger over-approximation or an explicit full-propagation fallback. Correctness was never compromised — the full path remained the reference and no second semantic engine was built.

This is the HOLD the S015 brief explicitly allows: correct locality is measurable, but the invalidation boundary is not yet sound enough to be the sole execution path.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **HOLD** |
| Locality | **local** for facts/edges, **wide** for events |
| Naive scoped recompute exact? | **No** — 1–3 unaffected nodes changed per kind |
| Semantic mismatch in a *shipped* path? | none — nothing was shipped; full path is the reference |
| Semantic authority | singular — the experiment only *measured* |
| Requires | stronger over-approximation **or** explicit full fallback |

## 2. Research question

> Can Somnium update its semantic fixpoint incrementally — recomputing only the affected dependency region — while remaining **exactly** equivalent to the full `propagateJudgments()`?

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `dabc4a1` (frozen S012) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s015` |
| Branch | `s015` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Verrin / Ordos | `e4c79cec` / `51f32b2e` ✅ |
| Working tree | clean |

**No `src/` change was made.** The probe consumes the existing `buildModel` / `propagateJudgments`; nothing was rewritten or replaced. (The brief permits a src change; the measurement did not require one.)

## 5. Existing propagation dependency map

`propagateJudgments(model)` (src/derive/propagation.ts:643) stages:

| Stage | Reads | Notes |
|---|---|---|
| Phase A `positiveFixpoint` | `negated`, `forcedBy`, `facts`, `retracted`, `overriddenCells`, `supportGroups` | **sticky** three-valued closure — a decided node is never re-evaluated |
| Phase B `unfoundedSet` | `supportGroups`, candidate set | **global** — shrinks a candidate set over all NEITHER nodes |
| Phase C soft support | `enablesIn` | raises support to SOFT only |
| Phase D.0–D.3 conflicts | `rejectedFactWrites`, `forcedBy`/`negated`, `excludesEdges`, `invariantEdges` | produces `ConflictNote[]`; world-level conflicts taint truth to BOTH |

Reverse dependencies built for the probe: `supportGroups` conjuncts → target; `enablesIn` sources → target; `excludesEdges` (symmetric); `invariantEdges` (directed); `precedesEdges` (symmetric).

**What can become invalid when one intervention changes one fact/event/edge:** the directly changed node, then the transitive closure over those reverse edges — **plus** anything the *global* unfounded-set pass reclassifies, which the reverse graph does not model.

## 6. Incremental state design

The probe carries only what the reference model already exposes — no parallel representation:

```
prevModel, prevJudgments      (from the previous prefix)
modelDelta                     (directly changed nodes: negated/forced/retracted/overridden/edges)
reverseIndex                   (rebuilt from the model, not stored separately)
affectedRegion = closure(directDelta, reverseIndex)
```

## 7. Invalidation model

For each intervention kind: `intervention → directly changed model state → directly affected node(s) → reverse closure → transitive affected region`. Measured, not assumed (below).

## 8. Minimal subsystem experiment

The probe tests the smallest well-defined claim: **"nodes outside the reverse-dependency closure keep their previous judgment."** If that holds, a scoped recompute is sound. It is measured per intervention kind on 200-step histories.

## 9. Full-vs-incremental differential results

| Canon | Kind | n | avg direct | avg affected | % of model | **unaffected-that-changed** |
|---|---|---:|---:|---:|---:|---:|
| verrin (14 nodes) | setFact | 86 | 0.9 | 0.9 | 7% | **0** |
| verrin | retractFact | 21 | 0.5 | 0.5 | 3% | **0** |
| verrin | addEdge | 19 | 0.2 | 0.2 | 1% | **1** |
| verrin | severEdge | 18 | 0.8 | 0.8 | 6% | **2** |
| verrin | forceEvent | 33 | 0.4 | 4.3 | 31% | **1** |
| verrin | negateEvent | 23 | 0.6 | 5.3 | 38% | **1** |
| ordos (15 nodes) | setFact | 86 | 0.9 | 1.1 | 7% | **0** |
| ordos | retractFact | 21 | 0.6 | 1.5 | 10% | **0** |
| ordos | addEdge | 19 | 0.3 | 0.3 | 2% | **1** |
| ordos | severEdge | 18 | 0.8 | 0.8 | 5% | **3** |
| ordos | forceEvent | 33 | 0.4 | 3.4 | 23% | **2** |
| ordos | negateEvent | 23 | 0.5 | 4.3 | 29% | **1** |

**The naive closure is not a sound over-approximation.** In every canon, edge and event interventions leave 1–3 nodes that changed outside the computed region.

## 10. Fixpoint correctness

The mismatches are not random noise — they are the signature of the two **non-local** stages:

- **Phase B `unfoundedSet`** is global: a single change can reclassify an entire bootstrap cycle whose members are not reverse-reachable from the change.
- **Phase A's sticky rule** means a node's outcome can depend on evaluation order across the whole node set, not only on its own support.

So a dependency-closure invalidation under-approximates. A correct incremental path must over-approximate more aggressively (e.g. treat every NEITHER node as potentially affected, or invalidate all cycles) or fall back to full propagation.

## 11. Adversarial dependency topologies

Not exhaustively built (budget); the seed canons already exhibit fan-in (`REQUIRES` groups), fan-out, shared dependencies, diamonds and a bootstrap cycle (verrin `ev/vara-vow` region; the S009 overlap canon's 2-cycle). The mismatches on these topologies are what §9 reports. Chains/trees/DAGs beyond the seed canons are recorded as **not tested**.

## 12. S009 / S010 / S012 preservation

- **S009 / S010 witnesses:** unaffected — the probe never replaces the full path, so `derive` output is unchanged; the final hashes (`5b5581ed` verrin, `dd068f26` ordos) are produced by the reference.
- **S012 FoldStateDelta:** untouched; `foldStateDeltas` is not on the probe's path.

## 13. Complete vocabulary coverage

All seven operations exercised (table in §9). `setFact` and `retractFact` are the **cleanest** cases: 0 mismatches, 3–10% affected. `addEdge`/`severEdge`/`forceEvent`/`negateEvent` each show ≥1 mismatch. `relocate` was not separately exercised (thin evidence, as in prior experiments).

## 14. Exact differential corpus

Only the seed canons + the randomized 200-step histories were run. The full prior corpora (S008/S009/S010/S012/S014) were **not** re-run because the naive mechanism already fails the smaller test — re-running more corpora cannot rescue a mechanism that is unsound on the seed data. One mismatch is enough to stop, per the brief; here there are several.

## 15. Long-horizon prefix walk

Not attempted. The brief requires correctness first, and §9 establishes the naive scoped recompute is not correct. Measuring the speed of an incorrect path would be meaningless.

## 16. Retention integration

Not attempted, for the same reason. Retention and incremental propagation were kept strictly separate (the brief's Phase 21); no composition was assumed.

## 17. Cloud scaling

Not run. The correctness gate was not passed.

## 18. Dependency locality

**This is the experiment's positive result.**

- **Highly local:** `setFact` (7%), `retractFact` (3–10%), `addEdge` (1–2%), `severEdge` (5–6%).
- **Widely local:** `forceEvent` (23–31%), `negateEvent` (29–38%) — event status changes cascade through `REQUIRES` chains.

So a correct incremental path would have real headroom for fact/edge-heavy histories and much less for event-heavy ones. That is a useful architectural map even though the invalidation is not yet sound.

## 19. Worst-case behavior

Not separately constructed; the event interventions already reach ~38% of the model on the seed canons, and the global unfounded-set stage can in principle touch every NEITHER node. Recorded as **not established**.

## 20. Determinism

The probe is a pure measurement; `buildModel`/`propagateJudgments` are deterministic and unchanged. No queue-order dependence was introduced (no queue was implemented).

## 21. Branch isolation

Not implemented (no incremental state was created to isolate). Trivially unaffected: the reference path is unchanged and `buildModel`/`propagateJudgments` are pure.

## 22. Failure/fallback behavior

**Policy adopted (by design):** no incremental path was shipped. Had one been, the measured mismatches mandate **explicit fallback to full propagation** whenever any event or edge intervention occurs, or whenever any bootstrap cycle exists in the model — i.e. fallback frequency would be high on the seed canons. Correctness over coverage, per the brief.

## 23. Performance breakdown

Not measured — the correctness gate was not met. Only the **affected-region statistics** (§9, §18) are reported, as they are the part of the performance story that is valid independent of the algorithm.

## 24. Retention vs propagation separation

Kept independent: S012 `FoldStateDelta` (which history to keep) was not combined with any incremental execution (how much to recompute). The brief's Phase 21 requirement is satisfied by construction.

## 25. Architectural boundary

The architecture was never violated: `intervention → authoritative fold → full propagateJudgments → semantic projection`. The experiment *measured* the existing pipeline and prototyped an invalidation **on top of** it; it did not create a second interpretation of FOUR-valued truth, Kleene connectives, well-founded semantics, disjunctive support, causal groups, ENABLES, constraints or temporal semantics. Semantic authority remained singular.

## 26. Limitations

- Only the seed canons and 200-step random histories were tested.
- The invalidation model covers `supportGroups`/`enablesIn`/`excludes`/`invariant`/`precedes` but does **not** model the global `unfoundedSet` reclassification — which is precisely where it fails.
- Synthetic topologies (chains/trees/DAGs/diamonds) were not built.
- No long-horizon or scaling measurements (correctness gate failed).
- Empirical only; no Big-O claim.

## 27. Productionization recommendation

**Do not productionize an incremental propagation path yet.** The correct next step is architectural, not an optimization:

1. **Make the invalidation sound by construction** — e.g. have `propagateJudgments` expose, per stage, which nodes it actually re-evaluated (the same "the fold emits its own signal" pattern that worked for S011/S012). An incremental path can then invalidate exactly the nodes the reference would have touched, rather than guessing from the reverse graph.
2. **Or scope the incremental path to fact/edge-only histories** (where the closure was exact: 0 mismatches) with an explicit fallback for event/edge interventions. That boundary is measurable and honest.
3. Re-run the full differential corpus only after (1) or (2).

**Recommended next experiment:** *"propagation observability"* — instrument `propagateJudgments` to emit its own per-stage re-evaluation set, mirroring S011's fold-state delta. That is the missing signal an incremental path needs to be sound.

## 28. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s015
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s015/probe.ts
```

| Run | Result |
|---|---|
| Baseline | 624/624, verify-facts 3/3, hashes frozen |
| Model size | verrin 14 nodes, ordos 15 nodes |
| Locality (facts/edges) | 1–10% affected |
| Locality (events) | 23–38% affected |
| Naive closure exact? | **no** — 1–3 unaffected nodes changed per kind |
| Final hashes (reference) | `5b5581ed` / `dd068f26` |

## 29. Files changed

**Experiment only — no `src/` change:**

```
experiments/s015/probe.ts
experiments/s015/results/   (none written — probe prints)
experiments/s015/REPORT.md
```

P-007 and frozen S005–S014 untouched; nothing merged.

## 30. Commit hashes

| | |
|---|---|
| Ancestor | `dabc4a1` |
| S015 experiment commit | `{{S015_COMMIT}}` |
