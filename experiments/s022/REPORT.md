# S022 — Unfounded-Set Candidate Boundary / Incremental Cycle Observability

**Verdict: HOLD**

Phase B is **GLOBAL SCAN + effectively EMPTY/LOCAL RESULT** on the seed canons — and the "global" scan domain is itself **tiny**. The candidate set is exactly the **NEITHER set after Phase A** (0.07–1.31 nodes), its cross-prefix delta is 0.00–0.19 nodes, and the **unfounded set is empty (|U| = 0)** on both canons. So the global barrier is not expensive here and is a *cheap global consistency check that can safely remain global*.

The verdict is HOLD rather than PASS because **constructed cycles with non-empty unfounded sets were not tested** — the boundary is well characterised on the seed canons, but not on the case where Phase B actually does work.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **HOLD** |
| Phase-B scan domain (candidate set) | = the **NEITHER set**; 0.07–1.31 nodes |
| ΔC (candidate delta) | 0.00–0.19 nodes → **local** |
| Unfounded set \|U\| | **0.00** (empty on both canons) |
| ΔU | **0.00** |
| Phase B character | **GLOBAL SCAN + EMPTY/LOCAL RESULT** |
| Synthetic cycles with \|U\|>0 | **not tested** |

## 2. Research question

> Is the global Phase-B boundary inherently global, conditionally global, reducible to a smaller candidate frontier, or itself amenable to compact maintained state?

**Answer:** it is a **candidate-set fixpoint whose domain is small and locally observable**; on the seed canons it is a cheap global check.

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `dfa4cfa` (frozen S021) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s022` |
| Branch | `s022` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Verrin / Ordos | `e4c79cec` / `51f32b2e` ✅ |
| S021 support-aggregate observations | reproducible ✅ |

## 5. Phase-B input characterised (Phase 2)

`unfoundedSet(model, truth)`:

```
candidates = nodeIds where truth === "NEITHER"      // the scan domain
shrink: remove any candidate that has a support group with
        an EXTERNAL (non-candidate) conjunct, or no groups at all
