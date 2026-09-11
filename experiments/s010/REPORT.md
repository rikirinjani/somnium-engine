# S010 — Fold-Derived Sufficient History

**Verdict: BLOCKED**

No fold-derived retention mechanism tested produces a sufficient history. Two independent mechanisms were built and both fail — and they fail for **different, complementary reasons** that together explain why the current fold does not expose enough information:

- **M-B (accumulator-only)** preserves the fold's accumulators but loses **effective-fact identity provenance** → fails S009's NCR-006 and 6/10 multi-fact stress cases.
- **M-H (semantic-state-change oracle)** preserves fact identity but loses the fold's **accumulators** → fails 238/517 differential cases; its minimal counterexample is only **2 interventions** on the *seed* canon.

The root architectural fact: **the semantic state does not capture the fold's accumulators, and the fold's accumulators do not capture effective-fact identity.** Neither observable is sufficient, and constructing a sufficient history from either requires reimplementing part of the fold — i.e. a second semantic authority.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **BLOCKED** |
| Basis | Both candidate fold-derived mechanisms fail; minimal M-H counterexample is 2 interventions on the seed canon |
| Semantic authority kept singular? | Yes — neither mechanism duplicates the fold's rules |
| Does that save it? | No — singularity was achieved only by mechanisms that are *unsound* |

Per the spec, the experiment stops and reports rather than patching around individual examples.

## 2. Research question

> Can Somnium derive a semantics-preserving sufficient intervention history **from the authoritative semantic fold**, without creating a second semantic engine?

Target: `full history → authoritative fold → retained history`.
Rejected: `full history → independent reducer → reduced history → fold`.

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `443d3d9` (frozen P-007) |
| Branched from | `443d3d9` — not S007/S008/S009 |
| Worktree | `C:\Users\think\Project_v2\Somnium-s010` |
| Branch | `s010` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Frozen Verrin | `e4c79cec` ✅ |
| Frozen Ordos | `51f32b2e` ✅ |
| `src/` diff vs `443d3d9` | **empty** ✅ |

## 5. Authoritative fold dependency map

`derive(canon, interventions)` = `buildModel` (fold) + propagation + `applyFactInterventions` (fold) + projections + `effectiveSemanticState` + hash.

**Where each concern lives:**

| Concern | Where | Accumulator / output |
|---|---|---|
| interventions accumulated | `buildModel` (propagation.ts:285) | — |
| writes → effective facts | `applyFactInterventions` (world-state.ts:226) | `FactView[]` |
| **fact identity assigned/reused** | `overrideFact` (world-state.ts:190) | fact `id` (canon id reused, else `derived:<cell>`) |
| retractions | `buildModel` + `applyFactInterventions` | `retracted: Set` |
| validity windows | `computeEffectiveFacts` + `factNodeTruth` | derived per world |
| contradiction identity | `contradictions.ts:67` render | `contra:<subject>:<kind>:<reason>` |
| NEGATE / FORCE | `buildModel` (propagation.ts:286-288) | `negated: Set`, `forcedBy: Map` |
| edges | `resolveEdges` (propagation.ts:161) | `edges: CausalEdge[]` |
| causal support groups | `buildModel` classification | `supportGroups` |
| constraints | `evaluateConstraints` | `constraintViolations` |
| temporal/recurrent | `temporalViolations`, `unfoundedSet` | `temporalViolations`, statuses |

