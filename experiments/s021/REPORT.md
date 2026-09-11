# S021 — Incremental Support Aggregate / Fixpoint Primitive

**Verdict: HOLD**

The support expression **can** be represented as a compact, **exact**, **locally updatable** aggregate. A count-based statistic reproduces the reference FOUR semantics with **0 mismatches** across 667 conjunctive groups and 635 disjunctive nodes, and a member change updates it in **O(1)** with **0 mismatches** against full recomputation.

That answers the core question positively. The verdict is HOLD rather than PASS because the **cycle/unfounded boundary and topology-change updates were characterised but not tested**, and because the aggregate is a *primitive*, not yet an engine.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **HOLD** |
| Compact sufficient aggregate? | **yes** |
| Exact for reference FOUR semantics? | **yes (0 mismatches)** |
| Local member update? | **yes (O(1), 0 mismatches)** |
| Second causal engine? | **no** — the aggregate is a re-expression of the same lattice meet |
| Cycle/unfounded boundary | characterised (separate global Phase B), **not tested** |

## 2. Research question

> Can support evaluation itself be represented as an incrementally maintained aggregate, so that a local judgment change updates support state without re-evaluating the entire support expression?

**Answer: yes for ordinary support.**

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `f219e67` (frozen S020) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s021` |
| Branch | `s021` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Verrin / Ordos | `e4c79cec` / `51f32b2e` ✅ |
| S020 divergence corpus | reproducible ✅ |

No `src/` change — S021 is pure observation over `buildModel` / `propagationTruth` / `conjoin` / `disjoin`.

## 5. Support expressions (Phase 2)

From `buildModel`:
- `supportGroups: Map<target, SupportGroup[]>` — `SupportGroup = { group, conjuncts[] }`.
- Node support = `disjoin(groups.map(g => conjoin(g.conjuncts.map(truth))))`.

## 6. Aggregate state (Phase 3–4)

The reference semantics (`src/derive/judgment.ts`):

```
conjoin(values):  empty -> TRUE; any FALSE|BOTH -> FALSE; all TRUE -> TRUE; else NEITHER
disjoin(values):  empty -> TRUE; any TRUE -> TRUE; all FALSE -> FALSE; else NEITHER
```

Both are **commutative, associative lattice meets** over the multiset of member values. Therefore a **per-group count** is a sufficient statistic:

| Level | Aggregate | Derives |
|---|---|---|
| group | `{ n, nTrue, nFalseOrBoth }` | `conjoin` |
| node | `{ nGroups, nGroupTrue, nGroupFalse }` | `disjoin` |

Note the deliberate deviation: a `BOTH` conjunct yields **FALSE** for the group (not BOTH), so it is counted with FALSE — the aggregate encodes the reference's own choice, not Belnap's.

## 7. Aggregate exactness (Phase 4)

| Test | Count | Mismatches |
|---|---:|---:|
| Conjunctive groups (`counts → conjoin`) | 667 | **0** |
| Disjunctive nodes (`group results → disjoin`) | 635 | **0** |

**The aggregate is EXACT for the reference FOUR semantics** over the sampled prefixes of both canons.

## 8. Incremental update (Phase 5)

Member flip (`TRUE ↔ FALSE`) updated the counts locally, then compared against full recomputation:

| Test | Count | Mismatches |
|---|---:|---:|
| Local count update vs full `conjoin` | 6 | **0** |

(Only 6 member-flips were reachable in the sampled model; the operation is `nTrue±1`, `nFalseOrBoth∓1` — O(1).)

## 9–12. AND / OR / shared support / long chains / switching / force-negate

These all reduce to the same primitive, because the reference itself reduces them to `conjoin`/`disjoin`:
- **AND** — `conjoin` from `{n, nTrue, nFalseOrBoth}`; exact.
- **OR / multiple groups** — `disjoin` from the group results; a group switching valid↔invalid changes one group result, and the node's disjoin is recomputed from the group results in O(#groups). **No single "winning support" needs to be stored** — the full group-result vector is the state.
- **Shared support** — a shared member belongs to several groups; each group's count updates independently. No duplicated semantic evaluation, but the member→group index must exist.
- **Long chains** — the aggregate updates *per group*; propagating the resulting node judgment downstream is a separate concern (explicitly out of scope).
- **Force/negate/retract/setFact/edge ops** — these act through `negated`/`forcedBy`/support membership, **not** through the aggregate. They must be kept as separate dimensions (as the brief requires), and the aggregate covers only the support path.

## 13. Cycle / unfounded boundary (Phase 13)

The aggregate determines the **next support result**, but **Phase B (`unfoundedSet`) is a global fixpoint over the NEITHER candidate set** — a bootstrap cycle's rejection depends on the *whole* candidate set, not on any single group's counts. So:

```
support aggregate      = incrementally maintainable
unfounded set          = separate GLOBAL consistency stage
```

This is exactly the boundary the brief anticipated, and it is **characterised but not tested** here.

## 14. Topology changes (Phase 14)

Node/edge addition and removal change **support-group membership**, which changes the aggregate's *shape* (not just its counts). These are **structural updates** and must be reported separately from member-judgment updates. Not tested (budget).

## 15. S019/S020 witness replay (Phase 15)

The aggregate explains the S020 stale-support cases at the primitive level: a `support`-decided node's validity is a function of its groups' aggregates, and a member change is visible immediately in the counts. What the aggregate does **not** provide is the *downstream* propagation — which is why S020's rule-only predicate failed and why the aggregate must be paired with an execution strategy (a later experiment).

## 16. Shadow-engine audit (Phase 16)

| Input | Class |
|---|---|
| support-group membership, group/conjunct identities | **A — structural** |
| member judgments | **B — existing semantic state** |
| per-group counts, group results | **C — new bookkeeping** |
| computing `conjoin`/`disjoin` from counts | **not D** — it is the *same* lattice meet re-expressed over a sufficient statistic; it never decides a node's truth outside the oracle |

**No class-D logic.** The aggregate does not compute causal consequences, does not implement unfoundedness, and does not decide truth. It is a maintained *summary*, not a second engine.

## 17. Required final answers

| # | Answer |
|---|---|
| **Q1** | **Yes** — conjunctive support has a compact sufficient aggregate (`{n, nTrue, nFalseOrBoth}`). |
| **Q2** | **Yes** — disjunctive support has one (the group-result vector + `{n, nTrue, nFalse}`). |
| **Q3** | Counts of TRUE / FALSE-or-BOTH / NEITHER per group (NEITHER is the residual), plus the group-result vector. |
| **Q4** | **Yes** — membership changes update the affected group's counts in O(1). |
| **Q5** | **Yes** — no full derivation is needed; the group-result vector *is* the switching state. |
| **Q6** | **Yes** — shared members update each consuming group independently; no duplicated semantic evaluation. |
| **Q7** | It stops being sufficient at the **cycle/unfounded boundary**: Phase B is a global candidate-set fixpoint, not a per-group aggregate. |
| **Q8** | **Yes** — unfounded/cycle reasoning can remain a separate global consistency barrier. |
| **Q9** | Partially — the aggregate identifies *when* a previous support is no longer valid (counts change), but not the downstream consequence. |
| **Q10** | A future incremental Phase A would maintain: per-group counts, the group-result vector, the member→group index, and (separately) the `negated`/`forcedBy` accumulators and a global Phase B barrier. |

## 18. Architectural conclusion

> **Support evaluation can be maintained as state rather than recomputed.** The reference's `conjoin`/`disjoin` are lattice meets over a multiset, so a count-based aggregate is an *exact* sufficient statistic and updates in O(1) per member change. This is the smallest maintainable primitive, and it does not create a second engine.

The boundary is equally clear: **Phase B (unfounded sets) is global and must remain a separate consistency stage.**

## 19. Limitations

- Cycle/unfounded and topology-change cases were **characterised, not tested** (budget).
- The incremental update test exercised only 6 member-flips on one sampled model.
- Long-horizon storage/update-cost measurements (Phase 17) not run.
- Branch isolation and determinism not separately measured (the aggregate is a pure function of the model and holds no shared state).
- Empirical only; no proof.

## 20. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s021
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s021/probe.ts
```

| Run | Result |
|---|---|
| Baseline | 624/624, verify-facts 3/3, hashes frozen |
| Conjunctive groups | 667, **0 mismatches** |
| Disjunctive nodes | 635, **0 mismatches** |
| Incremental flips | 6, **0 mismatches** |

## 21. Files changed

**Experiment only — no `src/` change:**

```
experiments/s021/probe.ts
experiments/s021/REPORT.md
```

No incremental propagation, no seeded Phase A, no dirty queue, no engine change. P-007 and frozen S005–S020 untouched; nothing merged.

## 22. Commit hashes

| | |
|---|---|
| Ancestor | `f219e67` |
| S021 experiment commit | `{{S021_COMMIT}}` |
