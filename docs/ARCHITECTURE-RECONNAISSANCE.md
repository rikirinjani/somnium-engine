# Somnium Engine — Architectural Reconnaissance Report

**Date:** 2026-08-30 · **Status:** DRAFT v0.1 · **Ancestor:** Kronos Engine (separate repository) · **Sibling repo, no code shared.**

## 0. How this report was produced

Two explorer recon lanes read the KE repository (engine/timeline core; sectors/experiment/governance). A planned oracle design lane failed upstream (API credit exhaustion) and was not retried; the design analysis in sections 4–12 was performed by the orchestrator directly, grounded in the two file-cited recon reports. All KE claims cite the two recon outputs, which cite file paths and line numbers.

---

## 1. KE components worth carrying forward

The generic (domain-independent) mechanisms, per recon, flagged `[GENERIC]`:

1. **Universe identity + genealogy** (`src/engine/universe.ts:1`): `UniverseID { id, rngSeed, parent, rewindTick, intervention, created, label }` with a `parent` chain enabling lineage reconstruction. Carry the shape; drop `rngSeed`, and record `intervention` as a typed object, not a JSON string.
2. **Determinism mechanism as a tested invariant** (`src/engine/rng.ts`, `determinism.test.ts`): single RNG stream with call-count restore-and-replay; the *pattern* "same seed ⇒ same world, asserted by dedicated tests" carries. The RNG itself does NOT (see §3.3).
3. **Rewind Point with content hash + verify()** (`src/timeline/rewind-point.ts:86,123`): `stateHash` over sorted-key JSON (FNV-1a, `hash.ts:1`) gives tamper detection. Carry the hashing + verify pattern, re-targeted to narrative cuts.
4. **Functional per-tick advance** (`src/engine/world-engine.ts:77`): `tick()` returns a new state and never mutates the input; old state preserved by reference is what makes rewind points safe. Carry the *principle* (immutability of the past), not the tick loop.
5. **Branching by rewind-then-re-run** (`src/timeline/branch.ts:152`): snapshot → restore → apply intervention → run forward → diff. The *concept* carries; SE makes the fork O(1) instead of O(state × ticks) (see §4).
6. **Generic shape-agnostic diff engine** (`src/experiment/diff-engine.ts:4`): recursive path extraction over any object. The *concept* carries; numeric-only leaves do not (see §3.1).
7. **Experiment artifact shape** (`src/experiment/types.ts` + `wwii-no-war.ts`): an `ExperimentSet { runId, seed, intervention, diff }` persisted to JSON. Carry the shape minus statistics.
8. **Testing conventions**: Vitest, colocated `*.test.ts`, dedicated determinism/invariant/cadence suites (`determinism.test.ts`, `invariants.test.ts`, `cadence.test.ts`). Carry verbatim.
9. **Governance conventions**: HANDOFF.md pending/active/completed ledger (commit-push protocol, HANDOFF.md:9-18); QMS record formats (NCR/verification JSON schemas); `verify-facts` CI gate (`scripts/verify-facts.ts` + `.github/workflows/ci.yml`); per-module contract `.md` files (`src/sectors/contracts/*.md`). All domain-agnostic — adopt verbatim in SE.
10. **`src/api/server.ts` REST shape** (`[GENERIC]`): status/eras/experiments GET+POST with JSON/CSV export. Reusable shape for a future query API; not part of the PoC.

## 2. KE components that should be discarded

1. **Numeric scalar world state** (GDP, CO2, population, casualties): Earth-specific; narrative state is relational/categorical, not a vector of indicators.
2. **The `Sector` interface + tick/cadence lifecycle** (`src/sectors/types.ts:29`, `world-engine.ts:84`): time-advancing isolated numeric processes. Narrative worlds have no wall-clock tick; they have a partial order of events. Discard the interface; do NOT adapt it.
3. **Cross-sector event bus** (`src/sectors/event-bus.ts`, `events.ts`): ordering depends on Map insertion order (`HANDOFF.md:163` flags this as caller-dependent); eager handler dispatch is a latent nondeterminism leak (`event-bus.ts:10`). SE propagation must be order-independent by construction. Discard.
4. **RNG/mulberry32 + seed splitting + call-count restore** (`rng.ts:8`, `world-engine.ts:45`): SE v1 has zero stochasticity — determinism is structural (see §14-I). Discard from the core; keep only a `tieBreak` total order for stable iteration. Reintroduce a *single isolated* RNG only if probabilistic edges are ever added, and mark it as the sole nondeterminism source.
5. **Monte Carlo statistics / Cohen's d / CI significance / sensitivity sweeps** (`src/experiment/stats.ts`): variance-based inference is vacuous when the same seed+canon+interventions always produce the same universe. Discard; keep only plain aggregation helpers if ever needed.
6. **The untyped raw state-patch intervention** (`src/timeline/branch.ts:9` `Record<string, Record<string, unknown>>`): silently patches arbitrary keys, no validation, unknown keys silently no-op. Actively harmful for SE, where interventions must be a closed enumerable set (see §10). Replace with a typed intervention vocabulary (§5).
7. **Era JSON loaders / `StrategicWorldState` / `Nation`/`War`/`Alliance` history types** (`src/engine/era-loader.ts`, `src/timeline/history-types.ts`, `future-types.ts`): Earth-specific. Discard.
8. **Deers Rock adapter + sidecar Python TabFM classifier** (`src/bridge/`, `sidecar/`): project-specific. Discard (the *adapter pattern* — wrap external sim, hash inputs, circuit-break — is worth a one-line note, not code).
9. **The dead second intervention vocabulary** (`src/experiment/types.ts` `INTERVENTION_TYPES`): unused by the experiment path; Earth-coupled. Discard; SE needs exactly one vocabulary.
10. **The dual divergent diffs** (`diff-engine.ts` vs `branch.ts:61 computeDiff`): two differing diff implementations exist in KE. Discard both; SE needs one typed diff (§8).

## 3. Proposed Somnium ontology

### 3.1 Entity kinds (v1 — deliberately small)

```ts
type EntityKind = "Character" | "Location" | "Faction" | "Institution" | "Event" | "Work";
```

A **Work** is a canonical story (e.g. "Murder on the Orient Express") — a set of Events with order constraints and an authorial fact scope. Relationships are **Facts with two endpoints** (`Poirot —employed_by→ Sûreté`). Character state at narrative time t = the set of Facts about that character valid at t. Relationship state = the set of two-endpoint Facts. Location/Faction/Institution are first-class so the diff model can answer LocationDiff / FactionDiff directly.

### 3.2 Facts

A **Fact** is a typed attribute with a validity window expressed in *narrative time* (event-bound, not dates):

```ts
interface Fact {
  id: string;
  subject: string;             // entity id
  predicate: string;           // e.g. "located_in", "employed_by", "married_to"
  object: string | number | boolean | null;
  validFrom: string | null;    // event id — fact becomes true when this event occurs
  validTo: string | null;      // event id — fact becomes false when this event occurs
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

**Research Q A — graph, event-sourced log, temporal graph, or hybrid?**

**Recommendation: hybrid — a canonical fact/edge graph + an ordered intervention log, with the world state *derived* by a pure function.**

- The **canonical baseline** is the canon graph G0.
- A **branch is O(1)**: `Branch { universe, canonId, interventions: Intervention[], parent }` — it stores *no* mutated state.
- **`derive(canon, interventions) → WorldState`** is a pure, deterministic function: apply each intervention in order (each validated against the *previous* derived world), build the post-intervention fact base, run the monotone fixpoint (§5), compute statuses (§6), and emit the WorldDiff vs the baseline.
- WorldState is **memoized by (canonHash, interventionListHash)**: branching then re-derives only when queried; identical branches share cached states. This replaces KE's O(state × ticks) deep-clone fork with near-free branching.
- No snapshot/restore/clone machinery is needed for forking — KE's `clone.ts` disappears from the hot path.

This design makes depth-N inheritance *structural* (§7), replay trivial (`derive` is deterministic by construction), and minimum-intervention search feasible later (§10). Trade-off accepted: canonical-base facts are re-propagated per branch, so worst-case cost is O(branches × canon) — fine for the PoC; memoization plus the small v1 canon keeps it cheap.

**Narrative time**: partial order over events via PRECEDES edges — no tick counter, no wall clock. Fact validity windows are anchored to event ids. This is the decisive break from KE's tick/cadence model.

---

## 5. Proposed causal model

**Research Q B — what is a causal dependency?**

**Recommendation: typed causal edges evaluated by a monotone fixpoint over a status lattice.**

- **REQUIRES** (hard necessity): target is impossible without source. Violation ⇒ `UNSUPPORTED` at target (and downstream marking).
- **ENABLES** (soft/access): target is degraded/unreachable, not contradictory. Violation ⇒ `UNSUPPORTED`/`CONTINGENT` (no contradiction). ENABLES is how uncertainty is modeled in v1 — *not* probabilities: an ENABLES edge with explicit alternative paths, never a dice roll.
- **MOTIVATES** (psychological/narrative): changes character state, not event status. E.g. `Poirot —MOTIVATES→ accepts case`.
- **PRECEDES** (temporal constraint): `A PRECEDES B` — if both occur, ordering must hold; violation ⇒ contradiction.
- **EXCLUDES** (mutual exclusion): `A EXCLUDES B` — both holding ⇒ contradiction.
- **INVARIANT** (authorial/constraint): global constraint evaluated at fixpoint end (e.g. "the detective always solves the crime", "Poirot never marries"). Violation ⇒ `CONTRADICTORY` at the constraint node.

**Propagation algorithm**: worklist over the post-intervention graph. Each node's status starts at `UNKNOWN`; when a predecessor is marked, its outgoing REQUIRES/ENABLES edges are re-evaluated and the successor's status is raised via lattice join (§6). Iterate to fixpoint; monotone, so it terminates. Determinism: iterate nodes in sorted-id order; ties broken by canonical sort — order-independent by construction (unlike KE's event bus).

**Negation / removal**: interventions remove facts or edges. To keep the fixpoint monotone, all interventions are applied to the base set first (producing the *post-intervention fact base*), and the fixpoint runs over that. Monotonicity holds w.r.t. the modified base, guaranteeing termination and determinism.

**No probabilities in v1.** If probabilistic edges are ever added, they are the *only* nondeterminism source, isolated behind a single seeded RNG and clearly labeled.

---

## 6. Event/entity status ontology

**Research Q C — the five-status strawman (VALID/ALTERED/IMPOSSIBLE/UNREACHABLE/UNKNOWN) is not a lattice and conflates two orthogonal axes.**

**Recommendation: a status lattice; ALTERED is NOT a status.**

```ts
type EventStatus = "UNKNOWN" | "UNSUPPORTED" | "CONTINGENT" | "ESTABLISHED" | "EXCLUDED" | "CONTRADICTORY";
```

Lattice (join):
- `UNKNOWN` (⊥) — not yet evaluated
- `UNSUPPORTED` — evaluated; no valid derivation path (prerequisite missing)
- `CONTINGENT` — derivable, but only via soft/enabling paths (no hard guarantee)
- `ESTABLISHED` — all hard prerequisites satisfied; occurs in this world
- `EXCLUDED` — blocked by EXCLUDES edge or explicit removal (incomparable with ESTABLISHED)
- `CONTRADICTORY` (⊤) — requires X and ¬X
- `join(ESTABLISHED, EXCLUDED) = CONTRADICTORY`; `join(UNSUPPORTED, CONTINGENT) = CONTINGENT`.

**Where does ALTERED go?** An event that still occurs but with different parameters keeps status `ESTABLISHED`; its *alteredness* lives in the **diff** (parameter deltas), not in the status. This is the one place the strawman is actively corrected: a five-value flat enum cannot support the join operation the fixpoint needs, and ALTERED-as-status would hide parameter changes inside a status instead of exposing them in a diff. User-facing mappings: "altered" = status ESTABLISHED + non-empty parameter diff; "impossible" = UNSUPPORTED under REQUIRES (or EXCLUDED); "causally disconnected" = UNSUPPORTED with no path; "preserved" = ESTABLISHED + empty diff; "delayed" = ESTABLISHED with shifted PRECEDES window.

**Character/relationship state** is not a status — it is the derived Fact set plus derived attributes (see §3.2). Statuses apply to Events, Works, and constraint nodes only.

**Contradictions** (§14-C): never auto-repaired. The engine emits a `ContradictionRecord { a, b, source: interventionId | "canon", detectedAt }` with derivation provenance, and the world state is returned *including* the contradiction. Contradictions are first-class queryable objects.

---

## 7. Proposed Rewind Point model

**Research Q E — KE's `RewindPoint { universeId, tick, sectorStates, stateHash, ... }` is tick-based; SE has no ticks.**

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
  created: string;            // metadata only — never hashed
}
```

