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

*End of report. Next: implement step 1â€“3 of Â§16, or request a specific section's deeper design first.*
