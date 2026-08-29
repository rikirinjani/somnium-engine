# Somnium Engine

Deterministic counterfactual narrative engine for fictional canons. Answers:
**what happens to a fictional world when something in its canon changes?**

A sibling project of Kronos Engine (real-world counterfactual simulation); no
code is shared and the repositories are independent.

## Core concept

```
Canon ─► Rewind Point ─► Intervention ─► derive() ─► WorldDiff ─► optional LLM
(entities, facts,   (a cut in narrative   (typed change:     (pure,        (structural  narration
 causal edges)      time, e.g.            negateEvent,       deterministic deltas)      (a labeled
                    RP-VERRIN-001)        setFact,           function,                   view, never
                                          forceEvent)        memoized)                   the answer)
```

Unlike Kronos, there is no wall-clock tick, no RNG, no Monte Carlo statistics.
Narrative time is a partial order of events (`PRECEDES` edges); determinism is
structural, not seeded. Contradictions surface as first-class records, never
silently repaired. Design: [`docs/ARCHITECTURE-RECONNAISSANCE.md`](docs/ARCHITECTURE-RECONNAISSANCE.md).

## Status

**PoC** (pre-alpha). Four lanes in flight: scaffold (this repo's governance),
canon + Verrin seed library, derive core (lattice + fixpoint), and
timeline/diff/query/CLI. The `tests/acceptance/` suite is the executable
contract — lanes must satisfy it without modifying it.

## Seed universe

Verrin — a tiny invented canon (~6 characters, ~12 events, 3 Works); no
copyright or canon ambiguity.

## How to run

```sh
npm install        # install dependencies
npm run check      # typecheck (tsc --noEmit)
npm test           # run vitest suite
npm run dev        # start the CLI (tsx src/cli/main.ts)
```

## Governance

- `HANDOFF.md` — inter-agent handoff ledger (pending/active/completed).
- `qms/trace-matrix.json` — requirement-to-verification trace.
- `self-harness/constitution.md` — agent conduct rules for this repo.
- `scripts/verify-facts.ts` — CI facts gate; wired into `.github/workflows/ci.yml`.
