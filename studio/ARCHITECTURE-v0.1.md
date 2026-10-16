# Somnium Studio Architecture v0.1

**Status:** Draft — technical/product architecture for the Studio MVP  
**Date:** 2026-09-17  
**Scope:** Single-user, local-first application architecture. Builds on `PRODUCT-CONTRACT-v0.1.md` and `UX-SPEC-v0.1.md`. Does not modify Somnium Core.

---

## Authority and dependencies

This document translates the Product Contract and UX Specification into the smallest software architecture that preserves the deterministic Core boundary.

Unresolved Research-track questions shaping the architecture:

| ID | Question | Architectural impact |
|---|---|---|
| **R1** | Should `derive()` respect `RewindPoint.cut` semantically? | If yes, the Core Adapter accepts `rewindPoint` as a derivation boundary. If no, `rewindPoint` remains metadata passed through for `identityHash` only. |
| **R2** | Should Core expose `validateIntervention()`? | If yes, Studio delegates pre-flight validation to Core. If no, Studio maintains its own `InterventionValidator` built from public Core primitives. |
| **R3** | Is actual-causality attribution in scope? | If yes, `CausalEvidencePresenter` gains an attribution field. If no, it remains a grounding presenter. |
| **R4** | Should Core provide `WorldState` checkpoint/restore? | If yes, `PersistenceLayer` may cache checkpoints for fast load. If no, it persists `(canon + interventions + rp)` and re-derives. |

The architecture is designed so that answers to R1–R4 can be swapped in without structural redesign.

---

## 1. Studio architecture overview

### Layer diagram

```text
┌─────────────────────────────────────────────┐
│                 UI Layer                    │  React/Vue/Svelte components
│   (shell, tabs, forms, graphs, inspectors)    │
├─────────────────────────────────────────────┤
│            Application Layer                │  Studio-owned state machines
│  (ProjectManager, BranchManager,             │  and use-case controllers
│   DerivationController, QueryLayer)          │
├─────────────────────────────────────────────┤
│              Core Adapter                     │  Single product-facing boundary
│         (SomniumCoreAdapter)                  │  to public Core API
├─────────────────────────────────────────────┤
│              Somnium Core                     │  Deterministic derivation
│         (public API only)                     │
└─────────────────────────────────────────────┘
```

### LLM adapter (separate concern)

```text
┌─────────────────────────────────────────────┐
│              Studio Application               │
├─────────────────────────────────────────────┤
│              LLM Adapter                      │  Task-scoped context assembly,
│         (LLMContextBuilder,                  │  prompt templates, response
│          LLMResponseParser)                  │  parsing, citation enforcement
├─────────────────────────────────────────────┤
│              LLM Provider                     │  OpenAI / Anthropic / local / mock
│           (pluggable)                         │
└─────────────────────────────────────────────┘
```

### Responsibility of each layer

| Layer | Must do | Must NOT do |
|---|---|---|
| **UI Layer** | Render state, capture input, provide feedback, accessibility. | Call Core directly; store authoritative state; mutate canon. |
| **Application Layer** | Orchestrate use cases, manage Studio-owned state, enforce lifecycles, persist projects. | Reimplement Core derivation, edge semantics, status lattice, diff semantics. |
| **Core Adapter** | Translate Studio operations into the public Core API; normalize errors; serialize/deserialize Core outputs. | Reach past public API into `src/derive/propagation.ts` internals; depend on `src/derive/incremental.ts`. |
| **Somnium Core** | Deterministically derive worlds, compute diffs, validate canons/rewind points. | Manage project state, UI, persistence, LLM integration. |
| **LLM Adapter** | Build bounded context packages, render prompts, parse structured responses, enforce citations. | Call Core directly; mutate Core state; invent facts/events. |
| **LLM Provider** | Generate text from prompt. | Access project files or Core internals. |

---

## 2. Minimum application components

Derived from `UX-SPEC-v0.1.md` screen inventory. Abstractions removed where they add no value.

