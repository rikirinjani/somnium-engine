# REQ-S002 — Somnium Studio UX Specification v0.1

**Status:** Draft  
**Type:** Product requirement / UX specification  
**Source:** Somnium Studio Product track; translates `PRODUCT-CONTRACT-v0.1.md` into implementation-ready UX.  
**Date:** 2026-09-17

## Requirement statement

Produce a concrete user-experience specification for the Somnium Studio MVP that defines the application shell, canonical user journey, screen-by-screen behavior, core interactions, error/empty/loading states, LLM touchpoints, and acceptance criteria.

The specification must remain within the Product Contract boundaries: single-user, local-first, deterministic Core as authority, LLM as optional interpretation layer, no Core semantic changes, and no coding of the engine itself.

## Scope

- Application shell layout (title bar, World Tree, Main Workspace, Context Panel, bottom bar).
- Canonical MVP journey: World → Timeline → Rewind → What If? → Derive → Diff → Why? → World → Branch.
- Screen specifications: Canon browser, Timeline, What If? composer, Diff, World, Why?, Ask Somnium.
- Interaction and state rules.
- Error, empty, and loading states.
- LLM touchpoint rules.
- Handling of unresolved Research-track questions R1–R4.
- UX-level MVP acceptance criteria.
- Implementation handoff component inventory.

## Acceptance criteria

1. `UX-SPEC-v0.1.md` exists and covers all sections listed in the scope.
2. Every screen specification describes what the user sees, clicks, selects, and experiences.
3. The four Research-track questions (R1–R4) from `PRODUCT-CONTRACT-v0.1.md` are explicitly reflected in the UX with defer-compatible designs.
4. The UX does not introduce Core semantic changes, collaboration, cloud sync, or prose-generation features.
5. The spec includes a first-time default path that demonstrates the product thesis in ≤5 clicks.
6. Trace and QMS record are created.

## Dependencies

- `PRODUCT-CONTRACT-v0.1.md` is the authoritative baseline.
- Research-track questions R1–R4 remain unresolved; UX must not assume their answers.

## Risks addressed

- R1 (Rewind Point semantic cut): Rewind Point selector is designed as a narrative anchor that can become a derivation boundary if Core implements the cut.
- R2 (validateIntervention): Studio implements pre-flight validation so the UI is safe even if Core does not expose a validator.
- R3 (causal attribution): Why? view is framed as grounding, not attribution.
- R4 (WorldState checkpoint/restore): Studio persistence uses re-derivation, with room to use a future Core checkpoint API as an optimization.

## Verification

- Trace recorded: `C:\Users\think\self-harness\traces\somnium-studio-ux-spec-v0-1.pm1`.
- UX spec file: `C:\Users\think\Project_v2\Somnium Studio\UX-SPEC-v0.1.md`.