- **Definition**: `cut` is the set of canonical events that have *already occurred* at the anchor (the downward closure of the anchor under PRECEDES). Facts whose `validFrom` lies inside the cut are "canonically fixed" at that moment.
- **Validation** (`validateRewindPoint(rp, canon)`): (1) the cut is downward-closed under PRECEDES; (2) the baseline derivation at the cut is contradiction-free; (3) `derivedHash` matches recomputation (carries KE's verify() tamper-detection, `rewind-point.ts:123`).
- **Application**: an intervention attaches at a Rewind Point; the engine re-derives from the cut forward. Example anchors: `RP-VERRIN-001 "The Blight begins"`, `RP-SHERLOCK-001 "Reichenbach Falls"` (future seed libraries, not built-ins).

---

## 8. Proposed counterfactual-depth model

**Research Q F — is depth just "number of sequential interventions"?**

**Recommendation: two metrics; depth is genealogical, divergence is structural.**

1. **Genealogical depth** = length of the parent chain from the baseline universe. This is what makes "depth N inherits the complete state of depth N-1" *operational*: because a branch stores `canon + ordered interventions` and `derive()` recomputes from the previous world's full derived state, a depth-N world literally contains everything produced at N-1, except what an intervention explicitly changed. Inheritance is structural, not a convention. (Test: depth-N state must equal the recomputation of baseline + interventions[0..N]; a no-op depth chain must produce a zero diff.)
2. **Divergence score** = a real-valued structural measure: size of the changed-status set + causal distance of the nearest changed node from the intervention site. "Five no-ops" is NOT deeper than one world-altering intervention — the metric must reflect structural change, not bookkeeping.

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

**Research Q D — what should the comparison outputs be?**

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
  workStatuses: Record<string, EventStatus>;  // canonical Work → status, answering "which stories survive / are altered / are impossible / are causally disconnected"
}
```

Typed views — CharacterDiff, EventDiff, RelationshipDiff, LocationDiff, FactionDiff, WorkDiff, CanonDiff — are **projections over the same WorldDiff** (filter facts by subject/endpoint/entity kind), not separate implementations. This kills KE's dual-diff divergence problem (`diff-engine.ts` vs `branch.ts:61`) by construction. A Work whose status is ESTABLISHED but whose parameter diff is non-empty is "altered"; the answer is in the diff, not the status (§6).

---

## 10. Proposed minimum-intervention query model (deferred)

**Research Q H — "what is the minimum intervention for Poirot and Miss Marple to meet?"**

This is **abduction over the intervention space**: find the smallest intervention set S such that `derive(canon, S)` satisfies a target query (reachability of a Fact). Candidate classes: minimum-cardinality model revision / MaxSAT / beam search over a finite intervention catalog.

**Not implemented in the PoC**, but three properties are designed in now so it becomes possible later:

1. **Interventions are a closed, typed, enumerable vocabulary** (`negateEvent | forceEvent | setFact | retractFact | severEdge | addEdge | relocate`), not arbitrary patches — a search can enumerate candidate sets.
2. **`derive()` is pure and cheap** (memoized; O(canon) worst case) — a search can call it thousands of times.
3. **Every status carries a derivation path** (provenance chain) — a solver can trace which facts actually matter and prune the search.

KE's raw state-patch intervention (`branch.ts:9`) would make this impossible — another reason it was discarded.

---

## 11. What NOT to carry from KE — blunt summary

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

1. **LLM creep into the core** → the core package has zero network/LLM imports (enforced by CI dependency check). The LLM's only two touchpoints: canon *ingestion* (validated, reviewed as a diff, committed — never consumed at runtime) and optional *narration* of an already-computed WorldDiff.
2. **Ontology sprawl** → v1 caps entity kinds at 6 and edge kinds at 6. Any new kind requires a failing acceptance query first (test-first).
3. **Contradiction laundering** → property test: a known-inconsistent fixture must yield `CONTRADICTORY` + a `ContradictionRecord`; the engine never silently repairs.
4. **Depth faking** → inheritance is structural (`derive` from full previous state); a test asserts depth-N ⊇ depth-(N-1) except for explicit overrides, and that a no-op chain yields zero diff.
5. **"Just ask the LLM" drift** → every answer must trace to a derivation path in the world model; narration is a labeled view over the diff, not the answer.

---

## 13. Minimal proof-of-concept

**Seed library: "Verrin" — a tiny invented universe** (avoids canon/copyright ambiguity; §13 of the brief). Scale: ~6 characters, ~12 events, 2 factions, 3 locations, 1 institution, 3 Works, ~20 causal edges.

PoC must demonstrate all 10 required capabilities:

| # | Capability | Verrin demonstration |
|---|---|---|
| 1 | baseline canon | Verrin canon document, content-hashed |
| 2 | one Rewind Point | `RP-VERRIN-001 "The Blight begins"` |
| 3 | one intervention | `negateEvent(blight-begins)` — the "WWI never happens" analogue |
| 4 | causal propagation | fixpoint marks downstream events UNSUPPORTED / EXCLUDED |
| 5 | changed character state | protagonist Vara stays in Valdar; `employed_by` facts change |
| 6 | changed event reachability | a canonical Work becomes IMPOSSIBLE / ALTERED |
| 7 | branch genealogy | `U-BASELINE → U-001 → U-002` tree with parent/intervention lineage |
| 8 | world diff | `WorldDiff` asserted field-by-field |
| 9 | multi-depth intervention | depth-2 intervention validated *inside* the depth-1 world, inheriting its state |
| 10 | deterministic replay | `derive` twice ⇒ identical state; tampered RP hash fails `validateRewindPoint` |

**Acceptance queries (written before the engine — falsifiability):**
- `status(baseline, "blight-begins") === "ESTABLISHED"`
- `status(U-001, "exodus") === "UNSUPPORTED"` (no Blight ⇒ no exodus)
- `workStatus(U-001, "work/verrin-ashfall") === "IMPOSSIBLE"`
- `characterFact(U-001, "Vara", "located_in") === "Valdar"` (she never leaves)
- `replay(U-001) === replay(U-001)` for same canon + interventions

---

## 14. Proposed repository structure

```
somnium-engine/
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

Single package (no monorepo — YAGNI). Sibling repo; no shared package; zero imports of KE code. KE stays untouched.

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

Build order — each step ends with a passing acceptance query (§13):

1. Repo scaffold: package.json, tsconfig, Vitest, qms/, self-harness/, HANDOFF.md, minimal verify-facts.
2. Canon model + content hashing + Verrin seed library.
3. Status lattice + monotone fixpoint propagation over the post-intervention fact base.
4. `derive()` pure function + memoization.
5. Rewind Point + validation.
6. Branch/genealogy — O(1) fork.
7. Typed interventions + depth validation.
8. WorldDiff + typed projections.
9. Acceptance-query test suite (all 10 PoC capabilities).
10. CLI + JSON artifact output (ExperimentSet shape from KE, minus stats).

Estimated scale: ~1,500–2,500 lines of TypeScript + tests. Recommended first lane: **Canon model + Verrin seed library** (est. 1 step), followed by **lattice + propagation** (the core intellectual risk — worth its own review lane before anything downstream is built).

---


---

## 17. P-003 — Causal semantics adversarial pass

**Mission.** Attack the causal model itself rather than extend it. The question: is SE's causal model strong enough to support counterfactual fictional canon, or did P-001/P-002 merely build a deterministic graph traversal engine?

**Verdict: it was closer to the latter than the report admitted.** Six defects were confirmed by construction, not by opinion — four from review, two more that only the adversarial fixture exposed. Three were load-bearing. The model has been rebuilt onto established foundations (Belnap FOUR, Kleene three-valued connectives, well-founded semantics) and every changed assumption carries a regression test.

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

**Contradiction is localized, not propagated (v1 decision).** A node that becomes `BOTH` in Phase D does not retroactively refute its dependents; re-entering the fixpoint with `BOTH` admitted reinstates the non-monotonicity this rewrite removed.

Be precise about the mechanism, because the obvious description is wrong. `conjoin` does map a `BOTH` conjunct to `FALSE` (a contradictory prerequisite cannot soundly ground anything, so it refutes rather than infects) — but **that code path is unreachable for Phase-D contradictions**, because `BOTH` is only ever assigned *after* Phase A has finished. The actual semantics is therefore: **a dependent is evaluated against its prerequisite's Phase-A classical truth**, and a later contradiction at that prerequisite does not revisit it. Measured: with `x` and `y` both grounded, `x EXCLUDES y`, and `dep REQUIRES x`, the result is `x` `CONTRADICTORY` and `dep` `ESTABLISHED` — grounded on `x`'s classical `TRUE`. The `conjoin` guard matters only for a canon that authors `BOTH` upstream of Phase A, which nothing currently does.

Consequence, observed in the unit fixture: an event whose prerequisite is contradictory is evaluated against that prerequisite's classical truth, which can surface a *second*, independent violation that the old cascade silently suppressed. A contradiction hiding another contradiction is worse than two contradictions. Scoped as risk 1 in §17.8.

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

