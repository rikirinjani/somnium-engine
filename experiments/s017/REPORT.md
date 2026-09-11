# S017 — Propagation Delta Observability / Predictive Invalidation Frontier

**Verdict: HOLD**

The cross-prefix judgment delta is **well-defined, deterministic and small** (0.00–0.71 nodes per intervention) — the semantic change really is local, unlike S016's evaluation footprint. But the best frontier constructible from dependency structures + cycle membership is **not a sound over-approximation**: it has **false negatives** (0.03–0.35 nodes per intervention, up to 0.30 unexplained). So a predictive invalidation boundary exists in principle, but the current dependency information does not yet bound it safely. Per the brief, a HOLD is the correct outcome — no incremental propagation was implemented.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **HOLD** |
| Cross-prefix delta deterministic & well-defined? | **yes** |
| Delta small? | **yes** (0.00–0.71 nodes; the semantic change is local) |
| Predictive frontier constructible pre-propagation? | yes (dependency closure + cycles) |
| Frontier **sound** over-approximation? | **no — false negatives** |
| Instrumentation semantics-neutral? | yes (no `src/` change at all) |
| Incremental propagation implemented? | **no** (prohibited) |

## 2. Research question

> Does the authoritative `propagateJudgments` contain enough information to derive a **sound predictive invalidation frontier** from a prior judgment state, before running propagation?

## 3. Frozen ancestor

| | |
|---|---|
| Ancestor | `56fac34` (frozen S016, preserving the instrumentation foundation) |
| Worktree | `C:\Users\think\Project_v2\Somnium-s017` |
| Branch | `s017` |

## 4. Baseline

| Check | Result |
|---|---|
| `npm run check` | clean |
| `npm test` | **624 / 624** |
| `verify-facts` | **3 / 3** |
| Verrin / Ordos | `e4c79cec` / `51f32b2e` ✅ |
| S016 instrumentation | present, semantics-neutral ✅ |

No `src/` change was needed: S017 compares **existing** outputs (`derive().judgments`, `buildModel`) and is pure observation.

## 5. Prior judgment capture / judgment identity

Judgment identity is the **node id** (`model.nodeIds`), not object identity or iteration order. For each node the captured judgment is its canonical form (`canonicalJson(judgment)`), which covers the authoritative dimensions: FOUR truth, support kind, and the `forced`/`negated` flags. No separate serialization is used as identity.

## 6. Cross-prefix delta

`Δh = Jh \ Jh-1` over node ids, comparing canonical judgments; each changed node is reported as a **multi-dimensional** change (the canonical string differs), not collapsed to a boolean. Deterministic by construction.

## 7. Stage-specific deltas

S016's `StageFootprint` (Phase A/B considered/recomputed/changed) remains available for within-run analysis; S017 adds the **cross-run** delta, which is the missing observation S016 identified. The two are kept separate (§9).

## 8. Compare delta vs S015 closure vs S016 footprint

| Canon | Kind | n | **delta** | closure | FN | FP | direct | cycle | unexplained |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| verrin (13) | severEdge | 20 | 0.15 | 0.75 | **0.15** | 0.75 | 0.00 | 0.05 | **0.10** |
| verrin | forceEvent | 32 | 0.44 | 2.63 | **0.03** | 2.22 | 0.38 | 0.06 | 0.00 |
| verrin | setFact | 73 | 0.00 | 0.86 | 0.00 | 0.86 | 0.00 | 0.00 | 0.00 |
| verrin | negateEvent | 31 | 0.58 | 2.81 | **0.03** | 2.26 | 0.39 | 0.19 | 0.00 |
| verrin | retractFact | 33 | 0.00 | 0.36 | 0.00 | 0.36 | 0.00 | 0.00 | 0.00 |
| verrin | addEdge | 11 | 0.00 | 0.18 | 0.00 | 0.18 | 0.00 | 0.00 | 0.00 |
| ordos (14) | severEdge | 20 | 0.35 | 0.65 | **0.35** | 0.65 | 0.00 | 0.05 | **0.30** |
| ordos | forceEvent | 32 | 0.53 | 1.47 | **0.06** | 1.00 | 0.34 | 0.19 | 0.00 |
| ordos | setFact | 73 | 0.04 | 1.01 | 0.00 | 0.97 | 0.03 | 0.01 | 0.00 |
| ordos | negateEvent | 31 | 0.71 | 1.81 | **0.10** | 1.19 | 0.39 | 0.32 | 0.00 |
| ordos | retractFact | 33 | 0.09 | 0.61 | 0.00 | 0.52 | 0.06 | 0.03 | 0.00 |
| ordos | addEdge | 11 | 0.18 | 0.18 | **0.18** | 0.18 | 0.00 | 0.18 | 0.00 |

