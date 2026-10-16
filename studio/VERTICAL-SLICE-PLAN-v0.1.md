# Somnium Studio Vertical Slice Implementation Plan v0.1

**Status:** Draft — implementation plan for the first end-to-end Studio build  
**Date:** 2026-09-17  
**Scope:** Single vertical slice demonstrating the product's core magic moment. Builds on `PRODUCT-CONTRACT-v0.1.md`, `UX-SPEC-v0.1.md`, and `ARCHITECTURE-v0.1.md`. Does not modify Somnium Core.

---

## Authority and dependencies

This plan derives from the three prior Studio Product-track documents. It uses the Verrin seed canon already present in Core (`src/canon/verrin.ts`) as the demo world and the `negateEvent(ev/blight-begins)` intervention as the canonical first counterfactual.

Unresolved Research-track questions (R1–R4) are reviewed in §14. **None block the vertical slice.**

---

## 1. Define the vertical slice

The first end-to-end path is:

```text
Load demo project
    ↓
View Canon
    ↓
Open Timeline
    ↓
Select Event  (ev/blight-begins)
    ↓
Select/confirm Rewind Point  (RP-VERRIN-001)
    ↓
"What If?"
    ↓
Create structured Intervention  (negateEvent(ev/blight-begins))
    ↓
Confirm
    ↓
Run Core derivation  (via Web Worker)
    ↓
Display WorldDiff
    ↓
Display causal evidence / explanation  (grounding, deterministic)
    ↓
Enter Alternate World  (browse counterfactual)
```

### What is intentionally OUT of the first slice

- LLM narration (deferred to a later slice).
- Full project import/export.
- Multi-branch branch tree management beyond baseline + one counterfactual.
- Full persistence abstraction (only save/load the slice project).
- Canon editing.
- Side-by-side branch comparison.
- "Branch again" beyond a single counterfactual.

---

## 2. Choose the smallest demo world

### Demo world: Verrin seed canon

Use the existing Core seed `verrinCanon()` from `src/canon/verrin.ts` and its rewind point `verrinRewindPoint()`.

### Why Verrin

- Already authored in Core.
- Content-hashed and deterministic.
- Has a documented acceptance contract (`src/canon/verrin.ts:8-12`; `PRODUCT-CONTRACT-v0.1.md` §13).
- Small enough for a developer to understand completely.
- Produces a dramatic magic moment with one intervention.

### Demo world contents

| Category | Count | Examples |
|---|---|---|
| Characters | 6 | char/vara, char/kael, char/maren, char/orin, char/selys, char/tomas |
| Locations | 4 | loc/valdar, loc/thornhollow, loc/cinderwatch, loc/stonehall |
| Factions | 2 | fac/ember-court, fac/stone-wardens |
| Institution | 1 | inst/valdar-academy |
| Events | 13 | ev/blight-begins, ev/exodus, ev/ashfall-falls, ev/kael-oath, ev/wardens-arrive, ev/treaty-of-ash, etc. |
| Works | 3 | work/verrin-ashfall, work/ember-prelude, work/wardens-pact |
| Facts | 17 | located_in, sibling_of, affiliated_with, head_of, etc. |
| Causal edges | 27 | REQUIRES, PRECEDES, ENABLES, MOTIVATES, EXCLUDES, INVARIANT |

### Demo world requirements met

- **Characters:** yes.
- **Factions:** yes.
- **Several events with dependency chain:** yes (blight → exodus → ashfall).
- **Relationships:** yes (sibling_of, affiliated_with, leader_of).
- **Temporal relationship:** yes (PRECEDES edges form a partial order).
- **One intervention producing multiple downstream changes:** yes (`negateEvent(ev/blight-begins)` cascades through the whole Verrin cycle).

---

## 3. Define the exact intervention

### Base world

- Project: **Verrin Demo**.
- Canon: `verrinCanon()` from Core.
- Baseline branch: interventions `[]`.

### Rewind point

- `RP-VERRIN-001` from `verrinRewindPoint()`.
- Anchor event: `ev/blight-begins`.
- Cut: `[]`.

