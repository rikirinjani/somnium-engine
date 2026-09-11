# S026 — Phase-A Reconsideration Semantics / Sound Invalidation Boundary

**Verdict: HOLD** (root cause identified; a principled boundary is plausible but unvalidated)

The S025 divergence is reproduced exactly and its **root cause is identified** — and it is *not* "the closure is too small". It is two precise, named conditions:

1. **A missing authoritative dependency:** the reverse-dependency index is built from `supportGroups` / `enablesIn` / `excludes` / `invariant` / `precedes` — it **omits fact validity windows** (`validFrom` / `validTo` → fact node). `fact/seal-held-vaela` changed *outside* the closure because `negateEvent:ev/vaela-invested` closes its validity window, and that edge is not in the index.
2. **Sticky order-dependence:** two nodes *inside* the closure still diverged because the seeded sticky fixpoint decided them (TRUE) using a stale member value before the member was reset/evaluated — a schedule effect, not a reachability effect.

`R \ closure` = **51 over 800 prefixes (max 5 per prefix)** — a small, systematic residue consistent with a *named missing edge class* rather than an unbounded semantic gap.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **HOLD** |
| S025 failure reproduced? | **yes** (exact) |
| Root cause | **missing validity-window dependency** + **sticky order-dependence** |
| `R \ closure` | 51 / 800 prefixes, max 5 |
| Aggregate exactness | S021 aggregate remains exact — not the failure |
| Classification | **C — conditionally incremental with a characterised dependency/order requirement** |
| Baseline | 624/624 · verify-facts 3/3 · hashes frozen |

## 2. Frozen ancestor

| | |
|---|---|
| Ancestor | `d1d6f66` (frozen S025) |
| Chain | S021 `dfa4cfa` → S022 → S023 → S024 `19f6c98` → S025 `d1d6f66` |
| Worktree | `C:\Users\think\Project_v2\Somnium-s026` |
| Branch | `s026` |

## 3. S025 failure reproduced (Phase 3)

```
canon:  ordos
seed:   0
prefix: 5
iv:     negateEvent:ev/vaela-invested
```

| Item | Value |
|---|---|
| `directChanged` | `[ev/vaela-invested]` |
| reset closure (11) | `charter-veto-invoked, galen-claims-inheritance, galen-invested, galen-recognised, old-warden-dies, rite-of-binding-galen, rite-of-binding-vaela, succession-settled, vaela-acclaimed, vaela-invested, vaela-recognised` |
| divergent nodes | **3** |

### The three nodes

| node | ref | cand | prev | inClosure | support |
|---|---|---|---|---|---|
| `ev/rite-of-binding-vaela` | FALSE | TRUE | TRUE | **true** | group 0: `fact/seal-held-vaela = FALSE` |
| `ev/succession-settled` | FALSE | TRUE | TRUE | **true** | acclaim: `rite-of-binding-vaela`; inherit: `rite-of-binding-galen` |
| `fact/seal-held-vaela` | FALSE | TRUE | TRUE | **false** | *(none — a fact; negated=false, forced=false)* |

## 4. Root cause A — the missing validity-window dependency (Phase 8/13)

`fact/seal-held-vaela` is **outside** the closure yet changed. It has **no support groups**, is not `negated`, not `forced` — its truth comes from **`factNodeTruth`**, i.e. its **validity window**. `negateEvent:ev/vaela-invested` makes that window's anchor event not-occur, so the fact becomes FALSE.

**The reverse index does not contain validity-window edges.** `buildModel`'s `supportGroups` are REQUIRES-derived; `validFrom`/`validTo` are a *separate* authoritative dependency used by `factNodeTruth` and `factWindowTruth`, and they were never added to the index. So this is a **named missing edge class**, not an unbounded closure shortfall.

## 5. Root cause B — sticky order-dependence (Phase 8/9)

`ev/rite-of-binding-vaela` and `ev/succession-settled` were **inside** the reset closure (reset to NEITHER) yet still diverged. The mechanism: the seeded sticky fixpoint evaluates `model.nodeIds` in a fixed order and **skips decided nodes**. `ev/rite-of-binding-vaela` was decided TRUE using the *stale* `fact/seal-held-vaela` value before the fact was re-decided; once TRUE, it is never re-evaluated.

This is a **schedule effect**: the same set of reset nodes can yield different results depending on evaluation order. It is not reachability.

## 6. R vs closure (Phase 10/14)

| Metric | Value |
|---|---:|
| prefixes | 800 |
| total \|R \ closure\| | **51** |
| max per prefix | **5** |

`R` = nodes whose **judgment changed** from the previous prefix (re-decided, not merely re-visited). The residue is small and systematic — consistent with the single missing dependency class plus the order effect, not with an unbounded boundary.

## 7. Critical distinction (Phase 16)

**"reconsidered" ≠ "value changed".** The from-scratch fixpoint *evaluates* every node (all start at NEITHER) but only a few *change*. `R` above is the *changed* set; the *reconsidered* set is the whole model. An incremental queue cares about the *changed* set's propagation, so `R` (not "all evaluated") is the right quantity — and it is small.