### Final component list

| Component | Responsibility | Why kept / Why minimal |
|---|---|---|
| `AppStateManager` | Single source of truth for active project, active branch, selected entity, staged interventions, derivation status. | Keeps UI in sync; replaces scattered prop drilling. |
| `ProjectManager` | Load, save, create, validate project files; import canons; manage project metadata. | Studio owns persistence. |
| `CanonExplorer` | Read-only presentation of `Canon` entities, facts, events, edges, works. | Direct mapping to Core `Canon` type. |
| `TimelineController` | Render PRECEDES graph; select events; create rewind point suggestions. | Thin layer over `canon.edges`. |
| `RewindController` | Declare/select rewind points; validate via Core; track which RP is active for derivation. | Owns Studio `RewindPoint` records separate from Core validation. |
| `InterventionComposer` | Build typed interventions from closed vocabulary; run pre-flight validation. | Maps 1:1 to `What If?` tab. |
| `DerivationController` | Run `derive()` through the Core Adapter; handle success, failure, cancellation; cache results. | The central action; isolates Core async work. |
| `WorldViewBuilder` | Build browseable world views from `WorldState`. | Reused by Canon/World tabs. |
| `DiffPresenter` | Render `WorldDiff` with filtering, grouping, row selection. | Maps 1:1 to `Diff` tab. |
| `CausalEvidencePresenter` | Render grounding details (status, judgment, support, contradictions, edges). | Maps 1:1 to `Why?` tab. |
| `BranchManager` | Maintain parent/child lineage, branch labels, active branch switching, branch creation. | Studio owns branch identity and persistence. |
| `WorldQueryLayer` | Answer structured queries over `WorldState` for UI consumption. | Wraps `subjectFact`, `statusOf`, `reachable`, etc. |
| `PersistenceLayer` | Read/write project files; serialize/deserialize Studio model; re-derive on load if needed. | Files, not a database, for MVP. |
| `LLMAdapter` | Build task-scoped context, render prompts, parse responses, enforce citations. | Prevents LLM from touching Core. |

### Components deliberately NOT included

| Rejected abstraction | Reason |
|---|---|
| Separate `CounterfactualManager` | `BranchManager` + `DerivationController` cover counterfactuals; a separate manager duplicates state. |
| `CanonManager` that edits canons | MVP canon is imported/loaded, not edited in Studio. |
| `EventBus` / message broker | Single-user local app; direct method calls + `AppStateManager` are simpler. |
| `Repository` pattern with database | Files suffice; premature abstraction. |
| Micro-frontends | Single coherent app is smaller. |

---

## 3. Core Adapter

### Boundary rule

> All Studio interaction with Somnium Core goes through `SomniumCoreAdapter`. No UI component, controller, or persistence module may import Core modules directly.

### Adapter methods

```typescript
interface SomniumCoreAdapter {
  // Canon
  loadCanon(raw: unknown): Canon;
  inspectCanon(canon: Canon): CanonInspection;

  // Rewind points
  validateRewindPoint(rp: RewindPoint, canon: Canon): { ok: boolean; errors: string[] };

  // Derivation
  derive(canon: Canon, interventions: Intervention[], rp?: RewindPoint): WorldState;

  // World identity
  identityHash(world: WorldState): string;        // from world.identityHash
  stateHash(world: WorldState): string;             // from world.stateHash

  // Diff
  worldDiff(baseline: WorldState, branch: WorldState): WorldDiff;
  projectDiff(diff: WorldDiff, canon: Canon, kind: ProjectionKind): WorldDiff;
  typedDiff(diff: WorldDiff, canon: Canon): TypedDiff;

  // Queries
  statusOf(world: WorldState, entityId: string): EventStatus;
  workStatusOf(world: WorldState, workId: string): WorkStatus;
  subjectFact(world: WorldState, subjectId: string, predicate: string): FactView | undefined;
  reachable(world: WorldState, eventId: string): boolean;

  // Depth / divergence
  computeDivergence(canon: Canon, baseline: WorldState, branch: WorldState, interventions: Intervention[]): DivergenceScore;
  computeDepth(canon: Canon, baseline: WorldState, branch: WorldState, interventions: Intervention[], genealogicalDepth: number): DepthMetrics;

  // Intervention validation (Studio fallback if R2 deferred)
  validateInterventionTargets(iv: Intervention, canon: Canon): string[];
}
```