**Note:** Per R1, the rewind point is a **narrative anchor** in this slice, not a semantic derivation boundary. `derive()` receives the rewind point for `identityHash`/provenance purposes only. The slice works whether R1 is answered yes or deferred.

### Intervention

- **Kind:** `negateEvent`
- **Target:** `ev/blight-begins`
- **Stable id:** `negateEvent:ev/blight-begins`
- **Label:** `"The Blight never begins"`

### Expected semantic consequences (from existing Core acceptance contract)

| Entity | Baseline | After intervention |
|---|---|---|
| `ev/blight-begins` | ESTABLISHED | EXCLUDED (negated) |
| `ev/exodus` | ESTABLISHED | UNSUPPORTED (requires blight) |
| `ev/ashfall-falls` | ESTABLISHED | UNSUPPORTED (requires exodus) |
| `ev/ember-ultimatum` | ESTABLISHED | UNSUPPORTED (requires blight) |
| `ev/orin-defies` | ESTABLISHED | UNSUPPORTED (requires ultimatum) |
| `ev/vara-vow` | ESTABLISHED | UNSUPPORTED (requires blight) |
| `ev/kael-oath` | ESTABLISHED | UNSUPPORTED (requires blight) |
| `ev/wardens-arrive` | ESTABLISHED | UNSUPPORTED (requires kael-oath) |
| `ev/treaty-of-ash` | ESTABLISHED | UNSUPPORTED (requires wardens) |
| `ev/valdar-rebuilds` | ESTABLISHED | UNSUPPORTED (requires treaty) |
| `ev/maren-return` | ESTABLISHED | UNSUPPORTED (requires wardens) |
| `work/verrin-ashfall` | PRESERVED | IMPOSSIBLE |
| `work/ember-prelude` | PRESERVED | IMPOSSIBLE |
| `work/wardens-pact` | PRESERVED | IMPOSSIBLE |
| `char/vara.located_in` | `loc/thornhollow` (after exodus) | `loc/valdar` (exodus never happens) |

### Expected WorldDiff categories

- **statusChanges:** many events from ESTABLISHED to UNSUPPORTED/EXCLUDED.
- **workStatusChanges:** works from PRESERVED to IMPOSSIBLE.
- **factOverrides:** `char/vara.located_in` changes from `loc/thornhollow` to `loc/valdar`.
- **reachabilityChanges:** affected events become unreachable.
- **edgeChanges:** none (we did not sever/add edges).
- **contradictionsIntroduced/Resolved:** none expected in this slice.
- **constraint/temporal violations:** none expected.

### Expected branch identity/lineage behavior

- Baseline branch: `branch-baseline`, interventions `[]`, `worldHash = baseline.identityHash`.
- Counterfactual branch: `branch-001`, parent `branch-baseline`, interventions `[negateEvent(ev/blight-begins)]`, `worldHash ≠ baseline.worldHash`.
- Re-deriving the same inputs produces the same `worldHash`.
- Branch label editable by user; rename does not change `worldHash`.

### Validation task

Before implementation begins, run the Verrin acceptance queries against Core to confirm the exact expected output:

```typescript
const canon = verrinCanon();
const rp = verrinRewindPoint();
const baseline = derive(canon, []);
const branch = derive(canon, [negateEvent("ev/blight-begins")], rp);
const diff = worldDiff(baseline, branch);
// Assert: statusOf(branch, "ev/exodus") === "UNSUPPORTED"
// Assert: workStatusOf(branch, "work/verrin-ashfall") === "IMPOSSIBLE"
// Assert: subjectFact(branch, "char/vara", "located_in")?.object === "loc/valdar"
// Assert: diff is non-empty and includes statusChanges, workStatusChanges, factOverrides
```

This is a **validation task**, not a product assumption.

---

## 4. Define the minimum Studio components

Starting from the 14 components in `ARCHITECTURE-v0.1.md`, reduce to the smallest set for the slice.

### Components kept

