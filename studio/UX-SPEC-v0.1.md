# Somnium Studio UX Specification v0.1

**Status:** Draft — implementation-ready UX specification for the Studio MVP  
**Date:** 2026-09-17  
**Scope:** Single-user, local-first desktop/web MVP. Builds on `PRODUCT-CONTRACT-v0.1.md`. Does not modify Core semantics or code.

---

## Authority and dependencies

This specification derives from `PRODUCT-CONTRACT-v0.1.md` and inherits its `[P]` / `[A]` / `[N]` / `[R]` classification discipline.

Unresolved Research-track questions that directly shape this UX:

| ID | Question | UX impact |
|---|---|---|
| **R1** | Should `derive()` respect `RewindPoint.cut` semantically? | Determines whether the Rewind Point selector is a narrative anchor or an actual derivation boundary. Spec designs for both. |
| **R2** | Should Core expose `validateIntervention()`? | Determines how much validation lives in Studio vs. Core. Spec puts Studio-owned pre-flight validation in place now. |
| **R3** | Is actual-causality attribution in scope? | Determines the "Why?" view content. Spec frames it as **grounding** (status + support + contradictions), not attribution. |
| **R4** | Should Core provide `WorldState` checkpoint/restore? | Determines persistence strategy. Spec uses Studio JSON persistence + re-derivation on load. |

---

## 1. Application shell

### Minimum chrome

The shell is intentionally minimal. One window, three persistent regions, one floating/command area.

```text
┌─────────────────────────────────────────────────────────────────────┐
│  Somnium Studio                    Project: Verrin Demo   [≡ menu]  │  ← Title bar
├────────────────┬──────────────────────────┬─────────────────────────┤
│                │                          │                         │
│  World Tree    │   Main Workspace         │   Context Panel         │
│  (left sidebar)│   (center stage)         │   (right sidebar)       │
│                │                          │                         │
│                │                          │                         │
├────────────────┴──────────────────────────┴─────────────────────────┤
│  Status: Baseline world loaded  |  Ask Somnium  |  Derive (active)  │  ← Bottom bar
└─────────────────────────────────────────────────────────────────────┘
```

### 1.1 Title bar

- Application name: **Somnium Studio**.
- Current **Project name**.
- Global menu (≡):
  - **File:** New project, Open project, Save, Save as, Export branch artifact.
  - **View:** Toggle World Tree, Toggle Context Panel, Reset layout.
  - **Help:** Open demo script, keyboard shortcuts, about.

### 1.2 Left sidebar — World Tree

Persistent branch and world navigator.

- **Baseline** (root node).
- Expandable list of branches created from baseline or from other branches.
- Each node shows:
  - Branch label (user-editable).
  - Small status glyph: 🟢 derived, 🟡 staged (intervention pending derivation), 🔴 derivation error.
  - Active branch is highlighted.
- Context menu on node: Rename, Duplicate, Delete, Export.
- Selecting a node loads that branch's world into the main workspace.

### 1.3 Center stage — Main Workspace

Tabbed view. Tabs persist per branch (last active tab remembered by Studio, not Core).

Default tabs, in order:

1. **Canon** — browse entities, facts, events, edges, works.
2. **Timeline** — partial-order graph of events.
3. **What If?** — intervention composer + rewind selector.
4. **Diff** — WorldDiff against baseline or parent.
5. **World** — alternate-world explorer.
6. **Why?** — grounding detail for a selected node.

Only **Canon**, **Timeline**, and **What If?** are available before the first derivation. **Diff**, **World**, and **Why?** appear after a branch is derived.

### 1.4 Right sidebar — Context Panel

Context-sensitive inspector. Content depends on the current tab and selected item.

- In **Canon**: properties of the selected entity/fact/edge.
- In **Timeline**: event details + incoming/outgoing edges.
- In **What If?**: currently staged intervention list, validation messages, derive button.
- In **Diff**: selected delta detail (from/to values, record IDs).
- In **World**: selected node's status, effective facts, work classification.
- In **Why?**: support kind, truth value, contradiction record, effective edge set.

### 1.5 Bottom bar — global status and actions

Left to right:

- **Simulation status:** short text (`Baseline loaded`, `Deriving…`, `Derived U-001`, `Error: invalid intervention`).
- **"Ask Somnium"** button — opens a small inline LLM assistant scoped to the current view/selection. Not a chatbot.
- **Primary action button:** context-aware:
  - In **What If?** tab: **Derive**.
  - In **Diff** / **World** tab: **Branch again**.
  - Disabled when derivation is invalid or already running.

### 1.6 Global project state

At any moment the Studio holds exactly one loaded project with:

- `canon: Canon` — immutable reference document.
- `activeBranchId: string` — currently displayed branch.
- `branches: Map<string, BranchRecord>` — Studio-owned lineage.
- `worldCache: Map<string, WorldState>` — derived worlds (can be recomputed from canon + interventions + rp).
- `pendingInterventions: Intervention[]` — interventions staged on the active branch but not yet derived.
- `selectedEntityId: string | null` — drives the Context Panel.

---

## 2. Canonical MVP journey

The spec implements the Product Contract's loop as a concrete click path.

### Journey map

| Step | User intent | Screen / action | Output |
|---|---|---|---|
| 1 | Start exploring a world | Open project or create from Verrin seed | Canon tab loads |
| 2 | Understand the world | Browse **Canon** and **Timeline** | User sees entities, facts, events, PRECEDES order |
| 3 | Choose a moment | Click an event in Timeline → **Create Rewind Point** | Rewind Point is declared and selected |
| 4 | Ask "what if?" | Switch to **What If?** tab, pick intervention type, fill target | Intervention is staged in Context Panel |
| 5 | Run the simulation | Click **Derive** in bottom bar | Studio calls `derive(canon, [iv], rp)` |
| 6 | See consequences | **Diff** tab opens automatically | WorldDiff is rendered |
| 7 | Understand grounding | Select a changed node → **Why?** tab | Grounding detail shown |
| 8 | Explore the alternate world | Switch to **World** tab | Browse the counterfactual as canon |
| 9 | Branch again | Click **Branch again** in **World** or **Diff** tab | Return to **What If?** with parent context loaded |
| 10 | Manage exploration | Use **World Tree** to switch branches | Branch tree grows |

### First-time default path

On first launch or new project:

1. Studio prompts: **"Start with the Verrin demo world?"** (default: yes).
2. Loads `verrinCanon()` and creates baseline branch.
3. Opens **Timeline** tab with `ev/blight-begins` pre-selected and a callout: **"Try changing this event."**
4. User clicks the callout → switches to **What If?** tab with `negateEvent(ev/blight-begins)` pre-filled.
5. One-click **Derive** triggers the magic moment.

---

## 3. Screen-by-screen specification

### 3.1 Canon browser

**Purpose:** Read-only understanding of the authoritative world document.

**Layout:**

- Left pane: filterable entity list (Characters, Locations, Factions, Institutions, Objects, Events, EventTypes, Works).
- Center pane: detail card for the selected entity.
- Right Context Panel: raw fact/edge relationships for the selected entity.

**Interactions:**

- Click any entity → show detail card.
- Click a fact predicate → show all facts with that predicate.
- Click an edge → highlight source and target in Timeline.
- Search/filter by name or id.
- No editing in MVP. (Canon editing is out of MVP scope; user imports/loads canons.)

**Empty/error states:**

- No canon loaded → centered message with **"Open project"** and **"Start Verrin demo"** buttons.
- Canon validation errors from `inspectCanon()` → warning banner with error list; still browsable read-only.

### 3.2 Timeline

**Purpose:** Visualize the partial order of events.

**Layout:**

- Horizontal/topological graph: events as nodes, `PRECEDES` edges as arrows.
- Nodes colored by baseline status (green = ESTABLISHED, gray = UNKNOWN, red = CONTRADICTORY, etc.).
- Zoom and pan.
- Mini-map optional; not required for MVP.

**Interactions:**

- Hover node → tooltip with event name + baseline status.
- Click node → Context Panel shows event details and edges.
- **"Create Rewind Point here"** button on selected event.
- **"What if this changed?"** button on selected event → switches to What If? tab with a context-aware intervention suggestion.
- When viewing a derived branch, show the same graph but nodes colored by branch status; optionally dim unchanged nodes.

### 3.3 What If? — Intervention Composer