Measured on the adversarial canon plus a minimal canon with a load-bearing edge:

| Pair | Commutes | Class |
|---|---|---|
| `negateEvent` + `negateEvent` | yes | set-like mark |
| `forceEvent` + `negateEvent` (same node) | yes | set-like mark |
| `severEdge` + `addEdge` (same id) | **no** | sequential edge-set write |
| `setFact(s,p,v1)` + `setFact(s,p,v2)` | **no** | cell assignment |
| `setFact` + `retractFact` | **no** | cell assignment |
| `relocate` + `setFact` (same cell) | **no** | cell assignment |

Three classes, not two:

- **Set-like marks** — `negateEvent`, `forceEvent`. These add to a set of negated targets or write a target into a map. Idempotent; order never matters.
- **Sequential edge-set writes** — `severEdge`, `addEdge`. These mutate the edge set in order (`resolveEdges`), so sever-then-add leaves the edge present while add-then-sever leaves it absent.
- **Cell assignments** — `setFact`, `relocate`, `retractFact`. Sequential writes to one `(subject, predicate)` cell; last write wins.

**The sever/add row is a correction, and it is the more instructive kind.** P-003 first shipped claiming `severEdge` + `addEdge` commuted, with a passing test to "prove" it. The test targeted an edge whose removal was *invisible* — its target was a declared root either way — so two genuinely different edge sets derived the same world and the assertion held for the wrong reason. On a canon where the edge is load-bearing (`ev/q REQUIRES ev/p`, with `p` negated) the orders diverge outright: `[sever, add]` gives `ev/q` `UNSUPPORTED`, `[add, sever]` gives `ESTABLISHED`. Because the hash had folded both kinds into a commutative set, those two worlds shared one hash while carrying different `interventions` — the exact provenance unsoundness this section claims to have fixed, reintroduced one row lower. Caught by the L2 gate (ncr-002). The regression test now uses a load-bearing fixture, and a second test asserts that even when the derived content *does* coincide, the hashes must still differ because the provenance does.

P-001 hashed a fully *sorted* intervention list, silently assuming universal commutativity. The hash now folds interventions in under the three-class split: set-like marks as a sorted deduplicated set, every sequential kind in actual order. An interim fix that hashed only derived content was also rejected during integration, because it collided a no-op intervention chain with the baseline. Every world hash changed across P-003; that is expected and correct.

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


---

## 18. P-004 — Second canon genericity challenge

**Question.** Does the P-003 architecture generalize beyond Verrin, or is it a very good Verrin engine?

**This subsection (18.1–18.4) was written BEFORE any P-004 code was changed.** It records the canon selection, the schema challenge, and a set of falsifiable predictions about what the engine would and would not handle. §18.5 onward records what actually happened, including where the predictions were wrong. Writing the predictions first is the only way the exercise can fail honestly.

### 18.1 Selecting the second canon

**Rejected approach: another cataclysm.** Verrin is a *cascade*: one root event (the Blight), deep REQUIRES chains, characters whose `located_in` flips at a single displacement event, Works bound to ordered event lists. A second canon of the same shape would raise the test count and prove nothing. Whatever the engine has silently learned from Verrin, it would learn again.

**Selected: `canon/ordos` — a succession dispute over an artifact of office.**

A chartered institution (the Ordos Chapter) has a Seal of office. Exactly one Warden may hold it at a time. When the old Warden dies, two claimants emerge — one with a clean claim by acclamation, one whose inheritance claim rests on a parentage canon never settles. A rite of binding cannot proceed unless the Seal is actually in the claimant's hands.

This is structurally the *inverse* of Verrin, along the axes that matter:

| Axis | Verrin | Ordos |
|---|---|---|
| Shape | cascade from one root | contest between two competing routes |
| What drives the plot | events causing events | **a fact (who holds the Seal) gating events** |
| Exclusion | between **events** (guarded vs sacked) | between **facts** (two holders of one Seal) |
| Support | conjunctive chains | **alternative sufficient causes as the central mechanism** |
| Time | a clear spine of PRECEDES | deliberately **partially ordered** — two events canon does not order |
| Entity kinds | characters, locations, factions, institution | adds an **object/artifact**; an institution with **no location at all** |
| Unknowns | one adversarial probe | a **load-bearing** unknown (disputed parentage) the plot turns on |
| Facts | almost all windowed | mix of windowed and **atemporal** (the Seal is silver; the charter grants a veto) |

Each of these is a property SE claims to support and has never had to demonstrate. None was chosen from the mission's menu for its own sake: the succession premise *forces* all of them. If a canon can have an artifact that changes hands and gates a ritual, it needs objects, ownership facts, fact-level exclusion, and fact-gated events, or it cannot be written.

**Scale discipline.** Ordos is deliberately small: roughly 20 entities, 14 facts, 12 events, 20 edges, 3 Works. It is a stress fixture, not a story.

### 18.2 Schema challenge — can SE represent Ordos without canon-specific hacks?

Every Ordos concept, classified **A** (already correct), **B** (represented incorrectly, needs a generic change), **C** (missing but clearly generic), or **D** (canon-specific, must NOT enter the core).

| # | Concept | Class | Reasoning |
|---|---|---|---|
| 1 | **Ownership / possession** (`held_by`) | **A** | A `Fact` with an entity-valued object. SE facts are already `(subject, predicate, object)` with narrative-time windows; possession is just a predicate. No core change. Verrin never used an entity-valued object for a *transferable* relation, so this is untested rather than unsupported. |
| 2 | **At most one holder at a time** | **A**, unproven | `EXCLUDES` between two *fact* nodes. P-003's `buildModel` admits any edge endpoint as a node and gives fact nodes truth via `factWindowTruth`, and the EXCLUDES check tests `occurs()` on both endpoints — so this should work. Verrin only ever put EXCLUDES between events. **Prediction: works unchanged.** If it does not, that is a [VERRIN-ACCIDENT] in the constraint layer. |
| 3 | **Fact-gated events** (rite requires the Seal held) | **A**, unproven | `REQUIRES` from a fact to an event. `hardSupport` reads whatever truth a node has, and fact nodes have truth. Verrin has exactly one such edge and it is a deliberate dead end (`fact/gate-bribed`), so the *working* case is untested. **Prediction: works unchanged.** |
| 4 | **Alternative sufficient causes** | **A** | P-003 added `CausalEdge.group`. Ordos makes it load-bearing rather than adversarial. |
| 5 | **Deliberately unknown facts** (disputed parentage) | **A** | The case-K mechanism: a fact whose window is anchored to an undeclared event stays `NEITHER` → `UNKNOWN`, and dependents stay `UNKNOWN` rather than becoming false. Already asserted; Ordos makes it plot-critical. |
| 6 | **Atemporal facts** (the Seal is silver) | **A** | `validFrom: null, validTo: null` ⇒ `factWindowTruth` returns TRUE unconditionally. |
| 7 | **Partially ordered events** | **A** | PRECEDES is a partial order; absence of an edge *is* "unordered". Nothing requires a total order. The temporal layer only rejects cycles among occurring events. |
| 8 | **Entities with no location** | **A** | Nothing in the core privileges `located_in`; `relocate` is sugar over `setFact(subject, "located_in", …)`. An institution with no location fact is simply an entity with fewer facts. |
| 9 | **Objects / artifacts** | **C** | `EntityKind` is `Character \| Location \| Faction \| Institution \| Event \| Work` — no object. Artifacts of office, weapons, documents, relics: ubiquitous across fictional canons, not an Ordos peculiarity. Cheapest possible change (one union member) and the burden of proof is easily met. Must check every site that reads `kind` — a new kind that silently falls through a projection filter would be worse than no kind at all. |
| 10 | **Works that depend on facts** | **C** | `WorkBinding` is `{ workId, events }`. "This story requires the Seal in the right hands" is a *general* narrative-constraint pattern — a story can require a state of the world, not only a sequence of occurrences. Generic; add optional `facts?: string[]`. |
| 11 | **`ALTERED` detection** | **B** | `computeWorkStatuses` computes `affectedByOverride` as `overridden.some(f => work.events.includes(f.subject))` — it compares a fact's **subject** against the work's **event** ids. So a Work is only ALTERED when an overridden fact's subject is one of its events. Verrin's Works are event-bound and its overridable facts are about *characters*, so the branch is nearly unreachable there and the one test that exercises it uses a fact whose subject happens to be an event (`setFact("ev/root1","mood",…)`). Under Ordos, overriding who holds the Seal must alter the investiture Work — and today it would report `PRESERVED`. A wrong answer, not a missing feature. |
| 12 | **Unvalidated fact objects** | **B** | `validateCanon` checks `subject`, `validFrom`, `validTo` and every edge endpoint, but never `object`. A typo in an entity-valued object (`loc/valdarr`) loads silently and produces a world that looks fine. Verrin hid this because its entity-valued objects are few and were hand-checked. Generic fix, and it belongs in the **canon schema/validation layer**, not the core ontology. |
| 13 | **`characterFact` naming** | **B**, cosmetic | Works for any subject; only the name says "character". A rename, not a generalization. |
| 14 | Chapter voting procedure, Seal metallurgy, charter clauses | **D** | Ordos flavour. Expressible as ordinary facts with canon-specific predicates. Predicates are free-form strings by design — **that is exactly the extension point**, and nothing about them enters the core. |

**Where extensions belong** (mission item 6). Of the changes above: two are **core ontology** (`EntityKind` gains `Object`; `WorkBinding` gains optional `facts`), one is **canon validation** (object reference checking), one is a **core semantics bug fix** (`ALTERED`), one is **cosmetic** (rename). Everything else — predicates, entity naming, the shape of the succession itself — is **seed data**. Nothing needs canon *rules* or a derived-projection extension, and no canon-specific branch enters the engine. If any Ordos concept had required a conditional on `canonId`, that would have been a failure of the exercise.

### 18.3 Predictions (falsifiable, recorded before coding)

1. Fact-level `EXCLUDES` works unchanged.
2. Fact-gated `REQUIRES` works unchanged.
3. Adding `EntityKind: "Object"` requires touching only the type and the diff projections.
4. `ALTERED` is wrong for Ordos today and will need the generic fix in item 11.
5. No canon-specific branch will be needed in `derive`, `propagation`, `diff`, or `depth`.
6. The 10 PoC capabilities will pass for Ordos with no engine change beyond items 9–11.
7. At least one *further* Verrin-specific assumption will surface that this challenge did not anticipate. (If none does, I have not looked hard enough.)

### 18.4 World identity and hashing — the question, stated before answering

P-003 left one hash carrying several distinct questions at once. Before changing anything, the identities have to be named:

