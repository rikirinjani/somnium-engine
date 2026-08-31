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

- **2026-08-31** — **P-004 second canon genericity challenge — COMPLETED +
  VERIFIED.** Introduced `canon/ordos` (a succession dispute over an artifact of
  office) as the deliberate structural inverse of Verrin: a FACT gating events,
  `EXCLUDES` between facts, disjunctive support as the central mechanism, a
  load-bearing unknown, a partial temporal order, an `Object` entity, an
  institution with no location.
  §18.1–18.4 (selection rationale, schema challenge, seven falsifiable
  predictions) were written and committed BEFORE implementation. **Four
  predictions held, three were refuted, and the refutations were worth more.**
  Core changes: `EntityKind` gains `Object`; `WorkBinding.facts`;
  `Canon.unspecified`; `inspectCanon` errors/notices split; fact-object typo
  guard; `ALTERED` dependency-union rule; `stateHash`/`identityHash` split
  replacing the ambiguous single `hash`; `characterFact` → `subjectFact`.
  **348/348 tests** (was 225), `tsc` clean, `verify-facts` 3/3. L2 gate:
  **REJECT** (`32a517a`), **APPROVE** (`1c7565a`, ver-004).
  Three findings worth carrying forward:
  (a) **A single canon cannot distinguish "the engine is generic" from "the
  engine happens to agree with this canon."** All 269 pre-Ordos tests passed
  while three things were wrong (§18.10).
  (b) **The engine held two disagreeing beliefs about whether a fact held.**
  `buildModel` collected only negate/force, so an event REQUIRING a fact was
  unaffected by that fact being retracted — a rite gated on the Seal proceeded
  with the Seal in nobody's hands. Verrin's one fact-sourced REQUIRES edge is a
  deliberate dead end, so it got the right answer for the wrong reason (§18.6).
  (c) **The validator had also stayed behind**, calling this project's own
  adversarial fixture invalid on seven counts while that fixture derived a
  perfectly usable world. Uncaught because nothing ever validated it (§18.7).
  ncr-003: a documentation claim about system state shipped without an
  executable assertion behind it — third recurrence of the class, and the
  preventive action is now "quantified claims must be parameterized tests",
  because grep cannot verify "all three canons validate".
  Next: **P-005 — repeatable events and occurrence identity** (§18.12).
- **2026-08-31** — **P-003 causal semantics adversarial pass — COMPLETED +
  VERIFIED.** Attacked the causal model rather than extending it. Six defects
  confirmed by construction (report §17.1): conjunction-only support; the status
  "lattice" was not a lattice and conflated four axes; the "monotone fixpoint"
  was not monotone and had a silent pass cap; ENABLES behaved as necessity;
  bootstrap cycles reported as UNKNOWN; `causalReach` misnamed.
  Rebuilt on Belnap FOUR + Kleene connectives + well-founded semantics:
  `src/derive/judgment.ts` (truth × support × forced × negated, `EventStatus`
  demoted to a lossy projection), staged propagation with an asserted
  monotonicity `throw` and a throwing pass cap, disjunctive support via
  `CausalEdge.group`, `temporalViolations` for PRECEDES cycles, adversarial
  annex canon + cases A–K.
  **225/225 tests** (was 138), `tsc --noEmit` clean, `verify-facts` 3/3.
  L2 gate: **REJECT** (`834c1ff`), **REJECT** (`fa572f7`), **APPROVE**
  (`5bd65a9`, ver-003) — both rejections on the ncr-001 defect class.
  Findings worth carrying forward:
  (a) **A green test can be evidence about the fixture, not the code.** The
  claim that `severEdge`+`addEdge` commute passed only because the test targeted
  an edge whose removal was invisible. On a load-bearing edge the orders diverge
  (`ev/q` UNSUPPORTED vs ESTABLISHED), and the commutative hash collided two
  different worlds carrying different provenance — ncr-002.
  (b) **Do not hand a specialist a measured table as specification** unless the
  measurement covered the case that would falsify it. I probed commutativity on
  one canon and shipped my sampling error into a lane's brief.
  (c) Absence of knowledge must never become falsehood: an undeclared
  prerequisite keeps its dependents UNKNOWN, while a bootstrap cycle is
  UNSUPPORTED. Both asserted side by side in one world (case J vs K).
  Next: **P-004 — a second seed canon** (§17.10). Genericity is currently
  asserted, not demonstrated.
- **2026-08-30** — **P-002 depth / divergence / chain experiments — COMPLETED +
  VERIFIED.** Two lanes (depth metrics, experiment runner) plus one remediation
  lane. Delivered: `src/depth/` (genealogicalDepth vs interventionCount vs
  divergence), `src/experiment/` (chain runner + deterministic JSON artifacts,
  no statistical layer), `experiment` CLI command, report §8.1.
  **138/138 tests** (was 94), `tsc --noEmit` clean, `verify-facts` 3/3.
  L2 gate: **REJECT** on `351b228` (runner docstring asserted the refuted
  monotonicity premise — ncr-001), remediated in `0e009d2`, **APPROVE** on
  re-verification (ver-002).
  Two findings worth carrying forward:
  (a) the first divergence implementation counted fact-record churn and scored
  an identical 23 at depths 1/2/3 of the Verrin chain — three different worlds,
  one number; fixed with value-aware `changedStateCount` (26/25/26).
  (b) divergence is a **distance from baseline, not a monotone accumulator** —
  an intervention restoring a canonical value legitimately lowers it. An
  acceptance test asserting monotonicity encoded a false premise and was
  replaced; only `genealogicalDepth` strictly increases along a chain.
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