**Purpose:** The product's central action. Build one typed change and run the simulation.

**Layout:**

- Top: **Rewind Point selector** (dropdown of declared RPs; default = baseline / none).
- Middle: **Intervention type picker** (7 kinds as radio/tile group).
- Below: **Target selector** + parameter fields, specific to type.
- Bottom: **Staged interventions** list (MVP supports one primary + optional sequential list for chain experiments).
- Right Context Panel: validation results and **Derive** button.

**Intervention type-specific UI:**

| Type | Target selector | Parameter | Validation notes |
|---|---|---|---|
| `negateEvent` | Event id dropdown | none | Must be a declared event. |
| `forceEvent` | Event id dropdown | none | Must be a declared event. |
| `setFact` | Entity id + Predicate | Object value | Must satisfy `factAssertionError()` rules; predicate must exist in fact vocabulary. |
| `retractFact` | Fact id dropdown | none | Must be a canon-declared fact id. |
| `severEdge` | Edge id dropdown | none | Must be a canon-declared edge id. |
| `addEdge` | Source + target entity dropdowns, edge kind, optional group | none | Source/target must exist; kind from closed set. |
| `relocate` | Character/entity id + Location id | none | Shorthand for `setFact(..., "located_in", loc)`. |

**Interactions:**

- Selecting an event in Timeline pre-fills target for `negateEvent`/`forceEvent`.
- Selecting a fact in Canon browser pre-fills target for `retractFact`.
- Selecting an edge pre-fills target for `severEdge`.
- **Add to chain** adds intervention to staged list.
- **Derive** runs `derive(canon, stagedInterventions, selectedRP)`.
- On success: open **Diff** tab, add a new branch node to World Tree.
- On error: show error in Context Panel, do not navigate away.

**Validation and error handling (Studio-owned until R2 resolved):**

- Pre-flight check every target id against the canon entity/fact/edge lists.
- Run `factAssertionError()` for `setFact`/`relocate`.
- Surface messages like:
  - `"ev/secret-betrayal" is not a declared event in this canon.`
  - `Predicate "located_in" cannot have object "loc/fake-place".`
  - `Edge "edge/exodus-requires-blight" does not exist.`
- Invalid interventions cannot be added to the chain.

### 3.4 Diff — WorldDiff view

**Purpose:** Show what changed because of the intervention. This is the primary magic-moment screen.

**Layout:**

- Top bar:
  - Compare selector: **Baseline** vs. **Parent** vs. **Another branch**.
  - Filter: All / Characters / Events / Locations / Works / Relationships / Edges / Contradictions.
- Main list: grouped changes.
  - **Status changes** (event/work nodes): from → to.
  - **Fact changes** (additions, removals, overrides).
  - **Edge changes** (added/removed causal law).
  - **Contradictions introduced / resolved**.
  - **Work status changes** (PRESERVED → IMPOSSIBLE, etc.).
  - **Temporal / constraint violations** introduced or resolved.
- Each row shows: icon, label, from value, arrow, to value, and **Why?** link.

**Interactions:**

- Click row → select node; Context Panel shows raw diff fields.
- Click **Why?** → switch to Why? tab with node pre-selected.
- Click **Branch again** → return to What If? with this branch as parent.
- Hover changed event → highlight in Timeline.

**Empty state:**

- If diff is empty (idempotent intervention): show **"This intervention did not change the effective world state."** and explain that `identityHash` still differs because of provenance.

### 3.5 World — Alternate World Explorer

**Purpose:** Browse the counterfactual world as if it were canon.

**Layout:** same as **Canon** browser, but data comes from `WorldState`:
- Entity list from canon.
- Effective facts from `world.facts`.
- Event statuses from `world.statuses`.
- Work statuses from `world.workStatuses`.

**Interactions:**

- Same selection/hover as Canon browser.
- Visual badges on events: ESTABLISHED, UNSUPPORTED, EXCLUDED, CONTRADICTORY, etc.
- Toggle: show only changed entities/facts vs. full world.
- **Compare with baseline** quick action on selected entity.

### 3.6 Why? — Grounding view

**Purpose:** Explain *how* the Core reached a verdict, not *why* in a causal-attribution sense.

**Layout:**

