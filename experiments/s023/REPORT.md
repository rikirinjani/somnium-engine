# S023 — Unfounded-Set Non-Empty / Candidate Sufficiency

**Verdict: HOLD** (with a strong positive core)

`|U| > 0` is now exercised (|U| = 2, 3, 5 on synthetic cycles). In every witness and every transition, **`U ⊆ C`** and **`ΔU ≤ ΔC`** — including the cross-SCC cascade, where no unfounded flip occurred outside the changed candidate frontier. So the S022 boundary survives: **ΔU is bounded by ΔC**, and the answer to the brief's central question is *"hand Phase B the candidate-set change (ΔC)"*.

The verdict is HOLD rather than PASS because the corpus is **six minimal witnesses** (no randomized stress), the OR-group external-support construction was not correctly exercised, and **determinism/branch-isolation were not tested**.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **HOLD** |
| \|U\| > 0 exercised? | **yes** (2, 3, 5) |
| `U ⊆ C`? | **yes**, every witness |
| `ΔU ≤ ΔC`? | **yes**, every transition |
| Phase-B change outside ΔC? | **none observed** |
| Cross-SCC cascade outside ΔC? | **none observed** |
| Determinism / branch isolation | **not tested** |

## 2. Research question

> Does every Phase-B consequence that can change after an intervention lie inside the changed NEITHER/candidate frontier ΔC, or can unfounded-set propagation escape that frontier?