### Error behavior

| Core error | Adapter response | Studio handling |
|---|---|---|
| `loadCanon` throws on invalid canon | Rethrow as `CanonLoadError` with `errors` array. | ProjectManager shows warning banner; project opens read-only. |
| `derive` throws | Rethrow as `DerivationError`. | DerivationController sets error state; UI shows message. |
| `effectiveSemanticState` throws key collision | Rethrow as `WorldIntegrityError`. | AppStateManager marks branch as failed; user cannot explore. |
| `validateRewindPoint` returns errors | Return as normal result; no throw. | RewindController shows validation list. |

### Synchronous/asynchronous expectations

- `derive()` is currently synchronous in Core (`src/derive/world-state.ts:491`).
- The adapter exposes it as `async` so that Studio can:
  - Show derivation spinner.
  - Support cancellation if/when Core becomes async or heavy.
  - Run derivation in a Web Worker / separate process later without changing callers.
- The adapter wraps synchronous Core calls in `Promise.resolve(...)` for now.

### Serialization boundary

- Inputs to the adapter are already typed Core objects (`Canon`, `Intervention[]`, `RewindPoint`).
- Outputs are typed Core objects (`WorldState`, `WorldDiff`, etc.).
- The adapter does **not** serialize to disk; that is `PersistenceLayer`'s job.
- The adapter normalizes output (e.g., ensures arrays are plain, maps are sorted) for predictable UI diffing.

### Identity/lineage handling

- The adapter reads `world.identityHash` and `world.stateHash` from Core output.
- It does **not** mint branch IDs; `BranchManager` owns project-scoped IDs.
- It does **not** use Core's `createUniverse`/`branchUniverse` registry for persistence; those are process-local.

---

## 4. Studio's internal data model

### Minimum Studio-owned objects

| Object | Fields | Rationale |
|---|---|---|
| `Project` | `id`, `name`, `createdAt`, `updatedAt`, `canon`, `rewindPoints[]`, `branches[]`, `metadata` | The root container; owns everything the Core does not. |
| `ProjectMetadata` | `version`, `lastBranchId`, `settings` (theme, LLM provider stub) | Separated from `Project` so it can change without affecting derived identity. |
| `CanonReference` | `canonId`, `hash`, `loadedAt` | Pointer/integrity for the embedded `Canon` object. The actual `Canon` is stored inside `Project`. |
| `Branch` | `branchId`, `parentBranchId \| null`, `rpId \| null`, `interventions[]`, `label`, `worldHash`, `stateHash`, `createdAt`, `childrenIds[]` | Studio-owned lineage. `worldHash` is a cache key/identity, not the stored state. |
| `Counterfactual` | (not a separate persistent type) | A `Branch` with `parentBranchId !== null` and non-empty `interventions[]`. |
| `InterventionDraft` | `kind`, `target`, `params`, `label`, `validationErrors[]` | Mutable user input before confirmation. |
| `Intervention` | Core `Intervention` shape (`id`, `kind`, `target`, `params`, `label`, `rpId?`) | Confirmed, validated intervention ready for Core. |
| `RewindSelection` | `rpId`, `anchorEvent`, `cut[]`, `derivedHash` | The active rewind point used for a derivation. |
| `DerivationJob` | `branchId`, `interventions[]`, `rpId`, `status: idle \| deriving \| done \| failed`, `result \| error` | Tracks one derivation attempt in `AppStateManager`. |
| `WorldView` | `branchId`, `worldState` (cached), `selectedEntityId`, `filter`, `compareWith` | UI-facing projection of `WorldState`. |
| `DiffView` | `branchId`, `baselineBranchId`, `worldDiff` (cached), `projectionKind`, `selectedRowId` | UI-facing projection of `WorldDiff`. |
| `CausalExplanation` | `nodeId`, `status`, `supportKind`, `truthValue`, `contradictionRecords[]`, `relevantEdges[]`, `groundingSentences[]` | Studio-assembled explanation from Core primitives. LLM may narrate this. |

