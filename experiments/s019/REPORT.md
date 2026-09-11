# S019 — Prior-Judgment Seeded Phase-A Equivalence

**Verdict: BLOCKED**

Complete prior-truth seeding (Experiment A) is **not** reference-equivalent: **26 of 400 steps diverge (6.5%)**, all stale-state failures. The mechanism is precise: **Phase A is sticky — a decided node is never recomputed** — so a seeded `TRUE` whose support the intervention removed is *preserved forever*. The reset to `NEITHER` is therefore **semantically necessary** for the current sticky Phase A. Making seeding viable requires **invalidation** (a later experiment), not seeding alone.

This is the "NO" branch the brief anticipates; it is documented precisely rather than optimised around.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **BLOCKED** |
| Experiment A (complete seeding) | **fails** — 26/400 divergences |
| Cause | sticky Phase A never recomputes a seeded value |
| Reset to `NEITHER` necessary? | **yes, for the current sticky algorithm** |
| Semantics changed? | yes — stale values persist |
| Second semantic engine? | no (rules reused; only the initial state differs) |

## 2. Research question

> Can the previous authoritative Phase A judgment map serve as a valid starting point for the next derivation, while the existing propagation rules remain authoritative?

**Answer: not by complete seeding alone.**

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `c652204` (frozen S018) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s019` |
| Branch | `s019` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Verrin / Ordos | `e4c79cec` / `51f32b2e` ✅ |
| `propagateJudgments` reference | unchanged |

## 5. Experimental change (isolated to S019)

`src/derive/propagation.ts`:
- `positiveFixpoint(model, fp?, seed?)` — the initial truth map is now `seed?.get(node) ?? "NEITHER"`. **The propagation rules are unchanged.**
- `propagateJudgments(model, footprint?, seed?)` — threads the seed.
- new `propagationTruth(model, seed?)` — exposes the authoritative truth map (reuses `positiveFixpoint`/`unfoundedSet`; no second implementation).

`buildModel` and the default `propagateJudgments(model)` path are unchanged. Tests re-verified after the change: 624/624, verify-facts 3/3, frozen hashes intact.

## 6. Experiment A — complete seeding

For each prefix `H[:i]`, seed `H[:i+1]`'s propagation with the **entire** authoritative truth map of `H[:i]` (captured from the reference, not reconstructed), then compare node-by-node against the from-scratch reference.

| kind | n | mismatches | example |
|---|---:|---:|---|
| `negateEvent` | 84 | **19** | `ev/treaty-of-ash: ref=FALSE seeded=TRUE` |
| `retractFact` | 32 | **2** | `fact/seal-held-vaela: ref=FALSE seeded=TRUE` |
| `setFact` | 152 | **1** | `fact/charter-grants-veto: ref=FALSE seeded=TRUE` |
| `forceEvent` | 68 | **1** | `ev/charter-veto-invoked: ref=TRUE seeded=FALSE` |
| `severEdge` | 38 | **3** | `ev/vara-vow: ref=TRUE seeded=FALSE` |
| `addEdge` | 26 | 0 | — |
| **total** | **400** | **26 (6.5%)** | |

**Verdict A: complete prior-truth seeding IS NOT reference-equivalent.**

## 7. Negative control (mandatory, Phase 15)

`forceEvent(ev/ashfall-falls) → negateEvent(ev/ashfall-falls)`:

| | value |
|---|---|
| reference | `FALSE` |
| seeded | **`TRUE`** |
| stale? | **yes** |

The seeded run preserves the `TRUE` the force produced; the later negation cannot lower it because the node is already decided. **The seeded algorithm does not repair stale judgments.**

## 8. Why it fails — the exact stale-state mechanism

Phase A is a **sticky** monotone fixpoint:

```
if (current !== "NEITHER") continue;   // sticky: already decided
```

A seeded value is therefore *never* re-evaluated. Any intervention that **removes** support, **negates**, **retracts**, or **severs** the reason for a prior `TRUE` leaves that `TRUE` in place. The reset to `NEITHER` is what forces every node to be *re-earned* from the current model. **That is exactly why the reset is semantically necessary.**

## 9. Seed validity analysis (Phase 8)

| transition | possible under seeding? |
|---|---|
| TRUE → FALSE | **no** (stale TRUE persists) |
| FALSE → TRUE | no |
| TRUE → UNKNOWN | **no** |
| UNKNOWN → TRUE | yes |
| NEITHER → established | yes (the only direction the sticky rule moves) |
| established → NEITHER | **no** |
| force removal | **no** |
| negation removal | **no** |
| edge removal / cycle creation / destruction | **no** (for already-decided nodes) |

Seeding is only sound for **monotone-increasing** interventions. Every support-removing or status-inverting intervention is unsafe.

## 10. Invalidation requirement (Phase 9)

A prior judgment **cannot** be preserved merely because it was previously computed. Seeded Phase A requires an explicit distinction between:

```
previous value
previous value whose support remains valid
```

The minimum information to make that distinction is **provenance of the prior decision** — at least: which support group (or `forcedBy`/`negated` override) decided the node, and whether the intervention invalidated it. That is exactly the invalidation mechanism S019 is forbidden to implement.

## 11. Recompute frontier / global consistency (Phase 10–11)

Not reached: Experiment A failed, so no seeded frontier is meaningful. The sticky Phase A remains a single global monotone closure; Phase B (`unfoundedSet`) remains a global candidate shrink. Both are unchanged.

## 12–13. Determinism / branch isolation

The seeded path is deterministic (the seed is a pure function of the prefix), and the probe holds no shared mutable state. Not separately measured, because the mechanism is already disqualified.

## 14. Long horizon

Not run — Experiment A failed at H≤200, so horizon scaling is moot.

## 15. Required architectural answers

| # | Answer |
|---|---|
| **Q1** | **No** — complete prior-judgment seeding does not converge to the authoritative fixpoint (26/400 diverge). |
| **Q2** | — (Q1 is no) |
| **Q3** | The exact stale-state mechanism: **sticky Phase A never recomputes a decided node**, so a prior `TRUE` whose support the intervention removed is preserved. |
| **Q4** | Every prior judgment whose **support / override** was invalidated by the intervention — i.e. anything the intervention can weaken: support removal, `negateEvent`, `retractFact`, `severEdge`, cycle creation. |
| **Q5** | **Not from structure alone as tested** — determining "support remains valid" requires knowing *which* support decided the node (provenance), which is beyond the structural frontier of S017/S018. |
| **Q6** | It changes starting values only; it does **not** reduce reconsideration (it removes it, unsoundly). |
| **Q7** | All current global mechanisms remain: Phase A's global sticky closure and Phase B's global unfounded-set shrink. |
| **Q8** | Not demonstrated. A global Phase B barrier remains necessary; Phase A cannot become incremental without invalidation. |
| **Q9** | Minimum persisted state: the prior truth map **plus per-node decision provenance** (which support group / override decided it). The truth map alone is insufficient. |
| **Q10** | It points to **neither** yet: naive seeding is a full-propagation variant that is *wrong*; a genuine incremental engine first needs an invalidation mechanism (a separate experiment). |

## 16. Architectural conclusion

> **Somnium cannot simply preserve the previous fixpoint.** The reset to `NEITHER` is semantically necessary because the authoritative Phase A is sticky and monotone-increasing: it can only *add* decisions, never *retract* them. Prior-state seeding is sound only for monotone-increasing interventions and unsound for every support-removing one.

The next research problem is therefore the one the brief names: **what is the minimum sound invalidation mechanism needed to update a preserved fixpoint?** — which requires per-node decision provenance, not merely the prior judgment map.

## 17. Limitations

- Seed canons + 200-step random histories; the full adversarial corpus (Phase 6) was not separately enumerated (the foundational Experiment A already failed).
- Only the sticky Phase A seeding was tested; seeded Phase B was not isolated.
- Long-horizon, branch, and determinism measurements not run (mechanism disqualified).
- Empirical only; no proof.

## 18. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s019
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s019/probe.ts
```

| Run | Result |
|---|---|
| Baseline / post-change | 624/624, verify-facts 3/3, hashes frozen |
| Experiment A | **26/400 divergences (6.5%)** |
| Worst kind | `negateEvent` 19/84 |
| Control (`force→negate`) | ref `FALSE`, seeded `TRUE` (stale) |

## 19. Files changed

**`src/` (experimental, isolated to S019):**

```
src/derive/propagation.ts   positiveFixpoint gains an optional seed;
                            propagateJudgments threads it; new propagationTruth
```

**Experiment:**

```
experiments/s019/probe.ts
experiments/s019/REPORT.md
```

No dirty queue, no invalidation, no selective recomputation, no cached fixpoint, no semantic rule change. `buildModel` default unchanged. P-007 and frozen S005–S018 untouched; nothing merged.

## 20. Commit hashes

| | |
|---|---|
| Ancestor | `c652204` |
| S019 experiment commit | `{{S019_COMMIT}}` |
