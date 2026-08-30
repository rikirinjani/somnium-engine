# Somnium Engine â€” Architectural Reconnaissance Report

**Date:** 2026-08-30 Â· **Status:** DRAFT v0.1 Â· **Ancestor:** Kronos Engine (`C:\Users\think\Project_v2\Kronos Engine`) Â· **Sibling repo, no code shared.**

## 0. How this report was produced

Two explorer recon lanes read the KE repository (engine/timeline core; sectors/experiment/governance). A planned oracle design lane failed upstream (API credit exhaustion) and was not retried; the design analysis in sections 4â€“12 was performed by the orchestrator directly, grounded in the two file-cited recon reports. All KE claims cite the two recon outputs, which cite file paths and line numbers.

---

## 1. KE components worth carrying forward

The generic (domain-independent) mechanisms, per recon, flagged `[GENERIC]`:

1. **Universe identity + genealogy** (`src/engine/universe.ts:1`): `UniverseID { id, rngSeed, parent, rewindTick, intervention, created, label }` with a `parent` chain enabling lineage reconstruction. Carry the shape; drop `rngSeed`, and record `intervention` as a typed object, not a JSON string.
2. **Determinism mechanism as a tested invariant** (`src/engine/rng.ts`, `determinism.test.ts`): single RNG stream with call-count restore-and-replay; the *pattern* "same seed â‡’ same world, asserted by dedicated tests" carries. The RNG itself does NOT (see Â§3.3).
3. **Rewind Point with content hash + verify()** (`src/timeline/rewind-point.ts:86,123`): `stateHash` over sorted-key JSON (FNV-1a, `hash.ts:1`) gives tamper detection. Carry the hashing + verify pattern, re-targeted to narrative cuts.
4. **Functional per-tick advance** (`src/engine/world-engine.ts:77`): `tick()` returns a new state and never mutates the input; old state preserved by reference is what makes rewind points safe. Carry the *principle* (immutability of the past), not the tick loop.
5. **Branching by rewind-then-re-run** (`src/timeline/branch.ts:152`): snapshot â†’ restore â†’ apply intervention â†’ run forward â†’ diff. The *concept* carries; SE makes the fork O(1) instead of O(state Ã— ticks) (see Â§4).
6. **Generic shape-agnostic diff engine** (`src/experiment/diff-engine.ts:4`): recursive path extraction over any object. The *concept* carries; numeric-only leaves do not (see Â§3.1).
7. **Experiment artifact shape** (`src/experiment/types.ts` + `wwii-no-war.ts`): an `ExperimentSet { runId, seed, intervention, diff }` persisted to JSON. Carry the shape minus statistics.
8. **Testing conventions**: Vitest, colocated `*.test.ts`, dedicated determinism/invariant/cadence suites (`determinism.test.ts`, `invariants.test.ts`, `cadence.test.ts`). Carry verbatim.
9. **Governance conventions**: HANDOFF.md pending/active/completed ledger (commit-push protocol, HANDOFF.md:9-18); QMS record formats (NCR/verification JSON schemas); `verify-facts` CI gate (`scripts/verify-facts.ts` + `.github/workflows/ci.yml`); per-module contract `.md` files (`src/sectors/contracts/*.md`). All domain-agnostic â€” adopt verbatim in SE.
10. **`src/api/server.ts` REST shape** (`[GENERIC]`): status/eras/experiments GET+POST with JSON/CSV export. Reusable shape for a future query API; not part of the PoC.

## 2. KE components that should be discarded

1. **Numeric scalar world state** (GDP, CO2, population, casualties): Earth-specific; narrative state is relational/categorical, not a vector of indicators.
2. **The `Sector` interface + tick/cadence lifecycle** (`src/sectors/types.ts:29`, `world-engine.ts:84`): time-advancing isolated numeric processes. Narrative worlds have no wall-clock tick; they have a partial order of events. Discard the interface; do NOT adapt it.
3. **Cross-sector event bus** (`src/sectors/event-bus.ts`, `events.ts`): ordering depends on Map insertion order (`HANDOFF.md:163` flags this as caller-dependent); eager handler dispatch is a latent nondeterminism leak (`event-bus.ts:10`). SE propagation must be order-independent by construction. Discard.
4. **RNG/mulberry32 + seed splitting + call-count restore** (`rng.ts:8`, `world-engine.ts:45`): SE v1 has zero stochasticity â€” determinism is structural (see Â§14-I). Discard from the core; keep only a `tieBreak` total order for stable iteration. Reintroduce a *single isolated* RNG only if probabilistic edges are ever added, and mark it as the sole nondeterminism source.
5. **Monte Carlo statistics / Cohen's d / CI significance / sensitivity sweeps** (`src/experiment/stats.ts`): variance-based inference is vacuous when the same seed+canon+interventions always produce the same universe. Discard; keep only plain aggregation helpers if ever needed.
6. **The untyped raw state-patch intervention** (`src/timeline/branch.ts:9` `Record<string, Record<string, unknown>>`): silently patches arbitrary keys, no validation, unknown keys silently no-op. Actively harmful for SE, where interventions must be a closed enumerable set (see Â§10). Replace with a typed intervention vocabulary (Â§5).
7. **Era JSON loaders / `StrategicWorldState` / `Nation`/`War`/`Alliance` history types** (`src/engine/era-loader.ts`, `src/timeline/history-types.ts`, `future-types.ts`): Earth-specific. Discard.
8. **Deers Rock adapter + sidecar Python TabFM classifier** (`src/bridge/`, `sidecar/`): project-specific. Discard (the *adapter pattern* â€” wrap external sim, hash inputs, circuit-break â€” is worth a one-line note, not code).
9. **The dead second intervention vocabulary** (`src/experiment/types.ts` `INTERVENTION_TYPES`): unused by the experiment path; Earth-coupled. Discard; SE needs exactly one vocabulary.
10. **The dual divergent diffs** (`diff-engine.ts` vs `branch.ts:61 computeDiff`): two differing diff implementations exist in KE. Discard both; SE needs one typed diff (Â§8).

