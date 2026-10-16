# S007 — Long-Horizon Semantic State Scaling

**Status:** COMPLETE
**Experiment ancestor (frozen P-007):** `443d3d9`
**Branch:** `s007` (isolated; P-007 untouched)
**Report generated from:** `experiments/s007/results/*.json`

---

## 1. Environment

| Field | Value |
|---|---|
| Commit | `443d3d9aba8565900ba156e5cef5bd1ff4b9ee70` |
| CPU | AMD Ryzen 3 4300U with Radeon Graphics |
| vCPU | 4 |
| RAM | 7.9 GB total (≈0.7 GB free at start) |
| OS | win32 / x64 |
| Node | v22.23.2 |
| TypeScript | 5.9.3 |

> **Host-target deviation (material).** The specification targets a dedicated Vultr
> instance (16 dedicated vCPU / 64 GB, Linux x86_64). The experiment ran on the
> available development host — **4 vCPU / 7.9 GB, Windows, 0.7 GB free**. This
> does not invalidate the *scaling* results (which are ratios and per-item costs),
> but it does mean: (a) the parallel-scaling ceiling is bounded by 4 physical
> cores, and (b) the absolute resource envelope must be **extrapolated** to the
> target, not measured on it. Extrapolations are labelled as such in §10.

---

## 2. Baseline

Established from the experiment ancestor before any experiment code was written:

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| Test suite | **624 / 624 pass** (24 files) |
| `verify-facts` | **3 / 3 PASS** |
| Frozen canon hash `verrin` | `e4c79cec` (unchanged) |
| Frozen canon hash `ordos` | `51f32b2e` (unchanged) |
| Full-suite wall time | ≈6–8 s |

The experiment begins from a clean P-007 baseline. All S007 code is isolated to
`experiments/s007/` and does not modify `src/`.

**Determinism harness:** every generator is a pure function of
`(canon, config, seed)`. There is no `Math.random`, `Date`, or I/O in the
workload path. Verified directly in Experiment E: worker-derived `stateHash`
sets are **identical** to the single-threaded reference for every worker count
(`match=true` for all rows).

---

## 3. Linear Scaling (Experiment A)

Single deterministic chain `W0 → I1 → W1 → … → WH`. Two measurements per horizon:

- **single-derive** — `derive(canon, chain[0..H])` once (construct the final state).
- **chain walk** — derive every prefix `W0..WH` (the production "step through" pattern).

### verrin

| H | single derive | µs / intervention | chain walk | repr size | peak RSS |
|---|---|---|---|---|---|
| 10 | 6.21 ms | 621 | 7.59 ms | 7.4 KB | 67 MB |
| 100 | 5.73 ms | 57 | 132.88 ms | 18.4 KB | 70 MB |
| 1,000 | 21.01 ms | 21.0 | 8.55 s | 45.0 KB | 94 MB |
| 3,000 | 61.62 ms | 20.5 | 87.83 s | 50.3 KB | 125 MB |
| 10,000 | 221.79 ms | 22.2 | *skipped* | 49.0 KB | 132 MB |
| 100,000 | 2,340 ms | 23.4 | *skipped* | 49.9 KB | 297 MB |

### ordos

| H | single derive | µs / intervention | chain walk | repr size | peak RSS |
|---|---|---|---|---|---|
| 10 | 1.93 ms | 193 | 6.59 ms | 10.7 KB | 297 MB |
| 100 | 4.22 ms | 42 | 123.95 ms | 21.4 KB | 279 MB |
| 1,000 | 16.13 ms | 16.1 | 7.30 s | 39.4 KB | 280 MB |
| 3,000 | 45.85 ms | 15.3 | 71.74 s | 39.3 KB | 282 MB |
| 10,000 | 161.57 ms | 16.2 | *skipped* | 38.5 KB | 289 MB |
| 100,000 | 1,570 ms | 15.7 | *skipped* | 39.3 KB | 444 MB |

**Observations**

1. **Single-derive is O(H).** Per-intervention cost is flat (verrin ≈21–23 µs,
   ordos ≈15–16 µs) across three orders of magnitude. `derive` re-applies the
   entire chain every call, so constructing `W_H` is linear in `H`.