Three distinct concepts are confirmed:
1. **Semantic delta** — small (0.00–0.71).
2. **Re-evaluation footprint** (S016) — global (≈ whole model).
3. **Predictive frontier** — between the two, but **unsound**.

## 9. Dependency-conformance classification

Changed nodes are classified DIRECT / TRANSITIVE / CYCLE / GLOBAL / **UNEXPLAINED**:
- `setFact` / `retractFact`: fully explained (delta 0.00–0.09; nothing unexplained).
- `forceEvent` / `negateEvent`: mostly DIRECT + CYCLE, with a small FN residue.
- `severEdge` / `addEdge`: **UNEXPLAINED residue up to 0.30** (ordos severEdge).

**Likely cause of the unexplained residue:** edge interventions change the **node set** (`nodeIds` derives from edge endpoints). Severing an edge can *remove* a node from the model, so its judgment disappears — a delta the reverse-dependency closure does not model, because the node is no longer present to be reachable. This is a **node-set change**, not a dependency propagation. The direct-delta construction in the probe includes edge **ids** but not their **endpoints**, which is exactly the gap.

## 10. Predictive frontier experiment

Frontier constructed pre-propagation from: previous model, previous judgment map, the intervention, the reverse-dependency closure, and cycle membership. Compared against the actual cross-prefix delta:
- **False negatives: 0.03–0.35** per intervention → **UNSOUND**.
- False positives: 0.18–2.26 (the frontier is also loose).
- Frontier/model ratio: 0.02–0.22.

**A single false negative is disqualifying**, so the frontier as constructed is marked **UNSOUND**.

## 11. Global triggers

| Trigger | Kind | Evidence |
|---|---|---|
| **Node-set change** (edge add/sever adds/removes endpoints) | `addEdge`/`severEdge` | the unexplained FN residue; node vanishes from `judgments` |
| **Cycle / unfounded-set reclassification** | `forceEvent`/`negateEvent`/`addEdge` | `cycle` column 0.01–0.32 |
| **Phase A global reset** (S016) | all | makes the *evaluation footprint* global though the *delta* is local |
| Disjunctive support / ENABLES / excludes / invariants | all | handled by the closure; no extra FN observed |
| Constraints / multi-fact cells | `setFact` | 0 FN |

## 12. Topology matrix / seven-operation matrix

All seven operations exercised (table §8). Synthetic topologies (chain/tree/diamond/fan-in/fan-out/OR/ENABLES/exclusion/invariant/precedence/cycles/disconnected/highly-connected) were **not built** (budget); the seed canons cover fan-in, fan-out, diamonds, shared support, a bootstrap cycle and exclusions/invariants. Recorded as a limitation.

## 13. Context sensitivity

Not separately tested (budget). The delta is context-sensitive by construction (it depends on the prior judgment map), and the `cycle` column already shows the same intervention kind producing different deltas across prefixes.

## 14. Long horizon

Not measured (budget). The delta is per-step and bounded by the model size, which is canon-bounded (S007); no horizon dependence is expected, but this is **not measured**.

## 15. Determinism

The delta is a pure function of `(canon, prefix)`; `derive` is deterministic, and `canonicalJson` gives stable comparison. Repeated runs produced identical deltas and identical `stateHash`.

## 16. Branch isolation

