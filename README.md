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

**PoC** (pre-alpha), four phases complete and independently gate-reviewed:

| Phase | What it established |
|---|---|
| P-001 | Ten PoC capabilities on the Verrin seed canon |
| P-002 | Counterfactual depth vs structural divergence (they are different questions) |
| P-003 | Causal semantics adversarial pass — six defects found and the model rebuilt on Belnap FOUR + Kleene connectives + well-founded semantics |
| P-004 | Second canon (Ordos) genericity challenge — two structurally opposite canons through one engine |

348 tests, `tsc --noEmit` clean. Design and findings:
[`docs/ARCHITECTURE-RECONNAISSANCE.md`](docs/ARCHITECTURE-RECONNAISSANCE.md) — §17 and §18 record what
was wrong and why, including the defects that a single canon could never have exposed.

## Seed canons

Both are small invented canons, deliberately chosen to avoid copyright or canon ambiguity —
and deliberately structural opposites:

- **Verrin** — a cascade. One root event (a blight), deep conjunctive `REQUIRES` chains,
  a character whose location flips at a single displacement event.
- **Ordos** — a contest. A *fact* (who holds the Seal of office) gating events, `EXCLUDES`
  between facts, alternative sufficient causes as the central mechanism, a load-bearing
  unknown (a parentage the canon never settles), a partial temporal order.

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
- `qms/records/` — nonconformity and verification records, including the three
  documentation-claim recurrences (ncr-001 … ncr-003) and their preventive actions.
- `self-harness/constitution.md` — agent conduct rules for this repo.
- `scripts/verify-facts.ts` — CI facts gate; wired into `.github/workflows/ci.yml`.

## License

[Apache License 2.0](LICENSE).
