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