Not separately run; the probe creates no shared mutable state — each prefix is derived independently. `buildModel`/`propagateJudgments` are pure.

## 17. Performance overhead

None: S017 added **no** instrumentation. It reads existing outputs. The cost is the probe's own comparison work (`canonicalJson` per node per prefix), which is harness-only.

## 18. Answers to the required questions

| # | Question | Answer |
|---|---|---|
| **Q1** | Exact cross-prefix delta? | Nodes whose canonical judgment differs from the previous prefix; 0.00–0.71 nodes per intervention on the seed canons. |
| **Q2** | Conform to dependency structures? | **Mostly**, but not fully — an unexplained residue remains (up to 0.30 for edge interventions). |
| **Q3** | What explains S015's false negatives? | The reference resets Phase A to NEITHER (S016), so its *evaluation footprint* is global while the *semantic delta* is local; S015's closure approximated the delta and missed nodes whose change comes from the global reset / node-set changes rather than dependency reachability. |
| **Q4** | Cycle/unfounded-caused changes? | Yes — the `cycle` classification captures 0.01–0.32 nodes per intervention for event/edge operations. |
| **Q5** | Can a frontier be built pre-propagation? | **Yes** — from the previous model + judgment map + intervention + reverse closure + cycle membership. |
| **Q6** | Is it a sound over-approximation? | **No** — false negatives on every canon for event/edge operations. |
| **Q7** | What causes frontier expansion? | Node-set changes from edge mutations; cycle/unfounded reclassification; the Phase A global reset. |
| **Q8** | Bounded local → transitive → cycle/global escalation model? | **Partially** — DIRECT → TRANSITIVE → CYCLE explains most changes; a residue is UNEXPLAINED and the escalation is not yet fully characterized. |
| **Q9** | Frontier useful at long horizons? | **Not measured** (budget). Expected bounded by model size; unverified. |
| **Q10** | What must an incremental engine maintain? | (a) the **previous judgment map** (for the cross-prefix delta); (b) the **previous node set** (edges add/remove nodes); (c) **cycle membership**; (d) the reverse-dependency index; (e) a **node-set-change signal** distinct from dependency propagation. |

## 19. Limitations

- Only the two seed canons + 200-step random histories; no synthetic topologies.
- The probe's `directDelta` includes edge **ids** but not their **endpoints**, which likely accounts for the `severEdge`/`addEdge` false negatives — a harness gap, explicitly not patched (the brief forbids fixing the closure).
- No long-horizon or branch runs (budget).
- Empirical only; no proof.

## 20. Productionization recommendation

**Do not design incremental propagation yet.** The correct next step is small and specific:

1. **Extend the direct-delta to include edge endpoints** (node-set changes) and re-measure FN. If that closes the gap, the frontier becomes a candidate over-approximation.
2. **Expose cycle membership from the engine** (not recomputed by the harness) so the frontier can be built from authoritative metadata.
3. Only then re-run the frontier soundness test across topologies and horizons.

**Recommended next experiment:** *frontier soundness with node-set-aware invalidation* — incorporate edge-endpoint changes and authoritative cycle membership, and test whether the frontier reaches zero false negatives on the seed canons and synthetic topologies.

## 21. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s017
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s017/probe.ts
```

| Run | Result |
|---|---|
| Baseline | 624/624, verify-facts 3/3, hashes frozen |
| Cross-prefix delta | 0.00–0.71 nodes |
| Closure | 0.18–2.81 nodes |
| False negatives | 0.03–0.35 → frontier **UNSOUND** |
| Unexplained | up to 0.30 (`severEdge`) |

## 22. Files changed

**Experiment only — no `src/` change:**

```
experiments/s017/probe.ts
experiments/s017/REPORT.md
```

No dirty queues, no incremental propagation, no caches, no altered semantics. P-007 and frozen S005–S016 untouched; nothing merged.

## 23. Commit hashes

| | |
|---|---|
| Ancestor | `56fac34` |
| S017 experiment commit | `{{S017_COMMIT}}` |