2. **Representation size saturates.** verrin: 7.4 KB → 50.3 KB over H=10…3,000,
   then **flat** (49.0 KB at H=10,000; 49.9 KB at H=100,000). ordos saturates at
   ≈39 KB. The effective semantic state is **bounded**, not proportional to
   history length. This is the central architectural result of P-007 measured at
   scale.
3. **Chain walk is O(H²).** verrin H=1,000 → 8.55 s; H=3,000 → 87.83 s: a 10.3×
   increase for a 3× horizon, i.e. exponent ≈ 2.1. Deriving every prefix
   re-derives from scratch each step.
4. **Memory is dominated by the chain, not the state.** Peak RSS at H=100,000 is
   297 MB (verrin) / 444 MB (ordos); the semantic representation is <50 KB of it.

---

## 4. Branching Scaling (Experiment B)

Deterministic tree, depth `D`, branch factor `B`; every node derived and hashed.

| Canon | D | B | nodes | leaf trajectories | unique states | duplicate rate | derive time | throughput |
|---|---|---|---|---|---|---|---|---|
| verrin | 4 | 2 | 31 | 16 | 23 | 25.8% | 23.3 ms | 1,333/s |
| verrin | 6 | 2 | 127 | 64 | 95 | 25.2% | 89.5 ms | 1,419/s |
| verrin | 8 | 2 | 511 | 256 | 395 | 22.7% | 350.6 ms | 1,457/s |
| verrin | 3 | 3 | 40 | 27 | 28 | 30.0% | 23.0 ms | 1,739/s |
| verrin | 5 | 3 | 364 | 243 | 271 | 25.5% | 232.7 ms | 1,564/s |
| verrin | 4 | 4 | 341 | 256 | 256 | 24.9% | 218.0 ms | 1,564/s |
| ordos | 4 | 2 | 31 | 16 | 24 | 22.6% | 23.1 ms | 1,342/s |
| ordos | 6 | 2 | 127 | 64 | 101 | 20.5% | 96.1 ms | 1,321/s |
| ordos | 8 | 2 | 511 | 256 | 410 | 19.8% | 407.0 ms | 1,256/s |
| ordos | 3 | 3 | 40 | 27 | 30 | 25.0% | 28.7 ms | 1,393/s |
| ordos | 5 | 3 | 364 | 243 | 289 | 20.6% | 253.0 ms | 1,439/s |
| ordos | 4 | 4 | 341 | 256 | 268 | 21.4% | 232.5 ms | 1,467/s |

**Observations**

1. **The state space is much smaller than the trajectory space.** Despite fully
   random interventions, **20–30 % of derived nodes are duplicates** of an
   already-seen semantic state, consistently across D, B and canon. Branching
   fast (in trajectories) does not grow the *distinct world* count at the same rate.
2. **Throughput is stable (~1,300–1,700 nodes/s)** and independent of D and B —
   confirming per-node cost is governed by the node's own chain length, not by
   the shape of the tree.
3. **Memory is flat (~435–440 MB)** across all configurations: nodes are derived
   and discarded, and the bounded representation (§3) keeps each node small.

---

## 5. Convergence (Experiment C)

### 5.1 Constructed convergent groups

Different histories, same effective semantic state — the P-007 property stated
directly. `converged` = one distinct `stateHash`; `diffEmpty` = `worldDiff` is
empty pairwise.

| Canon | Group | histories | distinct hashes | converged | pairwise diff empty |
|---|---|---|---|---|---|
| verrin | setFact-idempotent | 3 | 1 | ✅ | ✅ |
| verrin | negate-idempotent | 2 | 1 | ✅ | ✅ |
| verrin | commute (distinct cells) | 2 | 1 | ✅ | ✅ |
| verrin | redundant-8-rewrites | 2 | 1 | ✅ | ✅ |
| verrin | convergent-repetition | **10** | **1** | ✅ | ✅ |
| ordos | setFact-idempotent | 3 | 1 | ✅ | ✅ |
| ordos | negate-idempotent | 2 | 1 | ✅ | ✅ |
| ordos | commute (distinct cells) | 2 | 1 | ✅ | ✅ |
| ordos | redundant-8-rewrites | 2 | 1 | ✅ | ✅ |
| ordos | convergent-repetition | **10** | **1** | ✅ | ✅ |