1. **Effective world-state identity** — "are these two worlds *the same world*?" Judgments, effective facts, work statuses, contradictions, temporal violations, and the canon they are relative to. Deliberately *excludes* how the world was reached.
2. **Derivation / provenance identity** — "did these two worlds arise *the same way*?" Canon + rewind point + the canonical intervention form.
3. **Universe / lineage identity** — "where does this world sit in the branch tree?" Already a separate mechanism: `Universe.id`, `parent`, `lineageOf`. Not a hash question.
4. **Rewind-point integrity** — tamper detection over a canonical cut. Already separate: `computeRewindHash(canonId, anchorEvent, cut, canonHash)`. **This must remain untouched and unambiguous** whatever else changes.

The open question is whether (1) and (2) can share one value. P-003's answer — fold both into `hash` — is *sound as a memo key*, because a memo keyed on state alone can return a world carrying someone else's provenance. But it makes one question unanswerable: **"did two different intervention chains reach the same world?"** That is not a hypothetical; it is the immediate neighbourhood of the deferred minimum-intervention search (§10), and a cross-canon genericity exercise is exactly where convergent branches should be observable. §18.9 records the decision and its justification.

---


### 18.5 What actually happened — predictions scored

The §18.3 predictions, scored against implementation. Four held, three were wrong, and the wrong ones were worth more.

| # | Prediction | Outcome |
|---|---|---|
| 1 | Fact-level `EXCLUDES` works unchanged | **CONFIRMED.** Two `held_by` facts for one Seal; the constraint is satisfied at baseline with exactly one effective holder, no code change. |
| 2 | Fact-gated `REQUIRES` works unchanged | **REFUTED — and this was the serious one.** See §18.6. |
| 3 | `EntityKind: "Object"` touches only the type and the diff projections | **REFUTED.** It also needed `canon.ts`'s `ENTITY_KINDS` whitelist, which would have rejected every Object-bearing canon at load. The schema challenge overlooked the validator entirely — an omission that foreshadowed §18.7. |
| 4 | `ALTERED` is wrong for Ordos today | **CONFIRMED.** Fixed by the dependency-union rule. |
| 5 | No canon-specific branch needed in `derive`, `propagation`, `diff`, `depth` | **CONFIRMED**, and now enforced: a test scans nine engine source files for canon id literals in executable code and fails if any appears. |
| 6 | The 10 capabilities pass with no engine change beyond items 9–11 | **REFUTED.** Two further changes were required (§18.6, §18.7). |
| 7 | At least one further Verrin-specific assumption will surface | **CONFIRMED. Two did**, and neither was on the schema challenge's list. |

### 18.6 The fact-node defect — two views of the same fact

**The engine held two disagreeing beliefs about whether a fact held.**

`world-state.ts` owns the *effective fact list*, and `applyFactInterventions` correctly applies `retractFact` / `setFact` / `relocate` to it. `propagation.ts` owns *fact nodes in the causal graph*, and `buildModel` collected only `negateEvent` and `forceEvent` — so a fact node's truth came solely from its validity window over event truth.

Consequence: an event `REQUIRES` a fact, you retract that fact, and the event stays `ESTABLISHED`. Measured on Ordos before the fix:

```
retractFact(fact/seal-held-vaela)
   effective held_by : (none)          <- world-state: the Seal is held by nobody
   fact node status  : ESTABLISHED     <- propagation: the fact holds
   rite status       : ESTABLISHED     <- so the rite proceeds anyway
```

The rite of binding requires the Seal to be in the claimant's hands. The Seal was in nobody's hands. The rite happened.

**Why Verrin could never have caught this.** Verrin has exactly one REQUIRES edge sourced from a fact (`fact/gate-bribed`), and it is a deliberate dead end whose window can never open — it exists to make an event permanently unreachable. Its truth is *supposed* to be intervention-independent. So Verrin exercised the code path and got the right answer for the wrong reason. Ordos gates a live event on a transferable possession, and the disagreement was visible in the first probe.

**Fix.** `buildModel` now also collects retracted fact ids and overridden `(subject, predicate)` cells, and `factNodeTruth` consults them before the validity window: a retracted fact is `FALSE`; a cell overwritten with a *different* object makes the displaced canon fact `FALSE`; writing the *same* value changes nothing about truth (it still registers as an override for `ALTERED`). Fact-level interventions are now authoritative over fact nodes exactly as `negateEvent` is over events. Classification: **[VERRIN-ACCIDENT]**, invasive enough to touch the model but not the phase structure.

### 18.7 The validator had also stayed behind

P-001's `validateCanon` treated three things as fatal that P-003 subsequently made first-class engine behaviours:

- a reference to an **undeclared id** — which is the case-K mechanism, the thing that guarantees absence of knowledge never becomes falsehood;
- a **REQUIRES cycle** — which well-founded semantics rejects as unfounded, deliberately and with a test;
- a **PRECEDES cycle** — which surfaces as a `temporalViolation` while the events themselves stay `ESTABLISHED`, deliberately and with a test.

**The proof it was wrong was already sitting in the repository.** P-003's own adversarial fixture — a *deliberate* stress canon — derives a perfectly usable world, and `validateCanon` called it invalid on seven counts. Nothing caught the contradiction because **nothing ever validated that canon.** Its own header even conceded it "would therefore FAIL `validateCanon` … that is the point", which recorded the divergence as if it were a property of the fixture rather than a defect in the validator.

