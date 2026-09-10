# S009 — Subsumption Semantics / Reduced-History Sufficiency

**Verdict: BLOCKED**

A genuine, minimal counterexample demonstrates that the S008 reduction (`reduceChain`) is **not** a semantics-preserving abstraction for the full intervention vocabulary as currently specified. It loses semantically observable information for a *valid* canon whose cell holds more than one simultaneously-effective fact.

The reduction is nonetheless **sound for the two seed canons** (verrin, ordos) across 1,021 differential cases each, is idempotent, deterministic and branch-isolated there. The failure is a **stated-assumption failure**, not a random bug: rule R1 rests on an assumption the engine does not guarantee.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **BLOCKED** |
| Basis | Minimal counterexample (3 interventions) on a valid canon |
| Reduction sound on seed canons? | Yes (1,021/1,021 per canon) |
| Reduction sound for all engine-supported canons? | **No** |
| Cause | R1's "last write per cell" assumption fails for multi-effective-fact cells |

Per the S009 spec, optimisation work stops here; the counterexample is minimized and the semantic cause is reported rather than patched.

## 2. Research question

> Is `reduceChain(H)` a legitimate semantic abstraction / sufficient history representation, rather than merely an optimization artifact?

Equivalence criterion (not output similarity): identical `effectiveSemanticState`, identical `stateHash`, empty directed `worldDiff`. `identityHash` is deliberately excluded (lineage is intended to differ).

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor commit | `443d3d9` (frozen P-007) |
| Branched from | `443d3d9` — **not** S007, **not** S008 |
| Worktree | `C:\Users\think\Project_v2\Somnium-s009` |
| Branch | `s009` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** (24 files) |
| `verify-facts` | **3 / 3** |
| Frozen Verrin hash | `e4c79cec` ✅ |
| Frozen Ordos hash | `51f32b2e` ✅ |
| `src/` diff vs `443d3d9` | **empty** ✅ |

## 5. Reduction rules

`reduceChain(canon, H)` returns an order-preserving subsequence of `H`. Rules as specified in S008 (ported to `experiments/s009/reduction.ts`):

| Rule | Operation(s) | Semantic identity keyed | Keep | Why earlier/later is irrelevant |
|---|---|---|---|---|
| **R1** | legal `setFact` / `relocate` | `(subject, predicate)` cell | **LAST** | `overrideFact` replaces *every* effective fact for the cell with one derived fact; the model keeps only the last value per cell |
| **R2** | rejected `setFact` / `relocate` | contradiction id `contra:<subject>:fact-write-illegal:<reason>` | **FIRST** | the record id omits the value, so `detectContradictions` keeps the first per id |
| **R3** | `negateEvent` | target | **LAST** | `negated` is a Set |
| **R4** | `forceEvent` | target | **LAST** | `forcedBy` is a Map keyed by target |
| **R5** | `retractFact` | fact id | **FIRST** | a retracted id never returns (a later write mints `derived:<cell>`) |
| **R6** | `severEdge` / `addEdge` | edge id | **LAST** | `resolveEdges` removes-by-id then appends, and sorts at the end |

Ordering is preserved: survivors keep their original relative order; only subsumed elements are dropped.

## 6. Semantic assumptions

Each rule rests on an assumption read from source, not assumed:

- **R1-A (the fatal one).** *A write's effect is fully determined by the last write to its cell.* This holds when a cell holds **at most one effective fact**: a write leaves exactly one derived fact whose id the next write reuses. It **fails** when a cell holds **multiple simultaneously-effective facts** (overlapping validity windows): `overrideFact` (world-state.ts:190) selects `matching[matching.length - 1]` — the last by `validFrom` — and reuses *that* fact's id. A `retractFact` of that fact between two writes changes which id the later write reuses. Dropping the earlier write therefore changes the surviving fact's **identity**, which is part of the effective semantic representation (the `facts` dimension is keyed by id).
- **R2-A.** Rejected writes never touch `overriddenCells`; they accumulate in `rejectedFactWrites` and render to a value-independent contradiction id.
- **R3-A / R4-A.** `negated`/`forcedBy` are pure set-like accumulators.
- **R5-A.** A retracted id cannot be re-created: `overrideFact` mints `derived:<cellKey>` when no matching fact remains.
- **R6-A.** Only the last edge operation per id affects the final sorted edge set.

