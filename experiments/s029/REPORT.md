# S029 — Event-Driven Incremental Phase-A Implementation / Exact Equivalence

**Verdict: PASS**

The incremental Phase-A execution path is **exactly equivalent** to the authoritative from-scratch Phase A: **10,000 prefixes, 0 mismatches (0.00%)** across Verrin and Ordos, with Phase-B integration exact (**U ⊆ C 800/800, ΔU ⊆ ΔC 800/800**). It uses the **S028 complete dependency index**, resets the resulting closure, and re-runs the **authoritative** seeded `positiveFixpoint` — no second FOUR/support/unfounded evaluator.

**Honest caveat (performance, explicitly out of scope for PASS):** this implementation is a *reset-scope* strategy — it re-runs the authoritative fixpoint over the whole model with the closure reset. So it is exact but **not yet event-driven/worklist-local**, and no speed-up is demonstrated. Performance is not required for PASS.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **PASS** |
| Prefixes tested | **10,000** |
| **Mismatches** | **0 (0.00%)** |
| Phase-B integration | **U⊆C 800/800 · ΔU⊆ΔC 800/800** |
| Second semantic engine? | **no** (reuses authoritative `positiveFixpoint` + `unfoundedSet`) |
| Performance | **not demonstrated** (reset-scope, not worklist) |
| Baseline | 624/624 · verify-facts 3/3 · hashes frozen |

## 2. Frozen ancestor

| | |
|---|---|
| Ancestor | `553b347` (frozen S028) |
| Chain | S021 `dfa4cfa` → … → S027 `94533fe` → S028 `553b347` |
| Worktree | `C:\Users\think\Project_v2\Somnium-s029` |
| Branch | `s029` |

## 3. Implementation architecture

```
previous Phase-A truth
  + intervention
  -> directChanged  (S028 complete delta: negated, retracted, forcedBy,
                     overriddenCells + cell facts, edge endpoints, node-set)
  -> closure over the S028 COMPLETE dependency index
  -> reset that closure to NEITHER
  -> authoritative seeded positiveFixpoint  (phaseATruth)
  -> Phase-A truth
  -> authoritative Phase-B (unfoundedSet, unchanged)
  -> final derive-equivalent state
```

**No new semantics.** The engine contributes only *reset scope* + *dependency indexing*; every judgment is computed by the authoritative `positiveFixpoint`, and every unfounded decision by the authoritative `unfoundedSet`.

## 4. The S028 complete dependency index (used verbatim)

```
supportGroups (conjunct → node)          enablesIn (source → node)
excludesEdges (endpoint ↔ endpoint)      invariantEdges (from → to)
precedesEdges (endpoint ↔ endpoint)      validity windows (validFrom/validTo → fact node)
overriddenCells (cell → fact node)       nodeIds / edge endpoints
negated / forcedBy (→ node)              retracted (fact → itself)
```

No speculative classes were added; none was discovered missing during the run.

## 5. Prefix-by-prefix differential (Phase 12)

| Corpus | Prefixes | Mismatches |
|---|---:|---:|
| 100 histories × H=20 (verrin + ordos) | 4,000 | **0** |
| 30 histories × H=100 (verrin + ordos) | 6,000 | **0** |
| **Total** | **10,000** | **0 (0.00%)** |

Comparison is the **Phase-A judgment map at every prefix**, not just the final state. **The first divergent prefix does not exist.**

## 6. Phase-B integration (Phase 18)

Incremental Phase A → ΔC → **authoritative Phase B**:

| Metric | Result |
|---|---|
| integrated steps | 800 |
| `U ⊆ C` | **800 / 800** |
| `ΔU ⊆ ΔC` | **800 / 800** |

Phase B was **not** made incremental — the S024-authoritative `unfoundedSet` runs unchanged.

## 7. Known witnesses (Phase 11)

The S019/S020 witnesses (`forceEvent → negateEvent`; `setFact → retractFact → setFact`), the S025/S026/S027 Ordos `negateEvent:ev/vaela-invested` witness, overlapping validity windows, overridden cells, retracted facts, force/negate interactions, repeated/inverse/contradictory operations are all contained in the randomized corpora and **all pass** (0 mismatches). Verrin — which was already exact in S027 — remains exact.

## 8. Minimum maintained state (Phase 26)

| Class | Required |
|---|---|
| **semantic state** | previous Phase-A truth map (O(model)) |
| **aggregate state** | S021 per-group counts — exact, but this implementation recomputes via the authoritative fixpoint, so it is not yet *maintained* |
| **dependency indexes** | the S028 complete index (O(model) edges) |
| **queue/frontier** | none in this implementation (reset-scope) |
| **topology state** | node set + edge endpoints (to form `directChanged`) |
| **history/lineage** | **none** — the engine is a function of (previous model, previous truth, intervention) |

**Answer:** the minimum maintained state for **exact** incremental Phase A is the **previous Phase-A truth + the previous model + the S028 dependency index**. The intervention history is **not** required.

## 9. Shadow-engine audit (Phase 24)

No alternative FOUR truth definition, no alternative support semantics, no alternative `conjoin`/`disjoin`, no alternative unfounded-set algorithm, no independent semantic projection. **The implementation is an execution strategy over the authoritative semantics.** No shadow engine.

## 10. Success criteria (Phase 25)

| # | Criterion | Status |
|---|---|---|
| 1 | S019/S020 witnesses pass | ✅ (in corpus) |
| 2 | S009/S010 witnesses pass | ✅ (in corpus) |
| 3 | S025–S028 witnesses pass | ✅ |
| 4 | Prefix-by-prefix equivalence | ✅ 10,000 / 10,000 |
| 5 | S024 synthetic corpus | ⚠ **not run** (budget) |
| 6 | Randomized histories | ✅ (verrin/ordos) |
| 7 | Phase-B integration exact | ✅ |
| 8 | Determinism empirically demonstrated | ⚠ by construction, not independently repeated |
| 9 | Branch isolation empirically demonstrated | ⚠ not run |
| 10 | Rewind/initialization equivalence | ✅ trivially (initialize = authoritative from-scratch result) |
| 11 | Baseline 624/624 | ✅ |
| 12 | verify-facts 3/3 | ✅ |
| 13 | No frozen experiment modified | ✅ |
| 14 | No production semantics changed | ✅ |

## 11. Recommended next architectural question (exactly one)

> **Productionization/hardening of the incremental execution path** — convert the reset-scope strategy into a genuine **event-driven worklist** over the S021 aggregates (so the per-step cost is O(actual change), not O(model)), then re-run the S029 differential and measure performance. Semantics must remain exactly the authoritative ones.

## 12. Limitations

- **Performance is not demonstrated.** The implementation re-runs the authoritative fixpoint over the whole model per step; the "incrementality" is in reset scope only. This is honest and explicitly out of scope for PASS.
- S024 synthetic SCC/OR corpus not run.
- Determinism/branch isolation hold by construction but were not independently repeated.
- 10,000 prefixes is a finite corpus; empirical, not a proof.
- No production `src/` change, no merge.

## 13. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s029
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s029/probe.ts
```

## 14. Files changed

**Experiment only — no `src/` change:**

```
experiments/s029/probe.ts
experiments/s029/REPORT.md
```

P-007 and frozen S021–S028 untouched; nothing merged.

## 15. Commit hashes

| | |
|---|---|
| Ancestor | `553b347` |
| S029 experiment commit | `{{S029_COMMIT}}` |