- Header: selected node id and name.
- **Status card:** current `EventStatus` or `WorkStatus`.
- **Judgment card:** `TruthValue` and `SupportKind` from `world.judgments[node]`.
- **Grounding list:**
  - For events: which REQUIRES groups are satisfied/refuted; which ENABLES edges contributed; any EXCLUDES/INVARIANT violations.
  - For facts: effective fact value and source (canon/derived).
  - For works: member event statuses and which fact alterations affected the work.
- **Contradiction card:** if node is involved in a `ContradictionRecord`, show `detail`, `detectedAt`, `source`.
- **Edge set card:** effective edges (`world.edges`) that touch this node.

**Interactions:**

- Click any referenced node/edge/fact → navigate to it in World or Canon tab.
- **Ask Somnium to explain this** button → inline LLM narration based on the grounding data, with citations.

**Framing copy:**

- Use **"The Core found…"** rather than **"Because X caused Y."**
- Example: `"ev/exodus is UNSUPPORTED because its only REQUIRES group (ev/blight-begins) is negated by your intervention."`

### 3.7 Ask Somnium inline assistant

**Purpose:** Optional LLM interpretation layer, scoped to current context.

**Behavior:**

- Not a persistent chat sidebar. Appears as a small inline panel when invoked.
- Default prompts based on context:
  - In Diff: **"Summarize what changed and why it matters."**
  - In Why?: **"Explain this grounding in plain language."**
  - In What If?: **"Suggest an intervention based on my question."**
- User can type a free-form question, but the assistant answers only from the current Core state.
- Every LLM response must display citations (record IDs) and a **"Verify in Core"** link.
- LLM cannot override, edit, or silently patch Core output.

---

## 4. Core interactions and states

### 4.1 Branch lifecycle

```text
[Baseline]
   ↓ user stages intervention on What If?
[Staged]
   ↓ user clicks Derive (success)
[Derived Branch]
   ↓ user clicks Branch again
[Staged child]
   ↓ user clicks Derive (success)
[Derived child]
```

### 4.2 Derivation state machine

| State | UI indicators | User can… |
|---|---|---|
| **Idle** | Derive button enabled, status text stable. | Edit intervention, switch tabs, select nodes. |
| **Deriving** | Spinner on Derive button, status text "Deriving…", main workspace dimmed or read-only. | Cancel derivation if async and cancellable; otherwise wait. |
| **Derived** | Derive button becomes **"Branch again"** or re-enabled for new staging. Diff tab auto-opens. | Explore diff, branch again, save project. |
| **Error** | Derive button enabled; error banner in Context Panel. | Fix intervention and retry. |

### 4.3 Selection and navigation rules

- Selecting an item in one tab updates `selectedEntityId` and the Context Panel, but does not switch tabs unless the user explicitly clicks a **Why?** / **Open in…** link.
- The World Tree selection changes the active branch; all tabs reload their data for that branch.
- Closing a project clears all derived caches and returns to the project opener.