| Component | Responsibility in slice |
|---|---|
| `AppStateManager` | Holds `currentProject`, `currentBranchId`, `selectedEntityId`, `interventionDraft`, `derivationStatus`, `worldCache`, `diffCache`. |
| `CoreAdapter` | Boundary to public Core API; runs derivation in Web Worker. |
| `ProjectManager` | Load the demo project; save project state (minimal). |
| `CanonExplorer` | Render entities/facts/events/edges from `Canon`. |
| `TimelineController` | Render PRECEDES graph; event selection; rewind-point confirmation. |
| `InterventionComposer` | Build `negateEvent`/`forceEvent`/`setFact`/`retractFact`/`severEdge`/`relocate` drafts; basic target validation. |
| `DerivationController` | Trigger `CoreAdapter.derive()`; update cache and state. |
| `DiffPresenter` | Render `WorldDiff` rows for the counterfactual. |
| `CausalEvidencePresenter` | Render grounding for a selected diff row or world node. |
| `WorldView` | Browse the counterfactual world (statuses, effective facts, works). |

### Components folded or deferred

| Rejected/deferred component | Handling in slice |
|---|---|
| `BranchManager` | Folded into `AppStateManager` for the slice (only baseline + one child). |
| `WorldQueryLayer` | Folded into `WorldView` and `CausalEvidencePresenter` (direct Core Adapter query calls). |
| `PersistenceLayer` | Folded into `ProjectManager` (one JSON read/write function). |
| `LLMAdapter` | **Deferred.** Slice A is deterministic only. |
| `RewindController` | Folded into `TimelineController` + `AppStateManager` (only one RP in slice). |

### Dependency graph

```text
AppStateManager
  ├── ProjectManager  (load/save)
  ├── CoreAdapter     (derive, queries, diff)
  │     └── Web Worker with public Core API
  ├── CanonExplorer   (read canon)
  ├── TimelineController  (select event, confirm RP)
  ├── InterventionComposer
  ├── DerivationController
  ├── DiffPresenter
  ├── CausalEvidencePresenter
  └── WorldView
```

---

## 5. Define the first project structure

Minimum repository structure for the slice:

```text
Somnium Studio/
├── src/
│   ├── app/
│   │   └── App.tsx              # shell, layout, global state provider
│   ├── state/
│   │   └── appState.ts          # AppStateManager (Zustand/Jotai store)
│   ├── core-adapter/
│   │   ├── adapter.ts           # SomniumCoreAdapter interface + impl
│   │   └── worker.ts            # Web Worker entry point
│   ├── components/
│   │   ├── CanonExplorer.tsx
│   │   ├── TimelineController.tsx
│   │   ├── InterventionComposer.tsx
│   │   ├── DerivationButton.tsx
│   │   ├── DiffPresenter.tsx
│   │   ├── CausalEvidencePresenter.tsx
│   │   ├── WorldView.tsx
│   │   └── ContextPanel.tsx
│   ├── persistence/
│   │   └── projectFile.ts       # read/write demo project JSON
│   └── main.tsx                 # app entry
├── demo/
│   └── verrin-demo.json         # minimal project file referencing Verrin canon
├── tests/
│   └── vertical-slice.e2e.test.ts  # VS-01 through VS-12
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### Why this structure

- `core-adapter/` isolates all Core interaction.
- `components/` maps 1:1 to UX-SPEC screens.
- `persistence/` is one file for the slice.
- `demo/` contains the seed project, not a duplicate canon.
- No `llm/` folder in the first slice.

---

## 6. Define Core integration

### Only public Core API used

The slice uses these public Core exports, accessed exclusively through `CoreAdapter`:

| Studio need | Core public API |
|---|---|
| Load canon | `loadCanon()` |
| Baseline world | `derive(canon, [])` |
| Counterfactual world | `derive(canon, [intervention], rp)` |
| Validate rewind point | `validateRewindPoint()` |
| Compute diff | `worldDiff(baseline, branch)` |
| Typed projection | `typedDiff()` or `projectDiff()` |
| Status query | `statusOf()`, `workStatusOf()` |
| Fact query | `subjectFact()` |
| Reachability | `reachable()` |
| Intervention constructors | `negateEvent()`, `forceEvent()`, `setFact()`, `retractFact()`, `severEdge()`, `relocate()` |

### Core API not used (and why)

| Capability | Not used in slice because |
|---|---|
| `computeDivergence` / `computeDepth` | Not needed for the magic moment; metrics can be added later. |
| Occurrence queries | Not needed for Verrin slice. |
| `inspectCanon` | `loadCanon` throws on invalid; warning banner is post-slice. |
| `branchUniverse` / `createUniverse` | Core registry is process-local; Studio owns branch identity. |

### Ambiguous/unavailable API

| Capability | Status | Slice handling |
|---|---|---|
| `validateIntervention()` | Unavailable in Core. | Studio implements basic target existence validation in `InterventionComposer`. Escalate R2 for later. |
| `serialize()`/`restore()` for `WorldState` | Unavailable in public Core. | Persist `(canon, interventions, rp)` and re-derive. Escalate R4 for later. |

### Core Adapter interface for the slice

```typescript
interface CoreAdapter {
  loadCanon(raw: unknown): Canon;
  validateRewindPoint(rp: RewindPoint, canon: Canon): { ok: boolean; errors: string[] };
  derive(canon: Canon, interventions: Intervention[], rp?: RewindPoint): Promise<WorldState>;
  worldDiff(baseline: WorldState, branch: WorldState): WorldDiff;
  typedDiff(diff: WorldDiff, canon: Canon): TypedDiff;
  statusOf(world: WorldState, entityId: string): EventStatus;
  workStatusOf(world: WorldState, workId: string): WorkStatus;
  subjectFact(world: WorldState, subjectId: string, predicate: string): FactView | undefined;
  reachable(world: WorldState, eventId: string): boolean;
  interventionConstructor(kind: InterventionKind, ...args: unknown[]): Intervention;
}
```

### Error handling

| Core error | Adapter behavior | UI behavior |
|---|---|---|
| `loadCanon` throws | Rethrow `CanonLoadError(errors)`. | Show error; app does not load. |
| `derive` throws | Rethrow `DerivationError(message)`. | Show error; return to composer. |
| Invalid rewind point | Return validation result; do not throw. | Show warnings but allow proceed as narrative anchor. |
| Invalid intervention target | Studio validation catches before Core call. | Inline error in composer. |

---

## 7. Define the Web Worker boundary

### Why a Web Worker

- Keeps UI responsive during derivation.
- Isolates Core execution from main-thread UI state.
- Allows future Core parallelism without redesign.

### What crosses the boundary

**Main → Worker:**

```typescript
interface DeriveRequest {
  type: "derive";
  id: string;
  payload: {
    canon: Canon;             // plain object
    interventions: Intervention[];  // plain objects
    rp?: RewindPoint;         // plain object
  };
}
```

**Worker → Main:**

```typescript
interface DeriveResponse {
  type: "derived" | "error";
  id: string;
  payload?: {
    worldState: WorldState;   // plain object returned by derive()
  };
  error?: string;
}
```

### Serialization

- Use `structuredClone` / postMessage. Core `Canon`, `Intervention`, `RewindPoint`, and `WorldState` are plain nested objects; they cross the boundary safely.
- No custom serialization layer needed for the slice.
- `WorldDiff` and derived UI objects are computed on the main thread after receiving `WorldState`.

### Cancellation

- Not required for the slice.
- Future: add `AbortController` signal or `type: "cancel"` message.

### Errors

- Worker catches synchronous throws from Core and returns `type: "error"` with `error: message`.
- Main thread maps to `DerivationError`.

### Identity data

- Worker returns the full `WorldState`; main thread reads `worldState.identityHash` and `worldState.stateHash`.
- `WorldDiff` is computed by calling `worldDiff(baseline, branch)` on the main thread (fast enough for Verrin).

### No generalized RPC

The slice needs only one worker operation: `derive`. If more operations move to the worker later, a tiny dispatcher can be added; no RPC framework in V0.

---

## 8. Define Studio application state

### State classification

```text
Persistent state          →  saved to disk
Derived UI state          →  computed from persistent state + Core output
Temporary interaction state →  resets when user navigates or restarts
```

### Minimum state

| Field | Type | Class | Description |
|---|---|---|---|
| `project` | `Project` | Persistent | Loaded project: canon, rewind points, branches. |
| `activeBranchId` | `string` | Persistent | Currently displayed branch. |
| `selectedEntityId` | `string \| null` | Temporary | Drives Context Panel; not persisted. |
| `interventionDraft` | `InterventionDraft \| null` | Temporary | Mutable user input in composer. |
| `derivationStatus` | `idle \| deriving \| done \| failed` | Derived | Reflects worker state. |
| `derivationError` | `string \| null` | Derived | Last error message. |
| `worldCache` | `Map<branchId, WorldState>` | Derived-cache | Recomputable from project + Core. |
| `diffCache` | `Map<branchId, WorldDiff>` | Derived-cache | Recomputable from baseline + branch worlds. |
| `selectedDiffRowId` | `string \| null` | Temporary | Selected row in Diff presenter. |
| `selectedEvidenceNodeId` | `string \| null` | Temporary | Selected node in Why? / World views. |

### State not needed in slice

| Field | Why excluded |
|---|---|
| `currentWorld` | Replaced by `worldCache.get(activeBranchId)`. |
| `counterfactual` | Replaced by branch with `parentBranchId !== null`. |
| `causalEvidence` | Computed on demand from `selectedEvidenceNodeId` + `worldCache`. |
| Full `ProjectMetadata` | Only theme/LLM stub; not needed for slice. |

### State update flow

```text
User edits intervention draft
  ↓