### Objects combined or removed

- `Project` absorbs `ProjectMetadata` for file serialization, but `ProjectMetadata` remains a separate runtime object for mutation.
- `Counterfactual` is not a separate type; it is a `Branch` whose `parentBranchId !== null`.
- `WorldView` and `DiffView` are UI projections, not persistent entities.

### State separation invariant

```text
Core semantic state  →  WorldState, WorldDiff  →  immutable within a branch
Studio application state  →  Project, Branch, selectedEntityId, staged drafts  →  mutable user/workspace data
LLM conversational state  →  prompt/response scoped to a task  →  ephemeral, never authoritative
```

---

## 5. Persistence architecture

### Persistence semantics

| Data | Survives restart? | Storage | Recomputable? | Notes |
|---|---|---|---|---|
| `Project` metadata | Yes | `project.json` | No | User labels, settings, branch list. |
| `Canon` | Yes | `canon.json` inside project folder | No (immutable) | Content hash guarantees integrity. |
| `RewindPoint` declarations | Yes | `rewind-points.json` | No | Studio-owned set; re-validated on load. |
| `Branch` records | Yes | `branches.json` or inside `project.json` | Yes, from canon + interventions + rp | Authority is `(canon, interventions, rp)`, not stored `WorldState`. |
| `WorldState` | No (cache only) | Memory / optional `cache/` dir | Yes | Caching is an optimization; re-derive on load. |
| `WorldDiff` | Optional (cache) | `cache/diff-{branchId}.json` | Yes | Recomputed on demand. |
| `Lineage` | Yes | `branches.json` parent/child fields | Yes | Same as branch records. |
| User labels/notes | Yes | `project.json` metadata | No | Studio-only. |

### Project folder layout

```text
~/Somnium Projects/
  └── Verrin Demo/
      ├── project.json          # Project metadata + branch list + rewind points
      ├── canon.json            # Embedded Canon (immutable, content-hashed)
      ├── branches/
      │   ├── baseline.json     # interventions: []
      │   ├── branch-001.json   # parentId, rpId, interventions[], label, worldHash
      │   └── branch-002.json
      └── cache/
          ├── world-baseline.json
          ├── world-branch-001.json
          └── diff-branch-001-vs-baseline.json
```

### Load sequence

1. Read `project.json`.
2. Read `canon.json`; call `SomniumCoreAdapter.loadCanon()` and compare `hash`.
3. For each `RewindPoint`, call `validateRewindPoint()`.
4. For each `Branch`, reconstruct `interventions` array.
5. For the active branch, check cache. If cache hit and valid, load `WorldState`. Otherwise, call `derive()` and populate cache.
6. Compute `WorldDiff` against baseline or parent as needed.

### Save sequence

1. Write `canon.json` if changed (rare; canons are immutable).
2. Write `project.json` with metadata, rewind points, branch list.
3. Write per-branch `branches/{branchId}.json`.
4. Optionally write cache files (not required for correctness).

### Why not a database?

- Single-user MVP.
- Project files must be portable and diffable.
- Deterministic Core output means the authoritative state is recomputable from a small set of inputs.
- SQLite or a document store adds operational and migration cost without benefit at this scale.

---

## 6. Branch architecture

### Branch identity