### 4.4 Keyboard shortcuts (minimum set)

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + O` | Open project |
| `Ctrl/Cmd + S` | Save project |
| `Ctrl/Cmd + 1…6` | Switch to Canon/Timeline/What If?/Diff/World/Why? tabs |
| `Ctrl/Cmd + D` | Derive (when valid) |
| `Ctrl/Cmd + B` | Branch again (when on a derived branch) |
| `Esc` | Close Ask Somnium panel |

---

## 5. Error, empty, and loading states

### 5.1 Derivation errors

- **Invalid canon on load:** warning banner, project opens read-only, user cannot derive.
- **Invalid intervention:** inline validation in Context Panel; Derive disabled; no navigation.
- **Core throws during derive:** show error message and stack-free technical detail; project state unchanged.
- **Contradictory world:** **not** treated as an error. World is displayed with `CONTRADICTORY` badges and contradiction records. User can still explore.

### 5.2 Empty states

| Screen | Empty state |
|---|---|
| Canon | "No canon loaded. Open a project or start the Verrin demo." |
| Timeline | "No events to display." |
| What If? | "Choose a rewind point and an intervention to ask a question." |
| Diff (before derive) | "Derive a branch to see what changed." |
| Diff (empty diff) | "This intervention did not change the effective world state." |
| World | "No derived world to explore." |
| Why? | "Select a changed node from the Diff or World tab to see its grounding." |
| World Tree | "No branches yet. The baseline world is your starting point." |

### 5.3 Loading states

- Project load: centered spinner + project name.
- Derivation: Derive button spinner, workspace dimmed, status bar "Deriving `branchId`…".
- Tab switch with large branch: skeleton cards for entity list.

---

## 6. LLM touchpoints ("Ask Somnium")

### 6.1 Where Ask Somnium appears

- Bottom bar global button.
- Inline **"Explain this"** buttons in Why? view and Diff rows.
- Suggest-intervention button in What If? tab.

### 6.2 What the LLM is allowed to do in this UX

- Convert structured Core output into plain-language summaries.
- Suggest interventions in the closed vocabulary from a user's natural-language "what if" question.
- Answer world queries by reading the active `WorldState`, with citations.

### 6.3 What the UI enforces

- Every LLM response displays the Core record IDs it references.
- A **"Show in Core"** link jumps the user to the cited node/fact/edge.
- LLM suggestions for interventions are shown as editable, pre-validated forms; user must confirm before staging.
- No LLM output is stored as canon or as a derived fact.

### 6.4 LLM disabled state

If no LLM is configured, the Ask Somnium button is disabled with tooltip: **"LLM narration is optional. Configure a provider in settings to enable."**

---

## 7. Research-track dependencies in the UX

| ID | Dependency | Spec handling | If Research defers |
|---|---|---|---|
| R1 | Rewind Point semantic cut | Rewind Point selector is always shown as a **narrative anchor**. If R1 is resolved to "yes", the same UI becomes a derivation boundary with no redesign. | Continue treating RP as anchor only; derive from full canon. |
| R2 | `validateIntervention()` API | Studio implements pre-flight validation now. If Core later exposes it, swap the implementation without changing UX. | Keep Studio validation. |
| R3 | Actual-causality attribution | Why? tab uses **grounding** language. If Core later provides attribution, add a "Causal chain" section to Why? without removing grounding. | Keep grounding-only framing. |
| R4 | `WorldState` checkpoint/restore | Studio persists branch records and re-derives on load. If Core later provides checkpoint API, use it as an optimization under the hood. | Keep re-derivation strategy. |

---

## 8. MVP UX acceptance criteria

### Journey-level criteria

| ID | Criterion | How to verify |
|---|---|---|
| UX-A1 | A first-time user can go from launch to seeing a Verrin WorldDiff in ≤5 clicks. | Manual walkthrough with new user. |
| UX-A2 | The "What If?" composer prevents invalid interventions before Derive is enabled. | Automated test with invalid targets. |
| UX-A3 | After a successful derive, the Diff tab opens automatically and the World Tree gains a new branch node. | Automated UI test. |
| UX-A4 | Selecting a diff row opens the Why? tab with grounding details. | Automated UI test. |
| UX-A5 | Branching again from a derived world returns to What If? with the parent branch pre-selected. | Automated UI test. |
| UX-A6 | The World Tree allows switching between branches without losing tab context. | Manual test. |
| UX-A7 | LLM narration, if invoked, cites Core record IDs and offers a "Show in Core" link. | Manual review. |
| UX-A8 | Save/load round-trip restores the branch tree and allows re-derivation to the same `identityHash`. | End-to-end persistence test. |

### Per-screen criteria

| Screen | Criterion |
|---|---|
| Canon | User can locate `char/vara`, see its `located_in` facts, and navigate to related events. |
| Timeline | User can see the PRECEDES partial order and click `ev/blight-begins`. |
| What If? | User can select `negateEvent(ev/blight-begins)` and click Derive. |
| Diff | Diff shows `ev/exodus: ESTABLISHED → UNSUPPORTED` and `work/verrin-ashfall: PRESERVED → IMPOSSIBLE`. |
| Why? | Why? shows `ev/exodus` support = NONE and the negated prerequisite. |
| World | User sees `char/vara.located_in = loc/valdar` in the alternate world. |

### Accessibility criteria

- All interactive elements reachable by keyboard.
- Color is not the sole indicator of status (icons + text labels).
- Status glyphs include text equivalents for screen readers.
- Focus visible on all buttons, list items, and tabs.

---

## 9. UX non-goals

| Non-goal | Rationale |
|---|---|
| Rich text / prose editor for canon | MVP canon is imported/loaded, not authored in Studio. |
| Real-time collaboration cursors | Single-user MVP. |
| Infinite canvas / free-form graph for arbitrary worldbuilding | Timeline is the PRECEDES partial order only. |
| AI character-chat mode | LLM is interpretation layer, not a character simulator. |
| Mobile-first responsive layout | Desktop/tablet web MVP; mobile is later. |
| Theme customization | One default dark/light theme in MVP. |
| Onboarding wizard beyond the Verrin demo prompt | Demo path is the onboarding. |
| Undo/redo across derivation history | Branch tree is the history; explicit save/load is enough. |
| Notification center / activity feed | Out of MVP scope. |

---

## 10. Implementation handoff notes

### Data flow

```text
User action in UI
   ↓