AppStateManager updates `interventionDraft`
  ↓
User clicks Derive
  ↓
DerivationController sends request to CoreAdapter worker
  ↓
Worker returns WorldState
  ↓
AppStateManager stores WorldState in `worldCache`, creates branch record, sets `activeBranchId`
  ↓
DiffPresenter computes WorldDiff from `worldCache.get(baseline)` and `worldCache.get(activeBranchId)`
  ↓
UI renders Diff / Why? / World tabs
```

---

## 9. Define persistence for the slice

### Minimum persistence requirement

The slice must:

1. Open the demo world on launch.
2. Create a counterfactual branch.
3. Preserve the counterfactual across reload.
4. Re-derive the same world on reopen (determinism check).

### What is persisted

| File | Contents | Rationale |
|---|---|---|
| `demo/verrin-demo.json` | Project metadata, canon reference or embedded canon, rewind points, branch records. | Seed project. |
| `~/.somnium-studio/projects/verrin-demo/project.json` (or File System Access chosen folder) | Same as above after user save. | User's working copy. |
| `~/.somnium-studio/projects/verrin-demo/cache/world-{branchId}.json` | Optional cached `WorldState`. | Speeds reopen; not authoritative. |

### Branch persistence format

```json
{
  "branches": [
    {
      "branchId": "branch-baseline",
      "parentBranchId": null,
      "rpId": null,
      "interventions": [],
      "label": "Baseline",
      "worldHash": "sha256-baseline",
      "stateHash": "sha256-baseline-state"
    },
    {
      "branchId": "branch-001",
      "parentBranchId": "branch-baseline",
      "rpId": "RP-VERRIN-001",
      "interventions": [
        { "id": "negateEvent:ev/blight-begins", "kind": "negateEvent", "target": "ev/blight-begins", "label": "The Blight never begins" }
      ],
      "label": "The Blight never begins",
      "worldHash": "sha256-branch-001",
      "stateHash": "sha256-branch-001-state"
    }
  ]
}
```

### Persistence decisions

- **Authoritative state is `(canon + interventions + rp)`, not the cached `WorldState`.**
- On load, re-derive each branch and assert `worldHash` matches persisted value.
- If mismatch, discard cache and use freshly derived world (log warning).
- Save is triggered manually via `Ctrl/Cmd + S` or menu in the slice.

### Persistence not needed

- User labels/notes beyond branch label.
- Project history/undo.
- Cloud sync.
- Database.

---

## 10. LLM decision for the first slice

### Decision: Slice A — deterministic only

The first vertical slice does **not** include an LLM.

### Rationale

- The product thesis is **deterministic counterfactual exploration**, not AI prose.
- The magic moment must work even if no LLM is configured.
- Adding an LLM adds provider configuration, prompt engineering, hallucination guarding, and UI complexity that distract from validating the Core/Studio integration.
- `CausalEvidencePresenter` can show deterministic grounding in plain sentences without an LLM.

### What the slice includes instead of LLM

- Pre-written, deterministic explanation strings assembled from Core data:
  - `"ev/exodus is UNSUPPORTED because its REQUIRES group (ev/blight-begins) is negated by your intervention."`
  - `"work/verrin-ashfall is IMPOSSIBLE because ev/exodus is UNSUPPORTED."`
- A "Why?" view that displays status, support kind, truth value, relevant edges, and contradictions.

### Future slot

The architecture leaves a clear extension point: `LLMAdapter` can be added later to narrate the same `CausalExplanation` object. No redesign needed.

---

## 11. Define the first "magic moment" screen sequence

### Screen 1 — Canon

- Show entity list grouped by kind.
- Highlight `ev/blight-begins` with a subtle callout.
- Context Panel shows event description: *"A corruption blooms in the foundations of Valdar."*
- Bottom bar: **Next: Open Timeline →**

### Screen 2 — Timeline

- Render PRECEDES graph: blight → exodus → ashfall.
- `ev/blight-begins` is selected.
- Floating action: **"Create Rewind Point here"**.
- User clicks → confirms `RP-VERRIN-001`.

### Screen 3 — What If?

- Rewind point selected: `RP-VERRIN-001`.
- Intervention type picker defaults to `negateEvent`.
- Target is pre-filled: `ev/blight-begins`.
- Label auto-generated: `"The Blight never begins"`.
- User can edit or confirm.
- Validation: target exists, no errors.

### Screen 4 — Intervention confirmation

- Small confirmation card shows:
  - Intervention kind and target.
  - Rewind point.
  - Expected type of change (events, works, facts).
- Buttons: **Derive** (primary), **Edit**, **Cancel**.

### Screen 5 — Derivation

- Main workspace dims.
- Bottom bar: **"Deriving alternate world…"** with spinner.
- Derive button disabled.
- Worker runs `derive(canon, [negateEvent(...)], rp)`.

### Screen 6 — WorldDiff

- Diff tab opens automatically.
- Summary header: **"13 events changed, 3 works changed, 1 fact changed."**
- Grouped list:
  - Status changes (events ESTABLISHED → UNSUPPORTED/EXCLUDED).
  - Work status changes (PRESERVED → IMPOSSIBLE).
  - Fact override (char/vara.located_in).
- Each row has **"Why?"** link.
- User clicks a row → select it.

### Screen 7 — Why?

- Shows grounding for selected node (e.g., `ev/exodus`).
- Status: UNSUPPORTED.
- Support kind: NONE.
- Truth value: FALSE.
- Grounding: *"ev/exodus requires ev/blight-begins, which is negated by your intervention."*
- Relevant edge: `edge/exodus-requires-blight`.

### Screen 8 — Alternate World

- World tab opens.
- Browse the counterfactual as canon.
- `char/vara.located_in = loc/valdar` is shown.
- `work/verrin-ashfall` badge shows IMPOSSIBLE.
- Events downstream of blight show UNSUPPORTED.

---

## 12. Define acceptance tests

### Functional acceptance tests

| ID | Test | Expected result |
|---|---|---|
| VS-01 | Open `demo/verrin-demo.json`. | Project loads; baseline world derived; Canon tab visible. |
| VS-02 | Open Timeline tab. | PRECEDES graph renders with `ev/blight-begins` visible. |
| VS-03 | Select `ev/blight-begins`. | Event is highlighted; Context Panel shows description. |
| VS-04 | Create/select rewind point at `ev/blight-begins`. | `RP-VERRIN-001` is active; validation passes. |
| VS-05 | Construct `negateEvent(ev/blight-begins)` and confirm. | Intervention appears in staged area; Derive enabled. |
| VS-06 | Click Derive. | Worker runs derivation; status goes `deriving` then `done`; new branch created. |
| VS-07 | WorldDiff displays. | Diff tab opens; non-empty diff shows status changes, work changes, fact override. |
| VS-08 | Navigate Diff rows. | Selecting a row updates Context Panel and enables Why? link. |
| VS-09 | Inspect causal evidence. | Why? view shows status, support kind, truth value, grounding sentence, relevant edge. |
| VS-10 | Enter Alternate World. | World tab shows counterfactual state (e.g., `char/vara.located_in = loc/valdar`). |
| VS-11 | Baseline remains unchanged. | Switch back to baseline branch; original statuses/facts intact. |
| VS-12 | Reproducibility. | Save project, reload, re-derive; `worldHash` matches persisted value. |

### Error and cancellation tests

| ID | Test | Expected result |
|---|---|---|
| VS-13 | Invalid intervention target. | Composer shows inline error; Derive disabled. |
| VS-14 | Derivation error. | If Core throws, status = failed; error message shown; baseline untouched. |
| VS-15 | Empty diff. | If intervention is idempotent, show "This did not change the effective world." |

---

## 13. Define what counts as "done"

The vertical slice is complete when a developer can demonstrate this exact path to another person:

1. Launch Studio (or open in browser).
2. Demo project loads automatically.
3. Click through Canon → Timeline.
4. Select `ev/blight-begins` and confirm rewind point.
5. Click **What If?**, confirm `negateEvent(ev/blight-begins)`.
6. Click **Derive**.
7. See WorldDiff.
8. Click **Why?** on a changed event.
9. See deterministic grounding.
10. Enter Alternate World and browse the counterfactual.

### Done checklist

- [ ] No terminal commands during normal demo.
- [ ] No source-file edits during demo.
- [ ] No LLM prompt engineering during demo.
- [ ] All VS-01 through VS-15 tests pass.
- [ ] Deterministic re-derivation verified.
- [ ] Core not modified.

---

## 14. Identify research dependencies for the slice

| ID | Question | Blocks slice? | Handling in slice | Decision |
|---|---|---|---|---|
| **R1** | Should `derive()` respect `RewindPoint.cut` semantically? | **No.** | Rewind point used as narrative anchor; `derive()` receives it for identity/provenance only. Slice works either way. | Defer. |
| **R2** | Should Core expose `validateIntervention()`? | **No.** | Studio implements basic target-existence validation. Semantic validation handled by Core at derive time (errors surfaced). | Defer. |
| **R3** | Is actual-causality attribution in scope? | **No.** | Why? view shows deterministic grounding only. | Defer. |
| **R4** | Should Core provide `WorldState` checkpoint/restore? | **No.** | Persistence stores `(canon, interventions, rp)` and re-derives on load. | Defer. |

### Conclusion

None of R1–R4 block the first vertical slice. Studio can build the magic moment without waiting for Research-track answers.

---

## 15. Identify implementation risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **Core bundle compatibility in browser/Web Worker.** Core derivation path is pure TypeScript but may import Node-only modules indirectly. | High if it fails. | Verify bundle early (V0/V1). Exclude `src/experiment/runner.ts` from Studio imports. |
| 2 | **WorldState contains Maps/Sets internally?** Public `WorldState` returned by `derive()` appears to be plain objects, but need to verify for `postMessage`/`structuredClone`. | Medium. | Validate in V2 Core adapter; if needed, add a normalization step. |
| 3 | **Web Worker message handling complexity.** Async derivation state must not leak into UI. | Low. | Keep worker protocol minimal (one `derive` message type). |
| 4 | **Project file persistence in browser.** File System Access API may not be available everywhere. | Medium. | Provide fallback: download `project.json` on save, upload on open. |
| 5 | **UI complexity of Timeline graph.** Rendering a partial-order graph with selectable nodes can be fiddly. | Medium. | Use a simple list or horizontal event rail for slice; full graph is V2+. |
| 6 | **Diff presenter noise.** Verrin diff will have many rows; need grouping/filtering to avoid overwhelm. | Medium. | Group by change type; default filter to events + works. |
| 7 | **Branch reconstruction on reload.** Re-derivation must match persisted `worldHash`. | Low. | Determinism is a Core invariant; verify in VS-12. |

### Risk ranking

1. Core bundle compatibility — **highest priority to validate first.**
2. Browser file persistence — **second.**
3. Diff/Timeline UI complexity — **third; solvable with simple components.**

---

## 16. Produce an implementation sequence

### V0 — Scaffold

- Set up Vite + React + TypeScript project in `Somnium Studio/`.
- Configure path alias for Core package.
- Add Vitest + Playwright dependencies.
- Verify Core can be imported in a browser bundle (smoke test: call `verrinCanon()`).
- **Outcome:** Build succeeds; blank app runs.
- **Test:** `npm run dev` starts; `npm run test` passes empty suite.

### V1 — Load demo world

- Create `demo/verrin-demo.json`.
- Implement `ProjectManager` and `persistence/projectFile.ts`.
- Implement `AppStateManager`.
- Render project name and baseline world hash in shell.
- **Outcome:** Opening app loads Verrin demo.
- **Test:** VS-01.

### V2 — Core adapter + Web Worker

- Implement `CoreAdapter` with worker boundary.
- Worker imports public Core API only.
- Implement `derive`, `worldDiff`, `statusOf`, `workStatusOf`, `subjectFact`, `reachable`.
- **Outcome:** Derivation runs in worker; returns `WorldState`.
- **Test:** VS-06 (derive baseline and branch manually in test).

### V3 — Canon browser + Timeline

- Implement `CanonExplorer` and `TimelineController`.
- Event selection updates `selectedEntityId`.
- Timeline shows PRECEDES order; simple rail is acceptable.
- **Outcome:** User can browse canon and timeline.
- **Tests:** VS-02, VS-03.

### V4 — Intervention flow

- Implement `InterventionComposer` for all 7 kinds (slice default to `negateEvent`).
- Implement rewind-point selection in TimelineController.
- Implement confirmation card.
- **Outcome:** User can stage `negateEvent(ev/blight-begins)`.
- **Tests:** VS-04, VS-05, VS-13.

### V5 — Derivation

- Wire `DerivationController` to worker.
- Update `AppStateManager` with derivation status and cache.
- Create branch record on success.
- **Outcome:** Clicking Derive produces a counterfactual branch.
- **Tests:** VS-06, VS-14.

### V6 — WorldDiff

- Implement `DiffPresenter`.
- Auto-open Diff tab after derive.
- Group by change type; link to Why?.
- **Outcome:** User sees cascading consequences.
- **Tests:** VS-07, VS-08, VS-15.

### V7 — Causal explanation

- Implement `CausalEvidencePresenter`.
- Render deterministic grounding strings from Core data.
- Link to relevant nodes/edges.
- **Outcome:** User understands why a node changed.
- **Test:** VS-09.

### V8 — Alternate World

- Implement `WorldView`.
- Browse counterfactual with badges.
- **Outcome:** User can explore the alternate world.
- **Test:** VS-10.

### V9 — End-to-end acceptance

- Implement save/load persistence round-trip.
- Run full Playwright journey test for VS-01 to VS-12.
- **Outcome:** Slice is demonstrable without manual steps.
- **Tests:** VS-11, VS-12, plus full e2e journey.

---

## 17. Deliverables and next step

### Deliverables

- `Somnium Studio\VERTICAL-SLICE-PLAN-v0.1.md` (this document).
- QMS requirement record: `Somnium Studio\qms\records\requirements\REQ-S004-vertical-slice-plan-v0.1.md`.
- PM-1 trace: `C:\Users\think\self-harness\traces\somnium-studio-vertical-slice-plan-v0-1.pm1`.

### Next task

Actual implementation of the Studio vertical slice, starting with **V0 — Scaffold** and validating **Risk #1 (Core bundle compatibility in browser)** before any UI work.

---

*End of vertical slice plan. The path from load-demo to alternate-world is fully specified and ready to build.*