## 7. Counterexample search

Two levels of attack were run.

**7.1 Targeted attacks on the seed canons** (`experiments/s009/counterexamples.ts`): 26 cases (verrin) / 24 (ordos) covering `A→B`, `B→A`, `A→B→A`, `A→retract→A`, `A→negate→A`, `A→force→A`, write↔rejected-write orders, edge create/remove/create, syntactic twins (`relocate` vs `setFact(located_in)`), and a multi-fact-cell probe.

**Result: 26/26 and 24/24 pass.** The seed canons' multi-fact cells have **disjoint** validity windows (at most one effective at a time), so the R1 hazard is not reachable there. Multi-fact cells *do* exist — verrin `char/vara.located_in` (2 facts), ordos `obj/seal-of-office.held_by` (4 facts) — but never with two effective at once.

**7.2 Overlapping-window canon** (`experiments/s009/synthetic.ts`). `overrideFact` explicitly handles *multiple matching* facts and `isEffective` is a pure predicate, so the engine supports a cell with two simultaneously-effective facts. A synthetic canon was built for exactly that case and **passes `inspectCanon` with zero errors**.

### MINIMAL COUNTEREXAMPLE

**Canon** (`canon/s009-overlap-baked`, valid — `inspectCanon` errors: `[]`):

```
ev/a (Event, root → occurs)
ev/b (Event, in a 2-cycle with ev/c → unfounded → does NOT occur)
char/x
f1: char/x at loc/1   validFrom null   validTo ev/b     ← effective (ev/b absent)
f2: char/x at loc/2   validFrom ev/a   validTo null     ← effective (ev/a occurs)
edges: ev/c --REQUIRES--> ev/b,  ev/b --REQUIRES--> ev/c   (bootstrap cycle)
```

Both `f1` and `f2` are effective at baseline. The inspectCanon output is a **notice** about the well-founded cycle, not an error.

**History (3 interventions):**

```
setFact(char/x, at, W1)  →  retractFact(fact/x-at-loc2)  →  setFact(char/x, at, W2)
```

**Reduced (2 interventions):**

```
retractFact(fact/x-at-loc2)  →  setFact(char/x, at, W2)
```

**Divergence:**

| | legacy `derive(H)` | reduced `derive(R)` |
|---|---|---|
| effective `at` fact | `derived:["char/x","at"]=W2` | `fact/x-at-loc1=W2` |
| `stateHash` | `2eaa050a` | `f41330b7` |
| `semanticEqual` | — | **false** |
| `hashEqual` | — | **false** |
| `diffEmpty` | — | **false** |

**Semantic cause.** With both facts effective, the first `setFact` reuses `f2`'s id (last by `validFrom`). Retracting `f2` empties the cell, so the second `setFact` mints the synthetic id. Dropping the first write means the second write instead finds `f1` still present and reuses `f1`'s id. The **identity of the surviving fact changes** — a semantic difference the engine can observe.

A variant with the overlap established by an explicit `negateEvent(ev/b)` (4 interventions) shows the same divergence (`legacyHash=e5bb683d`, `reducedHash=83c0c994`).

## 8. Closure / idempotence results

`reduceChain(canon, reduceChain(canon, H))` compared **structurally** (canonical JSON of `{kind,target,params}`), not merely by resulting state.

| canon | cases | idempotent |
|---|---|---|
| verrin | 1,021 | **1,021 / 1,021** |
| ordos | 1,021 | **1,021 / 1,021** |

Corpus: 13 constructed histories + 1,000 randomized (H=25) + invalid/contradiction cases. The reduction is idempotent on the seed canons.

## 9. Differential equivalence results

`semantic(derive(H)) == semantic(derive(R))`, `stateHash` equal, `worldDiff` empty.

| canon | cases | equivalent |
|---|---|---|
| verrin | 1,021 | **1,021 / 1,021** |
| ordos | 1,021 | **1,021 / 1,021** |

**But the overlapping-window canon fails** (§7.2). Equivalence therefore holds *for the seed canons and for canons with disjoint windows*, not universally.

## 10. Commutation / order findings

Independent operations in both orders:

| canon | pair | same resulting state | same reduced chain |
|---|---|---|---|
| verrin/ordos | `negate(e) vs force(e)` | ✅ | ❌ |
| verrin/ordos | `write(cellA) vs write(cellB)` | ✅ | ❌ |
| verrin/ordos | `retract(f0) vs write(cellA)` | ✅ | ❌ |
| verrin/ordos | `negate(e) vs write(cellA)` | ✅ | ❌ |