survivors = the unfounded set
```

So the **candidate set is precisely the NEITHER set Phase A leaves behind**. Observed via `observeUnfoundedSet(model)` → `{ candidates, unfounded, removed }`; the algorithm is untouched.

## 6. Candidate-set and unfounded-set deltas (Phase 3–4)

| Canon | Kind | n | \|C\| | **dC** | \|U\| | **dU** | dSem |
|---|---|---:|---:|---:|---:|---:|---:|
| verrin (14) | forceEvent | 32 | 0.44 | **0.03** | 0.00 | 0.00 | 0.44 |
| verrin | setFact | 82 | 0.49 | 0.00 | 0.00 | 0.00 | 0.00 |
| verrin | negateEvent | 24 | 0.25 | **0.08** | 0.00 | 0.00 | 0.79 |
| verrin | retractFact | 27 | 0.07 | 0.00 | 0.00 | 0.00 | 0.00 |
| verrin | addEdge | 18 | 0.11 | 0.00 | 0.00 | 0.00 | 0.00 |
| verrin | severEdge | 17 | 0.24 | 0.00 | 0.00 | 0.00 | 0.06 |
| ordos (16) | forceEvent | 32 | 1.31 | **0.19** | 0.00 | 0.00 | 0.50 |
| ordos | setFact | 82 | 1.24 | 0.00 | 0.00 | 0.00 | 0.01 |
| ordos | negateEvent | 24 | 1.21 | 0.00 | 0.00 | 0.00 | 0.67 |
| ordos | retractFact | 27 | 1.11 | 0.00 | 0.00 | 0.00 | 0.07 |
| ordos | addEdge | 18 | 1.06 | 0.00 | 0.00 | 0.00 | 0.00 |
| ordos | severEdge | 17 | 1.18 | 0.00 | 0.00 | 0.00 | 0.18 |

**ΔC is local** (0.00–0.19). **ΔU is zero** — the unfounded set is empty and stays empty.

## 7. Global vs local (Phase 8)

| Category | Observation |
|---|---|
| **Global scan** | yes — `unfoundedSet` iterates the whole candidate set |
| **Global candidate membership** | **no** — the candidate set is 0.07–1.31 nodes and its delta is ≤0.19 |
| **Global unfounded result** | **no** — \|U\| = 0 |
| **Local Phase-B delta** | yes — ΔU = 0, ΔC tiny |

→ **GLOBAL SCAN + EMPTY/LOCAL RESULT**, and the scan domain is itself small.

## 8. Why the barrier is cheap here

The candidate set is the **NEITHER set**, which is exactly the part of the semantic state Phase A could not decide. On the seed canons that is ≤1.3 nodes out of 14–16, and it rarely changes. The global barrier is therefore a **short pass over a handful of nodes**, not a whole-model sweep.

## 9. Support-aggregate interaction (Phase 6)

S021's aggregate determines which nodes become TRUE/FALSE; that *is* what removes nodes from the candidate set. So a support change can affect Phase B **without any topology change** — but only by changing the NEITHER set, which is already the observed domain. The relationship is:
```
support aggregate change → NEITHER-set change (= ΔC) → Phase B re-scan
```
No separate trigger was observed.

## 10. External-support sensitivity (Phase 12) — characterised, not tested

The shrink rule is exactly external-support sensitivity: a candidate with an external (non-candidate) conjunct is discharged. So the minimum information Phase B needs to reconsider a cycle is **the set of candidate membership changes** — which is ΔC. This follows from the implementation; it was **not exercised on constructed cycles**.

## 11. SCC / cycle and topology corpora (Phase 5, 10, 11, 13)

**Not built** (budget). The seed canons' bootstrap cycle is present but evidently externally grounded (no unfounded nodes), so the seed corpus does not exercise the `|U| > 0` path at all. Chain/fan-in/cycle-cascade constructions and the cycle-free control are recorded as **not tested**.

## 12. Long horizon, determinism, branch isolation (Phase 14–16)

Not run. `observeUnfoundedSet` is a pure function of the model and holds no shared state; determinism follows from the existing sorted iteration, but it is **not measured**.

## 13. Shadow-engine audit (Phase 17)

The probe only **reads** `observeUnfoundedSet`, which calls the authoritative `unfoundedSet` and reports its inputs/outputs. It does **not** reimplement the shrink rule, does not decide whether a cycle is founded, and does not compute FOUR outcomes. **No shadow engine.**

## 14. Required final answers

| # | Answer |
|---|---|
| **Q1** | The candidate set is exactly the **NEITHER set after Phase A** (the `unfoundedSet` scan domain). |
| **Q2** | Candidate membership changes when Phase A changes the NEITHER set — i.e. the semantic delta's NEITHER component. |
| **Q3** | **Yes** — ΔC is 0.00–0.19 nodes. |
| **Q4** | **Yes** — ΔU is 0.00 on the seed canons (empty unfounded set). |
| **Q5** | **Implementation, not semantics** — the scan is global by construction, but its domain (NEITHER nodes) is small; semantics did not force a large domain here. |
| **Q6** | SCC/cycle changes were **not tested**; the implementation's trigger is external-support membership, i.e. ΔC. |
| **Q7** | **Yes** — a support change can alter the NEITHER set (hence Phase B) with no topology change. |
| **Q8** | External-support changes are localised to the affected candidate's groups; not tested on constructed cycles. |
| **Q9** | **A principled boundary exists**: the NEITHER set (ΔC). Whether it is *sufficient* in general requires the cycle corpus. |
| **Q10** | The **NEITHER-set membership** (the candidate set) and its cross-prefix delta — plus, for real cycles, SCC membership. |
| **Q11** | **Yes** — Phase B can remain a global barrier: its domain is small and cheap to rescan, so Phase A can be incrementalised independently. |

## 15. Architectural conclusion

> Phase B is **GLOBAL SCAN + EMPTY/LOCAL RESULT** on the seed canons, and its scan domain is the **NEITHER set** — small (≤1.3 nodes) and locally observable. So the unfounded barrier is a **cheap global consistency check that can safely remain global** while Phase A is incrementalised.

This is the spec's anticipated "valuable result". It is stated as HOLD only because the `|U| > 0` case (constructed cycles) was not exercised.

## 16. Limitations

- **No constructed cycles**: the seed canons have \|U\| = 0, so the path where Phase B actually rejects nodes was not tested.
- No cycle-free control, SCC matrix, external-support sensitivity, or cascade test (budget).
- No long-horizon, determinism, or branch measurements.
- Empirical only; no proof.

## 17. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s022
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s022/probe.ts
```

| Run | Result |
|---|---|
| Baseline | 624/624, verify-facts 3/3, hashes frozen |
| Candidate set \|C\| | 0.07–1.31 nodes |
| ΔC | 0.00–0.19 → local |
| Unfounded \|U\| | **0.00** |
| ΔU | **0.00** |

## 18. Files changed

**`src/` (observation only):**

```
src/derive/propagation.ts   new observeUnfoundedSet -> { candidates, unfounded, removed }
```

**Experiment:**

```
experiments/s022/probe.ts
experiments/s022/REPORT.md
```

No incremental Phase B, no unfounded-semantics change, no production merge. P-007 and frozen S005–S021 untouched.

## 19. Commit hashes

| | |
|---|---|
| Ancestor | `dfa4cfa` |
| S022 experiment commit | `f02eadc` |