## 3. Proposed Somnium ontology

### 3.1 Entity kinds (v1 â€” deliberately small)

```ts
type EntityKind = "Character" | "Location" | "Faction" | "Institution" | "Event" | "Work";
```

A **Work** is a canonical story (e.g. "Murder on the Orient Express") â€” a set of Events with order constraints and an authorial fact scope. Relationships are **Facts with two endpoints** (`Poirot â€”employed_byâ†’ SÃ»retÃ©`). Character state at narrative time t = the set of Facts about that character valid at t. Relationship state = the set of two-endpoint Facts. Location/Faction/Institution are first-class so the diff model can answer LocationDiff / FactionDiff directly.

### 3.2 Facts

A **Fact** is a typed attribute with a validity window expressed in *narrative time* (event-bound, not dates):

```ts
interface Fact {
  id: string;
  subject: string;             // entity id
  predicate: string;           // e.g. "located_in", "employed_by", "married_to"
  object: string | number | boolean | null;
  validFrom: string | null;    // event id â€” fact becomes true when this event occurs
  validTo: string | null;      // event id â€” fact becomes false when this event occurs
  source: "canon" | "derived";
}
```

### 3.3 Causal edges

```ts
type EdgeKind = "REQUIRES" | "ENABLES" | "MOTIVATES" | "PRECEDES" | "EXCLUDES" | "INVARIANT";
interface CausalEdge {
  id: string;
  kind: EdgeKind;
  from: string;                // entity/event id
  to: string;                  // entity/event id
  note?: string;
}
```

### 3.4 Canon