**Finding.** These pairs **commute semantically** (same `stateHash`) but the reduction **preserves original order** (`sameReduced=false`). So `reduceChain` is *not* a canonical normal form: equivalent histories can reduce to different (order-different) chains. The reduction is a *sufficient* representation, not a *canonical* one. A stronger normal form (sorting independent operations by a canonical key) is **not justified** by this experiment — it would need its own equivalence proof, and R1's counterexample shows how easily an ordering assumption breaks.

## 11. Constraint / causal findings

- **Constraints**: the ordos canon carries `AT_MOST_ONE` constraints; histories exercising `forceEvent`/`negateEvent` over constraint-relevant events (1,021 cases) preserved `constraintViolations` exactly. No divergence on the seed canons.
- **Causal structure**: `REQUIRES` support groups, `ENABLES`, `EXCLUDES`, `INVARIANT`, `PRECEDES` and bootstrap cycles are all exercised via the edge and event histories; the effective `statuses`, `edges` and `temporalViolations` dimensions matched in every seed-canon case.
- **The hazard that fired is a *fact-identity* hazard, not a causal one** — but it is triggered through causal machinery (the bootstrap cycle that makes `ev/b` absent). This is exactly the S009 concern: *an intervention that appears semantically redundant at one stage becomes relevant because it changes a later evaluation.*

## 12. Invalid / unknown / contradiction-state findings

Explicit cases (both canons, all pass):

| case | preserved |
|---|---|
| undeclared-subject write | ✅ |
| id-shaped illegal object | ✅ |
| illegal-then-legal | ✅ |
| legal-then-illegal | ✅ |
| illegal-write → retract → illegal-write | ✅ |
| force-undeclared event | ✅ |
| force-then-negate / negate-then-force | ✅ |

R2 (first-per-contradiction-id) is what preserves these: the S008 defect (last-write-wins applied to rejected writes) is fixed and remains fixed. Absence of information is **not** converted to falsity — the `statuses`/`workStatuses` dimensions still drop `UNKNOWN`, and the well-founded `NEITHER` states are preserved (the bootstrap-cycle notice in §7.2 confirms this path is live).

## 13. Branch isolation

| canon | branches | isolation | legacy match |
|---|---|---|---|
| verrin | 4 (shared prefix) | ✅ | ✅ |
| ordos | 4 (shared prefix) | ✅ | ✅ |

Reducing one branch does not mutate the shared-prefix reduction; no cross-branch contamination. `reduceChain` is pure (allocates a fresh result; no shared mutable state).

## 14. Determinism

| canon | trials | stable | reduced length |
|---|---|---|---|
| verrin | 5 | ✅ | 184 |
| ordos | 5 | ✅ | 159 |

Same input → identical reduced chain and identical `stateHash` across repeated runs in-process. Traversal is over arrays and `Map`s keyed by explicit strings (`cellKey`, fact ids, edge ids), with no `localeCompare`-ordering dependency in the reduction itself — the P-007 ordering lesson is respected (ids are compared only via `Map` keys, never sorted by locale).

## 15. Minimality analysis

**Definitions considered:**
1. *No removable intervention* — no single intervention can be deleted without changing semantics.
2. *No adjacent pair collapsible.*
3. *Minimum cardinality canonical form.*
4. *Unique canonical form.*

**Findings:**
- (1) **Not established.** The reduction is conservative: it only drops provably-subsumed elements, and §10 shows it does not achieve a unique form. No claim of per-element minimality is made.
- (2) **Not established.**
- (3) **Not established** — and §7.2 shows that a *correct* reducer for overlapping windows must keep MORE than the S008 rules do, so S008's output is not even minimal among correct reducers.
- (4) **Refuted.** §10 shows equivalent histories reduce to different chains (`sameReduced=false`), so the form is not unique.

**No claim of mathematical minimality is made.** The reduction is a *sufficient* (sound-for-seed-canons) representation, not a minimal or canonical one.

## 16. Vocabulary coverage matrix

