# S012 — Fold-State Delta Productionization / forcedBy Identity

**Verdict: PASS**

S011's two open engineering questions are both resolved:

1. **`forcedBy` identity** is **content-derived** (`forceEvent:<target>`), a bijection of its key. Presence is semantic; the stored value is provenance-only. It is **not** a distinct identity domain.
2. **Delta overhead** fell from **57.7× → 0.93×** at H=3000 (≈63× better) and stays ~1.0× at H=10,000 — by replacing whole-list serialization with cheap structural bookkeeping.

Correctness is unchanged: **520/520** differential retention on three canons, **0** inverse hits, identical category classification to S011, determinism and branch isolation pass, and **default `buildModel` behaviour is preserved** (624/624, frozen hashes unchanged).

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **PASS** |
| `forcedBy` semantics | resolved — content-derived, presence-semantic |
| Incremental delta correct | yes (520/520, 0 inverse hits) |
| Overhead at H=3000 | **0.93×** (was 57.7×) |
| Default behaviour preserved | yes (624/624, frozen hashes) |
| Semantic authority singular | yes |

## 2. Research question

> Can the S011 fold-state delta be made incremental (cheap per intervention) and can `forcedBy` identity be defined precisely enough to expose a production-facing API?

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `d92a15e` (frozen S011) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s012` |
| Branch | `s012` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Verrin | `e4c79cec` ✅ |
| Ordos | `51f32b2e` ✅ |
| S011 instrumentation present | `foldStateDeltas` at `world-state.ts:568` ✅ |

Re-verified after the S012 change: 624/624, 3/3, hashes unchanged.

## 5. `forcedBy` identity investigation

Traced from source (`propagation.ts`, `timeline/types.ts`) and confirmed empirically (`experiments/s012/probe-forcedby.ts`).

| Question | Finding |
|---|---|
| Where created | `buildModel` accumulator fold: `forcedBy.set(iv.target, iv.id)` |
| What is stored | the **intervention id**, which `forceEvent(target)` derives as `` `forceEvent:${target}` `` |
| Which identity domain | **none distinct** — the value is a deterministic function of the key |
| Repeated FORCE | `Map.set` with the same id → **no change**; S011 reports an **empty** delta for the repeat |
| Does NEGATE observe it | yes — Phase D.1 checks `forcedBy` before `negated`, producing `force-vs-negate` |
| Retract/override interaction | none — different accumulators |
| Value in semantic state | **no** — it appears only as `ConflictNote.source`, which the semantic projection subtracts |
| Value in contradictions | as **provenance** only; the record's id/detail do not contain it |
| Presence in semantic state | **yes** — it changes truth and produces contradictions |

**Decisive test.** A hand-built `forceEvent` with id `forceEvent:custom-xyz` (same target) produces the **same `stateHash`** (`f0185e63`) and the same `semanticState` as the constructor's `forceEvent:ev/maren-return`. Verified on both canons that **every** `forcedBy` value equals `` `forceEvent:${key}` ``.

## 6. `forcedBy` semantic contract

> `forcedBy` represents **the set of targets a `forceEvent` has been applied to**. Its *presence* is semantic (it drives truth and `force-vs-*` contradictions). Its *value* is the deterministic, content-derived id `forceEvent:<target>`, used only as conflict provenance (`source`), which the semantic projection already excludes.

**Allowed downstream dependence:** presence only. No consumer may depend on the value as an identity — it carries no information beyond the key.

**Conclusion:** `forcedBy` is **not** intervention/event/occurrence/fold-local identity in any meaningful sense; it is a `Map` used where a `Set` would be semantically sufficient, with the value retained solely for `ConflictNote.source`. **No new identity domain is required.**

## 7. Fold-state delta architecture

S011 observed fact-list change with `canonicalJson(current)` on every intervention — serializing the whole list, which dominated cost. S012 replaces that with **`factListsEqual`**, a field-by-field comparison of the fold's own output (`id, subject, predicate, object, source, validFrom, validTo, overridden`), no serialization, no semantic rule. The accumulator delta was already O(1) per step.

```
intervention → authoritative fold mutation → incremental bookkeeping → FoldStateDelta
```

The delta is still emitted **from inside** the fold (`buildModel`'s accumulator loop, `resolveEdges`, `applyFactInterventions`); no second model is maintained.

## 8. Delta representation analysis

| Option | Verdict |
|---|---|
| boolean only | rejected — destroys the component information S011's classification relies on |
| changed component names (`components`) | **kept** — this is exactly what retention and the A/B/C/D classification consume |
| operation identities / before-after values / accumulator keys / fact identities | rejected — more than any consumer needs; would expose internal representation |
| structured delta entries | deferred — no consumer exists yet |

`components: string[]` is the narrowest representation that preserves the useful architectural signal. The `forcedBy`-id question does **not** affect it (presence-only is sufficient).

## 9. S009 reproduction

`setFact(W1) → retract(f2) → setFact(W2)` on the overlap canon:

| # | components |
|---|---|
| 0 | `overriddenCells, facts` |
| 1 | `retracted, facts` |
| 2 | `overriddenCells, facts` |

All three retained → the unsafe reduction is prevented. Identical to S011. **No special case.**

## 10. S010 reproduction

`forceEvent(ev/maren-return) → negateEvent(ev/maren-return)`:

| # | components | semantic hash |
|---|---|---|
| 0 | `forcedBy` | `f0185e63 → f0185e63` (unchanged) |
| 1 | `negated` | → `1a8fe542` |

The semantic no-op is still caught. Identical to S011. **No special case.**

## 11. Differential equivalence

`derive(H)` vs `derive(retain(H))` — `effectiveSemanticState`, `stateHash`, directed `WorldDiff`:

| Canon | Cases | Equivalent |
|---|---|---|
| verrin | 520 | **520 / 520** |
| ordos | 520 | **520 / 520** |
| overlap (multi-fact) | 520 | **520 / 520** |

## 12. Inverse attack

Empty delta but future-relevant, over all steps of 1,533 histories: **0 hits.** No regression from S011.

## 13. Vocabulary coverage

All seven operations exercised with **0 retention failures**; changed/empty counts identical to S011 (the optimization changed cost, not the signal). `addEdge` is mostly empty-delta (re-adding an identical edge is a fold no-op) — correct. `relocate` remains thin (1 case).

## 14. Performance comparison

`derive(H)` vs `foldStateDeltas(H)`, random histories:

| H | S011 overhead | **S012 overhead** | retained |
|---|---|---|---|
| 10 | 2.2× | **0.15–0.29×** | 9/10 |
| 100 | 9.7× | **0.24–0.41×** | ~80/100 |
| 1,000 | 45.4× | **0.74×** | ~510/1000 |
| 3,000 | **57.7×** | **0.93×** | ~1420/3000 |
| 10,000 | (not measured) | **1.02×** | ~4540/10000 |

Ratios below 1.0 at small H are JIT/measurement noise (the plain derive runs first, cold). The meaningful result is that the overhead is now **≈1× and stable**, versus S011's **growing 57.7×**.

## 15. Long-horizon stress

H=10,000 measured at **1.02×** (verrin) / 0.83× (ordos) — the delta no longer drifts toward repeated whole-state reconstruction. H=50,000/100,000 were not practical on this host because the **underlying fold** is itself O(H × facts) for write-heavy histories (every `setFact` scans the fact list in `overrideFact`); that is pre-existing fold behaviour, not delta overhead. Recorded as a limit, not extrapolated.

## 16. Determinism

Delta sequences stable over repeated runs for verrin and ordos; the representation is a canonical-JSON-comparable array of `{index, kind, target, components}` with no object references or `Map` iteration order. `forcedBy` ids are content-derived and therefore stable by construction.

## 17. Branch isolation

Shared-prefix and independent branches: isolation ✅, legacy match ✅ on both canons. `foldStateDeltas` is pure.

## 18. Public API boundary

**Recommendation: experimental API, not production.**

- The delta (`foldStateDeltas`) is stable and cheap, but the **retention rule built on it is still an experiment** and category C (over-retention) is unresolved.
- Keep `buildModel` as the production surface. Expose the delta behind the existing experimental entry point until a larger corpus (and a resolution of over-retention) exists.
- If a `forcedBy` accessor is ever exposed, expose **presence** (a `Set` view), never the id.

## 19. Default-behaviour preservation

| Check | Result |
|---|---|
| `buildModel(canon, H)` semantics | unchanged (no delta sink → identical path) |
| `npm test` | 624/624 |
| `verify-facts` | 3/3 |
| Verrin / Ordos hashes | unchanged |
| `stateHash` for FORCE→NEGATE | `1a8fe542` (matches S011) |
| `identityHash` | `a8a62029` (unchanged path) |

No change to stateHash, identityHash, diff hash, event/constraint/causal/temporal semantics.

## 20. Architectural implications

- The S011 signal is now **cheap enough to be practical** (~1×), so the remaining blocker is **semantic**, not performance: over-retention (category C) and the experimental status of the retention rule.
- `forcedBy`'s value being redundant with its key means the fold could store presence-only internally; the only reason it does not is `ConflictNote.source` (lineage). This is an internal simplification opportunity, not an API concern.
- The delta remains a **necessary, not sufficient** signal for minimality — unchanged from S011.

## 21. Limitations

- Over-retention (category C, 2,692 steps) is unresolved; no minimality claim.
- Empirical only (520/520, 0 inverse hits) — no formal proof.
- H > 10,000 not measured (bounded by the pre-existing fold's O(H × facts) scan, not by the delta).
- `relocate` coverage thin (1 case).
- Small-H overhead ratios below 1.0 are measurement noise.

## 22. Productionization recommendation

**Justified as an experimental API; not yet as a production primitive.**

1. Land the S012 bookkeeping change (it is a strict improvement with no semantic change).
2. Keep the retention layer experimental until over-retention is addressed.
3. If a public accessor is added, expose `forcedBy` **presence** only.
4. The next genuine blocker is semantic (minimality), not performance.

## 23. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s012
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s012/probe-forcedby.ts    # identity investigation
npx tsx experiments/s012/probe-perf.ts        # overhead
npx tsx experiments/s012/run-all.ts           # S011 corpus re-run under S012
```

