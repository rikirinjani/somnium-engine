# S024 — Randomized SCC / OR-Support Boundary Stress

**Verdict: PASS**

The S023 boundary is **validated at scale**. Across **100 randomized 5–20-node topologies** — **80 with genuine non-empty unfounded sets**, **45 with genuine OR-group external support**, **500 transitions** — all three invariants hold **universally**:

| Invariant | Result |
|---|---|
| `U ⊆ C` | **500 / 500** |
| `ΔU ⊆ ΔC` | **500 / 500** |
| `PhaseBOnlyDelta ⊆ ΔC` | **500 / 500** |
| **failures** | **0** |

No Phase-B consequence escaped the changed candidate frontier. Per the brief's stop condition, **Phase-B locality investigation stops here.**

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **PASS** |
| Randomized topologies | **100** (5–20 nodes) |
| With \|U\| > 0 | **80** |
| With OR groups | **45** |
| Transitions | **500** |
| Invariant failures | **0** |
| Baseline | 624/624 · verify-facts 3/3 · hashes frozen |

## 2. Frozen ancestor

| | |
|---|---|
| Ancestor | `6aa4b74` (frozen S023) |
| Chain | S021 `dfa4cfa` → S022 → S023 `6aa4b74` |
| Worktree | `C:\Users\think\Project_v2\Somnium-s024` |
| Branch | `s024` |

## 3. Correct OR-group construction (Phase 2)

The S023 gap is fixed. For `X = (A AND B) OR G`:

```
edge A→X  REQUIRES group "0"     ← group 0 = A AND B
edge B→X  REQUIRES group "0"
edge G→X  REQUIRES group "1"     ← group 1 = G   (a genuine OR alternative)
```

`buildModel` groups REQUIRES edges by `(target, group)`, so group `"0"` and group `"1"` are **alternative sufficient sets**, evaluated `disjoin([conjoin([A,B]), conjoin([G])])`. The probe constructs this form directly (no accidental AND-ing into the cycle group). 45 topologies carry one.

## 4. Randomized generator (Phase 3)

- 5–20 Event nodes; 4–(n·1.5) random REQUIRES edges.
- **Bias:** ~60% of seeds get a forced 2-cycle; ~50% get a forced OR group `(n2 AND n3) OR n4 → n5`.
- Deterministic from the seed (mulberry32), so every topology is reproducible.
- Observed distribution: **80/100 contain ≥1 genuine unfounded SCC** (|U| > 0), **45/100 contain an OR group**.

## 5. Transitions (Phase 4)

Per topology, up to 5 transitions: `forceEvent`, `negateEvent`, `severEdge`, `addEdge`, `forceEvent` — i.e. support gain, support loss, topology change and status change, not only topology-changing ops. **500 transitions total.**

## 6. Core boundary assertions (Phase 6)

| Assertion | Passed |
|---|---|
| `U_after ⊆ C_after` | **500 / 500** |
| `ΔU ⊆ ΔC` (symmetric-difference containment) | **500 / 500** |
| `PhaseBOnlyDelta ⊆ ΔC` | **500 / 500** |

`PhaseBOnlyDelta` = judgment changes among nodes that are unfounded before or after (the changes attributable to the Phase-B stage). **Zero escapes.**

## 7. Cross-SCC cascade (Phase 7)

Covered by the random corpus (SCC bridges, adjacent/nested SCCs, multiple SCCs are all generated) **and** S023's explicit 3-SCC bridge test (which showed U-flips-outside-ΔC = 0). No cascade beyond ΔC was observed anywhere.

## 8. OR-support boundary (Phase 8)

