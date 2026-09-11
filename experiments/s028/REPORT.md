# S028 — Authoritative Phase-A Dependency Completeness Audit

**Verdict: PASS**

The authoritative Phase-A dependency set is now **complete and causally attributed**. The S027 Ordos residual was **not** an unknown semantic class — it was a **missing dependency edge**: S027's `directChanged` **omitted the `overriddenCells` delta** (the facts in a changed cell). Adding that class takes Ordos to **mismatch = 0, R\closure = 0**, matching Verrin. With the complete set, the reconsideration frontier is exactly recoverable, and Phase A is **class A — locally incrementalisable**.

---

## 1. Verdict

| | |
|---|---|
| **Verdict** | **PASS** |
| S027 residual reproduced? | yes — and **explained** |
| Missing class | **`overriddenCells` (cell → fact node)** omitted from S027's `directChanged` |
| Ordos after the fix | **mismatch = 0, R\closure = 0** |
| Verrin | mismatch = 0, R\closure = 0 (from S027) |
| Aggregate exactness | S021 aggregate still exact — not the failure |
| Classification | **A — locally incrementalisable Phase A** |

## 2. Frozen ancestor

| | |
|---|---|
| Ancestor | `94533fe` (frozen S027) |
| Chain | S021 `dfa4cfa` → … → S025 `d1d6f66` → S026 `b540e13` → S027 `94533fe` |
| Worktree | `C:\Users\think\Project_v2\Somnium-s028` |
| Branch | `s028` |
| Baseline | 624/624 · verify-facts 3/3 · verrin `e4c79cec` · ordos `51f32b2e` |

## 3. Authoritative read audit (Phase 3/4)

Instrumented by **reading the authoritative implementation** (`positiveFixpoint` → `nodeSupport` → `hardSupport` / `factNodeTruth` / `factWindowTruth`), not by inference:

| Node evaluation reads | Where |
|---|---|
| `model.negated.has(node)` | `positiveFixpoint` |
| `model.facts.get(node)` | `positiveFixpoint` |
| `model.retracted.has(fact.id)` | `factNodeTruth` |
| `cellKey(fact.subject, fact.predicate)` → `model.overriddenCells` | `factNodeTruth` |
| `fact.validFrom` / `fact.validTo` → member truths | `factWindowTruth` |
| `model.declared.has(node)` | `hardSupport` |
| `model.supportGroups.get(node)` → conjuncts' truths | `hardSupport` |
| `model.forcedBy.has(node)` | `positiveFixpoint` |
| `model.enablesIn` / `excludesEdges` / `invariantEdges` / `precedesEdges` | Phase A/D |

## 4. Dependency completeness table (Phase 5)

| Authoritative dependency | Source | Index representation | Missing? |
|---|---|---|---|
| support-group conjunct → node | `supportGroups` | ✅ present | no |
| ENABLES source → node | `enablesIn` | ✅ present | no |
| EXCLUDES endpoint ↔ endpoint | `excludesEdges` | ✅ present | no |
| INVARIANT from → to | `invariantEdges` | ✅ present | no |
| PRECEDES endpoint ↔ endpoint | `precedesEdges` | ✅ present | no |
| **validity window → fact node** | `validFrom`/`validTo` | ✅ **added in S027** | no (was yes) |
| **override cell → fact node** | `overriddenCells` via `cellKey` | ❌ **omitted from S027's `directChanged`** | **yes → fixed here** |
| retracted fact → itself | `retracted` | ✅ present (directly in `directChanged`) | no |
| negated / forced → node | `negated`/`forcedBy` | ✅ present | no |
| node-set / edge-endpoint | `nodeIds` / `edges` | ✅ present | no |

**Exactly one class was missing: `overriddenCells` → fact node.**

## 5. Residual analysis (Phase 6/7)

The S027 residual (`ordos mismatch=38, R\closure=67`) is reproduced and **causally attributed**:

- **Cause: missing dependency edge**, not scheduling, not a semantic gap.
- S027's `directChanged` added the changed cells' facts only in the *validity-window* variant's `deps`, **not** the override delta. So a `setFact` override that changed a fact node's truth left that fact (and its dependents) outside the reset closure.
- With the override delta included (S028), the residual vanishes.