The `convergent-repetition` group is the sharp result: **10 histories of different
lengths (1–11 interventions) all collapse to a single semantic state** — history
grows, world identity does not. Provenance is excluded by construction, so this
is genuine semantic convergence.

### 5.2 Random histories at scale

| Canon | histories | horizon | distinct states | ratio | max / state |
|---|---|---|---|---|---|
| verrin | 10 | 10 | 10 | 1.000 | 1 |
| verrin | 100 | 10 | 100 | 1.000 | 1 |
| verrin | 1,000 | 10 | 1,000 | 1.000 | 1 |
| verrin | 5,000 | 10 | 5,000 | 1.000 | 1 |
| ordos | 10 | 10 | 10 | 1.000 | 1 |
| ordos | 100 | 10 | 100 | 1.000 | 1 |
| ordos | 1,000 | 10 | 1,000 | 1.000 | 1 |
| ordos | 5,000 | 10 | 5,000 | 1.000 | 1 |

**Observation.** Random histories do **not** converge: every one of 5,000 random
chains reaches a distinct state. Convergence is a property of *semantic
equivalence* (idempotence, commutativity, redundant re-writes) — not of chance.
The bounded cell space does not by itself force collisions at this horizon. This
is the correct and important contrast with §5.1.

### 5.3 A semantic subtlety discovered (and its resolution)

The first smoke run reported `redundant-8-rewrites` as *not* converging. Root
cause: **interventions key on `(subject, predicate)` cells, and the effective
fact for a cell is not necessarily the canon-declared one** — validity windows
and override precedence decide which fact holds the cell. Re-writing a canon
fact's *declared* value when a *different* fact currently holds that cell is a
real state change, not a no-op. The corrected test reads the **effective** fact
from the base world before re-writing it, and then converges as expected (§5.1).
The engine was right; the workload premise was wrong.

---

## 6. WorldDiff Scaling (Experiment D)

`worldDiff(A, B)` cost against representation size and delta size.

### verrin

| Regime | repr A | repr B | delta (changes) | diff time |
|---|---|---|---|---|
| equal | 35.7 KB | 35.7 KB | 0 | 1.02 ms |
| small (adjacent) | 18.4 KB | 18.4 KB | 0 | 0.32 ms |
| large k=1 | 6.8 KB | 6.8 KB | 1 | 0.53 ms |
| large k=10 | 6.8 KB | 7.4 KB | 7 | 0.26 ms |
| large k=100 | 6.8 KB | 18.4 KB | 82 | 0.62 ms |
| large k=250 | 6.8 KB | 27.5 KB | 134 | 1.08 ms |
| large k=500 | 6.8 KB | 35.7 KB | 176 | 0.91 ms |

### ordos

| Regime | repr A | repr B | delta | diff time |
|---|---|---|---|---|
| equal | 32.4 KB | 32.4 KB | 0 | 0.86 ms |
| small (adjacent) | 21.5 KB | 21.5 KB | 2 | 0.29 ms |
| large k=100 | 7.1 KB | 21.4 KB | 81 | 0.74 ms |
| large k=250 | 7.1 KB | 27.5 KB | 122 | 0.81 ms |
| large k=500 | 7.1 KB | 32.4 KB | 157 | 0.89 ms |

**Observations**

1. **WorldDiff is dominated by representation size, not delta size.** At the
   saturated representation (~32–36 KB) a full diff costs ≈0.9–1.0 ms regardless
   of whether the delta is 0 or 176 changes.
2. **There is no equal-state fast path.** `worldDiff(A, A)` costs the same as a
   full comparison (≈1 ms) because the engine still walks the whole
   representation to establish emptiness. An `A.stateHash === B.stateHash` guard
   at the call site would make equal-state diffs O(1) — a cheap optimisation, not
   an architectural change.
3. **Cost is bounded by history-independent state size.** Because the
   representation saturates (§3), WorldDiff cost does **not** grow with
   intervention history.

---

## 7. Parallel Scaling (Experiment E)

Persistent worker pool; startup excluded via a ready-handshake and a warmup batch.
Every worker count is verified to produce the **identical** hash set.