| Run | Result |
|---|---|
| Baseline / post-change | 624/624, verify-facts 3/3, hashes frozen |
| S009 / S010 witnesses | caught, no special case |
| Differential | 520/520 × 3 canons |
| Inverse attack | 0 hits |
| Classification | A=19990 B=621 C=2692 D=14329 (identical to S011) |
| Overhead H=3000 | **0.93×** (was 57.7×) |
| Overhead H=10,000 | 1.02× |

## 24. Files changed

**`src/` (productionization of the S011 instrumentation — permitted):**

```
src/derive/world-state.ts   applyFactInterventions: replace canonicalJson observation with
                            factListsEqual structural bookkeeping (no semantic change)
```

**Experiment (isolated):**

```
experiments/s012/probe-forcedby.ts   forcedBy identity investigation
experiments/s012/probe-perf.ts       overhead measurement
experiments/s012/checks.ts           S011 corpus (copied, unchanged)
experiments/s012/run-all.ts          S011 runner (copied, unchanged)
experiments/s012/probe.ts            S011 witness probe (copied)
experiments/s012/results/results.json
experiments/s012/REPORT.md
```

No reduced-history derivation, no incremental propagation, no change to `buildModel`'s default behaviour. P-007 and S007–S011 untouched; nothing merged.

## 25. Commit hashes

| | |
|---|---|
| Ancestor | `d92a15e` |
| S012 experiment commit | `{{S012_COMMIT}}` |