Studio state update (project, activeBranch, stagedInterventions, selectedEntityId)
   ↓
If deriving: call derive(canon, stagedInterventions, selectedRP)
   ↓
Store WorldState in worldCache keyed by branchId
   ↓
Compute WorldDiff against baseline or parent
   ↓
Render tab content from WorldState / WorldDiff
```

### Component inventory (suggested)

| Component | Responsibility |
|---|---|
| `AppShell` | Layout, global state, menus, bottom bar. |
| `WorldTree` | Branch list, selection, rename/delete/duplicate. |
| `TabPanel` | Canon, Timeline, WhatIf, Diff, World, Why?. |
| `CanonBrowser` | Entity list, detail card, fact/edge inspector. |
| `TimelineGraph` | Partial-order rendering, node selection. |
| `InterventionComposer` | Type picker, target selectors, staged list, validation. |
| `DiffView` | Grouped delta list with Why? links. |
| `WorldBrowser` | Counterfactual world browser. |
| `GroundingView` | Status, judgment, support, contradictions, edges. |
| `ContextPanel` | Right-sidebar inspector. |
| `AskSomniumPanel` | Inline LLM assistant. |
| `StatusBar` | Derivation status and primary action. |

### Files to create (when implementation begins)

- No engine files modified.
- Studio files (to be created in a separate Studio app/repo):
  - `src/app/AppShell.tsx` (or equivalent)
  - `src/project/projectStore.ts`
  - `src/canon/CanonBrowser.tsx`
  - `src/timeline/TimelineGraph.tsx`
  - `src/what-if/InterventionComposer.tsx`
  - `src/diff/DiffView.tsx`
  - `src/world/WorldBrowser.tsx`
  - `src/why/GroundingView.tsx`
  - `src/llm/AskSomniumPanel.tsx`
  - `src/tree/WorldTree.tsx`
  - `src/persistence/fileStore.ts`

### What to build first

1. App shell + project store + file persistence.
2. Canon browser + Timeline (read-only).
3. What If? composer with validation.
4. Derive call + Diff view (the magic moment).
5. World browser + Why? grounding view.
6. World Tree + branch again.
7. Ask Somnium inline assistant.

---

## Appendix A — Traceability to Product Contract

| Product Contract section | UX-SPEC section |
|---|---|
| §1 Product definition | §1 Application shell, §6 LLM touchpoints |
| §2 Target user | Journey defaults to Verrin demo; no casual-chat UX |
| §3 JTBD | §2 Canonical MVP journey |
| §4 Product objects | §3 Screen specs render each object |
| §5 User actions | §2 Journey map, §4 Interactions |
| §6 Primary UX | §1 Shell, §3 Screens |
| §7 Core/Studio boundary | §7 Research dependencies, §10 Data flow |
| §8 LLM boundary | §6 Ask Somnium |
| §9 Persistence model | §10 Project store / fileStore |
| §10 MVP acceptance criteria | §8 UX acceptance criteria |
| §11 Non-goals | §9 UX non-goals |
| §12 Escalation criteria | §7 R1–R4 dependency table |
| §13 First demo | §2 First-time default path |
| §14 Risks | §5 Error/empty states, §7 Defer handling |

---

*End of UX specification. Next step: resolve R1–R4 with Research, then produce a component-level design spec and start implementation.*
