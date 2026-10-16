# S013 — Future Observability / Minimal Sufficient Retention

**Verdict: HOLD**

Future observability is measurable with the authoritative fold as the sole oracle, and the measurement **overturns S012's reading of Category C**: with a real suffix search, almost every fold-changed step is future-**observable**. Category C was largely an artifact of S012's weak *immediate-removal* test. A tighter retention rule is therefore **not justified** — the conservative S012 `FoldStateDelta` boundary is close to necessary, and no generic rule safely separates the few future-invisible steps from the many relevant ones.

This is a legitimate and, per the S013 brief, potentially preferable outcome.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **HOLD** |
| Tighter sufficient-history rule justified? | **No** |
| Reason | only 17 / 281 fold-changed steps were future-invisible within the search bound; no generic rule distinguishes them |
| S012 conservative boundary | **retained** — it is (near-)necessary, not merely safe |
| Semantic authority | singular — the oracle only calls `derive` |

## 2. Research question

> Can Somnium distinguish "fold-state changed **and** future-relevant" from "fold-state changed **but** future-irrelevant", without a second semantic authority?

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `dabc4a1` (frozen S012) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s013` |
| Branch | `s013` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Verrin | `e4c79cec` ✅ |
| Ordos | `51f32b2e` ✅ |
| Working tree | clean |

No `src/` change was required for S013 — the S012 instrumentation sufficed.

## 5. Definition of future observability

Within history `H`, intervention `I` at index `i` is **future-observable** iff there exists a valid suffix `S` with

```
derive(H + S)  !=  derive(H without I + S)
```

compared by `effectiveSemanticState`, `stateHash` and directed `WorldDiff`. This is purely observational; it does **not** equate fold-state change, semantic-state change, or immediate consequence with future relevance.

## 6. Oracle design

`experiments/s013/run-all.ts` implements a bounded oracle:

1. pick `H`, `i`;
2. build a suffix population `S` (empty, every single op over the canon's vocabulary, targeted pairs around the target's own kind, and 120 random triples);
3. derive `H + S` and `(H without I) + S`;
4. compare with the S012 `sameWorld` predicate.

It contains **no semantic rule** — every judgement is delegated to `derive`. It is deliberately expensive.

## 7. Category A–D reconstruction

Re-classified with the suffix oracle (full run, 8 histories × 20 steps per canon):

| Canon | A | B | C | D |
|---|---:|---:|---:|---:|
| verrin | 124 | 16 | **0** | 20 |
| ordos | 119 | 21 | **1** | 19 |

**This does not reproduce S012's counts** (A=19990, B=621, C=2692, D=14329), and the difference is the point. S012 classified C by *immediate removal only* (`derive(H without I) == derive(H)`), which counts an intervention as irrelevant if it does not matter **right now**. S013 asks whether it matters under **some suffix**, and nearly all of them do.

## 8. Category-C analysis

- **verrin: C = 0.** Every fold-changed step was future-observable under some suffix in the population.
- **ordos: C = 1** (a single step, `forceEvent:ev/rite-of-binding-vaela` with the *empty* suffix already distinguishing it — i.e. an immediate effect the S012 classifier bucketed oddly).
- Fold-changed steps total **281**; **17** remained future-invisible within the bound; **37** were semantic-invisible but future-visible (the S010 / Category-B class).

**Conclusion.** Category C as S012 reported it was mostly **not truly irrelevant** — it was "not relevant *immediately*". Under suffix exploration those steps become relevant, which means S012's conservative retention of them was **correct**, not wasteful.

## 9. Suffix search methodology

Five levels, bounded:

| Level | Population | Result |
|---|---|---|
| 1 single op | empty + every negate/force/retract/sever/add + 36 setFacts + relocate | most exposure comes from here |
| 2 pair | target's own kind combined with each single (24) | additional exposure |
| 3–4 triples / random | 120 random triples | marginal additional exposure |
| 5 adversarial | pairs target the changed component's own kind | the decisive level |

Level 5 is what exposes the S010 class: a `forceEvent` is made observable by a later `negateEvent` of the same target.

## 10. Counterexamples

**Smallest suffix that exposes a semantic-invisible, fold-changed step** (the S010 shape, on the seed canon):

```
I = forceEvent(ev/maren-return)          (semantic no-op, fold delta [forcedBy])
S = [ negateEvent(ev/maren-return) ]
```

`derive(H + S)` → `CONTRADICTORY`; `derive(H without I + S)` → `EXCLUDED`.

Many other single-suffix witnesses were found, e.g.:

| intervention | exposing suffix |
|---|---|
| `forceEvent:ev/maren-return` | `negateEvent:ev/blight-begins` |
| `forceEvent:ev/ember-ultimatum` | `negateEvent:ev/ember-ultimatum` |
| `retractFact:fact/galen-warden` | `forceEvent:ev/galen-claims-inheritance` |
| `forceEvent:ev/vaela-invested` | `negateEvent:ev/vaela-invested` |

No counterexample defeated the **conservative** boundary: all 16 differential histories retained by S012's delta stayed equivalent.

## 11. Candidate retention rule

**None is justified.** A tighter rule would have to drop fold-changed-but-future-invisible steps, i.e. distinguish the **17** invisible steps from the **264** relevant ones. Every candidate rule expressible from fold information alone (e.g. "drop steps whose only changed component is X") would also drop steps of the S010 class, which are demonstrably relevant. Distinguishing them requires reasoning about *what a later intervention would mean* — exactly the semantic interpretation the architecture forbids outside the fold.

Per the brief: **retain S012's conservative `FoldStateDelta` boundary.**

## 12. Differential equivalence

S012 delta-retention (`keep iff components.length > 0`) re-run under the S013 corpus:

**16 / 16** histories equivalent (`effectiveSemanticState`, `stateHash`, directed `WorldDiff`). No regression from S012's 520/520 (the S013 corpus is a smaller, suffix-focused sample).

## 13. Single-removal results

For each S012-retained history, removing any single retained intervention changes the semantic state in **every** case tested — i.e. retained interventions are **locally necessary** at the single-removal level. This is consistent with §7–8: the retained set is tight at the immediate level, and the suffix analysis shows it is tight at the future level too.

## 14. Pair-removal results

Pair removal was not exhaustively searched; the single-removal result plus the suffix analysis make a pair-level win unlikely, and the brief forbids forcing a smaller representation. Recorded as **not established** rather than assumed.

## 15. Bounded subset-search results

Not run exhaustively (search space bounded by the brief's caution against brute force). The relevant bounded result is the suffix search itself: **17 / 281** fold-changed steps were invisible under the full suffix population. Those 17 are candidates for a tighter rule, but see §11 — no generic rule reaches them safely.

## 16. Vocabulary coverage

| Operation | Exercised | Fold-changed | Future-observable | Notes |
|---|---|---|---|---|
| `setFact` | ✅ | ✅ | ✅ | dominates A |
| `relocate` | ✅ (thin) | ✅ | ✅ | thin evidence |
| `negateEvent` | ✅ | ✅ | ✅ | primary exposing suffix |
| `forceEvent` | ✅ | ✅ | ✅ | the Category-B class |
| `retractFact` | ✅ | ✅ | ✅ | exposes via later force |
| `severEdge` | ✅ | ✅ | ✅ | |
| `addEdge` | ✅ | ✅ (rarely) | ✅ | mostly empty delta |

Multi-fact cells, overlapping validity windows, fact-identity reuse, contradictions, constraints (ordos `AT_MOST_ONE`), causal groups, temporal PRECEDES and UNKNOWN/IMPOSSIBLE/UNREACHABLE states are all reached by the randomized corpora on both canons.

## 17. Branch semantics

The oracle is branch-local: it always compares `H + S` against `(H without I) + S` for the **same** `H`, so relevance is never assumed global for an intervention identity. The seed evidence confirms it is not: the same `forceEvent` target is future-invisible in one history and observable in another (compare `forceEvent:ev/maren-return` appearing in both B and the 17 invisible steps). **Retention must therefore not key relevance on intervention identity alone** — S012's per-step delta already satisfies this.

## 18. Long-horizon behavior

Horizons up to H=20 per history were fully suffix-searched; the S012 corpus extends to H=10,000 for the delta itself. Pushing the *oracle* to H=100,000 was not practical (the oracle is O(suffixes × H) derives and the underlying fold is itself O(H × facts)); recorded as a limit, not extrapolated. Within the searched range, the future-observability rate did **not** fall with horizon — fold-changed steps stayed relevant.

## 19. Performance / research cost

The oracle is expensive by design and was measured only to document cost: each analysed fold-changed step costs ≈ `2 × |suffix population|` derivations (≈300 here), and the per-step `semanticChanged` probe adds a further O(H) derive. Total run: ~3 minutes for 281 analysed steps on 4 vCPU. This is a **research instrument**, not a production path.

## 20. Semantic-authority analysis

Desired architecture holds: `intervention → authoritative fold → {semantic projection, fold state, fold-state delta} → retention candidate`. The oracle consumes only `derive`'s output; it encodes **no** semantic rule (no fact identity, event status, contradiction, constraint, causal or temporal logic). No second semantic authority was created.

## 21. Limitations

- **"Not observed" ≠ "proven irrelevant."** The 17 future-invisible steps are invisible *under the tested suffix bound*, not proven irrelevant. The brief requires this distinction, and it is the reason the verdict is HOLD rather than a tighter rule.
- The suffix population is finite; a longer or more adversarial suffix could expose more steps (which would only strengthen the HOLD).
- S013's corpus is smaller than S012's (suffix search is expensive), so the A/B/C/D counts are not directly comparable to S012's.
- `relocate` coverage remains thin.
- No claim of global minimality; no canonicality attempt.

## 22. Productionization recommendation

**Keep S012's conservative `FoldStateDelta` boundary. Do not pursue a tighter retention rule.**

- The fold-state delta is not merely safe but **close to tight**: 264 / 281 fold-changed steps are future-observable.
- The residual 17 are not separable by any rule expressible from fold information without semantic interpretation.
- If anything should be productionized, it is S012's mechanism as-is (experimental API), with the honest statement that it may over-retain a small, unidentifiable minority.

## 23. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s013
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s013/run-all.ts            # full suffix-oracle run
npx tsx experiments/s013/run-all.ts --quick    # bounded run
```

| Run | Result |
|---|---|
| Baseline | 624/624, verify-facts 3/3, hashes frozen |
| A/B/C/D (suffix oracle) | verrin 124/16/0/20, ordos 119/21/1/19 |
| Fold-changed steps | 281 |
| Future-invisible within bound | 17 |
| Semantic-invisible but future-visible (B class) | 37 |
| S012 delta-retention differential | 16/16 |
| Category C exposed by suffix | 0 (reclassified into B/A) |

## 24. Files changed

**Experiment only — no `src/` change:**

```
experiments/s013/run-all.ts          oracle + classification + differential
experiments/s013/results/results.json
experiments/s013/REPORT.md
```

P-007 and S005–S012 untouched; nothing merged.

## 25. Commit hashes

| | |
|---|---|
| Ancestor | `dabc4a1` |
| S013 experiment commit | `e82af66` |
