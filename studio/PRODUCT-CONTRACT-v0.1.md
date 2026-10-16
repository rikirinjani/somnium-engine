# Somnium Studio Product Contract v0.1

**Status:** Draft — Product-track bridge from S035 Core boundary to MVP specification  
**Date:** 2026-09-17  
**Scope:** Studio MVP (human-facing deterministic counterfactual exploration). Does not extend or alter Core semantics.

---

## Repository Authority Note

This contract is written against two sources of truth:

1. **Research evidence** — the S035 report establishes that the incremental derivation architecture is proven, 6,582/6,582 cases passed, and a production-boundary plan was established. This tells us what the Core has demonstrated it *can* do.
2. **Repository evidence** — direct inspection of the current checkout (`Somnium-s035`) shows ~505 `it()`/`test()` call-site declarations and shows that `src/derive/incremental.ts` does not exist. The S035 plan to promote `incrementalApply`/`serialize`/`restore` into `src/derive/incremental.ts` is recorded as a *next step* in the report, not a completed action in the repository.

**Product implication:** Studio must depend on the *public behaviors* the Core has proven (deterministic derivation, WorldDiff, lineage, rewind points, interventions), not on a specific internal file path. The 6,582-case count and the exact module layout are treated as research/repository reconciliation items, not product assumptions.

---

## 1. Product definition

### What Somnium Studio is

Somnium Studio is the human-facing environment for exploring alternate fictional worlds with deterministic causal consistency.

- The Core answers: **"Given this canon and this change, what world results?"**
- Studio answers: **"How do I let a human ask that question, understand the answer, and keep exploring?"**

Studio is an interface, persistence, and visualization layer over the deterministic Core. It does not simulate; it queries, persists, and presents Core output.

### Core abstraction preserved from S035

```text
Canon
  ↓
Rewind Point (a declared narrative cut)
  ↓
Intervention (typed, enumerable change)
  ↓
derive(canon, interventions, rewindPoint) → WorldState
  ↓
WorldDiff(baseline, branch)
  ↓
Causal grounding / explanation (support, not attribution)
```

### What Studio is NOT (defining boundaries)

| Is NOT | Why |
|---|---|
| An LLM story generator | LLM may narrate or explain, but the deterministic Core is the authority on what is true in the world. |
| A generic AI writing suite | MVP does not generate prose, characters, or plots. |
| Causality Engine (CE) | CE is a separate Godot/game-oriented simulator. Studio does not import CE requirements. |
| A social/collaboration platform | MVP is single-user, local-first project storage. |
| A procedural universe generator | Worlds are authored, not generated. |
| A replacement for Core semantics | Studio may NOT redefine `derive`, edge semantics, status lattice, or diff semantics. |

---

## 2. Target user

### Primary user

**Serious fictional-world creators who care about consistency.**

- Novelists building internally consistent fictional history
- Screenwriters tracking story logic
- RPG / tabletop world designers
- Interactive-fiction / visual-novel creators
- Alternate-history creators
- Complex franchise/universe maintainers

### Secondary users (out-of-MVP reach, but audience-adjacent)

- Narrative editors / lore-keepers helping authors verify consistency
- Academics or students studying counterfactual narrative structure
- TTRPG players replaying canonical scenarios (consumes, not authors)

### Explicitly excluded users for MVP