**What survives vs what is lost.** The fold keeps only *summary* accumulators. Two pieces of history-dependent information are **not** in the accumulators:
1. **which fact id a write reused** (R1's hazard, S009/NCR-006) — visible only in `WorldState.facts`, not in `overriddenCells`;
2. **that a no-op operation happened at all** (e.g. `forceEvent` on an already-established event) — `forcedBy` is set, but the semantic state is unchanged.

## 6. Definition of sufficient history

> R is **sufficient** for H iff `derive(canon, R)` and `derive(canon, H)` are indistinguishable: identical `effectiveSemanticState`, identical `stateHash`, empty directed `WorldDiff`.

Lineage (`identityHash`, `WorldState.interventions`) is excluded. No claim of canonicality or minimality is made.

## 7. S009 counterexample reproduction

Canon `canon/s010-overlap` (S009's baked overlap canon; `inspectCanon` errors `[]`): cell `(char/x, at)` holds two simultaneously-effective facts; `ev/a` occurs, `ev/b` is unfounded.

```
history : setFact(char/x, at, W1) → retractFact(f2) → setFact(char/x, at, W2)
legacy  : derived:["char/x","at"]=W2   hash 70f5ed5e
```

| mechanism | retained | resulting fact | equivalent? |
|---|---|---|---|
| M-B | `retractFact(f2) → setFact(W2)` (2) | `fact/x-at-loc1=W2` | **no** (semantic/hash/diff all false) |
| M-H | full 3 ops | `derived:["char/x","at"]=W2` | yes |

M-B fails exactly as S008/S009 predicted: `overriddenCells` kept only the last value, so the first write's removal of the sibling fact is invisible. **M-H handles it** — but M-H is unsound for a different reason (§9).

## 8. Fold-derived retention design

Two mechanisms were prototyped (`experiments/s010/retain.ts`); neither was assumed correct.

**M-B — accumulator-only.** Re-encode each surviving `DerivationModel` accumulator entry as one operation: `retracted`→`retractFact`, `overriddenCells`→`setFact` (last value per cell), `negated`/`forcedBy`→`negateEvent`/`forceEvent`, `edges`→sever/add re-encoding, `rejectedFactWrites`→the original rejected ops.

**M-H — oracle-guided.** Walk H once; keep an intervention iff applying it **changes the semantic world**, decided entirely by `derive`. Contains no semantic rule of its own.

## 9. Differential equivalence

`derive(H)` vs `derive(R)` across 13 constructed + 500 random histories per canon.

| mechanism | verrin | ordos |
|---|---|---|
| M-B | **493 / 517** | **483 / 517** |
| M-H | **279 / 517** | **297 / 517** |

**M-H fails MORE than M-B** — a counter-intuitive but explicable result: M-B at least preserves the accumulators (so `forcedBy`/`negated` survive), whereas M-H discards no-op operations that the accumulators needed.

### Minimal M-H counterexample (2 interventions, SEED canon)

```
H = [ forceEvent(ev/maren-return), negateEvent(ev/maren-return) ]
R = [ negateEvent(ev/maren-return) ]          ← M-H dropped the force
```

| | H | R |
|---|---|---|
| `ev/maren-return` | **CONTRADICTORY** | **EXCLUDED** |
| contradictions | `contra:ev/maren-return:force-vs-negate` | *(none)* |

**Cause.** `forceEvent` on an already-ESTABLISHED event is a **semantic no-op** (the state is unchanged), so M-H drops it. But `buildModel` sets `forcedBy[E]`, and a later `negateEvent(E)` then yields a *force-vs-negate contradiction* rather than EXCLUDED. **The semantic state does not record `forcedBy`, so a state-change oracle cannot see why the force matters.**

This is structurally the same failure as NCR-006 — *a no-op operation whose accumulator entry becomes observable later* — but on the **event-status** dimension instead of fact identity, and with a shorter witness.

## 10. Multi-fact / identity stress

10 synthetic stress cases on the overlap canon.

| mechanism | passed | failing cases |
|---|---|---|
| M-B | **6 / 10** | write-retract-write (NCR-006), write-write-retract, negate-ev/b then write-retract-write, write-then-both-retract |
| M-H | **10 / 10** | — |

M-H passes every multi-fact case (it retains the ops that matter); M-B fails four, all involving the fact-identity dependency. So the two mechanisms are **complementary**: M-B is right where M-H is wrong and vice-versa — which is precisely why neither alone is a solution.

## 11. Complete vocabulary coverage

Failure counts per operation (of the tested histories containing it):

| Operation | verrin tested | M-B fails | M-H fails | ordos tested | M-B fails | M-H fails |
|---|---:|---:|---:|---:|---:|---:|
| `setFact` | 507 | 24 | 238 | 507 | 34 | 220 |
| `relocate` | 1 | 0 | 0 | 1 | 0 | 0 |
| `negateEvent` | 494 | 23 | 238 | 494 | 34 | 218 |
| `forceEvent` | 500 | 24 | 238 | 500 | 34 | 220 |
| `retractFact` | 489 | 24 | 233 | 489 | 34 | 212 |
| `severEdge` | 463 | 23 | 222 | 463 | 31 | 200 |
| `addEdge` | 430 | 19 | 204 | 430 | 25 | 188 |

All seven operations are exercised. **`relocate` has thin evidence (1 case)** and is marked as such. Constraints, causal support groups, temporal/PRECEDES cycles, contradictions, UNKNOWN/IMPOSSIBLE/EXCLUDED/CONTRADICTORY states and invalid writes are all exercised through the verrin/ordos corpora; failures span every operation, so the defect is **not operation-specific** — it is the retention criterion itself.

## 12. No-second-semantic-engine analysis

| mechanism | duplicates fold logic? | detail |
|---|---|---|
| **M-H** | **No** | calls `derive` as the oracle; contains zero semantic rules. Sound-by-construction was *assumed* and is false (§9). |
| **M-B** | **Mildly** | re-encodes accumulator entries as operations and re-derives the edge set; it does not re-implement the *semantic* fold, but its output is only as complete as the accumulators. |

**This is the crux of the verdict.** The only mechanism that keeps semantic authority singular (M-H) is *unsound*; the mechanism closest to the target architecture (M-B) is *incomplete*. Recovering soundness from M-H would require retaining operations whose effect is not visible in the semantic state — which means reading the fold's accumulators, i.e. re-deriving the fold's own retention rules. **That is the second semantic engine the spec forbids.**

## 13. Idempotence

`retain(retain(H))`: for M-H the retained chain is itself a history, so idempotence is meaningful. Empirically M-H is *not* idempotent in the useful sense, because it is unsound — re-running it on its own output can drop further operations. For M-B the operation is a re-encoding of the fold of its input, so `retain(retain(H))` re-encodes the same accumulators and is stable **when the input is already accumulator-complete**. Neither property rescues soundness. (No idempotence claim is made for the architecture.)

## 14. Determinism

| canon | M-B | M-H |
|---|---|---|
| verrin | stable | stable |
| ordos | stable | stable |

Same history → identical retained chain over 5 trials, for both mechanisms. Determinism is not the failure mode.

## 15. Branch isolation

| canon | mechanism | isolation | legacy match |
|---|---|---|---|
| verrin | M-B | ✅ | ✅ |
| verrin | M-H | ✅ | **✗** |
| ordos | M-B | ✅ | ✅ |
| ordos | M-H | ✅ | **✗** |

Neither mechanism mutates a sibling branch (both are pure). M-H's `legacy match` failure is the same unsoundness as §9, surfaced per branch.

## 16. History scaling

Random histories on verrin:

| H | M-B retained | M-B % | M-H retained | M-H % |
|---:|---:|---:|---:|---:|
| 10 | 10 | 100% | 10 | 100% |
| 100 | 66 | 66% | 68 | 68% |
| 1,000 | 230 | 23% | 478 | 48% |
| 3,000 | 326 | **10.9%** | 1,266 | **42.2%** |

M-B **saturates** toward the model's operation space (the S007/S008 behaviour); M-H does **not** — it retains far more because "changed the state at the time" is a weaker (and unsound) criterion. Scaling of retained size is therefore *not* the binding constraint; soundness is.

## 17. Performance

Only a sanity check was run. M-H is O(H) oracle calls, each `derive` O(retained) → **O(H²)**; at H=3,000 that is already ~1,300 oracle calls over a growing chain, and H=100,000 is infeasible. M-B is a single fold pass (O(H)) plus a small re-encode. Neither is a performance win worth pursuing given they are unsound/incomplete.

## 18. Architectural implications

1. **The semantic state is a projection, not a complete fold state.** It does not record `negated`/`forcedBy`/`retracted`/`overriddenCells`, so *state-change* retention cannot be sound.
2. **The fold's accumulators are summaries, not provenance.** `overriddenCells` does not record fact-id reuse, so *accumulator* retention cannot be sound.
3. **Retention needs both** — and combining them means reconstructing the fold's retention semantics, i.e. a second authority.
4. Therefore the target architecture (`full history → fold → retained history`) is **not realizable from the current fold's public outputs**. To realize it, the fold would have to *expose* the provenance it currently discards — for example a per-operation "effect fingerprint" produced *by* the fold.

## 19. Limitations

- The minimal M-H counterexample is on the **seed** canon (verrin), not synthetic — it is not an artifact.
- M-B's failures on the seed canons (24/517 verrin, 34/517 ordos) arise from the same fact-identity hazard reaching seed fixtures via random histories; M-B's multi-fact stress failures are on the synthetic overlap canon.
- `relocate` coverage is thin (1 case).
- Only `effectiveSemanticState` / `stateHash` / `worldDiff` were used as the equivalence criterion.
- Results are empirical on a 4-vCPU host; no formal proof is claimed.

## 20. Productionization recommendation

**Do not productionize a fold-derived retention in the current architecture.** Specifically:

1. **Do not adopt M-B** — it is incomplete (fact identity, NCR-006).
2. **Do not adopt M-H** — it is unsound (accumulator identity; 2-op seed counterexample).
3. **The enabling change is in `src/`, not in the experiment:** have the fold *emit*, per intervention, whether it changed the fold state (accumulators + effective facts) — a boolean or small fingerprint. A retention driven by that flag is sound by construction and adds no semantic authority, because the flag comes from the fold itself. That is a separate, justified productionization task.
4. Until then, S008/S009's caution stands: the reduction is sound only under the enforced precondition *at most one effective fact per cell*, and even then it must preserve the accumulators (M-B) rather than use a state-change oracle.

## 21. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s010
npm run check && npm test && npx tsx scripts/verify-facts.ts   # baseline
npx tsx experiments/s010/run-all.ts                            # full suite
npx tsx experiments/s010/probe.ts                              # S009 counterexample + mechanisms
npx tsx experiments/s010/probe-mh.ts                           # constructed histories under M-H
npx tsx experiments/s010/probe-mh-random.ts                    # minimal M-H failure search
```

| Run | Result |
|---|---|
| Baseline | 624/624, verify-facts 3/3, hashes frozen, src/ clean |
| S009 counterexample | M-B ✗, M-H ✓ |
| Differential M-B | 493/517 (verrin), 483/517 (ordos) |
| Differential M-H | 279/517 (verrin), 297/517 (ordos) |
| Multi-fact stress | M-B 6/10, M-H 10/10 |
| Determinism | stable both |
| Branch isolation | pure both; M-H legacy-match ✗ |
| Minimal M-H counterexample | `[forceEvent(E), negateEvent(E)]` (seed canon) |

## 22. Files changed

New, isolated under `experiments/s010/`:

```
experiments/s010/retain.ts             M-B + M-H + greedy retention
experiments/s010/synthetic.ts          overlap canon + counterexample runner
experiments/s010/checks.ts             differential/stress/coverage/determinism/branch/scaling
experiments/s010/run-all.ts            suite runner
experiments/s010/probe.ts              S009 counterexample probe
experiments/s010/probe-mh.ts           constructed-history M-H probe
experiments/s010/probe-mh-random.ts    minimal M-H failure search
experiments/s010/extract.ts            results extractor
experiments/s010/results/results.json
experiments/s010/REPORT.md
```

`src/` **unchanged** (empty diff vs `443d3d9`). S007/S008/S009 untouched. Nothing merged.

## 23. Commit hashes

| | |
|---|---|
| Ancestor | `443d3d9` |
| S010 experiment commit | `{{S010_COMMIT}}` |
