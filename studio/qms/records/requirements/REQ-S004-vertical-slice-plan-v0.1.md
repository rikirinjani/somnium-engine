# REQ-S004 — Somnium Studio Vertical Slice Implementation Plan v0.1

**Status:** Draft  
**Type:** Implementation planning requirement  
**Source:** Somnium Studio Product track; defines the first end-to-end build demonstrating the product's magic moment.  
**Date:** 2026-09-17

## Requirement statement

Produce a concrete implementation plan for the smallest end-to-end Studio vertical slice that demonstrates:

> Change one fact → derive an alternate world → see what changed → understand why → explore the alternate world.

The plan must specify the demo world, exact intervention, minimum components, project structure, Core integration, Web Worker boundary, application state, persistence, LLM decision, screen sequence, acceptance tests, done criteria, research dependency review, implementation risks, and ordered implementation sequence.

## Scope

- Verrin seed canon from Core as the demo world.
- `negateEvent(ev/blight-begins)` as the canonical first intervention.
- Deterministic-only slice (LLM deferred).
- Public Core API only, accessed through a Core Adapter.
- Web Worker for Core derivation.
- Local JSON persistence.
- Single baseline + one counterfactual branch.
- 15 acceptance tests (VS-01 through VS-15).
- Ordered implementation sequence V0–V9.

## Acceptance criteria

1. `VERTICAL-SLICE-PLAN-v0.1.md` exists and covers all 16 sections requested.
2. Demo world, intervention, and expected consequences are specified using actual Core artifacts.
3. Expected consequences are marked as validation tasks, not assumptions.
4. Component list is reduced from the full architecture to the minimum needed.
5. LLM is explicitly deferred; slice is deterministic-only.
6. R1–R4 are reviewed and declared non-blocking for the slice.
7. Implementation sequence identifies the first validation task (Core bundle compatibility in browser) before UI work.
8. Trace and QMS record are created.

## Dependencies

- `PRODUCT-CONTRACT-v0.1.md`
- `UX-SPEC-v0.1.md`
- `ARCHITECTURE-v0.1.md`
- Public Core API (`loadCanon`, `derive`, `worldDiff`, status/fact queries, intervention constructors).
- Verrin seed canon from Core.

## Risks addressed

- Core API leakage: prevented by Core Adapter boundary.
- LLM scope creep: prevented by deferring LLM.
- Over-engineered persistence: prevented by minimal JSON project files.
- Waiting for R1–R4: prevented by declaring them non-blocking.
- UI complexity: prevented by simple Timeline rail and grouped Diff list.

## Verification

- Trace recorded: `C:\Users\think\self-harness\traces\somnium-studio-vertical-slice-plan-v0-1.pm1`.
- Plan file: `C:\Users\think\Project_v2\Somnium Studio\VERTICAL-SLICE-PLAN-v0.1.md`.