- Casual "AI worldbuild for me" chat users
- Writers looking for prose generation first
- Game developers needing runtime simulation / Godot integration (CE's domain)
- Multi-user collaborative teams (Studio is single-user in MVP)
- Users needing real-world counterfactual simulation (Kronos Engine's domain)

---

## 3. Jobs-to-be-done

### Primary JTBD

> When I have a complex fictional world, I want to change an established fact and understand the consequences across the world, so that I can explore alternate scenarios without manually maintaining causal consistency.

### Supporting jobs

| # | Supporting job | Classification |
|---|---|---|
| 3.1 | Keep one authoritative canon and separate alternate branches from it. | [P] Core supports canon + intervention identity. |
| 3.2 | Pick a narrative moment and ask "what if X changed here?" | [N] Studio must build UI; Core has `RewindPoint` metadata but does not yet semantically cut derivation at the point (see §7). |
| 3.3 | See which events, facts, and stories changed because of my intervention. | [P] `WorldDiff` is implemented and invariant-backed. |
| 3.4 | Understand *why* something changed (grounding, not attribution). | [P] Partial — status + support kind + contradiction records available; full "X caused Y" attribution is NOT in Core. |
| 3.5 | Save projects, branches, and exploration history and resume later. | [N] Studio persistence layer; Core provides serializable world state but no project/branch store. |
| 3.6 | Compare branches side by side. | [N] Studio UI; `worldDiff` and `identityHash` provide the underlying primitives. |
| 3.7 | Export or share a branch as a reproducible artifact. | [N] Studio feature; `ExperimentSet` shape and `writeExperimentSet` show a possible artifact pattern. |

---

## 4. Product objects

### Object definitions with provenance classification

| Object | Definition | Classification & evidence |
|---|---|---|
| **Project** | A Studio-level container: one canon, a timeline/rewind-point set, a branch tree, and user metadata. | [N] No `Project` type exists in Core. Studio must define and persist its own project model. |
| **Canon** | Immutable, versioned, content-hashed document: entities, facts, causal edges, work bindings, constraints. | [P] `Canon` interface in `src/canon/types.ts:168-202`; `loadCanon`/`inspectCanon`/`validateCanon` in `src/canon/canon.ts:78-279`. |
| **World** | A derived `WorldState` produced by `derive(canon, interventions, rp?)`. Includes judgments, statuses, effective facts, work statuses, contradictions, temporal/constraint violations, and two hashes. | [P] `WorldState` in `src/derive/world-state.ts:65-121`; `derive` entry point at `:491-579`. |
| **Timeline** | The partial order of events declared by `PRECEDES` edges in the canon. Not a wall-clock timeline. | [P] `PRECEDES` edge kind in `src/canon/types.ts:90`; temporal skeleton in Verrin seed `src/canon/verrin.ts:126-136`. |
| **Rewind Point** | A declared narrative cut: anchor event + downward-closed set of events under `PRECEDES` + derived-hash integrity check. | [P] `RewindPoint` type in `src/timeline/types.ts:34-43`; `validateRewindPoint` in `src/timeline/rewind-point.ts:14-50`. **Caveat:** the current `derive()` does not use `rp.cut` to restrict derivation; the cut is validated metadata only (observed in `src/derive/world-state.ts:514`). This is a genuine [R] gap for the product's central rewind metaphor (see §7). |
| **Intervention** | A closed, typed, enumerable change: `negateEvent \| forceEvent \| setFact \| retractFact \| severEdge \| addEdge \| relocate`. | [P] `Intervention` type and constructors in `src/timeline/types.ts:10-101`. |
| **Counterfactual** | The alternate `WorldState` that results from applying one or more interventions to a canon (optionally at a rewind point). | [P] Produced by `derive()`; no separate `Counterfactual` type exists. Studio may wrap it. |
| **Branch** | A lineage record from baseline through a chain of interventions. The Core provides `Universe`/`BranchRecord` as process-local mutable registry entries. | [P] Types exist (`src/timeline/types.ts:45-60`). [N] Studio must NOT rely on the module-level `Universe` registry (`src/timeline/universe.ts:11-24`) for persistence; it must own branch storage. |
| **WorldDiff** | The deterministic structural delta between two worlds from the same canon: status changes, fact add/remove/override, edge changes, introduced/resolved contradictions, constraint/temporal violations, reachability changes, work-status changes. | [P] `WorldDiff` in `src/diff/types.ts:106-125`; `worldDiff()` in `src/diff/diff.ts:149-241`; invariant: empty diff ⟺ equal `stateHash` (see `src/derive/semantic.ts` and `src/derive/world-state.ts:564-566`). |
| **Causal Evidence** | The grounding information Studio can show: event/fact status, `SupportKind` (HARD/SOFT/NONE/UNFOUNDED), truth value, contradiction records, and the effective edge set. | [P] `Judgment` in `src/derive/judgment.ts:60-67`; `ConflictNote` in `src/derive/propagation.ts:739+`; `ContradictionRecord` in `src/diff/types.ts:37-44`. [R] Actual-causality attribution ("X caused Y") is explicitly noted as unimplemented in `docs/ARCHITECTURE-RECONNAISSANCE.md` §17.8 risk 7. |

### Object relationship diagram

```text
Project
  ├── Canon (immutable, content-hashed)
  ├── Timeline (PRECEDES partial order)
  ├── Rewind Points (declared narrative cuts)
  └── Branches / Counterfactuals
          ├── Base World (derive(canon, []))
          ├── Rewind Point reference
          ├── Intervention chain
          ├── Resulting WorldState
          ├── WorldDiff vs parent/baseline
          ├── Causal Grounding (status + support + contradictions)
          └── Lineage (parent/child chain)
```

---

## 5. User actions

### Canonical operations and state transitions

| User action | Core operation(s) | Classification |
|---|---|---|
| Create / import project | Studio-defined; canon loaded via `loadCanon()` | [N] + [P] |
| Browse canon (entities, facts, events, edges) | Direct read of `Canon` fields | [P] |
| View timeline | Render `PRECEDES` edges from `canon.edges` | [P] |
| Create / view Rewind Point | Studio UI + `validateRewindPoint()`; metadata persists in Studio | [P] for validation; [N] for Studio-owned RP set; [R] if RP must cut derivation semantically |
| Compose intervention | Studio UI calls intervention constructors | [P] constructors exist; [N] for intervention authoring UI and validation UX |
| Validate intervention before applying | **NO** public `validateIntervention()` exists; pieces exist (`factAssertionError`, edge/event existence) but are not composed. | [N] Studio can build a wrapper; [R] to request a Core validator. |
| Derive counterfactual | `derive(canon, interventions, rp?)` | [P] |
| View WorldDiff | `worldDiff(baseline, branch)` + `projectDiff()` / `typedDiff()` | [P] |
| View causal grounding / explanation | Read `WorldState.judgments`, `contradictions`, `edges`, `statuses` | [P] partial; [R] for attribution (§7). |
| Compare branches | `worldDiff()` across branch states | [P] |
| Branch again from a counterfactual | Studio appends a new intervention and re-derives; Core's `derive()` takes the full chain | [P] behaviorally, though not incrementally in the public API of the inspected checkout. |
| View branch tree / lineage | Studio persists parent/child records; Core provides `lineageOf()` only for process-local registry | [P] concept; [N] Studio persistence. |
| Save / load project | Studio persistence layer; serialize `Canon`, rewind points, branch records, intervention chains | [N] |
| Export reproducible artifact | Studio wraps world state + diff + lineage; `writeExperimentSet()` shows a possible JSON artifact pattern | [N] |

### State-transition diagram

```text
[Project empty]
   ↓ import canon
[Canon loaded]
   ↓ create rewind point
[Rewind Point declared]
   ↓ compose intervention
[Intervention staged]
   ↓ derive
[Counterfactual World produced]
   ↓ diff against baseline / parent
[WorldDiff displayed]
   ↓ explore / explain / branch again
[Branch tree grows]
   ↓ save project
[Project persisted]
```

---

## 6. Primary UX

### Minimum screens and navigation

Studio MVP requires only the following screens, ordered by the canonical loop:

| # | Screen | Purpose | Core dependency |
|---|---|---|---|
| 1 | **Project / World Open** | Load or create a project; import a canon. | `loadCanon()` [P] |
| 2 | **Canon Browser** | Read-only browse entities, facts, events, causal edges, works. | `Canon` fields [P] |
| 3 | **Timeline** | Visualize the `PRECEDES` partial order. | `canon.edges` filtered by `PRECEDES` [P] |
| 4 | **Rewind Point selector** | Pick an anchor event; declare or select a rewind point. | `validateRewindPoint()` [P]; semantic cut [R] |
| 5 | **"What If?" / Intervention Composer** | Build one typed intervention from the closed vocabulary. | Intervention constructors [P]; validation [N]/[R] |
| 6 | **Derive button** | Run `derive(canon, interventions, rp)`. | `derive()` [P] |
| 7 | **WorldDiff view** | Show what changed: statuses, facts, edges, contradictions, work statuses. | `worldDiff()` + projections [P] |
| 8 | **"Why?" / Grounding view** | Show status, support kind, truth value, contradiction record, effective edge set for a selected node. | `judgments`, `contradictions`, `edges` [P] |
| 9 | **Alternate World explorer** | Browse the counterfactual world as if it were canon. | `WorldState` fields [P] |
| 10 | **Branch tree** | Show baseline → parent → child relationships and allow branching again. | Studio persistence + `identityHash` [P] |

### Navigation flow

```text
Open World
   → Canon Browser
   → Timeline
   → Rewind Point selector
   → "What If?" Intervention Composer
   → Derive
   → WorldDiff
   → "Why?" Grounding
   → Alternate World Explorer
   → Branch Again
   → Branch Tree
```

### UX decisions

- The first "magic moment" is: user changes one fact (e.g., negates the Blight) and immediately sees downstream events flip status and a story become impossible.
- Studio should default to the Verrin seed canon for the MVP demo so users experience counterfactual power before they author their own canon.
- No LLM chat interface in MVP; LLM is an optional explanation/narration layer invoked only from the "Why?" view.

---

## 7. Core/Studio boundary

### Boundary principle

> Studio presents Core state, queries Core state, persists projects/branches, constructs interventions, visualizes diffs, explains results, and manages user workflow. Studio must NOT redefine how Core derives semantic state.

### Capability matrix

| Studio operation | Required Core capability | Current status | Classification |
|---|---|---|---|
| Load a canon | `loadCanon()` / `inspectCanon()` / `validateCanon()` | Implemented in `src/canon/canon.ts:78-279` | [P] |
| Derive a world | `derive(canon, interventions, rp?)` | Implemented in `src/derive/world-state.ts:491-579` | [P] |
| Get entity status | `statusOf(ws, entityId)` | Implemented in `src/query/status.ts:8-10` | [P] |
| Get work classification | `workStatusOf(ws, workId)` | Implemented in `src/query/status.ts:13-15` | [P] |
| Query a subject's fact | `subjectFact(ws, subjectId, predicate)` | Implemented in `src/query/query.ts:19-25` | [P] |
| Compute WorldDiff | `worldDiff(baseline, branch)` | Implemented in `src/diff/diff.ts:149-241` | [P] |
| Typed diff projections | `projectDiff()` / `typedDiff()` | Implemented in `src/diff/projections.ts:46,98` | [P] |
| Compute divergence / depth | `computeDivergence()` / `computeDepth()` | Implemented in `src/depth/depth.ts:160,236` | [P] |
| Validate a rewind point | `validateRewindPoint(rp, canon)` | Implemented in `src/timeline/rewind-point.ts:14-50` | [P] |
| Create branch lineage record | `createUniverse()` / `branchUniverse()` / `lineageOf()` | Implemented in `src/timeline/universe.ts:31-67` | [P] as concept, but [N] for Studio-owned persistence because the Core registry is process-local mutable state (`src/timeline/universe.ts:11-24`). |
| Persist a world snapshot | Serializing `WorldState` (or subset) | No public `serialize()`/`restore()` for `WorldState` in `src/`; the S035 plan proposes them for `src/derive/incremental.ts`. `writeExperimentSet()` in `src/experiment/runner.ts:114-118` writes `ExperimentSet` artifacts but is not a general project-store API. | [N] / [R] depending on whether Studio builds it or requests a Core checkpoint API. |
| Validate an intervention before applying | Composed validator over event/fact/edge existence and `factAssertionError()` | **No public `validateIntervention()` exists.** `factAssertionError()` in `src/canon/fact-rules.ts:120+` and edge/event existence checks provide pieces. | [N] Studio can build; [R] if we want Core to own semantic validation of interventions. |
| Explain causality / "Why?" | Status + support kind + contradiction records + effective edges | Partial: `Judgment` gives support; `ConflictNote` gives contradiction justification; but **actual-causality attribution is unimplemented** (`docs/ARCHITECTURE-RECONNAISSANCE.md` §17.8 risk 7). | [P] for grounding; [R] for attribution. |
| Apply a rewind point semantically (cut narrative time) | `derive()` must respect `rp.cut` | **Not implemented.** `derive()` reads only `rp.id` (`src/derive/world-state.ts:514`). | [R] — this is the most important missing Core capability for the product's central metaphor. |

### Critical gaps requiring Research-track questions

1. **Rewind Point semantic cut.** The product loop assumes "rewind to moment X, then intervene." The current public `derive()` does not restrict derivation to the cut; it applies interventions to the full canon. Does the research track intend the cut to become semantically active, or should the product treat Rewind Points as validated metadata only?

2. **Actual-causality attribution for "Why?".** The product wants to show "X caused Y." Core currently answers "Y is UNSUPPORTED because its REQUIRES group is refuted." Is attribution in scope for S036+? If not, the product must reframe "Why?" as "grounding" rather than "cause."

3. **Public intervention validation API.** Should Core expose a `validateIntervention(iv, canon, world?)` function? Studio can approximate it, but semantic validation belongs in Core.

4. **Public checkpoint/restore for `WorldState` (not `DerivationModel`).** S035's planned `serialize`/`restore` target the internal `DerivationModel`. For Studio, the natural checkpoint target is `WorldState` + project metadata. Is a `WorldState` checkpoint API in scope?

### What Studio must build itself

- Project model and persistence
- Branch tree storage (do not use Core's process-local `Universe` registry across sessions)
- Intervention authoring UI
- Diff/grounding visualization
- Optional LLM narration wrapper

---

## 8. LLM boundary

### What the LLM MAY do

- **Canon-entry assistance:** Help a human transcribe prose or notes into the structured `Canon` format. The resulting canon must pass `inspectCanon()` and be committed as a reviewed, content-hashed document.
- **Intervention interpretation/proposal:** Suggest interventions in the closed vocabulary from natural-language "what if" prompts.
- **World queries:** Answer natural-language questions by reading the derived `WorldState` (with citations to node ids / facts).
- **Causal grounding narration:** Convert status/support/contradiction records into human-readable explanations.
- **Summary generation:** Summarize a `WorldDiff` or branch tree for the user.

### What the LLM MUST NOT do

- Become the authoritative simulator.
- Override, repair, or silently patch Core output.
- Invent facts, events, or edges not grounded in the canon or derived world.
- Answer "what happens?" by generating prose without first deriving the world through Core.
- Make probabilistic or judgmental claims the Core cannot verify.

### Enforcement

- Studio must display LLM-generated explanations alongside the underlying Core record IDs (status, fact, edge, contradiction) so the user can verify the claim against the deterministic output.
- The Core package must retain zero LLM/network imports (already true in the inspected checkout).

---

## 9. Persistence model

### Minimum information Studio must persist

| Entity | Fields to persist | Notes |
|---|---|---|
| **Project** | `projectId`, `name`, `createdAt`, `updatedAt`, `canonPath` or embedded `Canon` | Canon is immutable; store by reference or embed with version. |
| **Canon** | Full `Canon` JSON + `hash` | Re-loadable via `loadCanon()`. Content-hash gives integrity. |
| **Rewind Point** | `id`, `canonId`, `anchorEvent`, `cut`, `derivedHash`, `label`, `tags`, `created` | Re-validated on load via `validateRewindPoint()`. |
| **Branch / Counterfactual** | `branchId`, `parentBranchId` (or null for baseline), `rpId`, ordered `interventions[]`, `worldHash` (identityHash), `stateHash`, `createdAt`, `label` | Do NOT persist the full `WorldState` as the source of truth; re-derive on load. Caching derived worlds is an optimization, not authority. |
| **WorldDiff snapshot** | Optional: store `WorldDiff` JSON + `hash` for quick display | Can be recomputed from parent and branch worlds. |
| **Lineage** | Parent-child adjacency list; full intervention chain per branch | Enables branch tree rendering and deterministic replay. |
| **User metadata** | Labels, tags, notes, favorite branches | Studio-only; never hashed into world identity. |

### Persistence decisions

- **Single source of truth for a derived world is `(canon, intervention chain, rp)`, not a stored `WorldState`.** Studio may cache derived worlds for performance, but must be able to re-derive to verify determinism.
- **Identity key for a branch is `identityHash` from Core**, which encodes stateHash + rpId + canonical intervention form. Studio may add its own project-scoped branch ID.
- **Do not reuse Core's `Universe` registry for persistence.** It is module-local mutable state with per-process counters (`src/timeline/universe.ts:11-24`). Studio must own branch IDs.
- **File format:** JSON files on local disk for MVP. No cloud database in MVP.

---

## 10. MVP acceptance criteria

### Functional criteria

| ID | Criterion | Verification approach | Classification |
|---|---|---|---|
| A1 | User can load Verrin canon and see entities, facts, events, and edges. | UI test / manual demo. | [P] |
| A2 | User can view the timeline as a partial order (PRECEDES edges). | UI test / manual demo. | [P] |
| A3 | User can select or create a Rewind Point anchored at an event. | UI test + `validateRewindPoint()` passes. | [P] validation; [R] semantic cut. |
| A4 | User can compose one valid intervention from the closed vocabulary. | UI test. | [N] (validation UX). |
| A5 | Deriving a counterfactual returns a deterministic `WorldState` for the same inputs. | Automated test: derive twice, compare `identityHash`. | [P] |
| A6 | WorldDiff shows status changes, fact changes, and work-status changes for the Verrin "negate blight" intervention. | Automated test against known Verrin expectations. | [P] |
| A7 | "Why?" view shows at minimum the status, support kind, truth value, and effective edge set for a selected node. | UI test / automated assertion on `WorldState.judgments` and `edges`. | [P] |
| A8 | User can branch again from a counterfactual and get a new deterministic world. | Automated test: append intervention, re-derive, check lineage. | [P] conceptually; [N] for Studio persistence. |
| A9 | Saving and loading a project restores the same branch tree and allows re-derivation. | End-to-end persistence test. | [N] |
| A10 | LLM narration, if used, cites the Core record IDs it is based on. | Manual review / test. | [N] |

### Verrin demo acceptance criteria

These mirror the existing PoC acceptance queries (`docs/ARCHITECTURE-RECONNAISSANCE.md` §13; `src/canon/verrin.ts:8-12`):

- Baseline: `statusOf(baseline, "ev/blight-begins") === "ESTABLISHED"`.
- After `negateEvent("ev/blight-begins")`: `statusOf(world, "ev/exodus") === "UNSUPPORTED"`.
- After the same intervention: `workStatusOf(world, "work/verrin-ashfall") === "IMPOSSIBLE"`.
- After the same intervention: `subjectFact(world, "char/vara", "located_in")?.object === "loc/valdar"`.
- Determinism: two derivations of the same inputs produce the same `identityHash`.

### Quality criteria

- No Core semantic redefinition in Studio code.
- Deterministic output does not depend on UI state or LLM state.
- Invalid interventions produce a user-visible explanation, not silent no-op (current Core silently skips illegal fact writes; Studio must surface this).

---

## 11. Non-goals

### Explicit MVP exclusions

| Non-goal | Rationale |
|---|---|
| Social platform / collaboration | MVP is single-user, local-first. |
| Marketplace for canons or worlds | Out of scope. |
| Generic AI writing suite / prose generation | LLM is optional explanation only. |
| Generic LLM chatbot front end | Core queries, not open chat. |
| Game engine / Godot integration | Causality Engine owns this. |
| Full manuscript ingestion | Later feature; not MVP-defining. |
| Procedural universe generation | Worlds are authored. |
| Cloud sync or multi-device | Local files in MVP. |
| Minimum-intervention search / abduction | Deferred per `docs/ARCHITECTURE-RECONNAISSANCE.md` §10. |
| Probabilistic edges or RNG | Core v1 has zero stochasticity. |
| Interval / Allen algebra for time | PRECEDES-only point order in v1. |
| Multi-valued predicates for one subject+pair | Known v1 limitation (`docs/ARCHITECTURE-RECONNAISSANCE.md` §17.8 risk 4). |

---

## 12. Research-track escalation criteria

A requirement must go back to the original Somnium research session ONLY if it meets one of these criteria. Do NOT escalate implementation-file or test-count discrepancies.

### Escalate to Research when

| # | Criterion | Example for this contract |
|---|---|---|
| R1 | The MVP requires a Core semantic change. | Should `derive()` respect `RewindPoint.cut` semantically? |
| R2 | The MVP requires a new public Core API that owns semantic validation. | Should Core expose `validateIntervention()`? |
| R3 | The MVP requires causal attribution ("X caused Y") beyond grounding. | Is actual-causality attribution in scope? |
| R4 | The MVP requires a public checkpoint/restore API for `WorldState`. | Should Core provide `serializeWorld`/`restoreWorld`? |
| R5 | The MVP requires a new entity kind, edge kind, or status value that affects propagation. | Any new ontology member must be test-first and research-reviewed. |
| R6 | Studio discovers a Core behavior that contradicts the documented semantics. | E.g., if `derive()` produced non-deterministic output. |

### Do NOT escalate

- Where the S035 incremental functions live internally (file path discrepancy).
- Exact test-count accounting between the S035 report and the current checkout.
- Studio-only UI, persistence, or workflow features.
- Missing Core convenience wrappers that Studio can build without semantic risk.

### Escalation format

Each escalation must be a single, answerable question with:

- The product requirement it supports.
- Evidence from the repository or S035 report.
- A concrete "yes/no/defer" ask.
- The MVP impact if deferred.

---

## 13. First demo specification

### Goal

Communicate Somnium's unique value in under five minutes: **change one fact, see deterministic consequences across a fictional world.**

### Demo world

Use the built-in **Verrin** seed canon (`src/canon/verrin.ts`). It is small, invented (no copyright issues), and already has acceptance contracts.

### Demo script

| Step | Action | What Studio shows | Evidence |
|---|---|---|---|
| 0 | Open project "Verrin Demo." | Canon browser loads. | `verrinCanon()` in `src/canon/verrin.ts:158-168`. |
| 1 | **Baseline view.** | Timeline shows `ev/blight-begins` → `ev/exodus` → `ev/ashfall-falls`. Work `Verrin: Ashfall` is PRESERVED. | Acceptance contract in `src/canon/verrin.ts:148-152`. |
| 2 | User asks: **"What if the Blight never began?"** | Studio suggests intervention `negateEvent(ev/blight-begins)`. | Intervention constructor in `src/timeline/types.ts:63-65`. |
| 3 | User applies the intervention at rewind point `RP-VERRIN-001` (The Blight begins). | Studio runs `derive(canon, [negateEvent(...)], rp)`. | `derive()` in `src/derive/world-state.ts:491`. |
| 4 | **WorldDiff view.** | Status changes: `ev/exodus` → UNSUPPORTED, `ev/ashfall-falls` → UNSUPPORTED, `ev/vara-vow` → UNSUPPORTED, `ev/kael-oath` → UNSUPPORTED, etc. Fact change: `char/vara.located_in` stays `loc/valdar`. Work change: `work/verrin-ashfall` → IMPOSSIBLE. | PoC acceptance queries in `docs/ARCHITECTURE-RECONNAISSANCE.md` §13. |
| 5 | **"Why?" view on `ev/exodus`.** | Shows status UNSUPPORTED, support NONE, and that its REQUIRES group (`ev/blight-begins`) is negated by the intervention. | `Judgment`/`SupportKind` in `src/derive/judgment.ts:54-67`; support groups in `src/derive/propagation.ts:65-77`. |
| 6 | User branches again: **"What if Vara still leaves for Thornhollow anyway?"** | User adds `relocate(char/vara, loc/thornhollow)`. Studio derives the new world and shows the new diff vs. the previous branch. | `relocate()` in `src/timeline/types.ts:93-100`; re-derivation via `derive()`. |
| 7 | **Branch tree.** | Shows baseline → "Blight negated" → "Vara relocates". | Studio persistence + `identityHash` [P]. |

### Demo acceptance test

A passing demo must satisfy:

- `statusOf(baseline, "ev/blight-begins") === "ESTABLISHED"`.
- After `negateEvent("ev/blight-begins")`: `statusOf(world, "ev/exodus") === "UNSUPPORTED"`.
- After same: `workStatusOf(world, "work/verrin-ashfall") === "IMPOSSIBLE"`.
- After same: `subjectFact(world, "char/vara", "located_in")?.object === "loc/valdar"`.
- Replay: two runs with the same inputs produce identical `identityHash`.

### Caveat

The demo uses the Verrin rewind point as a *declared narrative anchor*. Because the current public `derive()` does not restrict derivation by `rp.cut`, the demo is valid only if interventions are applied to the full canon. If the product later requires the rewind point to cut the canon semantically, this demo script must be updated after the Research-track supplies that capability.

---

## 14. Product risks and assumptions

### Known risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Rewind Point is metadata-only.** The central product metaphor (rewind, then change) is not semantically implemented in the public `derive()` path. | High | Escalate to Research (R1). In parallel, design the UX so it still works as a narrative anchor if the cut remains metadata-only. |
| 2 | **No actual-causality attribution.** The "Why?" screen can show grounding but cannot honestly say "X caused Y." | Medium | Frame "Why?" as "Grounding" in the MVP. Escalate to Research (R3) for later attribution. |
| 3 | **No public `WorldState` checkpoint/restore.** Studio must build its own persistence; re-derivation on load is the source of truth. | Medium | Build local JSON persistence. Escalate to Research (R4) if a Core checkpoint API is desired. |
| 4 | **Core's `Universe` registry is process-local mutable state.** Studio cannot rely on it for cross-session branch IDs. | Medium | Studio must own branch IDs and lineage. Do not use `createUniverse`/`branchUniverse` as a database. |
| 5 | **Invalid interventions silently no-op in some paths.** A user could change a fact and see nothing happen with no explanation. | Medium | Build `validateIntervention()` wrapper in Studio and surface errors before derive. Escalate to Research (R2) for Core ownership. |
| 6 | **No `Project` type in Core.** Studio owns the project model entirely. | Low | Accept as a Studio responsibility; align project schema with persistence model §9. |
| 7 | **`WorkStatus.CAUSALLY_DISCONNECTED` is declared but never assigned** (`src/derive/world-state.ts:358-369`). | Low | Do not expose "Causally disconnected" as a work state in the MVP UI. |
| 8 | **CLI cannot parse `addEdge` interventions** (`src/cli/main.ts:49-70` supports only 6 of 7 kinds). | Low | Ensure Studio's intervention composer supports all 7 kinds. |
| 9 | **Multi-valued predicates collapse** (`docs/ARCHITECTURE-RECONNAISSANCE.md` §17.8 risk 4). | Low | Do not promise multiple simultaneous values for one `(subject, predicate)` in the UI. |
| 10 | **Contradictions do not propagate downstream.** A contradictory prerequisite does not invalidate its dependents in v1. | Low | Explain contradictions as localized records, not cascading failures. |

### Key assumptions (unvalidated)

| # | Assumption | Validation needed |
|---|---|---|
| A1 | Target users prefer a structured counterfactual tool over an LLM chatbot. | User interviews / prototype testing. |
| A2 | The Verrin demo communicates value to novelists/worldbuilders. | Demo user testing. |
| A3 | Local-file persistence is acceptable for MVP. | User workflow interviews. |
| A4 | Users will author canons in the structured format (with help), not import finished novels. | Canon-entry UX testing. |
| A5 | "Grounding" explanation is enough for the MVP "Why?" moment; attribution can wait. | User testing of the "Why?" view. |
| A6 | A single-user MVP is enough to prove product-market fit before collaboration. | Strategic decision; revisited after launch. |

### Open questions to resolve before implementation

1. Does the Research track intend to make `RewindPoint.cut` semantically active in `derive()`? (Escalation R1)
2. Is actual-causality attribution in scope for the research roadmap? (Escalation R3)
3. Should Core expose `validateIntervention()` and a `WorldState` checkpoint API? (Escalations R2, R4)
4. What file/project format should Studio use so future collaboration/cloud features do not break local projects?

---

## Appendix A — Evidence summary

### Core public API surface verified in this contract

| Module | Key exports |
|---|---|
| `src/canon/types.ts` | `Canon`, `Entity`, `Fact`, `CausalEdge`, `WorkBinding`, `EntityKind`, `EdgeKind`, `CardinalityConstraint` |
| `src/canon/canon.ts` | `loadCanon()`, `inspectCanon()`, `validateCanon()` |
| `src/canon/hash.ts` | `hashCanon()`, `computeRewindHash()`, `hashState()`, `canonicalJson()` |
| `src/canon/fact-rules.ts` | `factAssertionError()`, `buildFactVocabulary()` |
| `src/canon/verrin.ts` | `verrinCanon()`, `verrinRewindPoint()` |
| `src/derive/world-state.ts` | `derive()`, `WorldState`, `FactView` |
| `src/derive/propagation.ts` | `buildModel()`, `propagateJudgments()`, `nodeSupport()`, `cellKey()`, `TemporalViolation`, `ConflictNote` |
| `src/derive/judgment.ts` | `Judgment`, `TruthValue`, `SupportKind`, `projectStatus()`, `occurs()` |
| `src/derive/lattice.ts` | `EventStatus`, `WorkStatus`, `joinStatuses()` |
| `src/derive/constraints.ts` | `evaluateConstraints()`, `ConstraintViolationRecord` |
| `src/derive/contradictions.ts` | `detectContradictions()`, `buildContradiction()` |
| `src/derive/semantic.ts` | `effectiveSemanticState()`, `DIMENSION_NAMES`, `CanonicalEdge`, `CanonicalFact`, `CanonicalContradiction` |
| `src/diff/types.ts` | `WorldDiff`, `StatusChange`, `FactDelta`, `EdgeChange`, `ContradictionRecord`, `TypedDiff` |
| `src/diff/diff.ts` | `worldDiff()`, `semanticDelta()`, `semanticDeltaEmpty()` |
| `src/diff/projections.ts` | `projectDiff()`, `typedDiff()`, `ProjectionKind` |
| `src/timeline/types.ts` | `Intervention`, `InterventionKind`, `RewindPoint`, `Universe`, `BranchRecord`, constructors |
| `src/timeline/rewind-point.ts` | `validateRewindPoint()` |
| `src/timeline/universe.ts` | `createUniverse()`, `branchUniverse()`, `lineageOf()` |
| `src/query/status.ts` | `statusOf()`, `workStatusOf()` |
| `src/query/query.ts` | `subjectFact()`, `reachable()` |
| `src/query/occurrence.ts` | `occurrencesOfType()`, `typeOfOccurrence()`, `occurrenceCount()`, `declaredEventTypes()`, `diffOccurrences()` |
| `src/depth/depth.ts` | `computeDivergence()`, `computeDepth()` |
| `src/experiment/runner.ts` | `runChain()`, `writeExperimentSet()` |
| `src/cli/main.ts` | `baseline`, `intervene`, `chain`, `experiment` commands |

### Absent from the inspected checkout (and therefore Studio responsibilities unless escalated)

- `Project` type
- `Counterfactual` type
- `CausalEvidence` type (beyond grounding primitives)
- `Branch` as a persisted object (only `BranchRecord` and process-local `Universe`)
- `validateIntervention()`
- Public `serialize()`/`restore()` for `WorldState`
- `src/derive/incremental.ts`
- HTTP/server/API layer
- UI layer
- LLM integration
- General project persistence

---

*End of contract. Next step: resolve the four Research-track escalation questions (R1–R4) before committing to detailed Studio UX implementation.*
