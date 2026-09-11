# S018 — Node-Set & Topology-Aware Frontier Soundness

**Verdict: HOLD**

Explicitly modelling **node-set changes, edge endpoints and cycle membership** *does* eliminate the S017 false negatives: **FN 3 → 0**. The frontier is therefore **sound** on the tested corpus. But the sound frontier is **global** — it covers the entire model (F18 ≈ 14/18 nodes, FP ≈ whole model) — because cycle membership must be seeded and the reverse closure spreads from it to everything. So locality can be *predicted soundly* only at global scope; a **useful local** frontier does not exist under this construction.

This is exactly the outcome the brief anticipates: a HOLD with a precise, documented reason. No incremental propagation was implemented.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **HOLD** |
| S017 false negatives eliminated? | **yes (3 → 0)** |
| Frontier sound? | **yes** (FN = 0) |
| Frontier local/useful? | **no** — global (F18 ≈ whole model) |
| Second semantic engine? | **no** — structural inputs only |
| Semantic authority | singular; no `src/` change |

## 2. Research question

> Can node-set / topology-aware invalidation produce a **sound** predictive frontier from a principled, finite set of **pre-propagation** state variables?

**Answer:** yes for soundness, no for locality.

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `4ad78c7` (frozen S017) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s018` |
| Branch | `s018` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Verrin / Ordos | `e4c79cec` / `51f32b2e` ✅ |
| S017 observations | reproducible ✅ |

No `src/` change — S018 is pure observation over existing outputs.

## 5–6. Pre-propagation state model & topology delta

Modelled **before** propagation, using canonical identity:
- **Node domain:** previous/current node sets, added/removed nodes, edge endpoints.
- **Topology:** edge presence/content per edge id; cycle membership (REQUIRES strongly-connected sets).
- **Dependency structures:** reverse index over support groups, ENABLES, exclusions, invariants, precedes.
- **Accumulator changes:** `negated`, `forcedBy`, `retracted`, `overriddenCells`, edge identity.

`Δnodes`, `Δedges`, `Δcycles` are all computed from `buildModel(canon, prefix)` — no propagation result is consulted when *constructing* the frontier.

## 7. Frontier construction

```
F = Δnodes ∪ edge-endpoint delta ∪ cycle membership
        ──closure over──▶ reverse deps ∪ support groups ∪ ENABLES ∪ excludes ∪ invariants ∪ precedes