| Identity type | Owner | Purpose | Example |
|---|---|---|---|
| `branchId` | Studio | Project-scoped human-readable or UUID identifier for UI and persistence. | `branch-001` |
| `worldHash` (identityHash) | Core | Cryptographic identity of the derived world, including provenance. | `id-sha256-…` |
| `stateHash` | Core | Identity of the effective semantic state (ignores provenance). | `st-sha256-…` |
| `parentBranchId` + `interventions[]` | Studio | Provenance / lineage. | Baseline → [negateEvent(...)] → branch-001 |

### Branch reconstruction

A branch is reopened by reading its `interventions[]` and `rpId`, then re-deriving:

```typescript
const world = await coreAdapter.derive(project.canon, branch.interventions, rp);
```

The cache may skip this, but correctness does not depend on the cache.

### Branch tree

```text
Canon
  └── Baseline (branch-baseline, interventions: [])
        └── "Blight negated" (branch-001, interventions: [negateEvent(ev/blight-begins)])
              └── "Vara relocates" (branch-002, interventions: [negateEvent(...), relocate(char/vara, loc/thornhollow)])
```

- Each branch stores its **full intervention chain from baseline**, not deltas from its parent. This matches Core's `derive()` contract and makes a branch self-contained.
- `parentBranchId` is for lineage display only; derivation does not need it.

### User-facing labels

- `branchId` is never shown to users unless they choose to see it.
- Default labels are derived from the last intervention label.
- Users can rename labels; renames do not affect `worldHash`.

---

## 7. Counterfactual lifecycle

### Lifecycle states

```text
Draft
  ↓ user edits intervention draft
Validated
  ↓ user confirms / adds to chain
Confirmed (staged)
  ↓ user clicks Derive
Deriving
  ↓ Core returns success
Derived
  ↓ user explores / opens Why?
Explorable
  ↓ user clicks Branch again
Branched (becomes parent of new Draft)
```

### State definitions

| State | Meaning | Allowed transitions |
|---|---|---|
| `Draft` | User is typing/selecting an intervention. | → `Validated` (on valid input) |
| `Validated` | Draft passes Studio pre-flight validation. | → `Confirmed` (user adds to chain) |
| `Confirmed` | Intervention is in the staged chain, ready to derive. | → `Deriving` (user clicks Derive) |
| `Deriving` | Core derivation is running. | → `Derived` or `Failed` |
| `Derived` | Core returned a `WorldState`. | → `Explorable` (auto) |
| `Explorable` | User is browsing the branch. | → `Branched` (user starts child draft) |
| `Branched` | This branch is now the parent context for a new draft. | → new `Draft` |

### Cancellation, failure, invalidation

| Scenario | Handling |
|---|---|
| User cancels during `Deriving` | If Core call is interruptible, abort and return to `Confirmed`. If not, ignore cancellation for this MVP and wait. |
| Derivation fails | Transition to `Failed`; show error; remain in `Confirmed` so user can edit and retry. |
| Canon changes | Canons are immutable in MVP. If user imports a new canon, all branches are invalidated (prompted to create new project). |
| Branch deleted | Remove from `BranchManager`; update World Tree; switch to parent or baseline. Derived cache files are not required for correctness. |
| Cache stale | On load, if `worldHash` of cached `WorldState` does not match re-derivation, discard cache and use fresh result. |
| Reopening project | All branches return to `Explorable` after re-derivation. |

### Why this is a Studio lifecycle, not Core state

Core has no notion of "draft" or "explorable." These are application concepts. The lifecycle isolates UI state from Core execution details and lets Studio handle undo, deletion, and navigation without Core changes.

---

## 8. LLM architecture

### Three integration modes

#### 8.1 Intervention assistance

```text
User natural-language "what if"
  ↓
LLMContextBuilder: current canon + selected event/fact + closed intervention vocabulary
  ↓
Prompt: "Suggest an Intervention from this closed vocabulary: negateEvent, forceEvent, setFact, ..."
  ↓
LLM Provider
  ↓
LLMResponseParser: extract structured intervention proposal
  ↓
InterventionComposer: pre-fill draft + run Studio validation
  ↓
User reviews and confirms
  ↓
DerivationController.derive()
```