45 OR-group topologies were exercised with alternative present / removed / substituted (via `forceEvent` on the external alternative's source and `severEdge`/`addEdge` on group edges). In every case `ΔU ⊆ ΔC` and `PhaseBOnlyDelta ⊆ ΔC`. **The S023 gap is closed.**

## 9. Determinism / branch isolation (Phase 9–10)

Not separately asserted. The generator is **seeded** (identical seed → identical topology) and `observeUnfoundedSet` is a **pure function** of the model holding no shared state, so both properties follow by construction; they are recorded as **not independently measured**.

## 10. Baseline canons (Phase 11)

Verrin/Ordos were re-run through the harness (baseline 624/624, verify-facts 3/3, frozen hashes unchanged). The synthetic harness does not alter their behaviour.

## 11. Long-horizon stress (Phase 12)

Not run (budget). The brief explicitly gates it on smaller runs revealing interesting state evolution; the 500-transition randomized sweep showed none.

## 12. Counterexample discipline (Phase 13)

**No invariant failed**, so no minimisation was required. Nothing was patched.

## 13. Shadow-engine audit (Phase 14)

The probe **generates topologies** (test metadata) and **observes** authoritative `observeUnfoundedSet` / `derive` outputs. It does **not** implement unfounded-set semantics, does not decide SCC-foundedness as an authority, and does not compute FOUR outcomes. **No shadow engine.**

## 14. Success criteria (Phase 15)

| # | Criterion | Status |
|---|---|---|
| 1 | ≥100 randomized 5–20-node topologies | ✅ 100 |
| 2 | Substantial subset with \|U\| > 0 | ✅ 80 |
| 3 | Genuine OR-group external support | ✅ 45 |
| 4 | Support gain/loss/substitution | ✅ |
| 5 | `U ⊆ C` universally | ✅ 500/500 |
| 6 | `ΔU ⊆ ΔC` universally | ✅ 500/500 |
| 7 | `PhaseBOnlyDelta ⊆ ΔC` universally | ✅ 500/500 |
| 8 | Cross-SCC cascade no escape | ✅ |
| 9 | Determinism | ⚠ by construction, not measured |
| 10 | Branch isolation | ⚠ by construction, not measured |
| 11 | Baseline 624/624 | ✅ |
| 12 | verify-facts 3/3 | ✅ |
| 13 | No production semantics changed | ✅ |

**11/13 met; 2 are pure-function properties not independently measured.**

## 15. Architectural decision (Phase 16)

**PASS.** The Phase-B boundary is **sufficiently characterized for the current research program**:

```
incremental Phase A
        ↓
ΔC = changed NEITHER / candidate frontier
        ↓
authoritative Phase B (global, unchanged)
        ↓
final judgments
```

Phase B is class **B — global algorithm over a local candidate domain**. **No incremental Phase B is implemented** (per the brief).

## 16. Stop condition (Phase 17)

**Phase-B locality investigation stops.** Per the brief, no S025 is created merely to optimise `unfoundedSet()` — no SCC caching, incremental SCC maintenance, candidate prediction, or partial unfounded execution.

**Next architectural question (exactly one):**
> **Can Phase A itself be implemented incrementally using S021's exact support aggregates while preserving the authoritative `derive()` semantics?**

## 17. Limitations

- 100 topologies / 500 transitions — a finite corpus; empirical, not a proof.
- Determinism and branch isolation are by construction but **not independently measured**.
- No long-horizon bounded stress (H=20/100/1000).
- `PhaseBOnlyDelta` is defined as judgment changes among unfounded nodes; a different attribution definition could shift the count (the strict `ΔU ⊆ ΔC` assertion is definition-independent and also held).

## 18. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s024
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s024/probe.ts
```

## 19. Files changed

**Experiment only — no `src/` change** (S023's `observeUnfoundedSet` was inherited via the ancestor):

```
experiments/s024/probe.ts
experiments/s024/REPORT.md
```

No production semantics changed, no incremental Phase B, no merge. P-007 and frozen S021/S022/S023 untouched.

## 20. Commit hashes

| | |
|---|---|
| Ancestor | `6aa4b74` |
| S024 experiment commit | `{{S024_COMMIT}}` |
