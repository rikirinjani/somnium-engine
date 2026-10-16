# REQ-S005 — Somnium Studio Vultr Environment Audit v0.1

**Status:** Draft  
**Type:** Infrastructure discovery / audit requirement  
**Source:** Somnium Studio Product track; read-only inspection of Vultr environment and Studio implementation state before any deployment decisions.  
**Date:** 2026-09-17

## Requirement statement

Produce a factual environment inventory that separates observed Vultr resources from what the current Somnium Studio vertical slice actually requires, identifies the simplest viable deployment topology, and records blockers and unknowns.

The audit must:

- Confirm the current Studio implementation status (files, build/runtime requirements, Core/Studio boundary).
- Inspect accessible Vultr resources without modifying them.
- Record network, runtime/container, domain/DNS/TLS, and security findings.
- Separate observed, required, and future infrastructure.
- Recommend the next task (implementation before deployment).
- Not expose credentials, secrets, API keys, or passwords.

## Scope

- Studio directory inspection.
- SSH inspection of accessible Vultr instance `PM-1`.
- Review of prior Vultr recon artifacts (without exposing secrets).
- Documentation of observed vs required vs future infrastructure.
- Identification of simplest viable deployment topology.
- Recording of deployment blockers and unknowns.

## Acceptance criteria

1. `VULTR-ENVIRONMENT-AUDIT-v0.1.md` exists and contains all 15 sections.
2. The audit states clearly that the Studio implementation does not yet exist (only planning documents).
3. Vultr resource inventory is based on observed data or explicitly marked as unverified.
4. No credentials or secrets are exposed.
5. The simplest viable deployment topology is a static frontend + HTTPS on an existing Vultr instance.
6. Blockers are ranked; the primary blocker is the missing Studio implementation.
7. Trace and QMS record are created.

## Dependencies

- `PRODUCT-CONTRACT-v0.1.md`
- `UX-SPEC-v0.1.md`
- `ARCHITECTURE-v0.1.md`
- `VERTICAL-SLICE-PLAN-v0.1.md`
- SSH access to Vultr instance `PM-1`.
- Prior Vultr reconnaissance artifacts.

## Risks addressed

- Premature cloud deployment: prevented by identifying implementation as the blocker.
- Over-provisioning: prevented by static-site topology recommendation.
- Security exposure: prevented by noting UFW state and recommending TLS before public access.
- Confusion about Core server requirement: clarified that Core runs client-side in Web Worker for the slice.

## Verification

- Trace recorded: `C:\Users\think\self-harness\traces\somnium-studio-vultr-environment-audit-v0-1.pm1`.
- Audit file: `C:\Users\think\Project_v2\Somnium Studio\VULTR-ENVIRONMENT-AUDIT-v0.1.md`.
