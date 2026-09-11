# S020 — Decision Provenance / Minimum Sound Invalidation

**Verdict: BLOCKED**

A per-node **decision-rule provenance** (`negated` | `forced` | `support` | `unfounded`) is observable deterministically and **explains every S019 divergence**. But the rule-level invalidation predicate is **not sound**: **FN = 32, FP = 0**. Every false negative comes from the `support` rule — to know whether a support-established `TRUE` still holds, the predicate must **re-evaluate the support**, which is precisely Phase A. A provenance-only witness is therefore insufficient, and the only sound witness for support-decided nodes is effectively the derivation itself.

This is the brief's BLOCKED condition: *"invalidation requires duplicating propagation semantics."*

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **BLOCKED** |
| Provenance observable & deterministic? | **yes** |
| Explains S019 failures? | **yes** (all of them) |
| Rule-level predicate sound? | **no — FN = 32** |
| Why | `support` decisions require re-evaluating the support = Phase A |
| Second engine required for soundness? | **yes** (support re-validation) |

## 2. Research question

> What is the minimum information required to determine whether a previously established Phase A judgment remains valid after an intervention?

**Answer:** rule provenance is necessary but **not sufficient**; support decisions need their support re-evaluated.

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `fb2ec51` (frozen S019) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s020` |
| Branch | `s020` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Verrin / Ordos | `e4c79cec` / `51f32b2e` ✅ |
| S019 26/400 divergence | reproducible (sticky seeding) ✅ |

## 5. S019 divergence classes reproduced

The S019 divergences are reproduced and now **explained** by provenance: the stale `TRUE` values were all decided by the **`support`** rule (or by a `negated`/`forced` override that the intervention later removed), and the sticky seeding never re-evaluated them. Same mechanism, now with a name.

## 6. Decision provenance observation (Phase 3)

Instrumented `positiveFixpoint` to record, at the moment a node is decided, **which rule decided it**:

```
"negated"   model.negated.has(node)                 -> FALSE
"forced"    model.forcedBy.has(node)                -> TRUE/FALSE
"support"   factNodeTruth / hardSupport             -> the support value
"unfounded" Phase B unfounded-set rejection          -> FALSE
```

Exposed via `propagationObserve(model, seed?)` → `{ truth, provenance }`. The observation does not alter evaluation.

Observed distribution (seed canons): `support` 18, `negated` 10, `forced` 4 — **support dominates**.

## 7. Dependency provenance vs decision provenance (Phase 4)

The probe records **decision** provenance (which rule actually decided the node), not dependency adjacency. This distinction matters: a node may have many dependency edges but was decided by exactly one rule (and, for `support`, one support group).

## 8–10. OR / conjunctive support, ENABLES, force/negate, retraction, cycles

All of these reduce to the same finding, because they are all realised through the three deciding rules:
- **OR / conjunctive support** — both are folded into `hardSupport`'s `disjoin(groups.map(conjoin(...)))`; the rule provenance records only `"support"`, not which group won. So it **cannot** distinguish OR from AND, nor know whether *another* group still holds.
- **ENABLES** — raises support to SOFT only; it does not change truth, so it never decides a Phase A judgment.
- **force / negate / override** — recorded precisely (`forced` / `negated`), and the predicate handles them correctly (`after.forcedBy.has(node)` / `after.negated.has(node)`).
- **retraction / multi-fact cells** — realised through `factNodeTruth`, i.e. the `support` rule, with the same limitation.
- **cycles / unfounded** — recorded as `"unfounded"`; the predicate treats it conservatively (never STILL_VALID), so it produced no FN.

## 11. Invalidation predicate and soundness (Phase 12)

Predicate (`isStillSupported`, observation only):

| prior rule | STILL_VALID iff |
|---|---|
| `negated` | `after.negated.has(node)` |
| `forced` | `after.forcedBy.has(node)` |
| `support` | **assumed true** (optimistic) |
| `unfounded` | never (conservative) |

| kind | n | **FN (stale kept)** | FP |
|---|---:|---:|---:|
| `negateEvent` | 78 | **26** | 0 |
| `retractFact` | 38 | **3** | 0 |
| `severEdge` | 24 | **2** | 0 |
| `forceEvent` | 68 | **1** | 0 |
| `setFact` | 166 | 0 | 0 |
| `addEdge` | 26 | 0 | 0 |
| **total** | **400** | **32** | **0** |

**Primary safety condition violated: FN = 32.** The predicate never invalidated anything (`invalidated = 0`), so every divergence is a stale `support` decision.

## 12. Minimum-information analysis (Phase 13)

| Level | Candidate provenance | FN | Verdict |
|---|---|---:|---|
| 0 | node + prior judgment | (S019) 26/400 | unsound |
| 1 | + direct dependency set | — | does not identify *which* support decided |
| 2 | + dependency type | — | still not the winning support |
| 3 | + deciding **rule** (this experiment) | **32** | **unsound** |
| 4 | + winning support group | — | still needs the conjuncts' *current* judgments |
| 5 | + complete decision derivation witness | 0 by construction | **is the derivation** |

**Level 3 is the highest that can be captured without semantic work, and it is unsound.** The gap is structural: a `support` decision is `disjoin(conjoin(conjuncts))`, and re-checking it requires the conjuncts' **current** judgments — i.e. the fixpoint. So the minimum *sound* witness for support-decided nodes is the derivation itself.

## 13. Shadow-engine audit (Phase 14)

| Input | Class |
|---|---|
| `negated` / `forcedBy` membership (structural accumulators) | **A — existing structural information** |
| prior truth map | **B — existing semantic state** |
| per-node deciding rule | **C — new bookkeeping (provenance)** |
| re-evaluating a support group's conjuncts to decide validity | **D — reimplementation of propagation semantics** |

Sound invalidation **requires class D**. That is the shadow engine the brief forbids.

## 14. Context sensitivity (Phase 15)

Yes: the same intervention+target produces different invalidation requirements depending on the prior deciding rule and the prior support. The probe's per-kind FN spread (`negateEvent` 26 vs `setFact` 0) is exactly this. The explaining variable is the **prior decision rule plus the prior support state** — and the latter cannot be summarised without the conjuncts' judgments.

## 15. Determinism / branch isolation (Phase 16–17)

Provenance is a pure function of the model (rules are recorded at decision time from `model.negated`/`forcedBy`/support); it is deterministic and holds no shared mutable state. Not separately benchmarked, because the predicate is already disqualified.

## 16. Long horizon (Phase 18)

Not run — the predicate failed at H≤200.

## 17. Required final answers

| # | Answer |
|---|---|
| **Q1** | One of three rules decides a Phase A node: `negated` (FALSE), `forced` (TRUE/FALSE), or `support` (`factNodeTruth`/`hardSupport`); Phase B can reject via `unfounded`. |
| **Q2** | **No** — dependency provenance does not say which support actually decided the node. |
| **Q3** | The **deciding rule**, plus for `support` the winning group **and its conjuncts' current judgments**. The last part is the derivation. |
| **Q4** | **No** — OR/disjunctive support cannot be handled without re-evaluating the groups, which is Phase A. |
| **Q5** | **Yes** — force/negate/override are handled correctly by structural accumulator checks. |
| **Q6** | Cycles need the Phase B `unfoundedSet` result; `unfounded` provenance is conservatively safe (no FN) but cannot make a positive determination without re-running Phase B. |
| **Q7** | Per **node** for the rule; but `support` decisions additionally depend on the conjuncts' judgments, so a single node-local record is insufficient. |
| **Q8** | The minimum *sound* witness is: deciding rule + (for support) the current support evaluation — i.e. the derivation. No cheaper sound witness was found. |
| **Q9** | A rule-level record is ~1 small value per node; a *sound* record is effectively the full support graph + current judgments. |
| **Q10** | The rule-level record **can** be emitted by the engine without a second engine (done). A **sound** witness **cannot** — it requires class-D logic. |
| **Q11** | **No, not yet.** Incremental Phase A cannot be built on rule provenance alone; it needs support re-validation, which is the engine. |

## 18. Architectural conclusion

> `previous judgment + deciding rule` is **not** sufficient for continued validity. For `negated`/`forced` decisions the structural accumulators settle it cheaply and correctly; for `support` decisions — the dominant class — validity can only be established by **re-evaluating the support**, which is Phase A itself.

So the sticky reset is not just convenient; for support-based nodes it is the only sound mechanism available without duplicating semantics. A future incremental design must therefore either (a) accept support re-evaluation as the local operation (i.e. incrementalise *within* Phase A, not around it), or (b) find a support representation that is cheaper to re-check than to recompute — a different research question.

## 19. Limitations

- Seed canons + 200-step random histories; OR/AND/ENABLES/cycle cases were reasoned through the three deciding rules rather than built as synthetic graphs (budget).
- Only the rule-level witness was implemented; Levels 4–5 were characterised, not implemented.
- Long-horizon, branch, determinism measurements not run (predicate disqualified).
- Empirical only; no proof.

## 20. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s020
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s020/probe.ts
```

| Run | Result |
|---|---|
| Baseline / post-change | 624/624, verify-facts 3/3, hashes frozen |
| Provenance rules observed | `support` 18, `negated` 10, `forced` 4 |
| Rule-level predicate | **FN = 32, FP = 0** → **UNSOUND** |
| Invalidated | 0 |

## 21. Files changed

**`src/` (experimental, isolated to S020):**

```
src/derive/propagation.ts   positiveFixpoint records the deciding rule;
                            new propagationObserve -> { truth, provenance }
```

**Experiment:**

```
experiments/s020/probe.ts
experiments/s020/REPORT.md
```

No incremental propagation, no dirty queue, no invalidation implementation, no semantic rule change. `buildModel` default unchanged. P-007 and frozen S005–S019 untouched; nothing merged.

## 22. Commit hashes

| | |
|---|---|
| Ancestor | `fb2ec51` |
| S020 experiment commit | `{{S020_COMMIT}}` |