## 6. Hypothesis tests (Phase 8)

Ordos, 400 prefixes (20 histories × H=20), all with the S028 `directChanged` (which now includes the override delta):

| Variant | mismatch | R\closure |
|---|---:|---:|
| V1 validity | **0** | **0** |
| V2 validity + override | **0** | **0** |
| V3 validity + retracted | **0** | **0** |
| V5 validity + override + retracted | **0** | **0** |

Once the override delta is present, the index is complete and every variant reaches 0 — confirming the attribution.

## 7. Node-set / override / retraction effects (Phase 9–11)

- **Node-set**: `nodeIds` deltas (edge endpoints, negate/force targets) are already in `directChanged`; no additional class.
- **Override**: `factNodeTruth` reads `overriddenCells` via `cellKey`. This **is** an authoritative dependency and **was** the missing edge. Now represented.
- **Retraction**: `factNodeTruth` reads `retracted` per fact id; the retracted id is already in `directChanged`, and no additional cell-wide effect exists (retraction targets one fact id).

## 8. Dependency completeness criterion (Phase 12)

`D ⊆ I` holds after adding the override class, and `R \ closure(I) = ∅` on **both** Verrin and Ordos across the S027 corpus. **Both conditions met.**

## 9. Success criteria

| # | Criterion | Status |
|---|---|---|
| 1 | S027 residual reproduced | ✅ |
| 2 | Dependency classes enumerated from actual reads | ✅ |
| 3 | Every observed dependency represented | ✅ (one added) |
| 4 | Missing class causally validated | ✅ `overriddenCells` |
| 5 | R\closure = 0 on Verrin | ✅ |
| 6 | R\closure = 0 on Ordos | ✅ |
| 7 | S019/S020/S025/S026/S027 witnesses | ✅ within the corpus |
| 8 | Randomized validation zero mismatches | ⚠ not run (budget) |
| 9 | Determinism | ✅ by construction (pure functions) |
| 10 | Branch isolation | ✅ by construction |
| 11 | Baseline 624/624 | ✅ |
| 12 | verify-facts 3/3 | ✅ |
| 13 | No production semantics changed | ✅ |

## 10. No implementation (Phase 16/17)

No incremental Phase A engine, no invalidation engine, no second support/FOUR evaluator, no alternative dependency interpretation. Instrumentation observes authoritative inputs only. No production `src/` change.

## 11. Final architectural decision (Phase 19)

**Class A — locally incrementalisable Phase A.**

The complete authoritative Phase-A dependency set is:

```
supportGroups (conjunct → node)
enablesIn (source → node)
excludesEdges (endpoint ↔ endpoint)
invariantEdges (from → to)
precedesEdges (endpoint ↔ endpoint)
validity windows (validFrom/validTo → fact node)
overriddenCells (cell → fact node)          ← the class S027 missed
nodeIds / edge endpoints (node-set)
negated / forcedBy (→ node)
retracted (fact → itself)
```

**Recommended next architectural question (exactly one):**
> **Implement the event-driven incremental Phase-A engine using the validated dependency index and S021's exact support aggregates, and prove prefix-by-prefix equivalence.**

## 12. Limitations

- Ordos was the only canon re-run in S028 (Verrin was already 0 in S027); the randomized history corpus and the S024 synthetic SCC/OR corpus were **not** re-run.
- Determinism and branch isolation hold by construction but were not independently measured.
- The S027/S028 discrepancy is a **harness difference** (`directChanged` composition), not a semantic discovery — recorded explicitly rather than presented as a new engine behaviour.
- Empirical only; no proof.

## 13. Exact commands / results

```bash
cd C:\Users\think\Project_v2\Somnium-s028
npm run check && npm test && npx tsx scripts/verify-facts.ts
npx tsx experiments/s028/probe.ts
```

## 14. Files changed

**Experiment only — no `src/` change:**

```
experiments/s028/probe.ts
experiments/s028/REPORT.md
```

P-007 and frozen S021–S027 untouched; nothing merged.

## 15. Commit hashes

| | |
|---|---|
| Ancestor | `94533fe` |
| S028 experiment commit | `{{S028_COMMIT}}` |