```

All inputs are available **before** propagation.

## 8. Soundness test

| Canon | Kind | n | delta | F17 | **F18** | FN17 | **FN18** | FP18 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| verrin (14) | setFact | 77 | 0.00 | 0.00 | **13.91** | 0.00 | **0.00** | 13.91 |
| verrin | addEdge | 14 | 0.00 | 1.86 | **13.93** | 0.00 | **0.00** | 13.93 |
| verrin | severEdge | 14 | 0.14 | 10.50 | **14.00** | 0.00 | **0.00** | 13.86 |
| verrin | negateEvent | 40 | 0.50 | 3.60 | **13.90** | 0.03 | **0.00** | 13.40 |
| verrin | forceEvent | 25 | 0.40 | 4.72 | **13.92** | 0.00 | **0.00** | 13.52 |
| verrin | retractFact | 30 | 0.00 | 0.53 | **14.40** | 0.00 | **0.00** | 14.40 |
| ordos (17) | setFact | 77 | 0.00 | 0.13 | **18.00** | 0.00 | **0.00** | 18.00 |
| ordos | addEdge | 14 | 0.00 | 1.14 | **18.00** | 0.00 | **0.00** | 18.00 |
| ordos | severEdge | 14 | 0.14 | 6.29 | **18.00** | 0.00 | **0.00** | 17.86 |
| ordos | negateEvent | 40 | 0.45 | 2.30 | **18.00** | 0.05 | **0.00** | 17.55 |
| ordos | forceEvent | 25 | 0.40 | 2.28 | **18.00** | 0.00 | **0.00** | 17.60 |
| ordos | retractFact | 30 | 0.20 | 1.80 | **18.30** | 0.00 | **0.00** | 18.10 |

**Totals:** delta = 68 · FN(S017) = **3** · FN(S018) = **0** · FP(S018) = **6,339** · F18 = 6,407.

**Primary invariant met: FN = 0.** The frontier is sound. **But** precision is ≈ 1% — the frontier is essentially the whole model.

## 9. Edge-operation focus (the S017 residue)

The S017 `severEdge`/`addEdge` false negatives are **fully explained** by:
- **node-set change** — edge mutations add/remove `nodeIds` endpoints;
- **edge-endpoint change** — the endpoints of a changed edge must be seeded.

Including both drives FN to 0 for every edge operation. So the residue was, as S017 suspected, a **missing node-set/endpoint term**, not a mysterious semantic effect.

## 10. Why the frontier becomes global

Seeding **cycle membership** is what makes FN = 0 for `negateEvent`/`forceEvent`. But cycle members are connected to the rest of the graph through the same reverse index, so the closure from any cycle member reaches essentially every node. Hence **F18 ≈ the whole model** for every operation, on both canons.

This is the central architectural finding:

> **Soundness requires cycle membership; cycle membership is globally connected; therefore the sound frontier is global.**

## 11. Soundness vs shadow-engine audit (Phase 10)

| Input | Class |
|---|---|
| previous/current node set, edge endpoints, edge presence/content | **A — existing structural information** |
| cycle membership (REQUIRES SCCs) | **A — existing structural information** |
| reverse index over support groups / ENABLES / excludes / invariants / precedes | **A — existing structural information** |
| `negated` / `forcedBy` / `retracted` / `overriddenCells` changes | **B — existing semantic state** |
| frontier closure | **C — derived predictive state** |
| any prediction of FOUR outcomes, support satisfaction, unfoundedness, causal consequences | **D — none present** |

**No class-D logic exists.** The frontier never predicts a judgment value; it only over-approximates *which nodes might change*. **Semantic authority remains singular** — this is not a second engine.

## 12. Global-trigger audit (Phase 11)

| Trigger | Attributable to | Status |
|---|---|---|
| Node-set change (edge add/sever) | structural | ✅ explained |
| Edge-endpoint change | structural | ✅ explained |
| Cycle membership | structural (SCC) | ✅ explained — **and this is the globaliser** |
| Disjunctive support / ENABLES / excludes / invariants / precedes | structural | ✅ covered by the closure |
| Remaining unexplained | — | **none observed** (FN = 0) |

No unexplained residue remained, so no fallback category was needed for *correctness* — only for *locality*.

## 13. Conservative fallback experiment (Phase 12)

Because the sound frontier is already global, a `local → if-global-trigger → global` hybrid would trigger **on every intervention that touches a cycle or the node set**, which on these canons is **essentially all of them**:

- fraction requiring global fallback: **≈100%**
- fraction handled by a local frontier: **≈0%**

Per the brief, that fallback is **valid but not useful** — reported honestly rather than dressed up.

## 14. Required final questions

| # | Answer |
|---|---|
| **Q1** | **Yes** — modelling node-set changes eliminates the S017 false negatives (3 → 0). |
| **Q2** | **Yes** — topology-aware invalidation eliminates them. |
| **Q3** | Smallest sufficient pre-propagation state: **previous + current node sets, edge endpoints, cycle membership, and the reverse dependency index.** |
| **Q4** | **Structural.** All inputs are class A/B; no propagation semantics are reconstructed (no class D). |
| **Q5** | Remaining global triggers: **cycle membership** (the globaliser) and **node-set changes**. |
| **Q6** | They *can* be isolated behind an explicit fallback — but on these canons the fallback fires ≈100% of the time, so it buys no locality. |
| **Q7** | Percentage of interventions usable by a purely local frontier: **≈0%** on the seed canons. |
| **Q8** | **Still one semantic engine.** The predictive layer only over-approximates *which nodes might change*; it never computes a judgment. |

## 15. Limitations

- Seed canons + 200-step random histories only. The 21-topology adversarial corpus (Phase 6) was **not built** (budget); the seed canons cover chains, fan-in/out, diamonds, shared support, a bootstrap cycle, exclusions and invariants.
- H=10…10,000 long-horizon sweep (Phase 13) not run; the frontier is per-step and canon-bounded, but this is **not measured**.
- Branch isolation (Phase 15) not separately run; the probe holds no shared mutable state.
- Precision (~1%) is reported, not optimised — the brief forbids optimising.
- Empirical only; no proof.

## 16. Architectural conclusion

Locality **can** be predicted soundly from structural state without recreating the causal engine (Q4/Q8: no second engine). But on the tested canons the **sound** frontier is **global**, because the one input that removes the last false negatives — cycle membership — is globally connected.

**Therefore: stop chasing increasingly elaborate invalidation rules** (the brief's explicit instruction for a NO answer) and **reconsider the execution architecture around a different boundary.** The productive boundary is not "which nodes might change" but "recompute the fixpoint from a prior truth" — a change to how Phase A is *seeded*, which is a semantic-execution change and outside S018's scope.

## 17. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s018
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s018/probe.ts
```

| Run | Result |
|---|---|
| Baseline | 624/624, verify-facts 3/3, hashes frozen |
| FN(S017) | 3 |
| **FN(S018)** | **0 → sound** |
| F18 size | ≈ whole model (14/18) |
| FP(S018) | 6,339 (precision ≈ 1%) |
| Fallback frequency | ≈100% |

## 18. Files changed

**Experiment only — no `src/` change:**

```
experiments/s018/probe.ts
experiments/s018/REPORT.md
```

No incremental propagation, no queues, no caches, no semantic change. P-007 and frozen S005–S017 untouched; nothing merged.

## 19. Commit hashes

| | |
|---|---|
| Ancestor | `4ad78c7` |
| S018 experiment commit | `{{S018_COMMIT}}` |