## 8. Decision-provenance test (Phase 15)

For the divergent nodes:
- `ev/rite-of-binding-vaela` (rule `support`): its previous decision used conjunct `fact/seal-held-vaela`. The current aggregate shows that conjunct FALSE → **the previous decision is invalidatable from `previous decision rule + contributing support + current aggregate`** — *provided* the conjunct's *current* judgment is available, which requires the conjunct to have been re-decided first (recursive member re-evaluation).
- `fact/seal-held-vaela` (no groups): its decision depends on the **validity window**, which the current aggregate does **not** cover → **the triple is insufficient without validity-window state**.

So: `previous decision + support evidence + current aggregate` is **sufficient only if the dependency index also carries validity-window edges**, and only if member re-evaluation is ordered before dependents (or iterated to a fixpoint).

## 9. Ordering analysis (Phase 9)

The authoritative result is **deterministic but schedule-sensitive**: the sticky rule makes the *reachable* fixpoint depend on evaluation order. An incremental engine must therefore either (a) preserve the authoritative schedule, or (b) iterate to a fixpoint after resetting a *sufficient* set. S026 did not change the schedule.

## 10. Aggregate correlation (Phase 12)

S021's aggregate is **exact** and is **not** the failure. For `ev/rite-of-binding-vaela`, the group aggregate *does* show the change (its conjunct is FALSE) — so an aggregate-driven reconsideration would catch it **if** the fact's validity-window change propagated into the aggregate first. The gap is the **dependency index**, not the aggregate.

## 11. Support-loss / support-gain (Phase 6/7)

The reproduced witness is a **support-loss** case (`negateEvent` closing a validity window), exactly the class S019 flagged. Support-gain was exercised within the randomized corpus; no gain-side divergence dominated. The distinction matters: loss requires *lowering* a decision, which the sticky rule cannot do without resetting the node.

## 12. Architectural classification (Phase 19)

**C — conditionally incremental with an explicit dependency/order requirement.**

**Minimum information to know a previously decided Phase-A node must be reconsidered:**

| Class | Requirement |
|---|---|
| semantic state | previous judgment map |
| aggregate state | S021 per-group counts (exact) |
| **dependency indexes** | support groups + ENABLES + excludes + invariants + precedes **+ fact validity windows (`validFrom`/`validTo`)** |
| **schedule** | reset affected nodes and iterate to a fixpoint (order must not decide the outcome), or replay the authoritative schedule |
| topology state | node-set + edge endpoints |
| history/lineage | none |

**The single missing dependency class is fact validity windows.** With it in the index, and with member-first (or fixpoint) re-evaluation, the S025 divergence is plausibly eliminated. **This was not validated** — it is the one unresolved characterization/validation question.

## 13. No implementation (Phase 17)

S026 implemented **no** incremental Phase A, no invalidation engine, no second support/FOUR evaluator, no heuristic reset rules. It only instrumented observation and reproduced the failure.

## 14. Success criteria (Phase 18)

| # | Criterion | Status |
|---|---|---|
| 1 | S025 failure reproduces | ✅ exact |
| 2 | Actual reconsideration observed | ✅ |
| 3 | Support-loss/gain characterized | ✅ (loss = the witness) |
| 4 | R measured independently of final delta | ✅ |
| 5 | R \ naiveClosure characterized | ✅ 51/800, max 5 |
| 6 | Aggregate changes correlated with reconsideration | ✅ aggregate exact; index is the gap |
| 7 | Compact non-semantic boundary identified | ⚠ **candidate**: index + validity windows + fixpoint schedule |
| 8 | Reason no boundary exists | — (not reached) |
| 9 | Baseline 624/624 | ✅ |
| 10 | verify-facts 3/3 | ✅ |

**HOLD**: the reconsideration rule is understood but requires one additional validation family (the validity-window-aware index).

## 15. Recommended next experiment (exactly one)

**Validate a validity-window-aware dependency index**: add `validFrom`/`validTo` → fact-node edges to the reverse index, reset the resulting closure, and re-run the S025 differential. If `R \ closure` reaches 0 (with member-first or fixpoint ordering), the boundary is compact and Phase A is incrementalisable (class C→A); if not, the residual characterises the true limit.

## 16. Limitations

- The `R \ closure` measurement used the *judgment-changed* definition of `R`; a stricter "re-evaluated and could have changed" definition would be larger (but is the whole model by construction).
- Only 800 prefixes (20 histories × H=20 × 2 canons); no S024 synthetic corpus, no long horizon.
- Ordering was analysed, not controlled (the schedule was not varied).
- Empirical only; no proof.

## 17. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s026
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s026/probe.ts
```

## 18. Files changed

**Experiment only — no `src/` change:**

```
experiments/s026/probe.ts
experiments/s026/REPORT.md
```

P-007 and frozen S021–S025 untouched; nothing merged.

## 19. Commit hashes

| | |
|---|---|
| Ancestor | `d1d6f66` |
| S026 experiment commit | `{{S026_COMMIT}}` |