#### 8.2 Explanation

```text
Selected diff row / grounding view
  ↓
LLMContextBuilder: node id, status, support kind, truth value, contradictions, relevant edges
  ↓
Prompt: "Explain this grounding in plain language. Do not invent facts. Cite record ids."
  ↓
LLM Provider
  ↓
LLMResponseParser: extract text + cited ids
  ↓
CausalEvidencePresenter: render with "Show in Core" links
```

#### 8.3 World query

```text
User question
  ↓
WorldQueryLayer: answer structured query against WorldState first
  ↓
LLMContextBuilder: question + structured evidence + current branch context
  ↓
Prompt: "Answer this question using only the provided world evidence."
  ↓
LLM Provider
  ↓
LLMResponseParser: extract answer + citations
  ↓
UI renders answer with citations
```

### LLM authority rule

> The LLM adapter may only read Studio-provided context. It may never call the Core Adapter directly or mutate project/branch/world state.

---

## 9. LLM context contract

### Bounded context package

For each LLM task, Studio sends a package containing only what is required:

```typescript
interface LLMTaskContext {
  task: "suggest-intervention" | "explain-grounding" | "answer-query" | "summarize-diff";
  project: { name: string; canonId: string };          // no full canon unless task needs it
  branch: { branchId: string; label: string; worldHash: string };
  rewindPoint?: { anchorEvent: string; label: string };
  selectedEntity?: { id: string; name: string; kind: string };
  worldDiff?: { summary: string; changes: DiffRowSnippet[] };  // not raw full diff unless needed
  grounding?: {
    nodeId: string;
    status: string;
    supportKind?: string;
    truthValue?: string;
    contradictions: { id: string; detail: string }[];
    relevantEdges: { id: string; kind: string; from: string; to: string }[];
  };
  worldFacts?: { subject: string; predicate: string; object: unknown }[];  // only relevant facts
  userQuestion?: string;
}
```

### What is NOT sent to the LLM

- Full `Canon` (unless the task is canon-entry assistance, in which case it is sent explicitly).
- Full `WorldState` (only selected or queried snippets).
- Core implementation details, file paths, or hashes.
- Other branches' full content (unless user is comparing).
- LLM conversation history (each request is task-scoped).

### Response contract

```typescript
interface LLMTaskResponse {
  text: string;                    // human-facing answer
  citations: string[];             // Core record ids referenced
  proposedIntervention?: { kind: InterventionKind; target: string; params?: Record<string, unknown>; label: string };
  confidence?: "high" | "medium" | "low";
  refusal?: string;                // e.g., "I cannot answer that from the current world state."
}
```

### Handling LLM issues

| Issue | Studio behavior |
|---|---|
| LLM unavailable | Disable Ask Somnium button; show "LLM narration unavailable." No derivation blocked. |
| Hallucination risk | Enforce citations; every claim must map to a Core record id. Un-cited claims are flagged. |
| Unsupported question | LLM responds with refusal; Studio renders it. |
| Insufficient evidence | LLM responds with refusal or low-confidence; user can inspect the raw grounding. |
| Generated explanation conflicts with Core | Core wins; explanation is discarded or flagged. |
| Invalid proposed intervention | Studio validation rejects it; user sees validation error, not the LLM output. |

---

## 10. Determinism boundary

### Must remain deterministic

| Artifact | Determinism requirement | Enforced by |
|---|---|---|
| Core derivation | Fully deterministic | Somnium Core (same inputs → same `identityHash`). |
| `WorldState` | Deterministic for given inputs | Core. |
| `WorldDiff` | Deterministic for given pair | Core (`diff.hash`). |
| Branch derivation | Deterministic for same canon + interventions + rp | Core identityHash + Studio re-derivation. |
| Branch identity (`worldHash`) | Deterministic | Core. |
| Project file serialization | Deterministic enough for diffing | Studio writes JSON with sorted keys; canonical order of arrays. |

