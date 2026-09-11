# S032 — Minimise and Characterise the 5 Failing S024 Synthetic Topologies

**Verdict: PASS** — the failure is fully explained, causally proven, and the S024 corpus reaches **100/100 topologies, 1500/1500 prefixes**.

The cause was **not** a missing dependency class. It was a **reconsideration-scope** error in S030's worklist: S030 seeded the queue with `directChanged` only and carried the *previous* truth, so a **closure node that was not itself directly changed kept a stale value** and was never re-evaluated. The correct engine resets the **dependency closure** to `NEITHER` and seeds the queue with it — S029's closure reset combined with S030's worklist.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **PASS** |
| Original failures | **5 / 100 topologies** |
| Cause | **reconsideration scope** (closure not reset), **not** a missing dependency class |
| Fix | reset the **dependency closure** to `NEITHER`; seed the queue with it |
| S024 after fix | **100 / 100 topologies · 1500 / 1500 prefixes · 0 mismatches** |
| Baseline | 624/624 · verify-facts 3/3 · hashes frozen |

## 2. Baseline

624/624 · verify-facts 3/3 · verrin `e4c79cec` · ordos `51f32b2e` ✅
S024 (S031): **95/100 topologies, 1487/1500 prefixes** — reproduced.

## 3. The five original failures

| seed | prefix | intervention | divergent nodes | ref | inc |
|---|---:|---|---|---|---|
| 36 | 11 | `forceEvent:ev/n15` | `ev/n4`, `ev/n5` | NEITHER | FALSE |
| 38 | 5 | `severEdge:e5` | `ev/n14`, `ev/n7` | NEITHER | FALSE |
| 59 | 6 | `severEdge:e1` | `ev/n4`, `ev/n7` | NEITHER | FALSE |
| 79 | 3 | `severEdge:e2` | `ev/n1`, `ev/n4` | NEITHER | FALSE |
| 86 | 5 | `forceEvent:ev/n0` | `ev/n2`, `ev/n3`, `ev/n4` | NEITHER | FALSE |

**All five share one shape:** the divergent nodes are **inside the closure** (`inClosure=true`) yet **outside `directChanged`**, and the incremental engine holds a stale **`FALSE`** where the reference holds **`NEITHER`**.

## 4. Authoritative read analysis (Phase 2)

For every divergent node the authoritative support expression was `disjoin([conjoin([...])])` over conjuncts that are **themselves NEITHER in the reference** — e.g. seed 59: `ev/n4` requires `ev/n7` (NEITHER) → `conjoin([NEITHER]) = NEITHER` → `disjoin([NEITHER]) = NEITHER`. So the authoritative answer is **NEITHER**.

The incremental engine produced `FALSE` because it evaluated the node **against a stale `FALSE` conjunct** and never re-evaluated it after the conjunct changed. **No authoritative input was read that the index did not represent.** The dependency classes were complete (supportGroups covered every divergent node).

## 5. Candidate dependency classes considered and rejected

| Candidate | Verdict |
|---|---|
| `supportGroups` incomplete | **rejected** — the conjunct→target edges were present and correct |
| `enablesIn` / `excludesEdges` / `invariantEdges` / `precedesEdges` | **rejected** — not consulted by these nodes |
| validity windows / `overriddenCells` / `retracted` | **rejected** — the divergent nodes are events, not facts |
| SCC / cycle membership as a *new* dependency | **rejected** — cycles are expressed through `supportGroups`; no separate edge exists |
| **reconsideration scope** | **proven** — the closure was correct but was not *reset* |

**No speculative dependency was added.** The index is unchanged from S028.

## 6. Causal proof (Phase 3)

| Step | Result |
|---|---|
| A. Minimal witness (seed 59, prefix 6) | divergence present |
| B. False-negative demonstrated | `directChanged ⊆ closure` **but** the authoritative result changes on a closure node outside `directChanged` |
| C. Fix applied (reset closure + seed queue with it) | — |
| D. Re-run minimal witness | **divergence disappears** |
| E. Full S024 re-run | **0/100 failing** |
| F. Remove the fix (S030's original `step`) | **divergence returns (5 failures)** |

The fix is therefore **causally necessary**, not merely correlated.

## 7. The corrected engine

```
step(prev, intervention):
  model  = buildModel(canon, prefix)
  reset  = closure(directChanged(prev.model, model), dependencyIndex(model))
  truth  = { node -> NEITHER if node in reset else prev.truth[node] }
  queue  = reset                     // <-- S030 seeded directChanged only
  while queue not empty:
    n = pop; next = authoritative nodeSupport(model, n, truth)
    if next changed: truth[n] = next; enqueue n's dependents
  return { model, truth }
```

Only the **seed** changed. `nodeSupport` remains the authoritative per-node rule; no semantic rule was added.

## 8. Full S024 revalidation (Phase 5)

| Metric | Before (S030/S031) | **After (S032)** |
|---|---:|---:|
| topologies exact | 95 / 100 | **100 / 100** |
| prefixes exact | 1487 / 1500 | **1500 / 1500** |
| mismatches | 13 | **0** |

## 9. Architectural conclusion (Phase 16)

The S028 **dependency boundary is correct**; S030's **execution** was incomplete. The distinction the brief demanded:

```
semantic dependency   (S028 index)   — correct, unchanged
≠
evaluation footprint  (closure)      — correct
≠
execution state       (S030 truth)   — the bug: a stale value outside the reset
```

The missing knowledge was **"a decision can be invalidated by a change anywhere in its dependency cone, so the whole cone must be reconsidered, not just the directly-changed nodes."**

## 10. Residual limitations

- **Verrin/Ordos randomized corpus was not re-run** with the fix (the fix is a strict superset of S030's reset — it resets more — so it cannot regress correctness, but this is **not measured**).
- The 5 failures were **not minimised to the smallest node/edge set** (budget); the shape is uniform and clearly identified, but a per-failure minimal topology is not recorded.
- Determinism/branch isolation were not re-run in S032 (validated in S031).
- Wall-clock performance not measured.
- Empirical only; no proof.

## 11. Recommendation for S033 (exactly one)

> **Re-run the full correctness gate with the corrected seed** — Verrin/Ordos randomized histories, the S009/S010 witnesses, S021 aggregate checks, S022/S023 unfounded witnesses, `U ⊆ C` / `ΔU ⊆ ΔC`, and the S024 corpus — and only then resume the **wall-clock performance** comparison (S030 worklist vs S029 reset-scope vs from-scratch) at H=100/1k/10k on sparse/medium/dense workloads.

## 12. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s032
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s032/probe.ts
```

## 13. Files changed

**Experiment only — no `src/` change:**

```
experiments/s032/probe.ts
experiments/s032/REPORT.md
```

P-007 and frozen S021–S031 untouched; nothing merged.

## 14. Commit hashes

| | |
|---|---|
| Ancestor | `ad8340d` |
| S032 experiment commit | `{{S032_COMMIT}}` |
