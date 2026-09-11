# S025 — Incremental Phase-A Fixpoint Equivalence

**Verdict: BLOCKED**

A shadow incremental Phase A — reset the affected dependency closure to `NEITHER`, then run the **authoritative** seeded Phase A — is **not** equivalent to the from-scratch reference: **152 of 800 prefixes diverge (19.0%)**. The first divergence has **3 nodes changing outside an 11-node reset closure**. This is the S015/S017 finding resurfacing at the Phase-A level: the reverse-dependency closure **under-approximates** the set of nodes the fixpoint actually re-decides, so any closure-based reset leaves stale values.

Closing the gap requires resetting a **superset** — and on this corpus the only sound superset is effectively the whole model, i.e. **from-scratch propagation**. That is the brief's BLOCKED condition.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **BLOCKED** |
| Prefixes tested | 800 |
| Divergent prefixes | **152 (19.0%)** |
| First divergence | ordos prefix 5, `negateEvent` — **3 nodes outside an 11-node reset** |
| Root cause | dependency closure **under-approximates** the re-decided set |
| Second engine? | no — the candidate reused `positiveFixpoint` verbatim |
| Baseline | 624/624 · verify-facts 3/3 · hashes frozen |

## 2. Research question

> Can Phase A be implemented incrementally using S021's exact support aggregates while producing exactly the same judgments as the authoritative from-scratch Phase A?

**Answer: not with a dependency-closure reset.**

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `19f6c98` (frozen S024) |
| Chain | S021 `dfa4cfa` → S022 → S023 → S024 `19f6c98` |
| Worktree | `C:\Users\think\Project_v2\Somnium-s025` |
| Branch | `s025` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Verrin / Ordos | `e4c79cec` / `51f32b2e` ✅ |

## 5. Shadow engine design (Phase 4)

The candidate reuses the **authoritative** `positiveFixpoint` (exposed as `phaseATruth(model, seed?)`) — **no second FOUR evaluator, no reimplemented support rule**. Its only novelty is *what it resets*:

```
intervention
  ↓ directChanged(prevModel, model)   (accumulator + edge + node-set deltas)
  ↓ closure over reverse-dependency index
  ↓ reset those nodes to NEITHER, keep the rest from the prior truth
  ↓ authoritative seeded positiveFixpoint
  ↓ candidate Phase A
```

This is **actual-change propagation over an affected region**, not speculative reachability — the S015 distinction is respected. The reverse index covers `supportGroups` conjuncts, `enablesIn` sources, `excludes` (symmetric), `invariant` (directed) and `precedes` (symmetric).

## 6. Differential result (Phase 9)

20 histories × H=20 per canon = **800 prefixes**, comparing the judgment map **at every prefix**:

| Metric | Value |
|---|---|
| Prefixes | 800 |
| **Divergent prefixes** | **152 (19.0%)** |
| First divergence | `ordos seed=0 prefix=5 iv=negateEvent:ev/vaela-invested` |
| Nodes mismatched at first divergence | **3** |
| Reset-closure size at first divergence | 11 |

**A final-state match with intermediate divergence is a failure**, and the divergence occurs early (prefix 5).

## 7. Root cause (Phase 18 classification)

**Dependency-index / support-loss handling.** The closure reset **under-approximates** the nodes the fixpoint re-decides:

- The from-scratch Phase A is a **sticky least fixpoint over the whole node set**; a support change can re-decide nodes that are not reverse-reachable from the directly-changed nodes (the S015/S017 result, now reproduced at the Phase-A level).
- The reset closure covered 11 nodes; **3 more changed**.
- Nodes left with a stale prior value are never re-evaluated (the seeded sticky rule skips decided nodes), so the candidate retains a value the reference has lowered or raised.

This is **not** an aggregate-bookkeeping bug — S021's aggregate is exact. It is a **reset-scope** problem.

## 8. Why this is BLOCKED, not merely HOLD

The candidate is sound **iff** the reset set is a superset of the re-decided set. Every attempt to make it a *sound* superset must add nodes until it covers the fixpoint's actual reach — and on this corpus the closure already covers most of the model while still missing 3 nodes. Widening it to a guaranteed superset means **resetting everything**, i.e. running the from-scratch propagation. So exact incremental Phase A is not achievable with the maintained aggregate/dependency state **without effectively recreating from-scratch propagation**.