**Answer (on this corpus): it does not escape — ΔU ⊆ ΔC.**

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `dfa4cfa` (frozen S021 — per the S023 brief) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s023` |
| Branch | `s023` |
| Baseline | 624/624 · verify-facts 3/3 · verrin `e4c79cec` · ordos `51f32b2e` |

## 4. Synthetic unfounded witnesses (Phase 2)

Built inside S023 (no Verrin/Ordos structure relied upon). Cycles use **REQUIRES** (hard support), since `unfoundedSet` operates on hard support — note the brief's `ENABLES` example would be *soft* support and cannot produce an unfounded set.

| Case | Structure | Result |
|---|---|---|
| **A** | 2-cycle `a⇄b`, no external support | \|C\|=2, **\|U\|=2** (`a,b`) |
| **B** | 3-cycle `a→b→c→a`, no external support | \|C\|=3, **\|U\|=3** (`a,b,c`) |
| **C/F** | SCC-1 (unsupported) + SCC-2 + bridge requiring both | \|C\|=5, **\|U\|=5** |
| **D** | external-support gain (`addEdge g→a`) | dC=1, **dU=0** |
| **E** | external-support loss (`severEdge b←a`) | dC=2, **dU=2** |
| **F+** | external ground (`forceEvent a`) | dC=2, **dU=2** |

**All witnesses show `U ⊆ C` (`U\C = 0`).**

## 5. Candidate-boundary test (Phase 5)

Three distinct measures, kept separate as the brief demands:

| Case | ΔC | ΔU | Δsemantic | ΔU ≤ ΔC? |
|---|---:|---:|---:|---|
| A (static) | 0 | 0 | 0 | ✅ |
| B (static) | 0 | 0 | 0 | ✅ |
| C/F (static) | 0 | 0 | 0 | ✅ |
| D (gain) | 1 | 0 | 1 | ✅ |
| E (loss) | 2 | 2 | 2 | ✅ |
| F+ (force) | 2 | 2 | 2 | ✅ |

**`ΔU ≤ ΔC` in every case**, and `U ⊆ C` always. Candidate locality, unfounded-result locality, and final semantic locality were each measured separately; the unfounded result never exceeded the candidate frontier.

## 6. External-support matrix (Phase 6)

- **Gain (D):** adding a support edge makes the cycle's node NEITHER instead of unfounded → ΔU = 0 while ΔC = 1 (the new node enters C). The cycle did **not** remain unfounded and did **not** cascade.
- **Loss (E):** severing the cycle's grounding removes the external support → both nodes leave C and U → ΔU = ΔC = 2.
- **Force (F+):** an external ground resolves the cycle → ΔU = ΔC = 2.

Behaviour follows **only from the current candidate set**; no prior-U state was needed to explain any transition.

## 7. Cross-SCC cascade test (Phase 8 — the most important potential counterexample)

Canon C/F, three steps:

| step | intervention | \|C\| | ΔC | \|U\| | ΔU | **U-flips outside ΔC** |
|---|---:|---:|---:|---:|---:|---:|
| 0 | — | 5 | — | 5 | — | — |
| 1 | `forceEvent ev/g` | 5 | 0 | 5 | 0 | **0** |
| 2 | `severEdge e/c-req-g` | 5 | 0 | 5 | 0 | **0** |
| 3 | `severEdge e/b-req-a` | 3 | 2 | 3 | 2 | **0** |

**No Phase-B consequence escaped ΔC**, and the removal did not cascade into nodes outside the changed frontier.

## 8. Previous-state interaction (Phase 9)

From-scratch reference vs the observed state: every transition was explained by the **current** candidate set and the intervention. No previous-U or SCC-state dependence was required. (The observation wraps the authoritative `unfoundedSet`; it never reimplements it.)

## 9. Cycle-trigger controls / topology (Phase 7)

`addEdge`/`severEdge` changed topology and produced candidate-set changes (D, E, F+); no Phase-B behaviour appeared that was not already captured by ΔC. Non-topological support changes (`forceEvent`) behaved identically.

## 10. Long horizon / randomized stress / determinism / branch isolation (Phases 10–13)

**Not run** (budget). The randomized 5–20-node SCC corpus and H=20/100/1000 histories are the main gap. `observeUnfoundedSet` is a pure function of the model and holds no shared state, so determinism and branch isolation are expected to hold, but they are **not measured**.

## 11. Shadow-engine audit (Phase 14)

`observeUnfoundedSet` calls the authoritative `positiveFixpoint` and `unfoundedSet` and reports their inputs/outputs. It does **not** reimplement the shrink rule, does not decide whether a cycle is founded, and does not compute FOUR outcomes. **No shadow engine.**

## 12. Required final answers

| # | Answer |
|---|---|
| **Q1** | The candidate set C is the **Phase-A NEITHER set** (before Phase B rejects). |
| **Q2** | C changes when Phase A changes the NEITHER set. |
| **Q3** | ΔC is local (0–2 nodes on these witnesses). |
| **Q4** | ΔU is local and **bounded by ΔC** (`ΔU ≤ ΔC`). |
| **Q5** | Phase B is **global by algorithm, local by domain** — C is small. |
| **Q6** | **Yes** — ΔC sufficed to predict every unfounded change observed. |
| **Q7** | **Yes** — a support change alters C without topology change. |
| **Q8** | **Yes** — external-support gain/loss localised to the affected candidates. |
| **Q9** | **A meaningful boundary exists: ΔC.** |
| **Q10** | An incremental engine must hand Phase B **ΔC** (the candidate-set change). |
| **Q11** | **Yes** — Phase B can remain a global barrier over a locally-supplied ΔC. |

## 13. Most important deliverable

> **An incremental Phase-A engine must hand Phase B: `ΔC` — the changed NEITHER/candidate set.**
> Evidence: `U ⊆ C` always, and `ΔU ≤ ΔC` in every witness and every transition, with zero unfounded flips outside ΔC (including the cross-SCC cascade). No prior-U or SCC state was required.

## 14. Architectural classification (Phase 17)

**B — Global algorithm over a local candidate domain.**

Recommended architecture: **incremental Phase A + authoritative global Phase B** (unchanged), with Phase A handing Phase B the ΔC frontier. No evidence supports a different architecture.

## 15. Limitations

- **Six minimal witnesses**; no randomized SCC stress (5–20 nodes, 20–100 topologies).
- The SCC-2 external-support construction in canon C/F did **not** create a genuine OR group (the external edge was ANDed into the cycle group), so "partially externally supported SCC" was not correctly exercised.
- No long-horizon runs, no determinism/branch-isolation checks.
- Empirical only; no proof.

## 16. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s023
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s023/probe.ts
```

## 17. Files changed

**`src/` (observation only):**

```
src/derive/propagation.ts   observeUnfoundedSet (candidates from Phase-A truth)
```

**Experiment:**

```
experiments/s023/probe.ts
experiments/s023/REPORT.md
```

No incremental Phase B, no unfounded-semantics change, no production merge. P-007 and frozen S021/S022 untouched.

## 18. Commit hashes

| | |
|---|---|
| Ancestor | `dfa4cfa` |
| S023 experiment commit | `{{S023_COMMIT}}` |