| Canon | workers | cold start | warm wall | throughput | speedup | efficiency | hashes match |
|---|---|---|---|---|---|---|---|
| verrin | 1 | 216 ms | 177.5 ms | 1,127/s | 0.62× | 62% | ✅ |
| verrin | 2 | 224 ms | 140.4 ms | 1,424/s | 0.78× | 39% | ✅ |
| verrin | **4** | 348 ms | **99.4 ms** | **2,013/s** | **1.10×** | 28% | ✅ |
| verrin | 8 | 691 ms | 163.7 ms | 1,222/s | 0.67× | 8% | ✅ |
| verrin | 16 | 1.44 s | 167.9 ms | 1,191/s | 0.65× | 4% | ✅ |
| ordos | 1 | 194 ms | 188.9 ms | 1,059/s | 0.61× | 61% | ✅ |
| ordos | 2 | 220 ms | 145.6 ms | 1,374/s | 0.80× | 40% | ✅ |
| ordos | **4** | 359 ms | **122.6 ms** | **1,632/s** | **0.95×** | 24% | ✅ |
| ordos | 8 | 679 ms | 147.5 ms | 1,356/s | 0.79× | 10% | ✅ |
| ordos | 16 | 1.37 s | 131.6 ms | 1,520/s | 0.88× | 6% | ✅ |

Reference (single-threaded, warm): verrin 109.5 ms / 200 items; ordos 115.9 ms.

**Observations**

1. **Parallelism buys almost nothing.** Peak speedup is **1.10×** (verrin) /
   **0.95×** (ordos) at W=4 — the physical core count — and *degrades* beyond it.
2. **The per-item work is too small to amortise IPC.** Each item is a short
   chain; per-item compute is sub-millisecond, while message passing, worker
   scheduling and result collection cost far more.
3. **W=1 is already slower than the main thread** (0.61–0.62×): the worker
   boundary itself is the cost.
4. **Cold start is significant** (0.19–1.44 s) and grows with worker count, so
   short batches lose even more.
5. **Determinism is preserved under parallelism** — every hash set matches, for
   every worker count, both canons. `derive` is genuinely pure.

---

## 8. Bottleneck Analysis

Ranked by measured impact:

| # | Bottleneck | Evidence | Nature |
|---|---|---|---|
| 1 | **Re-derivation from scratch** | single-derive O(H); chain walk O(H²) | Architectural |
| 2 | **IPC / worker overhead** | W=1 slower than main thread; peak 1.1× at 4 cores | Workload-size vs overhead |
| 3 | **WorldDiff full-representation walk** | equal-state costs same as full diff | Missing fast path |
| 4 | **Intervention-chain memory** | peak 297–444 MB at H=100,000; state <50 KB | Expected (O(H)) |
| 5 | **Worker cold start** | 0.19–1.44 s, grows with W | Harness/scheduling |

Not a bottleneck: **semantic state size, hashing, and diff cost** — all bounded
by the saturated representation and independent of history length.

---

## 9. Complexity (empirical)

| Operation | Empirically observed | Basis |
|---|---|---|
| `derive(canon, H)` (single) | **O(H)** | flat µs/intervention across H=10³…10⁵ |
| chain walk `W0..WH` | **O(H²)** | 10.3× time for 3× H (exponent ≈2.1) |
| representation size | **O(1)** in H beyond ≈H=10³ | saturation at ~50 KB / ~39 KB |
| `stateHash(repr)` | **O(state)**, history-independent | bounded by saturation |
| `worldDiff(A,B)` | **O(state)**, weakly dependent on delta | ≈1 ms at ~35 KB regardless of delta 0…176 |
| branching derive | **O(nodes × mean chain length)** | stable nodes/s across D, B |
| parallel throughput | **flat then degrading** | peak at W = physical cores |

These are empirical fits from the measurements above, not formal proofs. No
formal Big-O claim is made; the source shows `derive` rebuilds the model from the
full intervention list every call, which is *consistent* with the observed O(H).

---

## 10. Resource Envelope

**Measured on the 4 vCPU / 7.9 GB host:**

- H=100,000 single-derive: **2.34 s** (verrin) / **1.57 s** (ordos), peak RSS
  **297 MB** / **444 MB**.
- H=10,000 single-derive: 0.22 s / 0.16 s, peak ≈132 MB / 289 MB.
- The chain walk is the only pathological case: H=3,000 takes ≈80 s; H=10,000
  would take ≈15 min and H=100,000 ≈25 h (O(H²)). **The walk, not the state,
  is the envelope.**

