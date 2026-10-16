# REQ-S001 — Somnium Studio MVP Product Contract v0.1

**Status:** Draft  
**Type:** Product requirement / specification  
**Source:** Somnium Studio Product track, continuing from Somnium Engine S035 boundary.  
**Date:** 2026-09-17

## Requirement statement

Establish a rigorous product contract for the Somnium Studio MVP: a human-facing, deterministic counterfactual exploration environment built on top of the Somnium Engine Core, without redefining Core semantics.

The contract must define product objects, user actions, Core/Studio boundary, LLM boundary, persistence model, MVP acceptance criteria, non-goals, demo specification, and explicit escalation criteria for missing Core capabilities.

## Scope

- Single-user, local-first MVP.
- Built on Core public behaviors only (`derive`, `worldDiff`, `validateRewindPoint`, status/fact queries, etc.).
- Does NOT prescribe internal Core file paths (e.g., `src/derive/incremental.ts`).
- Does NOT extend Core semantics.

## Acceptance criteria

1. A written Product Contract v0.1 exists and contains all 14 required sections.
2. Every major capability is classified as [P] Proven, [A] Assumption, [N] New product requirement, or [R] Requires research-track validation.
3. The contract explicitly identifies genuine Core capability gaps and frames them as research-track escalation questions, not silent product assumptions.
4. The contract conservatively treats the S035 report's 6,582-case count and the planned incremental-file promotion as research/repository reconciliation items, not product dependencies.
5. The contract is stored in the Studio product track (outside the engine repo) and traceable via PM-1.

## Known dependencies / escalations to Research

| ID | Question | MVP impact |
|---|---|---|
| R1 | Should `derive()` respect `RewindPoint.cut` semantically? | High — central product metaphor. |
| R2 | Should Core expose `validateIntervention()`? | Medium — UX safety. |
| R3 | Is actual-causality attribution ("X caused Y") in scope? | Medium — reframes "Why?" view. |
| R4 | Should Core provide `WorldState` checkpoint/restore? | Medium — affects persistence design. |

## Verification

- Trace recorded: `C:\Users\think\self-harness\traces\somnium-studio-product-contract-v0-1.pm1`.
- Contract file: `C:\Users\think\Project_v2\Somnium Studio\PRODUCT-CONTRACT-v0.1.md`.

## Notes

This requirement record captures a new specification. It does not itself implement any Core or Studio code.