### May be nondeterministic

| Artifact | Why acceptable | Controlled by |
|---|---|---|
| LLM wording | Language is not world state. | LLM adapter only reads, never writes, Core state. |
| UI presentation order where semantically irrelevant | Does not affect world truth. | Studio; default to stable sorts (id, label). |
| User notes/labels | Studio metadata. | Not hashed into Core identity. |
| Cache presence/absence | Optimization only. | Re-derivation is the source of truth. |

### Architectural invariant

> **A change in LLM output, UI theme, user label, or cache state must never change the authoritative `WorldState` or `WorldDiff`.**

---

## 11. API contract

### Behavioral API table

| Studio operation | Core capability | Adapter operation | Studio result | Classification |
|---|---|---|---|---|
| Load world | `loadCanon()` + `derive(canon, [])` | `loadCanon(raw)`, `derive(...)` | `WorldView` | [P] |
| Select rewind point | `validateRewindPoint()` | `validateRewindPoint(rp, canon)` | `RewindSelection` | [P] validation; [R] semantic cut |
| Create intervention (draft) | Intervention constructors + `factAssertionError()` pieces | `validateInterventionTargets(iv, canon)` (Studio fallback) | `InterventionDraft` | [P] constructors; [N] validation UX; [R] Core validator |
| Confirm intervention | Same as above | Same | `Intervention` | [N] Studio state transition |
| Derive | `derive()` | `derive(canon, interventions, rp)` | `WorldView` + `DiffView` | [P] |
| Show diff | `worldDiff()` + projections | `worldDiff(baseline, branch)`, `projectDiff()`, `typedDiff()` | `DiffView` | [P] |
| Explain / Why? | Status + judgment + support + contradictions + edges | `statusOf()`, reads `world.judgments/contradictions/edges` | `CausalExplanation` | [P] grounding; [R] attribution |
| Explore branch | World query primitives | `subjectFact()`, `statusOf()`, `workStatusOf()`, `reachable()` | `WorldView` | [P] |
| Create child branch | Branch state transition + `derive()` | Studio appends intervention; `derive()` | `Branch` + `WorldView` | [P] derive; [N] Studio lineage |
| Compare branches | `worldDiff()` | `worldDiff(branchA, branchB)` | `DiffView` | [P] |
| Save project | Studio persistence | `PersistenceLayer.writeProject()` | File path | [N] |
| Load project | Studio persistence + Core load | `PersistenceLayer.readProject()`, `loadCanon()`, re-derive | `Project` | [N] + [P] |
| Export branch artifact | JSON serialization | Studio wraps `WorldState`, `WorldDiff`, lineage | File path | [N] |
| Query world | Query primitives | `subjectFact()`, `reachable()`, occurrence queries | Structured answer | [P] |
| Suggest intervention via LLM | LLM adapter + validation | `LLMAdapter.suggestIntervention()` | `InterventionDraft` | [N] |
| Explain via LLM | LLM adapter + grounding | `LLMAdapter.explainGrounding()` | Text + citations | [N] |

### Notes on classification

- All Core-facing operations are [P] because they map to public Core exports.
- `validateInterventionTargets` is [N] because Studio must implement it if R2 is deferred; it becomes [P] if Core exposes a validator.
- Rewind point semantic cut is [R] (R1); until resolved, `RewindSelection` is metadata passed through.
- Causal attribution is [R] (R3); `CausalExplanation` is grounded explanation only.

---

## 12. Technology decisions

### Decision framework

| Criterion | Priority | Rationale |
|---|---|---|
| Minimal moving parts | High | Easier to debug, faster to ship MVP. |
| Local execution | High | Determinism, privacy, low cost. |
| Easy debugging | High | Product is experimental; must trace deterministic bugs. |
| Easy distribution | Medium | Single-user local app should install simply. |
| Low operational cost | High | No cloud servers in MVP. |
| Future extensibility | Low | Do not over-abstract for cloud before it is needed. |