**Fix.** `inspectCanon` returns `{ errors, notices }`. Errors mean the canon cannot be trusted (duplicate ids, a subject that is not an entity, a work binding pointing at a non-Work, an object that looks like a typo'd id, an *undeclared* dangling reference). Notices mean the canon is deliberately incomplete or cyclic in a way the engine handles by design. `validateCanon` returns the errors, so every existing caller keeps its meaning.

The interesting part is how a canon states intent. A deliberate unknown and a typo are **structurally identical** - both are a reference to an id that does not exist. No amount of analysis can distinguish them, so the canon must declare which it means, via `Canon.unspecified`. That is what lets the validator enforce referential integrity without outlawing incompleteness. All three canons now validate with zero errors: Verrin reports no notices, Ordos one, and the adversarial fixture seven (five declared-unspecified references plus the two cycles). A test now validates all three, because the finding in this section is precisely that nothing ever validated the adversarial one.

### 18.8 Verrin-specific assumptions, classified

Per mission item 5, using the mandated labels. Sources: the pre-implementation audit plus what implementation exposed.

| Assumption | Class | Disposition |
|---|---|---|
| Fact nodes are unaffected by fact interventions | **[VERRIN-ACCIDENT]** | Fixed (§18.6). Two views of one fact must agree. |
| Validator requires completeness and acyclicity | **[VERRIN-ACCIDENT]** | Fixed (§18.7) via errors/notices + `Canon.unspecified`. |
| `ALTERED` compares fact *subjects* to work *events* | **[VERRIN-ACCIDENT]** | Fixed: a Work is ALTERED when any fact it *depends on* is overridden (listed in `work.facts`, or windowed on a member event, or subject-is-a-member-event). |
| `fact.object` is never validated | **[VERRIN-ACCIDENT]** | Fixed with a convention-based typo guard. Documented limitation: a literal string containing `/` would false-positive. |
| `EntityKind` has no artifact kind | **[VERRIN-ACCIDENT]** | Fixed: `Object` added to the union, the validator whitelist, and the diff projections. |
| `characterFact` naming | **[VERRIN-ACCIDENT]**, cosmetic | Renamed `subjectFact`; deprecated alias retained. |
| Every entity has a location | **not present** — refuted by audit and by Ordos | The Chapter has no location fact and derives fine. `located_in` appears in the core only as what `relocate` desugars to, asserted by a test. |
| Events occur at most once | **[SE-INVARIANT]** | Event ids are validity-window boundaries, so an event is a *point* in narrative time. Repeatable events would need a distinct occurrence identity. Deliberate, documented, and now a stated limit rather than an accident. |
| Causality is binary per edge | **[SE-INVARIANT]** | No graded dependency anywhere. Uncertainty is expressed structurally (ENABLES, disjunctive groups, UNKNOWN), never numerically. This is what keeps the engine deterministic. |
| One value per `(subject, predicate)` cell | **[OPEN-QUESTION]** | Ordos wants "exactly one holder", so single-valued cells *helped* here. Dual membership or co-ownership would need multi-valued cells, and `overrideFact` / `changedStateCount` / `factNodeTruth` all key by cell. Not forced by either canon; deferred rather than guessed. |
| Canon is complete | **resolved** | Now explicitly optional via `Canon.unspecified`. |
| All state is temporal | **not present** | Ordos ships atemporal `null`/`null` facts that ground an event with no window involved. |
| `WorkBinding` binds only events | **[VERRIN-ACCIDENT]**, now generic | `facts?: string[]` added: a story may presuppose a *state*, not only a *sequence*. |

Two observations that are neither defects nor accidents, but genuine semantics worth recording:

**Possession falls back rather than vanishing.** Negating Vaela's recognition removes her investiture, which reopens the previous holder's window: the Seal returns to Petronius rather than becoming unheld. That is correct narrative-time behaviour — the object does not evaporate because a later transfer did not happen — and it is only visible in a canon with sequential possession.

**Kleene disjunction keeps ignorance honest.** `succession-settled` requires (Vaela's rite) OR (Galen's rite). Negating Vaela's recognition refutes the first; the second depends on the unsettled parentage. `disjoin(FALSE, NEITHER) = NEITHER`, so the succession is **UNKNOWN, not UNSUPPORTED**. The engine declines to conclude that the succession fails, because it genuinely might not — exactly the behaviour the three-valued design exists to produce, arrived at without any special-casing.

### 18.9 World identity and hashing — the decision

§18.4 named four identities. The answer: **two hashes are required, one is not enough, and two of the four were never hash questions.**

```ts
/** "Are these the same WORLD?" — effective state only, provenance-independent. */
stateHash: string;
/** "Was this world reached the same WAY?" — full derivation identity; the memo key. */
identityHash: string;
```

- `stateHash` = `hashState({ canonId, canonHash, judgments, statuses, facts, workStatuses, contradictions, temporalViolations })`. Deliberately **excludes** `rpId` and interventions.
- `identityHash` = `hashState({ stateHash, rpId, interventions: canonicalInterventions(interventions) })`, with `canonicalInterventions` unchanged from P-003 (set-like marks sorted and deduplicated; sequential kinds in actual order).
- The ambiguous `hash` field is **removed, not aliased.** Its meaning was the defect; keeping the name would keep the defect.
- **Universe/lineage identity** is not a hash: it is `Universe.id` + `parent` + `lineageOf`, and it already worked.
- **Rewind-point integrity** is not a hash question either, and `computeRewindHash` / `RewindPoint.derivedHash` were left completely untouched. Tamper detection remains unambiguous — it is the one mechanism in the engine that must never acquire a second meaning.

**Why one hash could not do the job.** P-003's single value answered "same world?" and "same derivation?" simultaneously, which made a real question unanswerable: *did two different intervention chains reach the same world?* That is the immediate neighbourhood of the deferred minimum-intervention search, and it is exactly what a cross-canon exercise should be able to observe. A genuine convergence case now exists and is tested: `setFact(hero, "located_in", home)` and `relocate(hero, home)` derive byte-identical content — **same `stateHash`, different `identityHash`**. So does the Ordos no-op chain, which shares the baseline's `stateHash` while carrying different provenance.

The direction of the split matters: `identityHash` is *strictly more discriminating* than the old `hash`, so no memo can now return a state whose recorded `interventions` are a lie, while `stateHash` is *strictly less* discriminating and answers the question the old value silently destroyed.

### 18.10 Genericity test — the three answers the mission demanded

**If Verrin were deleted tomorrow and only the SE core plus Ordos remained, would the architecture still make sense?**

**Yes — and Ordos exercises more of it.** Ordos uses every entity kind including `Object`, both fact-window styles including atemporal, five of six edge kinds with `EXCLUDES` between *facts*, disjunctive support as its central mechanism, `WorkBinding.facts`, a declared unspecified id, and a genuinely partial temporal order. Verrin exercises no ontology feature that Ordos does not. What Verrin still contributes is *shape coverage* — long conjunctive cascades and a deep single-root dependency chain — which is a different stress, not a different ontology.

**If Ordos were deleted and only Verrin remained, would the same architecture still make sense?**

**It would look like it did, and it would be wrong in three places.** All 269 pre-Ordos tests passed while: an event could require a fact and ignore that fact being retracted; the validator called the project's own adversarial fixture invalid on seven counts; and `ALTERED` could not detect a Work altered by anything other than an event-subject fact. The architecture would have *made sense* and been *unproven and partly incorrect*. This is the sharpest result of P-004: a single canon cannot distinguish "the engine is generic" from "the engine happens to agree with this canon".

**Which abstractions are now demonstrated as genuinely canon-generic?**

Demonstrated by two structurally opposite canons through one engine, with no canon-specific branch (source-scan enforced):

- **Entity/Fact/CausalEdge ontology** — free-form predicates carried both a displacement cascade and a succession dispute with zero core additions beyond `Object`.
- **The judgment model** — truth × support × forced × negated, with the projection to `EventStatus`. `UNKNOWN` stayed epistemic in both canons.
- **Staged propagation** — Phase A/B/C/D ran unmodified on both. Disjunctive support, well-founded rejection, and soft support all behaved as specified on a canon authored against the spec rather than against the implementation.
- **Fact-gated causality** — after §18.6, an event grounded on a fact, and refuted by intervening on that fact.
- **Constraint layer** — `EXCLUDES` between events (Verrin) and between facts (Ordos) through the same check; `INVARIANT` unchanged.
- **Temporal layer** — a clear spine and a deliberately partial order, both with zero violations, and `PRECEDES` contributing nothing to support in either.
- **Contradiction model** — provenance preserved, never auto-repaired, for canon-sourced and intervention-sourced conflicts in both canons.
- **Branch/genealogy/diff/depth/graphDistance** — all parameterized over both canons and asserted identically.
- **The two-hash identity model** — §18.9.

Still **canon-generic-by-assertion rather than by demonstration**: repeated events, multi-valued cells, and graded causality. Two canons is a much stronger claim than one, and it is not proof; a third canon should be chosen to attack whichever of those three a real story most needs.

### 18.11 Remaining risks

Carrying forward from §17.8, with P-004 updates:

1. **Contradiction still does not propagate** (§17.8 risk 1, unchanged). A node that becomes `BOTH` in Phase D does not refute its dependents. Neither canon needed it; a canon where contradiction should poison downstream events still cannot say so.
2. **No support-set minimality** (unchanged). `REQUIRES` groups are taken as authored; nothing enforces the NESS condition, so a redundant conjunct is treated as load-bearing.
3. **Point-order temporal model only** (unchanged). Ordos exercised *partial* order but not *interval* semantics; overlapping-span contradictions remain invisible.
4. **Multi-valued cells** — now an explicit [OPEN-QUESTION] rather than an unexamined assumption. `overrideFact`, `changedStateCount`, and the new `factNodeTruth` all key by `(subject, predicate)`.
5. **`WorkStatus` is still a hand-written cascade** reading the *projected* status rather than judgments — the one place the lossy projection feeds a decision. P-004 made it more capable (fact requirements, dependency union) and therefore more load-bearing, which raises rather than lowers this risk.
6. **`ENABLES` transitivity undefined** (unchanged). Soft support propagates one hop; neither canon forced the question.
7. **No actual-causality attribution** (unchanged). The engine answers "does this occur in this world?", not "which event caused this outcome?".
8. **New: the typo guard is convention-based.** It relies on ids containing `/`. A canon whose literal fact values contain a slash would get false positives; a canon abandoning the `prefix/slug` convention would lose the check entirely.
9. **New: `Canon.unspecified` is an honesty mechanism, not a proof.** A canon can declare a typo as intentional and the validator will believe it. It converts a silent failure into a documented assertion, which is the most a validator can do here.

### 18.12 Recommended P-005

**P-005: repeatable events and occurrence identity.**

Of the three abstractions still generic-only-by-assertion, this is the one most likely to be *forced* by a real canon and the one whose absence is most structural. Today an event id is a point in narrative time, used directly as a validity-window boundary — so "the Chapter votes" happening in three different years is inexpressible without three distinct event ids, and `PRECEDES` cannot relate occurrences of the same event. That constraint is currently classified **[SE-INVARIANT]** on the strength of two canons that never needed otherwise, which is exactly the kind of claim P-004 just showed to be unreliable.

Recommended shape, mirroring what worked here: choose a canon premise that *forces* recurrence (a cyclical rite, a recurring council, a seasonal siege), write the schema challenge and falsifiable predictions before touching code, and let the fixture disagree with the engine. Do not add occurrence identity to the core until a canon cannot be written without it.

Explicitly **not** recommended next: minimum-intervention search. It remains reachable (closed intervention vocabulary, pure `derive`, and now a `stateHash` that can recognise convergent branches) but it is a search problem layered on the causal model, and the causal model just produced two defects in one pass. Attack the ontology twice more before building on it.

---


---

## 19. P-005 — Repeatable events and occurrence identity

**Question.** Can Somnium represent a fictional world in which the same *kind* of thing happens more than once, while preserving deterministic identity, causality, temporal ordering, and branch provenance?

**Method note, stated honestly.** P-004 wrote its predictions before touching the engine at all. P-005 differs: the mission's questions were largely answerable by *read-only probe* against the existing engine, so §19.2 records what the engine already does, measured before any change. §19.4 then states falsifiable predictions about what remains to be built. Nothing in §19.2 is a prediction dressed up as a result. Note the structural weakness this leaves: §§19.1–19.4 and 19.5+ were committed together, so unlike P-004 there is no git evidence that the predictions preceded the code — the reader has only the record and whatever corroboration the artefacts provide.

### 19.1 The ontology question — Event is already an Occurrence

The mission proposes distinguishing `EventType` / `EventOccurrence` / `CanonicalEventReference` and warns against assuming that ontology is correct. It is not correct for SE, and the reason matters.

**SE's `Event` entity has been an occurrence since P-001.** An `Event` id is a point in narrative time: it anchors fact validity windows (`validFrom`/`validTo`), it is a `PRECEDES` endpoint, and it is what an intervention names. Nothing about it denotes a *kind* of happening. Verrin's `ev/exodus` is not "exodus in general", it is *the* exodus.

So the three-part ontology collapses to:

| Mission concept | SE reality | Verdict |
|---|---|---|
| `EventOccurrence` | **`Entity` of kind `Event`** — already exists, already the unit of causality, time, and intervention | **A** — already represented correctly |
| `EventType` | absent. Expressible as an ordinary fact (`occurrence --instance_of--> type`), but the *type itself* has no entity kind to be | **C** — missing, and generic: any canon with recurring rites, trials, battles or councils needs it |
| `CanonicalEventReference` | absent — no source/chapter/section provenance anywhere | **D** — bibliographic metadata, not world structure. Belongs in seed data as ordinary facts if a canon wants it. It must **not** enter the core: an engine that computes consequences has no use for a page number, and putting it in the core would invite the mistake of treating citation as identity. |

**Therefore P-005 is not "add recurrence support".** Recurrence already works (§19.2). What is missing is the *type layer* that lets a canon say "these two occurrences are the same kind of thing", and one defect that lets the engine invent occurrences that canon never declared.

**Occurrence identity, defined.** An occurrence is identified by its **declared canon id**, and by nothing else. Not by type, participants, temporal position, location, or causal provenance — those are *properties* of an occurrence, and every one of them can be shared by two distinct occurrences.

The mission asks: *can two distinct occurrences have identical observable properties?* **Yes**, and the engine must still distinguish them. Probe (§19.2 case C): two rites with the same name, the same performer, the same location, and no distinguishing fact remain distinguishable because they are distinct nodes — negating one yields a different world from negating the other. Identity is *declarational*, not derived from attributes. This is the only model that survives the twin-occurrence case, and it is what SE already does.

The cost of that choice, stated plainly: a canon must enumerate its occurrences. SE cannot say "the council meets every spring for a century" in one assertion. That is a **deliberate limit**, not an oversight — see §19.8 risk 1.

### 19.2 What the engine already does — probe results (read-only, before any change)

Each probe used a throwaway fixture and the shipped `derive`. No engine code was modified to obtain these.

**The mission's temporal pattern works, and is not mistaken for a cycle.**

```
A1 PRECEDES B1 PRECEDES A2 PRECEDES B2,  plus  A1 REQUIRES A2
```
Result: all four `ESTABLISHED`, zero `temporalViolations`, zero validation notices. Negating `A1` makes `A2` `UNSUPPORTED` (it required A1) while `B2` stays `ESTABLISHED` (mere ordering is not support).

This is the distinction the mission asks for, and it falls out of the existing design rather than needing new machinery:

- **causal cycle** — a `REQUIRES` loop among occurrences. Detected as an unfounded set (P-003 Phase B), rejected as `UNSUPPORTED`, reported as a validation *notice*.
- **temporal recurrence** — a `PRECEDES` chain that revisits the same *type*. Not a cycle at all, because the nodes are distinct occurrences. `A1 → B1 → A2 → B2` is a path of length 4 through 4 nodes.
- **repeated event type** — two occurrences bearing the same type label. Invisible to the engine today, because there is no type label.

A `PRECEDES` cycle can only arise between the *same* occurrence ids, which is a genuine contradiction (an occurrence before itself) and is already reported.

**Twin occurrences are distinguishable** (case C). Two `Event`s with identical name, performer and location: `negate(rite-1)` → `stateHash 747cf84b`; `negate(rite-2)` → `stateHash 82619cdb`. Distinct.

**Case D** (shared prerequisite, different outcomes): negating `trial-1` leaves the shared `omen` and `trial-2` established, and only `trial-1`'s outcome falls. Correct.

**Case E** (an occurrence *enables* a later occurrence of the same type) and **case F** (later occurrence *requires* the earlier): both derive cleanly, no oscillation, no manufactured nodes.

**Case G — convergence.** Two branches reaching the same outcome by *different* occurrences (`settled` supported by `rite-a` OR `rite-b`, negate one or the other) produce **different** `stateHash`es. This is correct and worth stating: occurrence statuses are part of the effective state, so "which rite happened" is a difference *in the world*, not merely in its history. False convergence is structurally impossible here.

**Case H — same state, different provenance.** Where two intervention chains genuinely produce the same effective world (P-004's `setFact` vs `relocate`, or a duplicated set-like mark), `stateHash` matches and `identityHash` differs. The P-004 split already answers the mission's question; §19.6 records the formal semantics.

**Type membership needs no core change.** An `instance_of` fact from occurrence to type validates with zero errors, and the occurrences of a type are recoverable by filtering effective facts. The type *layer* is free; only the type *entity kind* is missing.

**Ordos already contains a recurrence pattern and cannot say so.** `ev/rite-of-binding-vaela` and `ev/rite-of-binding-galen` are two occurrences of one narrative kind, feeding one outcome through disjunctive groups. Nothing in the canon marks them as the same kind of act. The capability gap is real and predates P-005.

### 19.3 The defect — `forceEvent` manufactures occurrences

`do(X happens)` on an id **canon never declared** yields:

```
forceEvent("ev/ghost")  ->  status ESTABLISHED
                            judgment { truth: TRUE, support: "HARD", forced: true }
                            contradictions: 0
```

The engine asserts that an occurrence it has never heard of not only happened but is *hard-supported*, and reports no conflict. Compare the same undeclared id reached other ways:

| Route | Result | Correct? |
|---|---|---|
| `addEdge`, undeclared id as REQUIRES **source** | `UNKNOWN` | yes — `hardSupport`'s no-support-rules branch consults `declared` (P-003 case K) |
| `addEdge`, undeclared id as REQUIRES **target** | **`ESTABLISHED`, support `HARD`** | **no — invented history** |
| `negateEvent` | `EXCLUDED` | harmless — removing a non-thing |
| **`forceEvent`** | **`ESTABLISHED`, support `HARD`** | **no — invented history** |

**Ten routes around the same wall.** P-003 built the `declared` gate so that absence of knowledge could not become fact. Nine separate routes walked around it, across five L2 gates. The list is worth reading in full, because the *pattern* is the finding and no individual route is:

1. `positiveFixpoint` sets `TRUE` for a forced node *before* consulting support, so `forceEvent` never reaches the gate at all.
2. The gate lived only in `hardSupport`'s *no-support-rules* branch. An `addEdge` intervention naming a fresh id as a REQUIRES **target** gives that id support rules, so it fell through to `disjoin` and inherited its prerequisite's truth. It chained, too: three added edges produced three `ESTABLISHED` invented occurrences, which then joined an `EventType` and were counted by the occurrence layer.

3. `ENABLES` had the same shape as (2): `softSupported` had no gate, so an added `ENABLES` edge reported an undeclared target as `CONTINGENT` — truth still `NEITHER`, so it could not occur, but the projection implied it was a real candidate.

**And the first repair of (1) was itself wrong.** It set `truth = TRUE` for the forced undeclared node and let Phase D join it to `BOTH`, giving status `CONTRADICTORY`. That reads correctly and fails where it matters: `occurs()` accepts `BOTH`, so the invented occurrence was still counted by `occurrenceCount`, still joined an `EventType`, and still opened the validity window of any canon fact anchored to it — an id canon never declared writing world state. The correct verdict is `truth: FALSE`: the world provably does not contain the occurrence, because **canon defines the vocabulary**. Every downstream consumer then behaves correctly for free, since they all read truth. The incoherence belongs to the *intervention*, not the world, and lives in the contradiction records — which are the authoritative surface for contradictions, while `statuses` is a documented lossy projection (§17.2).

**And the repair of THAT was also wrong.** Pass 3 fixed the `BOTH` problem by excluding the `forced-undeclared` conflict *kind* from the set that taints truth. But `negateEvent` + `forceEvent` on the same ghost emits `forced-vs-negated` instead — a different kind, not in the exclusion set — which tainted truth to `BOTH` and restored the entire hole, count inflation and fact-window writes included. Two individually harmless interventions composed into an unsafe one, and neither's test covered the pair.

**The fix that finally holds is a predicate on the NODE, not a list of conflict kinds.** `cannotBeTainted(node)` is true for any id canon never declared, so no conflict about such an id — present or future, single or composed — may lift its truth above `FALSE`. Gating on kinds means re-enumerating every future conflict kind and every composition of interventions; gating on the node means the invariant holds for all of them. The same repair also reorders Phase D.1 to check undeclared-ness *before* negation, so the record reported is `force-undeclared` (non-existence is the primary defect) rather than `force-vs-negate`.

**And a fifth route bypassed truth entirely.** The node-level guard protects a node's *truth*, and every truth-derived consumer with it. It does not protect *type membership*, because membership is an ordinary fact: `setFact(ghost, instance_of, type)` alone — no `forceEvent`, no conflict, no record — enrolled an invented id as a non-occurring member row, and `typeOfOccurrence(ghost)` resolved to the type. Nothing occurred, nothing was counted, no window opened, so it was not a truth-level hole. But `validateCanon` already forbids a *canon* fact whose subject is undeclared, and interventions were exempt from the same rule — the identical asymmetry as route (1), where `hardSupport` had a gate and `forceEvent` walked around it. Fixed with `declaredSubjects`: a fact's subject must be something canon declares, and a rejected write is reported as `fact-write-undeclared-subject` rather than silently dropped.

**That fix then reproduced a P-004 defect in miniature, and the new test caught it.** Gating only `buildModel`'s `overriddenCells` left the causal graph refusing the write while `applyFactInterventions` — which owns the effective-fact list that `occurrencesOfType` reads — still accepted it. Two views of the same fact disagreeing is exactly §18.6's defect, and the test written to pin the membership fix failed on it immediately.

**And a sixth route used the other end of the same fact.** Gating the subject left the OBJECT open: `setFact(ev/real, instance_of, type/ghost)` — a perfectly declared subject — invented an `EventType`, and `occurrenceCount(type/ghost)` returned 1 with `typeOfOccurrence(ev/real)` resolving to the phantom. `validateCanon` already applies a convention check to a canon fact's object (a string containing `/` is an id reference and must resolve); interventions were exempt from that half too. I found this one by self-probing the subject fix before dispatching the next gate, which is the first time in this sequence the route was found before it was claimed closed.

**And three more routes walked past the object check.** The fifth gate found that `factWriteRejection` had reached a convergence point — one predicate, both call sites — while the *content* of that predicate was still an enumeration wearing invariant clothing. It decided "is this an id?" by testing for a slash, and "is this declarable?" with a set that did not match the canon rule it claimed to mirror:

**(7a) A slash-free phantom type.** `setFact(ev/kael-oath, instance_of, "phantomtype")` on the *shipped Verrin canon* — one intervention, no conflict, no record — invented an `EventType`: `occurrenceCount("phantomtype")` returned 1 and Verrin's real oath count dropped from 2 to 1. Dropping the slash walked straight past `includes("/")`.

**(7b) A canon FACT id as a subject.** `declaredSubjects` included fact ids, but `validateCanon` requires a fact's subject to be an **entity**. So the intervention path was strictly *broader* than the canon path, contradicting the comment that claimed parity. On the shipped Ordos canon, `setFact(fact/seal-held-vaela, instance_of, type/investiture)` inflated the investiture count from 1 to 2, while canon is forbidden to say the same thing.

**(7c) A type instantiating itself.** An `EventType` is a legal fact subject in general, so `setFact(type/t, instance_of, type/t)` added a type to its own membership list.

**The fix is a typed rule, and a differential claim.** `instance_of` is named by the core (`src/canon/types.ts`) precisely so the occurrence layer can be canon-agnostic — so the core also owns its **signature**: `Event -> EventType`. A range check does not care whether a phantom id contains a slash, which is what defeated the convention-based version. `factAssertionError` in `src/canon/fact-rules.ts` holds all of it: subject must be a declared entity (not a fact), `instance_of` must respect its signature, and any other id-shaped object must resolve. It is called by `validateCanon`, `buildModel` and `applyFactInterventions` — three call sites, one function.

And the claim it supports is no longer a list. It is **differential**:

> An intervention may assert no more than canon may.

That is a property of one function, decidable by exhaustive comparison. `src/canon/fact-rules.test.ts` asserts it over 8 subjects × 4 predicates × 11 objects = 352 triples, comparing `validateCanon`'s verdict against whether `derive` actually applies the write, in both directions, with a guard against a vacuous pass. It would have caught 7a, 7b and 7c without anyone having to think of them — which is the whole point.

One deliberate asymmetry remains, in the safe direction: a canon may excuse an unresolved id reference by declaring it in `canon.unspecified`, because a canon can declare intent and an intervention cannot. So canon may be *more* permissive there, never less.

**And then a REFUSED write turned out to change the world.** The differential claim was stated over the wrong observable. It compared "would canon accept this fact?" against "did the fact appear in `world.facts`?" — a claim about the FACT LIST, not about the WORLD. Phase D.0 pushes a `fact-write-illegal` note whose node is the write's *subject*, and that subject is normally declared, so `cannotBeTainted` correctly admitted it to the taint set. The taint expression was then

```
joinTruth(base, base === "TRUE" ? "FALSE" : "TRUE")
```

which for a dormant node evaluates `joinTruth("NEITHER", "TRUE") = TRUE`. A **rejected** intervention therefore *promoted* a dormant declared event to `ESTABLISHED`. Measured on shipped Ordos, `setFact("ev/galen-invested", instance_of, "phantomtype")` — a write the engine refuses — moved that event `UNKNOWN -> ESTABLISHED`, inflated `occurrenceCount("type/investiture")` from 1 to 2, opened `fact/seal-held-galen` so both Seal holders were effective at once, and did **not** report the canon `EXCLUDES` violation, because the fact *node* stayed `NEITHER` and Phase D.2 gates on `occursNow`. 150 refused writes across the three shipped canons changed world state.

**The fix is a second discipline on the taint operation itself.** A conflict may only CONTRADICT A DECIDED VALUE; it may never decide an undecided one. `BOTH` means "this world asserts P and ¬P", which is meaningless until the world has asserted something, so `taint(NEITHER) = NEITHER`. Being a property of the operation rather than of a kind or a node, it holds for every present and future conflict kind on declared and undeclared nodes alike. Independently, `forced-undeclared` and `fact-write-illegal` are now marked as describing an incoherent *intervention* rather than an inconsistent *world*, so they are reported as records and never touch truth. Either guard alone suffices; both are present because fixing only the new kind would have been the ncr-004 mistake a seventh time.

**And the test observable moved to where the claim lives.** The differential suite now also asserts, per *shipped* canon: a refused write leaves `judgments`, `statuses`, `facts`, `workStatuses` and `temporalViolations` identical to the empty chain. (`stateHash` is deliberately excluded — it hashes `contradictions`, which P-003 made first-class members of the world, so a refused write legitimately moves it.) The old fixture had **no dormant declared event**, which is precisely why 352 triples passed while Verrin and Ordos were corruptible. The fixture's *shape*, not its size, was the gap.

The same gate also found that the `fact-write-undeclared-object` conflict kind was **dead code** — Phase D.0 hardcoded the subject kind and discarded the reason — so the report had documented a record the engine could not emit, and object rejections were misreported as subject rejections. There is now ONE kind, `fact-write-illegal`, carrying the specific rule in `FactAssertionError.reason`. Adding a rule needs no new kind and cannot create an unreachable one.

Sequence, because the pattern matters far more than any single hole. Pass 1 fixed (1) and asserted in prose that "every other route to an undeclared id already respected that gate". Pass 2 fixed (2) and (3) and restated the rule. Pass 3 fixed the `BOTH` path and restated it again. Pass 4 made the guard node-level and restated it again. Pass 5 gated fact-write subjects. Pass 6 — the object end — I found myself by probing pass 5 instead of asserting it. Pass 7 replaced the convention check with a typed rule and the prose claim with a differential one. Pass 8 fixed the taint operation and moved the differential's observable from the fact list to the world. **Seven false universals in a row, on the change's own headline rule, across six L2 gates.** Every one of them was written in good faith and every one of them was wrong.

The unifying error was never any individual oversight. It was the shape of the claim: a universal over an open set ("any intervention") defended by enumerating members of that set. Enumeration cannot close such a universal, because the set grows — new conflict kinds, new intervention kinds, and decisively *compositions* of existing ones.

What finally worked was different in kind: enforce the rule where all routes converge, and state it as what that point guarantees rather than as a list of what cannot happen. There are two such points, because there are two things worth protecting:

- **Truth** — `cannotBeTainted(node)`: no conflict about an undeclared id may lift its truth above `FALSE`. This covers occurrence, counting, fact windows, work statuses and temporal violations at a stroke, because every one of those consumers reads truth. It survived a gate's 6,175-chain search (every kind alone, all 342 ordered pairs, all 5,814 ordered triples) with zero violations.
- **Assertion** — `factAssertionError(subject, predicate, object, vocabulary)`: an intervention may assert no more than canon may. One function, three call sites, asserted differentially over 352 triples.

Routes 7a–7c taught the second half of the lesson, and it is the more useful half: **a convergence point protects you from routes, but it does not make the predicate at that point correct.** The assertion guard reached its convergence point at pass 5 and was still defeated three times, because its content was `includes("/")` and a set that did not match canon's. So the test has to be differential too — comparing one authority against another — rather than a survey of attacks.

Route 8 taught the third and last part, which is about the **observable** rather than the rule: **a correct predicate does not make its report harmless.** The rejection was routed into the same taint machinery as a real conflict, and taint on an undecided node is promotion rather than contradiction. A differential claim is only as strong as the thing it differs over, and "did the fact get written?" is a much weaker observable than "is the world the same?". Three lessons, in the order they were learned the hard way: enforce at the convergence point; make the predicate there correct; and compare worlds, not writes.

What would falsify the design now, all decidable and all asserted directly: a single triple on which canon and intervention disagree; a single node reachable such that `!declared && !facts && occurs()`; a single taint that raises a `NEITHER`; or a single refused write that changes a shipped canon's world. Recorded as ncr-004.

This is precisely the mission's prohibition — *"the engine must not silently manufacture infinite fictional history"* — and it is a live defect on `main`, not a hypothetical. It went unnoticed because both seed canons only ever force *declared* events.

**Occurrence generation rule (the explicit rule the mission asks for):**

> **Only canon declares an occurrence.** Canon defines the vocabulary of a world; an intervention selects among it. Two invariants enforce that, each at a point where every route converges. **Truth:** an id canon never declared has `truth: FALSE`, and no conflict about it may lift that truth — a predicate on the node, not a list of conflict kinds. A conflict may in any case only *contradict a decided value*, never decide an undecided one, so no intervention and no composition of interventions can make any dormant node occur, be counted, open or close a fact window, satisfy a `WorkBinding.facts` requirement, change a `workStatus`, or contribute a `temporalViolation`. **Assertion:** an intervention may assert no more than canon may — one function (`factAssertionError`) decides fact legality for `validateCanon`, `buildModel` and `applyFactInterventions` alike, so a fact write cannot name an undeclared subject, use a canon fact as a subject, refer to an unresolvable id, or violate `instance_of`'s `Event -> EventType` signature. Incoherent interventions are reported (`contra:<id>:force-undeclared`, `contra:<id>:fact-write-illegal:<reason>`) with the intervention as provenance, never silently dropped. Such an id may still appear as a node — an `addEdge` endpoint puts one in the node set — but it is `UNKNOWN`, which is the honest report for something canon does not mention.

### 19.4 Falsifiable predictions

1. Fixing the `forceEvent` gate breaks no existing test, because both seed canons only force declared events.
2. `EntityKind` gaining `EventType` requires the type union, the validator whitelist, and the diff projections — the same three sites `Object` needed in P-004, now that the P-004 lesson is known.
3. The type layer needs **no** change to `propagation.ts`: `instance_of` facts are ordinary facts, and types are not causal nodes.
4. Cases A–H all pass with no change to the causal, temporal, or hashing models.
5. The diff can express "event type remains but occurrence identity changed" as a **projection over the existing `WorldDiff`**, with no new `WorldDiff` field.
6. Both seed canons can carry a recurrence pattern without restructuring: Ordos by labelling the two rites it already has, Verrin by adding a genuinely recurring act.
7. At least one further assumption will surface that this analysis did not anticipate.

---


### 19.5 Intervention semantics — what is generic, what is search

The mission asks which of four intervention forms belong in the vocabulary.

| Form | Verdict | Reasoning |
|---|---|---|
| `do(EventOccurrence X never occurs)` | **Ship — already shipped.** | This is exactly `negateEvent(occurrenceId)`. It names a declared occurrence and has a unique satisfying world. |
| `do(EventOccurrence X occurs)` | **Ship — already shipped**, now with a gate. | `forceEvent(occurrenceId)`. P-005 added the rule that the occurrence must be declared (§19.3). |
| `do(EventType never occurs)` | **Ship as sugar, not primitive.** | Well-defined: negate *every* declared occurrence of the type. It has a unique satisfying world, so it is a derivation, not a search. Deliberately **not implemented** in P-005 because it is a mechanical fold over `occurrencesOfType` that no experiment yet needs — the moment a canon wants it, it is four lines and no new semantics. |
| `do(EventType occurs at least once)` | **Defer — this is search.** | It does not say *which* occurrence. With N declared occurrences there are up to 2^N−1 satisfying worlds, and choosing among them is abduction, not propagation. |
| `do(EventType occurs exactly N times)` | **Defer — this is search, and worse.** | Same non-uniqueness, plus it can be unsatisfiable given canon's support structure (Ordos cannot have two rites: they compete). An engine that "satisfied" it would have to invent or suppress occurrences, which is precisely §19.3's prohibition. |

**The dividing line is uniqueness, not difficulty.** An occurrence-quantified intervention names its target and yields one world. A type-quantified intervention constrains a *count* and yields a solution set. SE's `derive` is a function; a solver is not. This is the same boundary that keeps minimum-intervention search out of the core (§10), and it is now the second place that boundary has appeared — which suggests it is a real seam in the architecture rather than a convenience.

What P-005 ships instead is `occurrenceCount(world, typeId)`, which makes the *question* answerable without pretending the *constraint* is derivable. You can ask how many rites happened in any branch; you cannot ask the engine to arrange for exactly two.

### 19.6 Diff semantics — one flag was wrong, and both canons proved it

The mission asks for a diff that distinguishes occurrence added / removed / changed / *"event type remains but occurrence identity changes"*.

The first implementation carried a single `identityShifted` boolean for the last case, defined as *the type persists in both worlds and the occurrence set differs*. **Both seed canons immediately pulled it in opposite directions**, and the cross-canon test failed on Verrin:

| Canon | Shift | added | removed | Reading |
|---|---|---|---|---|
| Verrin | negate `ev/kael-oath` | — | `ev/kael-oath` | a sibling was **lost**; nothing replaced it |
| Ordos | negate Vaela's recognition, force Galen's | `ev/rite-of-binding-galen` | `ev/rite-of-binding-vaela` | one occurrence was **substituted** for another |

Both are "the occurrence set changed while the type persists". Only the second is an identity *shift* in the sense the mission means — the world still contains a rite of binding, but a different one. Collapsing them lost exactly the distinction being asked for, and the single flag reported `true` for both.

`OccurrenceSetDiff` therefore reports **three** predicates over the same computed sets:

- `setChanged` — the type happens in both worlds through a different set. True for both cases above.
- `substituted` — something was **both** added and removed: an occurrence stood in for another. The strict reading. True for Ordos, false for Verrin.
- `typeCeased` — the type happened before and happens not at all now. Not an identity change: the kind of thing stopped.

`added` / `removed` / `retained` / `statusChanged` carry the first three cases the mission lists, and are what the three predicates are computed from.

**No new `WorldDiff` field was needed** (prediction 5 held). This is a projection over derived state in `src/query/occurrence.ts`: the underlying status changes are already in the generic diff, and the type grouping is read from `instance_of` facts. The causal engine, the diff engine, and the hashing model are untouched.

### 19.7 Hash and convergence — measured

The mission asks whether `stateHash` equality is *expected* and `identityHash` equality *expected or forbidden*, for worlds with different intervention histories and different causal provenance but the same effective state.

**Formal semantics, restated:**

- `stateHash` = the identity of the **world**. Canon + judgments + effective facts + work statuses + contradictions + temporal violations. Excludes `rpId` and interventions. Two worlds sharing a `stateHash` *are the same world*.
- `identityHash` = the identity of the **derivation**. `stateHash` + `rpId` + the canonicalized intervention list. Two worlds sharing an `identityHash` were reached the same way.

Therefore: `stateHash(A) == stateHash(B)` with `identityHash(A) != identityHash(B)` is **expected and legitimate**. It is the signature of genealogical convergence. Measured on Ordos, retracting two type-membership facts in either order:

```
retract A then B   stateHash 44f43369   identityHash 241f7600
retract B then A   stateHash 44f43369   identityHash 50928c58
```

Same world, two provenances. Neither hash is wrong; they answer different questions.

**Is `identityHash` equality forbidden when provenance differs?** No — it is *impossible*, which is stronger. `identityHash` is computed *from* the canonicalized provenance, so distinct provenance yields distinct input. The only way two different-looking chains share an `identityHash` is if they canonicalize to the same thing (duplicate set-like marks, or reordered set-like marks), and in that case the provenance is genuinely the same up to the commutation semantics P-004 measured.

**Multiple genealogical branches may legitimately converge, and the engine does not collapse them.** `Universe.id`/`parent`/`lineageOf` are independent of both hashes: two universes with identical `stateHash` remain distinct universes with distinct ancestry. Genealogy and state identity are different concepts and are represented separately — the mission's instruction, satisfied by construction rather than by a new mechanism.

**One result worth stating because it is easy to get backwards.** Occurrence statuses are *part of* the effective state, so two branches that reach "the succession is settled" via different rites do **not** share a `stateHash`:

```
negate ev/kael-oath      stateHash db4b9c39   (kael-oath EXCLUDED)
negate ev/wardens-arrive stateHash bf0d25fa   (kael-oath ESTABLISHED)
```

Which occurrence carried the outcome is a difference *in the world*, not merely in its history. False convergence — two genuinely different worlds sharing a state identity — is structurally impossible for occurrence-level differences.

### 19.8 Propagation — no oscillation, no manufactured history

The mission asks whether the propagation algorithm survives `A → A₁ → B₁ → A₂` without infinite recursion, false bootstrap, accidental cycle detection, duplicate occurrence creation, or status oscillation. Measured:

- **No recursion at all.** `positiveFixpoint` is an iterative worklist over a fixed node set with a `throw`ing pass cap. The node set cannot grow during derivation.
- **No false bootstrap.** `A₁ REQUIRES A₂` between distinct occurrences is a DAG edge. The unfounded-set phase only fires on genuine `REQUIRES` loops, which recurrence is not.
- **No accidental cycle detection.** Verified: the `A1 → B1 → A2 → B2` fixture produces zero cycle notices and zero temporal violations, while a genuine `PRECEDES` loop on the same two occurrences still reports one. Revisiting a *type* is not revisiting a *node*.
- **No occurrence can be manufactured.** Be precise about what is guaranteed, because six earlier drafts of this bullet were false (§19.3, ncr-004). The node *set* is `canon events ∪ edge endpoints ∪ intervention targets`, and `addEdge` **can** put a fresh id in it — so "nothing adds a node" is wrong. What holds are two invariants, each at a convergence point, each asserted directly rather than as a list of routes. **Truth:** an id canon never declared has `truth: FALSE` and nothing can lift it — derivation denies it truth (`hardSupport` however many edges point at it, `softSupported` for soft support, the forced branch yielding `FALSE`) and conflict resolution denies it taint (`cannotBeTainted` covers every undeclared node, and `taint` may only contradict an already-decided value, so no conflict kind and no composition of interventions can join anything to `BOTH` that the world had not already asserted — `BOTH` being what `occurs()` would accept). Everything truth-derived follows: it can never be `ESTABLISHED`, be counted by `occurrenceCount`, appear in `diffOccurrences`' occurred sets, open or close a canon fact's validity window, satisfy a `WorkBinding.facts` requirement, change a `workStatus`, or contribute a `temporalViolation`. **Assertion:** `factAssertionError` decides fact legality for canon and interventions alike, so the intervention path is never more permissive than canon — no undeclared subject, no canon fact as a subject, no unresolvable id-shaped object, and no `instance_of` outside its `Event -> EventType` signature. An undeclared id may appear as an `UNKNOWN` or `UNSUPPORTED` node — the honest report for something canon does not mention. Nothing creates a node *during* derivation, so no fixpoint pass can grow the world. Both invariants are asserted over their whole input space: the truth invariant over the intervention vocabulary in `src/query/occurrence.test.ts`, the assertion invariant differentially over 352 triples in `src/canon/fact-rules.test.ts` — and, because a correct rule can still report harmfully, the same suite asserts per *shipped* canon that a refused write leaves the world identical to the empty chain apart from its record.
- **No oscillation.** Phase A truth values are sticky and monotone in the information order; the assertion that catches a `truthRank` decrease never fires on any recurrence fixture.

**The occurrence generation rule, as implemented:**

> Only canon declares an occurrence. Canon defines the vocabulary; an intervention selects among it. Two invariants, two convergence points. **Truth:** an id canon never declared has `truth: FALSE` and cannot occur — derivation denies it truth, `cannotBeTainted` denies it taint, and `taint` may only contradict a decided value, so nothing dormant can be woken by any conflict kind or any composition of interventions. **Assertion:** an intervention may assert no more than canon may — `factAssertionError` decides fact legality at all three call sites, so a write cannot invent a subject, promote a fact to a subject, refer to an unresolvable id, or violate `instance_of`'s signature. Incoherent interventions are reported with provenance (`contra:<id>:force-undeclared`, `contra:<id>:fact-write-illegal:<reason>`), never silently dropped. Such an id may still appear as an `UNKNOWN` or `UNSUPPORTED` node — the honest report for something canon does not mention.

This closes the defect in §19.3. It is the reason the engine cannot manufacture infinite fictional history: not a depth limit or a recursion guard, but the absence of any mechanism that could create a node.

### 19.9 Cross-canon results — two shapes, one engine

Both seed canons now carry a recurring event type, and **they express recurrence differently on purpose**:

| | Verrin | Ordos |
|---|---|---|
| Type | `type/oath-sworn` | `type/rite-of-binding`, `type/investiture` |
| Occurrences | `ev/kael-oath`, `ev/vara-vow` | `ev/rite-of-binding-vaela`, `ev/rite-of-binding-galen` |
| Shape | **independent parallel** — two people swear binding oaths in answer to one catastrophe | **competing alternatives** — two rites of one kind, at most one can complete |
| Occurring at baseline | 2 of 2 | 1 of 2 (Galen's hangs on the unsettled parentage) |
| Consequences | different (Kael's summons the Wardens, Vara's does not) | feed one outcome disjunctively |
| Under a shift | `setChanged`, **not** `substituted` | `setChanged` **and** `substituted` |

`capability 11` in the cross-canon suite is parameterized over both, per the mission's requirement that quantified claims be tests rather than prose: 9 assertions × 2 canons, plus 2 explicit contrast tests. The same `occurrencesOfType` / `occurrenceCount` / `diffOccurrences` functions read both, and the one-engine source scan still passes — no canon id literal appears in executable engine code.

Ordos's two rites existed before P-005 and the canon could not say they were the same kind of act. That gap is now closed with two facts and no structural change, which is the strongest available evidence that the type layer is genuinely a layer.

### 19.10 Predictions scored

| # | Prediction | Outcome |
|---|---|---|
| 1 | Fixing the `forceEvent` gate breaks no existing test | **CONFIRMED** — 348 stayed green through the fix |
| 2 | `EventType` needs the type union, the validator whitelist, and the diff projections | **CONFIRMED** — exactly those three, the P-004 lesson applied |
| 3 | The type layer needs no `propagation.ts` change | **CONFIRMED** — types are not causal nodes; the engine never learned they exist |
| 4 | Cases A–H pass with no change to the causal, temporal, or hashing models | **CONFIRMED** |
| 5 | The diff needs no new `WorldDiff` field | **CONFIRMED** — a projection in `src/query/occurrence.ts` |
| 6 | Both canons carry a recurrence pattern without restructuring | **CONFIRMED** — two facts each |
| 7 | At least one further assumption will surface | **CONFIRMED** — the single `identityShifted` boolean (§19.6). Both canons pulled it in opposite directions and the cross-canon test caught it. |

Prediction 7 is the one that earned its place. Writing it as "something I have not thought of will break" is only useful if it is allowed to actually fire, and it did: the diff-semantics correction came from the two canons disagreeing, not from review.

### 19.11 Remaining risks

Carried from §17.8 / §18.11, with P-005 updates:

1. **Occurrences must be enumerated.** The declarational identity model means a canon cannot say "the council meets every spring for a century" — it must declare each meeting. Correct for a *counterfactual* engine (you can only intervene on what exists), but it puts a hard ceiling on canon scale. A generative occurrence schema is the obvious next want and the obvious next hazard: anything that manufactures occurrences reopens §19.3.
2. **No cardinality constraints.** A canon cannot assert "this type happens at most once" and have it enforced. Ordos gets that effect indirectly, through fact-level `EXCLUDES` on the Seal. A first-class `AT_MOST_ONE` over a type would be a constraint-layer addition — deliberately not attempted on one canon's evidence.
3. **`instance_of` is single-valued in practice.** `typeOfOccurrence` returns the first match. An occurrence that is both a rite *and* a betrayal is representable as two facts but only one is reported. Same multi-valued-cell risk as §18.11 item 4, now with a second instance.
4. **Contradiction still does not propagate** (§17.8 item 1, unchanged).
5. **No support-set minimality** (unchanged).
6. **Point-order temporal model only** (unchanged). Recurrence exercised *partial* order hard; interval semantics remain absent.
7. **`WorkStatus` still reads the projected status** (§18.11 item 5, unchanged) and has no notion of occurrence at all — a Work binds to specific occurrence ids, so "the Work as such recurs" is inexpressible.
8. **`ENABLES` transitivity undefined** (unchanged).
9. **No actual-causality attribution** (unchanged).
10. **Type-quantified interventions are absent by design** (§19.5). If a canon genuinely needs "exactly N", that is a solver, and it should arrive as a separate layer above `derive`, never inside it.

### 19.12 Recommended P-006

**P-006: constraint-layer cardinality — `AT_MOST_ONE` / `AT_LEAST_ONE` over an EventType.**

This is the smallest thing P-005 makes both possible and obviously missing. Ordos already needs it and fakes it: "only one Warden holds the Seal" is enforced by a fact-level `EXCLUDES` between two `held_by` facts, which works but says the wrong thing — the constraint is really *about the type of act*, not about two particular facts. Verrin would need the opposite (its oaths are deliberately unconstrained), so the two canons would immediately disagree about it, which is the condition under which P-003/P-004/P-005 all produced their best findings.

Critically, cardinality *constraints* are not cardinality *interventions*: a constraint is checked in Phase D and yields a contradiction when violated, which is a derivation. `do(exactly N)` is a search (§19.5). P-006 should build the former and continue to refuse the latter.

Recommended method, unchanged because it keeps working: pick the premise that forces the feature, write the schema challenge and falsifiable predictions before touching code, let the fixtures disagree with the engine, and treat a green suite as evidence about the tests as much as about the code.

**Explicitly not recommended next:** a third canon. P-004 established genericity across two structurally opposite canons and P-005 confirmed it holds under recurrence. A third canon would raise confidence more slowly than attacking the constraint layer, which currently has exactly two edge kinds (`EXCLUDES`, `INVARIANT`) and has never been stress-tested at all.

---

*End of report. P-005 complete (section 19). Next: P-006 - constraint-layer cardinality over an EventType (section 19.12).*