Canon = an immutable, versioned document: entities + facts + causal edges + works + constraints, content-hashed (FNV-1a over sorted-key JSON, carrying KE's `hash.ts` pattern). Canon is **not** prose; it is the structured world model. LLM extraction may *produce* a candidate canon, but it is validated and committed as a reviewed diff, never consumed at runtime.

---

## 4. Proposed state model

**Research Q A â€” graph, event-sourced log, temporal graph, or hybrid?**

**Recommendation: hybrid â€” a canonical fact/edge graph + an ordered intervention log, with the world state *derived* by a pure function.**

- The **canonical baseline** is the canon graph G0.
- A **branch is O(1)**: `Branch { universe, canonId, interventions: Intervention[], parent }` â€” it stores *no* mutated state.
- **`derive(canon, interventions) â†’ WorldState`** is a pure, deterministic function: apply each intervention in order (each validated against the *previous* derived world), build the post-intervention fact base, run the monotone fixpoint (Â§5), compute statuses (Â§6), and emit the WorldDiff vs the baseline.
- WorldState is **memoized by (canonHash, interventionListHash)**: branching then re-derives only when queried; identical branches share cached states. This replaces KE's O(state Ã— ticks) deep-clone fork with near-free branching.
- No snapshot/restore/clone machinery is needed for forking â€” KE's `clone.ts` disappears from the hot path.

This design makes depth-N inheritance *structural* (Â§7), replay trivial (`derive` is deterministic by construction), and minimum-intervention search feasible later (Â§10). Trade-off accepted: canonical-base facts are re-propagated per branch, so worst-case cost is O(branches Ã— canon) â€” fine for the PoC; memoization plus the small v1 canon keeps it cheap.

**Narrative time**: partial order over events via PRECEDES edges â€” no tick counter, no wall clock. Fact validity windows are anchored to event ids. This is the decisive break from KE's tick/cadence model.

---

## 5. Proposed causal model

**Research Q B â€” what is a causal dependency?**

**Recommendation: typed causal edges evaluated by a monotone fixpoint over a status lattice.**

- **REQUIRES** (hard necessity): target is impossible without source. Violation â‡’ `UNSUPPORTED` at target (and downstream marking).
- **ENABLES** (soft/access): target is degraded/unreachable, not contradictory. Violation â‡’ `UNSUPPORTED`/`CONTINGENT` (no contradiction). ENABLES is how uncertainty is modeled in v1 â€” *not* probabilities: an ENABLES edge with explicit alternative paths, never a dice roll.
- **MOTIVATES** (psychological/narrative): changes character state, not event status. E.g. `Poirot â€”MOTIVATESâ†’ accepts case`.
- **PRECEDES** (temporal constraint): `A PRECEDES B` â€” if both occur, ordering must hold; violation â‡’ contradiction.
- **EXCLUDES** (mutual exclusion): `A EXCLUDES B` â€” both holding â‡’ contradiction.
- **INVARIANT** (authorial/constraint): global constraint evaluated at fixpoint end (e.g. "the detective always solves the crime", "Poirot never marries"). Violation â‡’ `CONTRADICTORY` at the constraint node.

**Propagation algorithm**: worklist over the post-intervention graph. Each node's status starts at `UNKNOWN`; when a predecessor is marked, its outgoing REQUIRES/ENABLES edges are re-evaluated and the successor's status is raised via lattice join (Â§6). Iterate to fixpoint; monotone, so it terminates. Determinism: iterate nodes in sorted-id order; ties broken by canonical sort â€” order-independent by construction (unlike KE's event bus).

**Negation / removal**: interventions remove facts or edges. To keep the fixpoint monotone, all interventions are applied to the base set first (producing the *post-intervention fact base*), and the fixpoint runs over that. Monotonicity holds w.r.t. the modified base, guaranteeing termination and determinism.

**No probabilities in v1.** If probabilistic edges are ever added, they are the *only* nondeterminism source, isolated behind a single seeded RNG and clearly labeled.

---

## 6. Event/entity status ontology

**Research Q C â€” the five-status strawman (VALID/ALTERED/IMPOSSIBLE/UNREACHABLE/UNKNOWN) is not a lattice and conflates two orthogonal axes.**

**Recommendation: a status lattice; ALTERED is NOT a status.**

```ts
type EventStatus = "UNKNOWN" | "UNSUPPORTED" | "CONTINGENT" | "ESTABLISHED" | "EXCLUDED" | "CONTRADICTORY";
```

Lattice (join):
- `UNKNOWN` (âŠ¥) â€” not yet evaluated
- `UNSUPPORTED` â€” evaluated; no valid derivation path (prerequisite missing)
- `CONTINGENT` â€” derivable, but only via soft/enabling paths (no hard guarantee)
- `ESTABLISHED` â€” all hard prerequisites satisfied; occurs in this world
- `EXCLUDED` â€” blocked by EXCLUDES edge or explicit removal (incomparable with ESTABLISHED)
- `CONTRADICTORY` (âŠ¤) â€” requires X and Â¬X
- `join(ESTABLISHED, EXCLUDED) = CONTRADICTORY`; `join(UNSUPPORTED, CONTINGENT) = CONTINGENT`.

**Where does ALTERED go?** An event that still occurs but with different parameters keeps status `ESTABLISHED`; its *alteredness* lives in the **diff** (parameter deltas), not in the status. This is the one place the strawman is actively corrected: a five-value flat enum cannot support the join operation the fixpoint needs, and ALTERED-as-status would hide parameter changes inside a status instead of exposing them in a diff. User-facing mappings: "altered" = status ESTABLISHED + non-empty parameter diff; "impossible" = UNSUPPORTED under REQUIRES (or EXCLUDED); "causally disconnected" = UNSUPPORTED with no path; "preserved" = ESTABLISHED + empty diff; "delayed" = ESTABLISHED with shifted PRECEDES window.

**Character/relationship state** is not a status â€” it is the derived Fact set plus derived attributes (see Â§3.2). Statuses apply to Events, Works, and constraint nodes only.

**Contradictions** (Â§14-C): never auto-repaired. The engine emits a `ContradictionRecord { a, b, source: interventionId | "canon", detectedAt }` with derivation provenance, and the world state is returned *including* the contradiction. Contradictions are first-class queryable objects.

---

## 7. Proposed Rewind Point model

**Research Q E â€” KE's `RewindPoint { universeId, tick, sectorStates, stateHash, ... }` is tick-based; SE has no ticks.**

**Recommendation: a Rewind Point is a canonical cut over narrative time.**

```ts
interface RewindPoint {
  id: string;                 // "RP-VERRIN-001"
  canonId: string;
  anchorEvent: string;        // the canonical moment ("The Blight begins")
  cut: string[];              // downward-closed set of event ids under PRECEDES
  derivedHash: string;        // hash of derived baseline world state at the cut (FNV-1a, sorted keys)
  label: string;
  tags: string[];
  created: string;            // metadata only â€” never hashed
}
```

- **Definition**: `cut` is the set of canonical events that have *already occurred* at the anchor (the downward closure of the anchor under PRECEDES). Facts whose `validFrom` lies inside the cut are "canonically fixed" at that moment.
- **Validation** (`validateRewindPoint(rp, canon)`): (1) the cut is downward-closed under PRECEDES; (2) the baseline derivation at the cut is contradiction-free; (3) `derivedHash` matches recomputation (carries KE's verify() tamper-detection, `rewind-point.ts:123`).
- **Application**: an intervention attaches at a Rewind Point; the engine re-derives from the cut forward. Example anchors: `RP-VERRIN-001 "The Blight begins"`, `RP-SHERLOCK-001 "Reichenbach Falls"` (future seed libraries, not built-ins).

---

## 8. Proposed counterfactual-depth model

**Research Q F â€” is depth just "number of sequential interventions"?**

**Recommendation: two metrics; depth is genealogical, divergence is structural.**

1. **Genealogical depth** = length of the parent chain from the baseline universe. This is what makes "depth N inherits the complete state of depth N-1" *operational*: because a branch stores `canon + ordered interventions` and `derive()` recomputes from the previous world's full derived state, a depth-N world literally contains everything produced at N-1, except what an intervention explicitly changed. Inheritance is structural, not a convention. (Test: depth-N state must equal the recomputation of baseline + interventions[0..N]; a no-op depth chain must produce a zero diff.)
2. **Divergence score** = a real-valued structural measure: size of the changed-status set + causal distance of the nearest changed node from the intervention site. "Five no-ops" is NOT deeper than one world-altering intervention â€” the metric must reflect structural change, not bookkeeping.

Ship both in the PoC; defer information-theoretic divergence until real canons exist. Document explicitly: **depth is not a scalar of interventions**.

### 8.1 Divergence as implemented (P-002, corrected)

```
score = changedStatusCount * 1
      + changedStateCount  * 1
      + changedFactCount   * 0.5
      + impactedWorkCount  * 2
      + graphDistance      * 1
```

- `changedStatusCount` — entities whose `EventStatus` differs from baseline.
- `changedStateCount` — **narrative state change**: effective facts compared by `(subject, predicate)` where the object *value* differs (absent-vs-present counts). This is what actually changed in the world.
- `changedFactCount` — fact-*record* churn by id (additions + removals + overrides). Retained as a secondary signal at half weight.
- `impactedWorkCount` — canonical Works whose classification differs.
- `graphDistance` — max shortest-path distance from any intervention target to any changed-status node over the post-intervention REQUIRES ∪ ENABLES graph (multi-source BFS, `from`=prerequisite → `to`=dependent). This is a structural DISTANCE over the support graph, not causal reach: it is deliberately independent of truth. It is NOT logical reachability (whether a derivation exists), NOT executability (a graph-connected node can be UNKNOWN, UNSUPPORTED or CONTRADICTORY — the metric says nothing about whether it happens), and NOT causal influence (ENABLES edges are counted, but an enabler never grounds anything).

**Two corrections were forced by implementation, and both matter:**

**(a) Record churn is not state change.** The first implementation counted only `changedFactCount`, which returned an identical 23 at depths 1, 2 and 3 of the Verrin chain `[negate(blight), setFact(vara→thornhollow), relocate(vara→stonehall)]` — three genuinely different worlds, one number. Fact-record churn stayed at 4 while value-aware state change was 3/2/3. Hence `changedStateCount`.

**(b) Divergence is a DISTANCE from baseline, not a monotone accumulator.** The original acceptance test asserted that divergence grows monotonically along a chain. That premise is **false**, and it only passed because the metric was insensitive. An intervention that restores a canonical value moves the world *back toward* baseline and legitimately lowers divergence. Verrin depths 1→2→3 score 26 → **25** → 26: depth 2 sets Vara back to her canonical `loc/thornhollow`, reducing distance. What strictly increases along a chain is *genealogical depth*, never divergence. The acceptance suite now asserts `scores[2] < scores[1]` explicitly as a regression guard.

Known v1 limitation: multiple effective facts sharing one `(subject, predicate)` collapse in the state map. Acceptable for the PoC; revisit when a canon needs multi-valued predicates.

## 9. Proposed diff model

**Research Q D â€” what should the comparison outputs be?**

**Recommendation: ONE generic typed diff over the derived fact/status store, with typed projections. Not six separate differs.**

```ts
interface WorldDiff {
  statusChanges: Record<string, { from: EventStatus; to: EventStatus }>;   // per event / work / constraint
  factAdditions: Fact[];
  factRemovals: Fact[];
  factOverrides: { factId: string; field: string; from: unknown; to: unknown }[];
  edgeChanges: { id: string; added: boolean }[];
  contradictionsIntroduced: ContradictionRecord[];
  contradictionsResolved: ContradictionRecord[];
  reachabilityChanges: { eventId: string; from: boolean; to: boolean }[];
  workStatuses: Record<string, EventStatus>;  // canonical Work â†’ status, answering "which stories survive / are altered / are impossible / are causally disconnected"
}
```

Typed views â€” CharacterDiff, EventDiff, RelationshipDiff, LocationDiff, FactionDiff, WorkDiff, CanonDiff â€” are **projections over the same WorldDiff** (filter facts by subject/endpoint/entity kind), not separate implementations. This kills KE's dual-diff divergence problem (`diff-engine.ts` vs `branch.ts:61`) by construction. A Work whose status is ESTABLISHED but whose parameter diff is non-empty is "altered"; the answer is in the diff, not the status (Â§6).

---

## 10. Proposed minimum-intervention query model (deferred)

**Research Q H â€” "what is the minimum intervention for Poirot and Miss Marple to meet?"**

This is **abduction over the intervention space**: find the smallest intervention set S such that `derive(canon, S)` satisfies a target query (reachability of a Fact). Candidate classes: minimum-cardinality model revision / MaxSAT / beam search over a finite intervention catalog.

**Not implemented in the PoC**, but three properties are designed in now so it becomes possible later:

1. **Interventions are a closed, typed, enumerable vocabulary** (`negateEvent | forceEvent | setFact | retractFact | severEdge | addEdge | relocate`), not arbitrary patches â€” a search can enumerate candidate sets.
2. **`derive()` is pure and cheap** (memoized; O(canon) worst case) â€” a search can call it thousands of times.
3. **Every status carries a derivation path** (provenance chain) â€” a solver can trace which facts actually matter and prune the search.

KE's raw state-patch intervention (`branch.ts:9`) would make this impossible â€” another reason it was discarded.

---

## 11. What NOT to carry from KE â€” blunt summary

| KE concept | Verdict | Why |
|---|---|---|
| Sector interface + tick/cadence | **Discard** | Narrative worlds have no wall-clock; process-structure replaces narrative structure |
| Cross-sector event bus | **Discard** | Order-dependent (insertion order); SE must be order-independent by construction |
| RNG / seeds / call-count restore | **Discard (core)** | Zero stochasticity in v1; determinism is structural. Reintroduce only as isolated labeled exception if probabilistic edges arrive |
| Monte Carlo / CI / Cohen's d | **Discard** | Vacuous without sampling variance |
| Raw state-patch intervention | **Discard** | Unvalidated, unenumerable; blocks minimum-intervention search |
| Numeric-only diff | **Discard** | Narrative diffs are structural, not scalar |
| Era JSON / StrategicWorldState / history types | **Discard** | Earth-specific |
| Deep-clone snapshot fork | **Adapt** | Replaced by O(1) derive-from-intervention-log |
| FNV-1a sorted-key hashing | **Carry** | RP integrity + memoization keys |
| Universe genealogy (parent chain) | **Carry** | Re-targeted to canon + interventions |
| Governance (HANDOFF/QMS/verify-facts) | **Carry verbatim** | Domain-agnostic |
| Testing conventions (Vitest colocated) | **Carry verbatim** | Domain-agnostic |
| Generic recursive diff concept | **Carry** | Re-implemented as typed structural diff |
| REST API shape | **Carry (later)** | Not in PoC |

---

## 12. Major risks and failure modes

1. **LLM creep into the core** â†’ the core package has zero network/LLM imports (enforced by CI dependency check). The LLM's only two touchpoints: canon *ingestion* (validated, reviewed as a diff, committed â€” never consumed at runtime) and optional *narration* of an already-computed WorldDiff.
2. **Ontology sprawl** â†’ v1 caps entity kinds at 6 and edge kinds at 6. Any new kind requires a failing acceptance query first (test-first).
3. **Contradiction laundering** â†’ property test: a known-inconsistent fixture must yield `CONTRADICTORY` + a `ContradictionRecord`; the engine never silently repairs.
4. **Depth faking** â†’ inheritance is structural (`derive` from full previous state); a test asserts depth-N âŠ‡ depth-(N-1) except for explicit overrides, and that a no-op chain yields zero diff.
5. **"Just ask the LLM" drift** â†’ every answer must trace to a derivation path in the world model; narration is a labeled view over the diff, not the answer.

---

## 13. Minimal proof-of-concept

**Seed library: "Verrin" â€” a tiny invented universe** (avoids canon/copyright ambiguity; Â§13 of the brief). Scale: ~6 characters, ~12 events, 2 factions, 3 locations, 1 institution, 3 Works, ~20 causal edges.

PoC must demonstrate all 10 required capabilities:

| # | Capability | Verrin demonstration |
|---|---|---|
| 1 | baseline canon | Verrin canon document, content-hashed |
| 2 | one Rewind Point | `RP-VERRIN-001 "The Blight begins"` |
| 3 | one intervention | `negateEvent(blight-begins)` â€” the "WWI never happens" analogue |
| 4 | causal propagation | fixpoint marks downstream events UNSUPPORTED / EXCLUDED |
| 5 | changed character state | protagonist Vara stays in Valdar; `employed_by` facts change |
| 6 | changed event reachability | a canonical Work becomes IMPOSSIBLE / ALTERED |
| 7 | branch genealogy | `U-BASELINE â†’ U-001 â†’ U-002` tree with parent/intervention lineage |
| 8 | world diff | `WorldDiff` asserted field-by-field |
| 9 | multi-depth intervention | depth-2 intervention validated *inside* the depth-1 world, inheriting its state |
| 10 | deterministic replay | `derive` twice â‡’ identical state; tampered RP hash fails `validateRewindPoint` |

**Acceptance queries (written before the engine â€” falsifiability):**
- `status(baseline, "blight-begins") === "ESTABLISHED"`
- `status(U-001, "exodus") === "UNSUPPORTED"` (no Blight â‡’ no exodus)
- `workStatus(U-001, "work/verrin-ashfall") === "IMPOSSIBLE"`
- `characterFact(U-001, "Vara", "located_in") === "Valdar"` (she never leaves)
- `replay(U-001) === replay(U-001)` for same canon + interventions

---

## 14. Proposed repository structure

```
C:\Users\think\Project_v2\Somnium Engine\
  docs\
    ARCHITECTURE-RECONNAISSANCE.md   (this file)
    PROPOSALS.md                     (per KE proposal convention)
  src\
    canon\       types.ts, canon.ts, hash.ts, verrin.ts (seed library)
    derive\      world-state.ts, lattice.ts, propagation.ts, contradictions.ts
    timeline\    rewind-point.ts, universe.ts, genealogy.ts
    diff\        diff.ts, projections.ts
    query\       status.ts, reachability.ts, interventions.ts
    cli\         main.ts
  tests\         (colocated *.test.ts per module)
  qms\           records\{nonconformities,verifications,requirements}\, trace-matrix.json
  self-harness\  constitution.md, traces\, failures\
  HANDOFF.md
  scripts\verify-facts.ts
  package.json  tsconfig.json
```

Single package (no monorepo â€” YAGNI). Sibling repo; no shared package; zero imports of KE code. KE stays untouched.

---

## 15. Major unresolved questions

1. **Time model**: is a partial order of PRECEDES edges sufficient, or does the first real canon need interval algebra (Allen) for overlapping spans? (Defer; PoC uses point-events.)
2. **Provenance depth**: how deep must derivation paths go (full DAG path vs. nearest cause) to make minimum-intervention search tractable later?
3. **CONTINGENT semantics**: is CONTINGENT user-observable, or should it collapse into UNSUPPORTED until a real canon demonstrates the need?
4. **Work binding**: is a Work = set of Events + order constraints, or does it need its own fact scope (e.g. "these characters may not die")?
5. **Probabilistic edges**: if ever added, how do they interact with depth/divergence metrics and determinism guarantees?
6. **Faction/Institution dynamics**: does v1 need any aggregate "power" notion, or is the pure fact graph sufficient? (YAGNI lean: pure graph.)
7. **Minimum-intervention exactness**: MaxSAT vs. beam search; deferred until a second canon exists.
8. **Intervention vocabulary**: is `negateEvent | forceEvent | setFact | retractFact | severEdge | addEdge | relocate` the right closed set, or does canon-authoring reveal more?

---

## 16. Smallest implementation that proves the concept

Build order â€” each step ends with a passing acceptance query (Â§13):

1. Repo scaffold: package.json, tsconfig, Vitest, qms/, self-harness/, HANDOFF.md, minimal verify-facts.
2. Canon model + content hashing + Verrin seed library.
3. Status lattice + monotone fixpoint propagation over the post-intervention fact base.
4. `derive()` pure function + memoization.
5. Rewind Point + validation.
6. Branch/genealogy â€” O(1) fork.
7. Typed interventions + depth validation.
8. WorldDiff + typed projections.
9. Acceptance-query test suite (all 10 PoC capabilities).
10. CLI + JSON artifact output (ExperimentSet shape from KE, minus stats).

Estimated scale: ~1,500â€“2,500 lines of TypeScript + tests. Recommended first lane: **Canon model + Verrin seed library** (est. 1 step), followed by **lattice + propagation** (the core intellectual risk â€” worth its own review lane before anything downstream is built).

---


---

## 17. P-003 — Causal semantics adversarial pass

**Mission.** Attack the causal model itself rather than extend it. The question: is SE's causal model strong enough to support counterfactual fictional canon, or did P-001/P-002 merely build a deterministic graph traversal engine?

**Verdict: it was closer to the latter than the report admitted.** Four defects were confirmed by construction, not by opinion. Three were load-bearing. The model has been rebuilt onto established foundations (Belnap FOUR, Kleene three-valued connectives, well-founded semantics) and every changed assumption carries a regression test.

Sections 5, 6 and 8.1 record the superseded design. They are kept for provenance; **this section is authoritative** where they disagree.

### 17.1 Confirmed defects

**D1 — Support was conjunction-only, so alternative sufficient causes were inexpressible.**
An event was supported only if *all* REQUIRES sources held. `A OR B ⇒ C` could not be written, so removing `A` always killed `C` even when `B` still held. This is the single most important defect for fictional counterfactuals: canon is full of overdetermined outcomes ("the city falls because of the siege *or* the betrayal"), and the engine could not represent one.

**D2 — The "status lattice" was not a lattice, and conflated four independent questions.**
`UNKNOWN < UNSUPPORTED < CONTINGENT < ESTABLISHED` with `EXCLUDED` incomparable and `CONTRADICTORY` on top mixed:
1. does the event occur? (truth)
2. do we know whether it occurs? (epistemic)
3. what grounds it? (support)
4. is the world inconsistent here? (conflict)

Concretely: `EXCLUDED` shared rank 3 with `ESTABLISHED`, giving an *intervention input* the same standing as a *derived conclusion*; `CONTRADICTORY` sat at the top as though contradiction were a higher degree of establishment; `UNKNOWN` meant both "canon is silent" and "not yet evaluated"; and `CONTINGENT` is a support notion wearing a truth-value costume.

**D3 — The "monotone fixpoint" was not monotone.**
Statuses could *decrease* across passes (an event established early became unsupported when a predecessor was later invalidated), and a pass cap silently absorbed the oscillation. Knaster–Tarski requires a monotone operator on a complete lattice; the old operator was neither monotone nor guaranteed to reach a least fixpoint, so results were order-dependent in principle. The cap turned a soundness bug into a plausible-looking answer.

**D4 — ENABLES behaved as necessity.**
A blocked enabler degraded its target to `UNSUPPORTED` — i.e. removing an *enabling condition* could refute an event. That is exactly what distinguishes enabling from requiring, and it was collapsed.

Two further findings emerged from the adversarial fixture rather than from review:

**D5 — A bootstrap cycle was reported as `UNKNOWN`.**
`A REQUIRES B`, `B REQUIRES A` with no external ground was treated as "we don't know". Wrong: there is *no grounding derivation*, and that is knowable. Well-founded semantics rejects an unfounded set as false.

**D6 — `causalReach` did not measure causal reach.** See 17.6.

### 17.2 Revised status model — the judgment

`EventStatus` survives only as a **lossy projection for reporting**. The engine reasons over `Judgment` (`src/derive/judgment.ts`):

```ts
type TruthValue  = "NEITHER" | "TRUE" | "FALSE" | "BOTH";   // Belnap FOUR
type SupportKind = "HARD" | "SOFT" | "NONE" | "UNFOUNDED";

interface Judgment {
  truth: TruthValue;
  support: SupportKind;
  forced: boolean;    // do(X happens)      — an INPUT, not a conclusion
  negated: boolean;   // do(X never happens) — an INPUT, not a conclusion
}
```

`TruthValue` carries **two independent bits** — is-true? and is-false? — so `NEITHER` (no information) and `BOTH` (conflict) are orthogonal rather than opposite ends of one scale. The fixpoint runs in the **information order** (`NEITHER ⊑ TRUE|FALSE ⊑ BOTH`), not the truth order, which is what makes it genuinely monotone.

Answers to the questions §3 of the mission posed:

| Question | Answer |
|---|---|
| Is `UNKNOWN` epistemic or ontological? | **Epistemic.** It is `truth: NEITHER` — canon is silent. It never means "does not occur". |
| Is `UNSUPPORTED` different from `UNREACHABLE`? | **Yes, and only one is a status.** `UNSUPPORTED` = `truth: FALSE` derived (every sufficient set refuted, or unfounded). "Unreachable" is a *Work-level* classification computed from member events; it is not an event status. |
| Is `CONTINGENT` a truth state or a reachability state? | **Neither — it is a support state.** It is `truth: NEITHER, support: SOFT`: an enabling path exists, no hard grounding does. It was never a truth value. |
| Can something be both `CONTINGENT` and `EXCLUDED`? | **No, and the question exposes the old conflation.** In the new model these are different axes: `EXCLUDED` is `truth: FALSE, negated: true` (an input), `CONTINGENT` is `truth: NEITHER, support: SOFT` (a derived support state). A negated node's support is irrelevant. |
| Can something be `ESTABLISHED` in one universe and `UNKNOWN` in another? | **Yes** — and this is required, not tolerated. Status is per-world; branching legitimately moves a node from grounded to unknown. |
| Where does `CONTRADICTORY` live? | **On the conflict axis, not the truth ranking.** It is `truth: BOTH`, reached by `joinTruth(TRUE, FALSE)`. It is not "more established than established". |
| Is reachability a separate dimension from truth? | **Yes.** Truth is `TruthValue`; grounding is `SupportKind`; graph connectivity is a *metric* (17.6), not a status. Three dimensions, previously one. |

### 17.3 Revised propagation model — staged, provably terminating

`propagateJudgments` runs four phases, each with a property worth stating separately (`src/derive/propagation.ts`):

- **Phase A — positive 3-valued fixpoint** over `{NEITHER, TRUE, FALSE}`. Kleene `conjoin`/`disjoin` are monotone in the information order and a decided value is *sticky*, so this is a least fixpoint on a height-2 lattice. `BOTH` is deliberately **excluded** from this phase: admitting it is precisely what broke monotonicity before (a `TRUE` conjunct turning `BOTH` flips `conjoin` from `TRUE` to `FALSE`).
- **Phase B — greatest unfounded set** (well-founded semantics). A still-`NEITHER` node whose *every* support group is grounded only through other still-`NEITHER` candidates is `FALSE`/`UNFOUNDED`.
- **Phase C — soft support.** `ENABLES` may raise `support` to `SOFT`; it can never change truth in either direction.
- **Phase D — constraints and intervention conflicts** (`EXCLUDES`, `INVARIANT`, forced-vs-negated, forced-vs-refuted) produce `BOTH`.

**Termination and monotonicity.** Phase A's operator only ever moves a node `NEITHER → TRUE|FALSE` and never revisits a decided node, so `truthRank` is non-decreasing and the iteration is bounded by the number of nodes. The code *asserts* this: any attempt to lower `truthRank` throws with the node id and both values, and the pass cap throws rather than returning a plausible-looking partial answer. A cap that is reachable in normal operation is a soundness bug, not a safety net.

**Contradiction is localized, not propagated (v1 decision).** A node that becomes `BOTH` in Phase D does not retroactively refute its dependents; re-entering the fixpoint with `BOTH` admitted reinstates the non-monotonicity this rewrite removed. `conjoin` treats a `BOTH` conjunct as `FALSE` for its group — a contradictory prerequisite cannot soundly ground anything, so it refutes rather than infects. Consequence, observed in the unit fixture: an event whose prerequisite is contradictory is now evaluated against that prerequisite's classical truth, which can surface a *second*, independent violation that the old cascade silently suppressed. A contradiction hiding another contradiction is worse than two contradictions.

### 17.4 Confirmed relation semantics

Each edge kind now does exactly one job. This is the formalization §1 of the mission asked for.

| Relation | Expresses | Directional | Transitive | In fixpoint | Source false/unreachable | Target false/unreachable | Cycles legal |
|---|---|---|---|---|---|---|---|
| **REQUIRES** | prerequisite (hard necessity) | yes | yes, through support | **yes** (Phase A) | group refuted; target `FALSE` unless another group holds | no upward effect | yes — rejected as unfounded unless externally grounded |
| **ENABLES** | enabling condition (soft access) | yes | no | **partly** (Phase C: support only) | target loses `SOFT`, truth **unchanged** | no effect | yes — stays `UNKNOWN` |
| **MOTIVATES** | motivation (narrative pressure) | yes | no | **no** | no effect | no effect | yes, inert |
| **PRECEDES** | temporal ordering | yes | yes, as a constraint | **no** | no effect | no effect | yes — a cycle among *occurring* events is a `temporalViolation` |
| **EXCLUDES** | mutual exclusion | symmetric | no | **constraint check** (Phase D) | constraint satisfied, no record | constraint satisfied | n/a |
| **INVARIANT** | authorial constraint | yes | no | **constraint check** (Phase D) | constraint satisfied | n/a | n/a |

The distinctions the mission demanded not be collapsed, and how they are kept apart:

- **causal cause vs prerequisite** — SE models *prerequisite* (`REQUIRES`), not efficient causation. A prerequisite is a grounding condition for the event's occurrence in this world. Actual-causality attribution ("which event *caused* the outcome") is a separate query, deliberately unimplemented (17.8).
- **prerequisite vs enabling condition** — `REQUIRES` can refute; `ENABLES` can never refute. Removing an enabler yields `UNKNOWN`, never `UNSUPPORTED`. This is D4's regression test.
- **enabling vs motivation** — `ENABLES` affects support; `MOTIVATES` affects nothing. Severing a `MOTIVATES` edge leaves the entire status map byte-identical (asserted).
- **temporal ordering vs causation** — `PRECEDES` contributes nothing to any judgment. Negating the earlier event leaves the later one `ESTABLISHED` (asserted). An unsatisfiable timeline is reported as a `temporalViolation` while both events remain `ESTABLISHED`: **a broken timeline is not a broken event.**
- **exclusion vs invariant** — `EXCLUDES` is symmetric and blames both endpoints; `INVARIANT` is directed and blames only the *target*. The rule-triggering source is not tainted: the authorial rule blames the violation, not the rule.

**Why exclusion yields `CONTRADICTORY` rather than `EXCLUDED` or `UNSUPPORTED`.** `EXCLUDED` denotes *an intervention removed this*. Two mutually exclusive events both occurring is the *world asserting an impossibility* — a different claim, and the engine must not silently pick a winner. `UNSUPPORTED` would be worse: it would imply we derived that one of them fails, which we did not.

### 17.5 Adversarial results (cases A–K)

`src/canon/verrin-adversarial.ts` (a Verrin-named annex fixture, **not** a second canon) plus `tests/acceptance/causal-acceptance.test.ts`, 33 tests:

| Case | Structure | Result |
|---|---|---|
| A | direct prerequisite removal | dependent `UNSUPPORTED`; the negated node is `EXCLUDED` — input and conclusion visibly distinct |
| B | indirect removal | transitive `UNSUPPORTED`; Work `IMPOSSIBLE` |
| C | **alternative sufficient causes** | removing one sufficient cause leaves the effect `ESTABLISHED`; removing all refutes it — **D1 fixed** |
| D | conjunctive prerequisites | one refuted conjunct refutes its group; contrasted against C in the same file |
| E | cycles | bootstrap ⇒ `UNSUPPORTED`/`UNFOUNDED`, **no contradiction record**; externally grounded ⇒ `ESTABLISHED`; ENABLES-only ⇒ `UNKNOWN` |
| F | PRECEDES without causation | ordering removal leaves the later event `ESTABLISHED`; a PRECEDES cycle is a `temporalViolation`, not a status change |
| G | MOTIVATES without necessity | severing leaves the whole status map identical |
| H | EXCLUDES | satisfied ⇒ silent, non-occurring side `UNKNOWN` (nothing removed it); violated ⇒ both `CONTRADICTORY` with one record each |
| I | INVARIANT | holds silently; violated ⇒ **target** `CONTRADICTORY`, source untainted |
| J | contradictory canon | contradictory *with zero interventions*; records carry `source: "canon"`; `derive` still returns a usable world |
| K | under-specification | undeclared prerequisite and its dependent stay `UNKNOWN`, explicitly asserted `not UNSUPPORTED` and `not EXCLUDED` |

**Case K is the crux, and it required a code change to get right.** Distinguishing "no information" from "no grounding derivation" is not free: a node with no support rules is a *root* (vacuously grounded) only if canon actually **declares** it. An id that canon merely references — an edge endpoint with no `Event` entity and no fact — is under-specified, so it stays `NEITHER` forever and its dependents stay `UNKNOWN`. Without the `declared` set, an unspecified prerequisite would have been silently promoted to a true premise, fabricating canon. Cases J and K are asserted **side by side in one world**, so the two reasons for "not true" are visibly different rather than merely differently named.

### 17.6 `causalReach` renamed to `graphDistance`

The metric computes a multi-source BFS distance over the `REQUIRES ∪ ENABLES` edge set. That is **graph connectivity** and nothing more. It is *not* logical reachability (whether a derivation exists), *not* executability (whether the event occurs), and *not* causal influence (`ENABLES` edges count toward it although an enabler never grounds anything). An event can be graph-connected to an intervention and still be `UNKNOWN`, `UNSUPPORTED`, or `CONTRADICTORY`.

Renamed throughout with numeric behaviour unchanged, and regression tests now assert connectivity **without** executability: nodes that are graph-connected but `UNKNOWN`, and others graph-connected but `UNSUPPORTED`, still contribute to `graphDistance`. That is correct for a structural distance and would be wrong for anything called "causal reach".

### 17.7 Interventions do not commute

Measured on the adversarial canon, `derive(c,[X,Y])` vs `derive(c,[Y,X])`:

| Pair | Commutes |
|---|---|
| `negateEvent` + `negateEvent` | yes |
| `forceEvent` + `negateEvent` (same node) | yes |
| `severEdge` + `addEdge` (same id) | yes |
| `setFact(s,p,v1)` + `setFact(s,p,v2)` | **no** |
| `setFact` + `retractFact` | **no** |
| `relocate` + `setFact` (same cell) | **no** |

The reason is semantic, not incidental: **graph-level interventions are set-like** (they mark a node negated/forced or add/remove an edge — idempotent, order-free), whereas **fact-level interventions are assignments** (sequential writes to the same cell; last write wins).

P-001 hashed a *sorted* intervention list, silently assuming commutativity. The hash now folds interventions in under their measured semantics: graph-level as a sorted set, fact-level in actual order. An interim fix that hashed only derived content was caught and rejected during integration because it collided a no-op intervention chain with the baseline — a hash-keyed memo could then have returned a state carrying the wrong `interventions` provenance. Every world hash changed; that is expected and correct.

### 17.8 Remaining causal-model risks

1. **Contradiction does not propagate.** Localizing `BOTH` is a v1 decision taken to preserve monotonicity. A canon where a contradiction *should* poison downstream events cannot express that today. Resolving it properly means a bilattice-valued fixpoint (monotone in the information order with `BOTH` admitted) — a real redesign, not a patch.
2. **No support-set minimality.** `REQUIRES` groups are taken as authored. Nothing enforces that a group is *minimally* sufficient (the NESS condition), so a canon can declare a redundant conjunct and the engine will treat it as load-bearing.
3. **Point-order temporal model only.** `PRECEDES` is a point partial order; cycles among occurring events are the only violation detected. Interval semantics (Allen) are absent, so overlapping-span contradictions are invisible.
4. **Multi-valued predicates collapse.** `changedStateCount` and `overrideFact` key facts by `(subject, predicate)`, so a subject with two simultaneously-valid values for one predicate is not representable.
5. **`WorkStatus` is heuristic.** The mapping from member-event statuses to `PRESERVED`/`ALTERED`/`IMPOSSIBLE`/`UNREACHABLE` is a hand-written cascade, not a derived semantics, and it reads the *projected* status rather than judgments — the one place the lossy projection still feeds a decision.
6. **`ENABLES` transitivity is undefined.** A chain of enablers confers `SOFT` support only one hop; whether soft support should compose is unresolved.
7. **No actual-causality attribution.** The engine answers "does this occur in this world?", not "which event caused this outcome?". Halpern–Pearl attribution and minimum-intervention search remain deliberately unbuilt; the closed intervention vocabulary and pure `derive` keep them reachable (§10).

### 17.9 Assessment

**Is the causal model strong enough to support counterfactual fictional canon?** After P-003, substantially yes for the structures fiction actually uses: overdetermined outcomes, enabling conditions that are not necessities, motivation that is not causation, ordering that is not causation, authorial invariants, contradictory canon preserved with provenance, and under-specification that stays unknown. Before P-003 the honest answer was no — it was a conjunctive graph traversal with a single confused status axis, and the tests passed because they encoded the same confusions as the engine.

What remains unfinished is mostly about *depth of inference* (contradiction propagation, minimality, interval time, causal attribution) rather than about the shape of the ontology. Risks 1 and 7 are the ones that would force another rebuild if a canon demands them.

**Method note worth keeping.** Every defect here was found by writing the adversarial case *first* and letting it disagree with the engine. Three tests that "passed" under the old model were asserting false things (bootstrap ⇒ `UNKNOWN`, blocked enabler ⇒ `UNSUPPORTED`, sorted-intervention hash equality). A green suite is evidence about the tests as much as about the code.

### 17.10 Recommended next task

**P-004: a second canon, now that the causal model can survive one.** The engine has only ever seen Verrin and its annex, so genericity is asserted rather than demonstrated — and every remaining risk in 17.8 is a question about what a *different* canon would demand. A second seed library is now the highest-information next step, and it was correctly deferred until the semantics were sound. Recommended shape: a small canon exercising overdetermination and authorial invariants heavily, authored by someone who has not read `propagation.ts`, so it probes the ontology rather than the implementation.

---

*End of report. P-003 complete (§17). Next: P-004 — a second seed canon to test genericity (§17.10).*