### Decisions

| Area | Decision | Status |
|---|---|---|
| Platform | **Web app in browser** | Chosen. Easier distribution than native desktop; can later be wrapped as Electron/Tauri if needed. |
| Frontend framework | **React + TypeScript** | Chosen. Strong typing, large ecosystem, component model fits the tabbed UI. (Defer final decision if team prefers Vue/Svelte; the architecture is framework-agnostic.) |
| State management | **Zustand or Jotai** | Chosen. Lighter than Redux; adequate for single-user app. `AppStateManager` is the conceptual owner. |
| Core execution | **Run Core in the same JavaScript runtime** | Chosen. Core is TypeScript; import as a package in the web app (bundled) or run in a Web Worker for isolation. |
| Web Worker for Core | **Use for derivation** | Recommended. Keeps UI responsive; deterministic Core is safe in a worker. |
| Persistence | **JSON files via File System Access API or Node/Electron fs** | Chosen for local-first. If pure browser, use `showSaveFilePicker`/`showDirectoryPicker` with a fallback download/upload. |
| Database | **None in MVP** | Chosen. Files suffice. |
| LLM provider | **Pluggable adapter; default to OpenAI-compatible API** | Chosen. Abstract provider so local models, Anthropic, or mock can be substituted. |
| Build tool | **Vite** | Recommended. Fast dev server; good TypeScript support. |
| Test framework | **Vitest for unit; Playwright for E2E journey** | Recommended. Matches Core tooling. |

### Deferred decisions

| Decision | Reason |
|---|---|
| Electron vs. Tauri vs. web-only | Distribution question; can be answered after web MVP works. |
| Cloud sync / multi-device | Out of MVP scope; files are portable. |
| SQLite migration | Only if file I/O becomes a bottleneck. |
| Server-side Core execution | Only if deterministic derivation becomes too heavy for browser or if collaboration is added. |
| Mobile layout | Out of MVP scope. |

---

## 13. Local vs cloud

### Recommended: local-first

```text
Browser / Desktop wrapper
  ↓
Studio application (React + state management)
  ↓
Core Adapter
  ↓
Somnium Core (TypeScript, runs locally or in Web Worker)
  ↓
Local project files (JSON)
```

LLM provider is the only external dependency, and it is optional.

### Why not service architecture for MVP

| Service argument | Rebuttal |
|---|---|
| "Heavy derivation needs server CPU" | Verrin-scale derivation is fast in local JS; Web Worker keeps UI responsive. |
| "Cloud enables collaboration" | MVP is single-user. |
| "Cloud simplifies distribution" | Web app is simpler distribution than maintaining a service. |
| "Cloud secures LLM keys" | LLM keys can be configured locally or via a tiny proxy later; not MVP-critical. |

### What would justify a service later

- Multi-user collaboration requiring shared canonical state.
- Deterministic derivation becomes too expensive for browser (large canons).
- Need for centralized canon marketplace or project hosting.

These are post-MVP considerations.

---

## Appendix A — Traceability

| UX-SPEC section | Architecture section |
|---|---|
| §1 Application shell | §1 Layer diagram, §2 component list |
| §2 Canonical journey | §7 Counterfactual lifecycle |
| §3 Screen specs | §2 components, §11 API contract |
| §4 Interactions and states | §7 lifecycle, §10 determinism |
| §5 Error/empty/loading | §3 error behavior, §7 failure handling |
| §6 Ask Somnium | §8 LLM architecture, §9 context contract |
| §7 R1–R4 dependencies | Throughout, especially §3, §4, §5, §11 |
| §8 UX acceptance criteria | §11 API contract |
| §9 UX non-goals | §12 deferred decisions, §13 local-first |
| §10 Implementation handoff | §2 component inventory, §12 tech decisions |

---

*End of architecture document. Next step: resolve R1–R4 with Research, then produce component-level interface specs and begin implementation.*