| Operation | Rule | Tested (verrin) | Counterexamples | Semantics preserved (seed canons) |
|---|---:|---:|---:|---:|
| `setFact` | R1/R2 | 1,004 | 0 | ✅ |
| `relocate` | R1/R2 | 1 | 0 | ✅ (thin evidence) |
| `negateEvent` | R3 | 982 | 0 | ✅ |
| `forceEvent` | R4 | 985 | 0 | ✅ |
| `retractFact` | R5 | 966 | 0 | ✅ |
| `severEdge` | R6 | 927 | 0 | ✅ |
| `addEdge` | R6 | 872 | 0 | ✅ |

(ordos counts identical.) **`relocate` has insufficient evidence** (1 case) and is marked as such. All operations are covered by the counterexample canon only through `setFact`/`retractFact`; the other five rules were not shown to fail, but were also not shown sound for arbitrary canons.

## 17. Productionization recommendation

**Do not adopt `reduceChain` as a core Somnium primitive in its current form.**

1. **R1 is unsound as specified.** The rule must be strengthened to refuse subsuming an earlier legal write to a cell if a `retractFact` of one of that cell's canon facts occurred between them. With that guard, the counterexample canon is repaired (`semanticEqual=true`, `hashEqual=true`, `diffEmpty=true`). But per the S009 spec this is **reported, not silently adopted**.
2. **Even guarded, the reduction is not canonical** (§10), so it cannot back a claim of "the reduced history is *the* representation of a world's history".
3. **Sound scope if adopted:** canons with **at most one effective fact per cell** (the seed canons). This must be an explicit precondition, enforced (e.g. at canon-validation time) rather than assumed.
4. **Prefer the architectural end-state** suggested by S008: expose the model's own fold accumulators and derive the reduced chain from them, so the reduction cannot disagree with the fold. That removes the duplication *and* the class of bug found here.

## 18. Limitations

- The counterexample uses a **synthetic canon** (validated by `inspectCanon`, 0 errors). Neither seed canon exhibits overlapping effective windows, so the failure is not reachable on shipped fixtures — but the engine **supports** the configuration, and `overrideFact` is written to handle it.
- **`relocate` coverage is thin** (1 case).
- The `sameReduced=false` commutation finding means "reduction" here is a *sufficiency* property, not a canonical-form property; no canonical-form claims are made.
- All results are empirical on a 4-vCPU host; no formal proof is offered for any rule.
- Only `effectiveSemanticState`, `stateHash` and `worldDiff` were used as the equivalence criterion; a semantic distinction observable *only* through some other API would not have been caught.

## 19. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s009

# baseline
npm run check && npm test && npx tsx scripts/verify-facts.ts

# full S009 suite
npx tsx experiments/s009/run-all.ts

# focused probes
npx tsx experiments/s009/probe.ts            # multi-fact cells + targeted attacks
npx tsx experiments/s009/probe-overlap.ts    # the counterexample
npx tsx experiments/s009/probe-minimize.ts   # legitimacy + 3-intervention minimum
```

| Run | Result |
|---|---|
| Baseline tests | 624 / 624 |
| verify-facts | 3 / 3 |
| Targeted attacks | verrin 26/26, ordos 24/24 |
| Idempotence | 1021/1021 both |
| Differential sufficiency | 1021/1021 both |
| Determinism | stable both |
| Branch isolation | pass both |
| Counterexample (R1 unguarded) | **diverges** |
| Counterexample (multi-fact guard) | repaired |

## 20. Files changed

New, isolated under `experiments/s009/`:

```
experiments/s009/reduction.ts        formalized rules + optional multi-fact guard
experiments/s009/counterexamples.ts  targeted attacks + multi-fact discovery
experiments/s009/synthetic.ts        overlapping-window canon + counterexample
experiments/s009/checks.ts           idempotence/sufficiency/determinism/branch/commutation/coverage
experiments/s009/run-all.ts          suite runner
experiments/s009/probe.ts            multi-fact + attacks probe
experiments/s009/probe-overlap.ts    counterexample probe
experiments/s009/probe-minimize.ts   legitimacy + minimization probe
experiments/s009/extract.ts          results extractor
experiments/s009/results/results.json
experiments/s009/REPORT.md
```

`src/` **unchanged** (empty diff vs `443d3d9`). S007 and S008 untouched. Nothing merged.

## 21. Commit hashes

| | |
|---|---|
| Ancestor | `443d3d9` |
| S009 experiment commit | `340ba91` |
