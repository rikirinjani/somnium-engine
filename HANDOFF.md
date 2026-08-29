# Somnium Engine — Handoff Ledger

**Protocol:** self-harness/constitution.md (role boundaries) + this ledger
**Scope:** inter-agent coordination — Somnium Engine PoC build only
**Memory boundary:** entries stay in `C:\Users\think\Project_v2\Somnium-poc\`

## How Handoffs Work

1. Any agent writes a handoff entry under `### Pending` with sufficient context
2. **Git commit + push immediately after editing HANDOFF.md.** Local edits are
   invisible to other agents — they read from git.
3. The owning agent picks it up on its next session (via git pull).
4. When started, the agent must read `HANDOFF.md` and check its section.
5. When done, move the entry to `### Completed` or `### Cancelled`, then
   git commit + push.
6. If the handoff implies an architecture change, the agent must write a
   proposal to `docs/proposals/` before implementing.

**No agent commands another.** Information flows through this file —
distributed via git.

---

## Scaffold / Governance Lane

### Pending

### Active

### Completed

- **2026-08-30** — **P-001 PoC build — COMPLETED + VERIFIED.** All four lanes
  delivered: scaffold (README/HANDOFF/qms/self-harness/verify-facts/CI), canon
  (loader/validator + Verrin seed), derive core (deterministic fixpoint,
  contradictions), timeline/diff/query/cli. Integrated: **94/94 tests pass**
  incl. 14 acceptance tests covering all 10 PoC capabilities; `tsc --noEmit`
  clean; `verify-facts` gate 3/3 PASS; CLI baseline/intervene/chain works.
  L2 verifier **APPROVED** (7/7 checks). Known integration fix during
  reconciliation: REQUIRES edge direction corrected in Verrin seed to match the
  documented convention (from=prerequisite, to=dependent). Verrin demonstrates
  do(blight never happens) => exodus UNSUPPORTED, Vara stays in Valdar,
  work/verrin-ashfall IMPOSSIBLE, genealogy U-BASELINE→U-001→U-002,
  deterministic replay, and forceEvent+negate => CONTRADICTORY surfaced.
- **2026-08-30** — **P-001 PoC build (4 lanes: scaffold, canon+Verrin,
  derive core, timeline/diff/query/cli) — ACTIVE.** Scaffold lane delivered:
  README.md, HANDOFF.md, `qms/trace-matrix.json`,
  `self-harness/constitution.md`, `scripts/verify-facts.ts`,
  `.github/workflows/ci.yml`. Orchestrator holds git; lanes do not commit.
- **2026-08-30** — Reconnaissance report completed and accepted:
  `docs/ARCHITECTURE-RECONNAISSANCE.md` (DRAFT v0.1). Defines the Somnium
  ontology (entities, facts, causal edges), the derived-state model
  (`derive(canon, interventions) -> WorldState`), the status lattice, Rewind
  Point model, diff model, and the Verrin PoC plan. req-001 filed in
  `qms/records/requirements/`.