Per the brief: *"Do NOT patch semantics blindly"* — and the brief's BLOCKED condition is met. **No further rules were added.**

## 9. Minimal witnesses (Phase 8)

The S019/S020 witnesses were exercised within the differential corpus (`forceEvent→negateEvent`, `setFact→retractFact→setFact`, support loss via `negateEvent`/`retractFact`/`severEdge`, support gain via `setFact`/`addEdge`/`forceEvent`, multi-fact cells, edge changes). The first divergence is a **support-loss** case (`negateEvent`), consistent with the S019 stale-`TRUE` mechanism — now shown to survive a dependency-closure reset.

## 10. What was NOT done (scope)

- **Randomized histories** at the brief's scale (100×20, 100×100, 50×1000) were not run: the candidate failed at 19% on the smallest corpus, so scaling was correctly stopped.
- **S024 synthetic SCC/OR corpus** differential not run (same reason).
- **Phase-B integration**, efficiency, long-horizon, state-size, branching, determinism were not run (correctness gate failed).
- No performance claims.

## 11. Shadow-engine audit (Phase 19)

The candidate calls the authoritative `positiveFixpoint` (`phaseATruth`) and the authoritative model builders. It implements **no** alternative support truth definition, no alternative FOUR evaluator, no alternative unfounded-set algorithm, no independent semantic projection. Its novelty is *reset scope*, not *meaning*. **No shadow engine.**

## 12. Minimum execution state (Phase 21)

| Class | Required |
|---|---|
| semantic state | the previous truth map |
| aggregate state | S021's per-group counts (proven exact) — **not the bottleneck** |
| dependency indexes | reverse index over support groups / ENABLES / excludes / invariants / precedes — **insufficient as a reset scope** |
| queue/frontier | not reached (the reset approach failed first) |
| topology state | node-set + edge endpoints (needed to even form `directChanged`) |
| history/lineage | none required |

**Conclusion:** incremental Phase A is **not** an exact execution optimization over the existing semantics under the aggregate/dependency state tested — closing the reset gap requires the full model.

## 13. Required final answers

| # | Answer |
|---|---|
| Exact with closure reset? | **No** — 152/800 diverge |
| Root cause | reset scope: the dependency closure under-approximates the re-decided set |
| Aggregate state sufficient? | **Yes** (S021 exact) — it is not the failure |
| Dependency index sufficient? | **No** — as a reset scope |
| Is new semantic machinery required? | **No** — but the only sound reset is the whole model = from-scratch |
| Is incremental Phase A exact? | **Not with the maintained aggregate/dependency state** |

## 14. Architectural deliverable

> **Incremental Phase A is BLOCKED under the reset-closure design.** The support aggregates are exact, but the *scope* of the reset cannot be bounded soundly by the dependency index: the sticky least fixpoint re-decides nodes the index does not reach. Exactness requires resetting the whole model, which is from-scratch propagation.

## 15. Limitations

- 800 prefixes (20 histories × H=20 × 2 canons); the first divergence is at prefix 5, so the corpus is adequate to refute the candidate but is not a large-scale study.
- Only the reset-closure design was tested; other incremental designs (e.g. a non-sticky chaotic iteration with a proven least-fixpoint start) were not attempted.
- Empirical only; no proof.

## 16. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s025
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s025/probe.ts
```

| Run | Result |
|---|---|
| Baseline | 624/624, verify-facts 3/3, hashes frozen |
| Prefixes | 800 |
| Divergent | **152 (19.0%)** |
| First divergence | ordos prefix 5, `negateEvent`, 3 nodes, reset=11 |

## 17. Files changed

**`src/` (experimental, isolated to S025):**

```
src/derive/propagation.ts   new phaseATruth(model, seed?) -> positiveFixpoint
```

**Experiment:**

```
experiments/s025/probe.ts
experiments/s025/REPORT.md
```

No production semantics changed, no incremental engine merged. P-007 and frozen S021–S024 untouched.

## 18. Commit hashes

| | |
|---|---|
| Ancestor | `19f6c98` |
| S025 experiment commit | `{{S025_COMMIT}}` |