**Extrapolated to the target Vultr instance (16 vCPU / 64 GB)** — *estimate, not
measured*:

- The workload is single-threaded-bound; extra cores do not help (§7).
- Memory headroom is ample: even H=1,000,000 single-derive would need roughly
  O(1) state (<50 KB) plus an O(H) intervention chain (order 1–5 GB at that
  scale) — comfortably within 64 GB.
- **Safe workload on 16 vCPU / 64 GB:** single-derive at H up to ~10⁶; full chain
  walks only up to H ≈ 3,000–5,000 unless derivation becomes incremental.

---

## 11. Findings

**Scaling wins**
- The canonical semantic representation is **bounded**: it saturates at ≈50 KB
  (verrin) / ≈39 KB (ordos) and stays flat from H=1,000 to H=100,000. History
  length does not grow world identity — the P-007 convergence architecture holds
  at scale.
- `stateHash` and `worldDiff` are therefore **history-independent**.
- **Determinism survives parallelism** — identical hashes at every worker count.
- ~20–30 % of randomly-branched nodes converge to existing states: the distinct
  world space grows far more slowly than the trajectory space.

**Scaling failures**
- **No incremental derivation.** `derive` is O(H) per call; stepping through a
  history is O(H²). This is the dominant cost and the only thing that becomes
  pathological.
- **Parallelism is ineffective** for this workload: ≤1.1× on 4 cores, degrading
  beyond. Per-item work is too small to amortise IPC.
- **WorldDiff has no equal-state fast path** — equal states pay a full walk.

**Memory pressure:** none observed below H=100,000; peak 444 MB, driven by the
intervention chain. The semantic state is negligible.

**CPU saturation:** single-threaded throughout Experiment A/B/C/D; Experiment E
saturates 4 cores at only ≈1.1× useful throughput.

**GC effects:** the initial O(H²) harness allocation (all prefixes) triggered a
heap OOM at H=100,000; after removing it, GC was not a limiting factor. This was
a harness defect, corrected and documented.

**Architectural bottlenecks:** exactly one — **derivation is not incremental**.

---

## 12. Recommendation

1. **Do not scale the Vultr instance to 32–48 vCPU / 128 GB for this workload.**
   Parallel throughput peaks at the physical core count and degrades beyond it
   (Experiment E). Additional cores are not the constraint.
2. **Optimize software first — and only one thing:** make derivation
   **incremental** (extend a prior `WorldState` with one intervention instead of
   rebuilding the model from the full chain). This converts the O(H) single-derive
   and O(H²) chain walk into O(1)-amortised steps and removes the only
   pathological behaviour. No semantic change is required; this is the
   performance bottleneck that §"Implementation Rules" says to document before
   changing.
3. **Add a cheap equal-state guard** at `worldDiff` call sites
   (`a.stateHash === b.stateHash → empty diff`). This is a one-line optimisation,
   not an architectural change.
4. **Remain on 16 vCPU / 64 GB** for the current architecture. It is more than
   sufficient: the semantic state is bounded and memory is dominated only by the
   intervention chain. The baseline machine is **not** the bottleneck.

**Overall:** the P-007 semantic-state architecture is **already resource-efficient
for long horizons** — the world identity does not grow with history. The scaling
limit is entirely in *re-derivation*, and it is a fixable software problem, not a
hardware one.

---

## Appendix — Reproducing

```
# baseline (from 443d3d9)
npm run check && npm test && npx tsx scripts/verify-facts.ts

# full sweep
npx tsx experiments/s007/run-all.ts            # all experiments
npx tsx experiments/s007/run-all.ts --quick    # bounded smoke run
npx tsx experiments/s007/run-all.ts --only=A   # one experiment

# diagnostics (the two anomalies investigated in §5.3 and Experiment E)
npx tsx experiments/s007/diagnose.ts
```

Results JSON: `experiments/s007/results/exp-{a,b,c,d,e}-*.json`.

**Isolation:** all S007 code lives under `experiments/s007/`. `src/` is
unmodified from `443d3d9`; frozen P-007, P-005, S006 and the frozen canon hashes
are untouched.
