# REQ-S003 — Somnium Studio Technical/Product Architecture v0.1

**Status:** Draft  
**Type:** Architecture requirement / specification  
**Source:** Somnium Studio Product track; translates `PRODUCT-CONTRACT-v0.1.md` and `UX-SPEC-v0.1.md` into the smallest software architecture preserving the deterministic Core boundary.  
**Date:** 2026-09-17

## Requirement statement

Define a concrete, implementation-ready architecture for the Somnium Studio MVP that:

- Preserves the Core/Studio/LLM responsibility separation.
- Introduces a single product-facing Core Adapter boundary.
- Defines the minimum Studio-owned components and data model.
- Specifies local-first persistence, branch identity/lineage, counterfactual lifecycle, and LLM integration.
- Remains compatible with unresolved Research-track questions R1–R4.
- Does not modify Somnium Core and does not prescribe internal Core file paths.

## Scope

- Layered architecture: UI, Application, Core Adapter, Core.
- Minimum application component inventory with responsibilities.
- Core Adapter interface (methods, inputs, outputs, errors, sync/async, serialization, identity).
- Studio data model: Project, Branch, InterventionDraft/Intervention, RewindSelection, DerivationJob, WorldView, DiffView, CausalExplanation.
- Persistence architecture: what is persisted, cached, recomputed, or discarded; project folder layout.
- Branch architecture: identity, lineage, reconstruction.
- Counterfactual lifecycle: Draft → Validated → Confirmed → Deriving → Derived → Explorable → Branched, plus failure/cancellation/invalidation.
- LLM architecture: intervention assistance, explanation, query; pluggable provider.
- LLM context contract: bounded context package, response contract, handling of unavailable/hallucination/refusal.
- Determinism boundary: what must be deterministic vs. what may vary.
- Behavioral API contract table classified [P]/[A]/[N]/[R].
- Technology decisions and deferred decisions.
- Local-first recommendation with rationale.

## Acceptance criteria

1. `ARCHITECTURE-v0.1.md` exists and covers all 13 sections requested by the Product track.
2. The architecture identifies a single Core Adapter boundary and lists what it must and must NOT do.
3. The Studio data model is minimized; no duplicate semantic abstractions.
4. Persistence architecture distinguishes recomputed, cached, persisted, and discarded data.
5. R1–R4 are explicitly handled with defer-compatible designs.
6. LLM architecture enforces read-only, citation, and no-Core-mutation rules.
7. Determinism boundary invariant is stated explicitly.
8. Trace and QMS record are created.

## Dependencies

- `PRODUCT-CONTRACT-v0.1.md`
- `UX-SPEC-v0.1.md`
- Public Core API as enumerated in the Product Contract.
- R1–R4 remain unresolved.

## Risks addressed

- Core leakage: prevented by the Core Adapter boundary rule.
- Semantic duplication: prevented by rejecting unnecessary abstractions.
- Cloud complexity: prevented by local-first persistence decision.
- LLM authority creep: prevented by bounded context contract and read-only adapter.
- R1–R4 uncertainty: architecture works whether each is answered yes or defer.

## Verification

- Trace recorded: `C:\Users\think\self-harness\traces\somnium-studio-architecture-v0-1.pm1`.
- Architecture file: `C:\Users\think\Project_v2\Somnium Studio\ARCHITECTURE-v0.1.md`.
