# P-007 — Semantic Comparison Convergence (design note, pre-implementation)

Status: **REVISED AFTER DESIGN REVIEW — NO-GO as originally written; three
mandatory corrections incorporated below and marked ▲.** Not yet implemented.

The review could not run in a specialist lane (five dispatch failures: credits
×2, ECONNRESET, terminated, invalid request) and was conducted by the
orchestrator with execution-backed probes. Its trace:
`somnium-verifier-p007-convergence-design`. The corrections, all three
execution-grounded:

> **▲1 — A key collision at construction is a HARD ERROR, not a recorded
> diagnostic.** Ordos `negateEvent(ev/old-warden-dies)` makes
> `fact/seal-held-anselm` and `fact/seal-held-vaela` simultaneously effective
> in ONE cell — today, on a canon-valid world. So a too-coarse key collides on
> a *legal* world, and the engine cannot mechanically distinguish "incoherent
> world" from "legal world my key cannot represent". Recorded-then-collapsed
> (§4.2 as originally written) silently loses records from world identity on
> legal worlds. A legal world must never fail to derive; therefore a collision
> can only be a key bug, and the only safe response is to refuse. This makes
> too-coarse keys crash on the first legal world that exposes them — detection
> by construction, not by test fixture.
>
> **▲2 — The declaration table IS the representation; `worldDiff`'s core
> accepts only representations.** Typed struct + table (§4.1 as originally
> written) still leaves two maintenance surfaces kept honest by a coverage
> test. The runtime representation is the table itself; typed access is via
> narrow accessors; and the invariant-bearing comparison takes
> `(representation, representation)` so raw `WorldState` is untypeable as diff
> input — gate 4's raw-read bypass becomes inexpressible rather than forbidden.
>
> **▲3 — Validation memoization is keyed by the COMPUTED canonical encoding of
> the canon, never the declared `hash` field.** A hand-built literal can declare
> any hash; two different canons declaring the same hash would share a memo
> entry and one receives the other's validation verdict. A cache keyed on
> untrusted input is a liability.

The review also **strengthened** the note's central claim beyond what §7 Q2
argued: with the representation as the keyed map, *no* key choice can break INV
at all — keys can only break **faithfulness** (a too-coarse key drops a record
from world identity, consistently on both sides, INV blind). The uniqueness
assertion therefore guards faithfulness, not agreement, and coverage/uniqueness
tests are regression tripwires rather than the safety mechanism.

The oracle design-review lane was unavailable (API credits), so §7 records the
four questions with the author's own answers. §7's answers are now superseded
by ▲1–▲3 and the review findings where they conflict.

---

## 1. The finding this design exists to answer

Four gate rounds, four rejections, each one level above the last:

| Gate | Finding | Level |
|------|---------|-------|
| 1 | `CanonicalEdge` omitted `group`; non-finite fact objects broke INV | field content |
| 2 | `computeWorkStatuses` compared with `!==` where the hash used the canonical encoding | value comparison |
| 3 | `semanticState` folded arrays; `worldDiff` compared sets/maps | collection comparison |
| 4 | projection folds the whole `FactView`; `factOverrides` compares 3 named fields | field enumeration *inside* the collection |

Gate 4's blocker 1 is the diagnostic one: **I introduced it while fixing gate 3.**
Changing the projection from "enumerate the semantic fields" to "copy the record
and subtract lineage" was right for the hash and made the diff strictly worse.
Pre-fix an unknown field was dropped from *both* views and the invariant held;
post-fix it enters the hash only.

That is not a sequence of careless sites. It is one structural fact:

> `stateHash` and `worldDiff` are two independently hand-written implementations
> of a single semantic comparison, and the invariant relating them is an external
> test rather than a property of the architecture.

`worldDiff` does call `semanticState`. That was necessary and insufficient: it
shares the *input* and then re-derives the *comparison* thirteen times by hand.
Sharing a helper while leaving independent field selection is the shape the
mission brief warns against, and it is exactly what is in the tree today.

---

## 2. Current dependency map (measured, HEAD `d22f353`)

```
WorldState  — carries semantic AND lineage AND diagnostic data intermixed
  judgments{forced,negated}  facts{source,overridden}  contradictions{source}
  rpId  interventions        statuses  workStatuses  edges
  temporalViolations  constraintViolations
        │
        │  semanticState()            src/derive/semantic.ts:194
        ▼
SemanticState
        │                                        │
        │ stateHash                              │ worldDiff(A,B)
        │ world-state.ts:473                     │ diff.ts:109
        ▼                                        ▼
hashState({canonId, canonHash,          13 hand-written comparisons
           semantic})                   + reachability read from RAW WorldState
```

Per dimension, what each side does — the divergences are the rows that do not
match:

| Dimension | `semanticState` produces | `stateHash` folds | `worldDiff` compares | Agree? |
|---|---|---|---|---|
| `statuses` | raw `Record` passthrough | whole record | key union, missing ⇒ `"UNKNOWN"`, `from !== to` | **NO** — absent vs present-`UNKNOWN` moves the hash, emits nothing |
| `facts` | dedupe by `id`, whole record minus `{source,overridden}` | whole record | present/absent by `id`; then `factOverrides` compares **only** `{object,validFrom,validTo}` | **NO** — gate 4 blocker 1 |
| `edges` | dedupe by `id`, whole record | whole record | present/absent by `id`; then whole-record `canonicalJson` | yes |
| `workStatuses` | raw `Record` passthrough | whole record | key union, missing ⇒ `"UNKNOWN"` | **NO** — same hole as `statuses` |
| `contradictions` | dedupe by **`id`**, whole record minus `{source}` | whole record | `contentSetDiff` on whole-record content | **NO** — projection coarser than the diff; gate 3's fix narrowed the projection and re-opened this from the other side |
| `temporalViolations` | dedupe by content | whole record | `contentSetDiff` on content | yes |
| `constraintViolations` | dedupe by content | whole record | `contentSetDiff` on content | yes |
| `reachabilityChanges` | — not in the representation — | not folded | computed from the **raw `WorldState`** | **NO** — bypasses the convergence point entirely |

Five of eight rows disagree. Every gate found one of them.

Three further sites feed the comparison and are not in the map above, which is
itself part of the problem — they are reachable, semantic, and outside the
projection:

- `overrideFact` (`world-state.ts:190`) mints fact ids via `cellKey`, whose
  injectivity rests on "NUL cannot appear in an id" — enforced nowhere (blocker 3).
- `dedupeBy` (`semantic.ts:161`) orders with `localeCompare` on both terms, which
  is not a total order, so a same-key survivor is input-order-dependent (blocker 2).
- `derive` never calls `inspectCanon`, so the reserved-namespace rule guards only
  the loader path while every seed canon and fixture is a literal (blocker 4).

---

## 3. The three layers, named

The mixing of these is the root of the divergence: each consumer drew the line
in a different place.

**A — Effective semantic state.** What the fictional world *means*. Statuses,
effective fact content with validity windows, the effective causal law
(including `group`), work classifications, contradiction content, temporal
violations, constraint violations. This is `stateHash`'s and `worldDiff`'s only
legitimate input.

**B — Lineage / provenance.** How the world was *produced*. `judgments.forced`
and `.negated`, `facts.source` and `.overridden`, `contradictions.source`,
`rpId`, `interventions`. `identityHash`'s domain. Must never reach A.

**C — Presentation / diagnostic.** How the engine *explains* what happened. The
typed `WorldDiff` shape, `factOverrides`' per-field breakdown, `edgeChanges`'
removed-then-added rendering of a replacement, typed projections
(`CharacterDiff` etc.), `DivergenceScore`. C is computed *from* A and may be
lossy; it may never be the thing A is compared by.

The current code puts the *comparison* in C. That is the inversion this design
corrects: comparison belongs to A, presentation to C.

---

## 4. Proposed architecture

```
WorldState
   │
   │ effectiveSemanticState()      ONE authoritative representation
   ▼
EffectiveSemanticState
   – a typed struct whose every field is a semantic DIMENSION
   – every dimension is a KeyedCollection: sorted [key, record] pairs,
     keys unique BY CONSTRUCTION (not deduped afterwards)
   – accompanied by DIMENSIONS, a declaration table naming each
     dimension and its identity key
   │                                          │
   │ stateHash                                │ semanticDelta(A, B)
   ▼                                          ▼
hash(canonId, canonHash,          generic keyed comparison, driven by
     representation)              DIMENSIONS — added / removed / changed
                                  per dimension, with per-field detail
                                  computed by walking the union of the
                                  two records' OWN keys
                                              │
                                              ▼
                                  WorldDiff — a typed PRESENTATION
                                  projection over the generic delta
```

### 4.1 The declaration table

```ts
interface SemanticDimension<T> {
  name: string;                  // dimension identity
  key: (record: T) => string;    // identity WITHIN the dimension
}
```

One declaration per dimension, consumed by both sides. The keys are the only
hand-written comparison surface that survives — §7 Q2 addresses whether that is
a real reduction.

### 4.2 Uniqueness by construction, not by repair

`dedupeBy` exists because arrays can carry multiplicity the diff cannot see.
A `KeyedCollection` cannot: it is built keyed. The multiset-vs-set class becomes
**inexpressible** rather than fixed, which is the standard this iteration is
held to.

Construction asserts key uniqueness. A collision is an incoherent world, and
per P-003's no-silent-repair discipline it is **recorded**, not quietly
collapsed and not thrown — see §7 Q3 for how that interacts with the canon
validation boundary.

### 4.3 Normalization: "no information" gets exactly one encoding

The `statuses` / `workStatuses` hole is absent-vs-present-`UNKNOWN`. Two ways to
close it: teach the diff to report key appearance, or normalize the
representation so `UNKNOWN` entries are simply absent.

**Choose normalization.** `UNKNOWN` means "the world says nothing about this
node"; an entry asserting nothing carries no semantic content, so absent and
`UNKNOWN` should be the *same* representation. This is smaller than a new diff
dimension, it closes the class rather than the instance (any future
default-valued field gets the same treatment), and it leaves the query surface
untouched — `statusOf(ws, id)` still answers `UNKNOWN` for an absent key,
because `WorldState` is not changed.

Consequence: `stateHash` moves for every world containing `UNKNOWN` nodes.
Acceptable — the composition has changed twice already this phase. Canon
document hashes must not move, and do not: `canonHash` is a separate layer.

### 4.4 Per-field detail becomes generic

`factOverrides`' three-field list is deleted. For a key present in both
collections whose canonical content differs, the engine walks the **union of the
two records' own keys** and emits one entry per differing field, comparing with
`sameCanonicalValue`. No field list exists anywhere, so blocker 1 is
inexpressible.

`edgeChanges` keeps its removed-then-added rendering (gate 1 required both laws
to be legible) — but that is now a *presentation* choice in C over a generic
"changed" delta, not a comparison rule.

### 4.5 Nothing outside the representation may enter the diff

`reachabilityChanges` currently reads the raw `WorldState`. Rule: **if a
dimension is semantic it is in the representation; if it is not in the
representation it cannot be in the diff.** Reachability is a *derived
projection of `statuses`* — it stays in the diff as presentation, computed from
the representation's statuses, never from the raw world.

### 4.6 Directedness is preserved

`semanticDelta(A, B)` is directed: keys only in B are added, keys only in A are
removed, `from`/`to` are ordered. `diff.hash` remains the identity of the
*directed* delta. Sharing one representation does not make the comparison
symmetric — it makes both endpoints canonical.

### 4.7 Guarantees the representation must carry

- **Immutable** — frozen at construction; consumers cannot mutate a shared view.
- **Canonical** — one encoding per semantic state: sorted keys, normalized
  "no information", lineage subtracted, non-finite numbers tokenized.
- **Totally ordered** — ordering by UTF-16 code unit (`<`/`>`), never
  `localeCompare`. Blocker 2's tie is unreachable once keys are unique, but the
  comparator must still be a total order or the *ordering* is unstable.
- **Structurally comparable** — the generic engine walks it without type
  knowledge.
- **Serializable and hashable** — through the single `canonicalJson` encoder.

### 4.8 Injective encoding without character assumptions

`cellKey` becomes `canonicalJson([subject, predicate])` — injective over
arbitrary strings via JSON escaping, with no undocumented character
restriction, reusing the one canonical encoder rather than inventing a second.
Blocker 3 closes structurally, and the encoding's soundness stops depending on
canon validation.

---

## 5. The invariant, rebuilt

Today: `worldDiff(A,B)` empty ⟺ `stateHash(A) === stateHash(B)` — a test of two
implementations.

After convergence, three properties, the middle one true *by construction*:

```
(1)  representation(A) === representation(B)   ⟺   semanticDelta(A,B) is empty
(2)  representation(A) === representation(B)   ⟺   canonicalJson equal
(3)  canonicalJson equal                      ⟹   stateHash equal
```

(1) holds because the delta is a generic function of the two representations
whose empty case is definitionally structural equality. (2) is canonicality.
(3) is the hash, modulo 32-bit collision — the one direction that remains
probabilistic, and the diff stays the more reliable witness there.

`worldDiff(A,B)` empty ⟺ `stateHash` equal then *follows* rather than being
asserted.

---

## 6. Predicted consequences

**Closed structurally (inexpressible, not merely absent):**
- blocker 1 — no field list exists
- blocker 2 — keys unique by construction; total-order comparator
- blocker 3 — injective encoding with no character assumption
- the `statuses`/`workStatuses` absent-vs-`UNKNOWN` hole
- the `contradictions` projection/diff key mismatch (one declared key, both sides)
- `reachabilityChanges`' raw-world read
- the multiset-vs-set class from gate 3

**Changed and needing new evidence:**
- `stateHash` composition moves (UNKNOWN normalization + keyed collections)
- minted fact ids change format again (`canonicalJson` pair encoding)
- `factOverrides` gains entries for `subject`/`predicate`/future fields
- every "N tests" and hash-value claim in the report needs re-measuring

**Not closed, and to be recorded honestly rather than claimed away:**
- the `key` declarations remain hand-written (§7 Q2)
- `canonicalJson` becomes load-bearing four ways: hash, keys, content
  comparison, injective encoding. Its own injectivity is now the single point of
  failure — see §7 Q4.
- 32-bit hash space, unchanged from P-001

---

## 7. The four questions, and my un-reviewed answers

These went to the oracle lane and could not be answered there. Recorded so a
reviewer attacks the reasoning, not just the code.

### Q1 — Is this the smallest architecture that closes the class?

**Rejected alternative:** derive `stateHash` *from* the diff (hash the delta
against a canonical empty world), making one direction true by construction.
Rejected because it inverts the dependency — world identity would be defined in
terms of a comparison — and makes the hash expensive and conceptually strange.

**Considered and folded in:** a single canonical tree with a generic tree-diff,
typed dimensions kept only as presentation. This is essentially the proposal;
the difference is that I keep a *typed struct* for the representation rather
than an untyped tree, because type safety at the dimension level is worth more
than the generality a tree buys, and a declaration table gives generic iteration
without giving up types.

**Answer (un-reviewed):** the proposal is the smaller of the two shapes I can
construct. The residual risk is that "typed struct + declaration table" still
permits the table and the struct to disagree — addressed by the coverage
property in Q2.

### Q2 — Does generic comparison close the class or relocate it?

Honest worry: a wrong `key` is still expressible, so the defect may have moved
from *comparison logic* to *key declaration*.

**Answer (un-reviewed): it is a real reduction, because the dangerous direction
becomes detectable.**

- A key that is **too coarse** (facts keyed by `subject`) makes two distinct
  records share a key. Construction's uniqueness assertion fires on any real
  world. **Detected.**
- A key that is **too fine** (keying by whole content where `id` was meant)
  makes a changed record render as removed+added. Both views still agree, so INV
  holds; the diff is merely less *explanatory*. **Degraded, not unsound.**

So the asymmetry is favourable: the direction that breaks the invariant is
caught by an assertion, the direction that survives only costs explanation.

Two properties make the table itself checkable, and both become tests:
1. **Coverage** — the declaration table names every field of
   `EffectiveSemanticState` exactly once. Adding a dimension without declaring
   it fails.
2. **Uniqueness** — for both seed canons and for a corpus of intervened worlds,
   every dimension's keys are unique. A too-coarse key fails.

### Q3 — The canon validation boundary (blocker 4)

Options: (a) `derive` validates and throws; (b) validate once, memoized by canon
hash; (c) a branded `ValidatedCanon` only the loader can produce.

**Answer (un-reviewed): (b), narrowed to exactly the invariants derivation
consumes.**

Reasoning. Canons are *authored artifacts*, mostly TypeScript literals, derived
from thousands of times in tests. (c) is structurally strongest and touches
every fixture and both seed canons — disproportionate. (a) pays full validation
on every call and changes the contract broadly.

But the brief's requirement is right: `inspectCanon` must not be a function
ordinary derivation forgets to call. The resolution is to separate two things
the current code conflates:

- **Encoding soundness** must not depend on validation at all. §4.8 removes that
  dependency: the injective encoding works for arbitrary strings.
- **Id-space freedom from collision** *is* something derivation relies on. So
  `derive` asserts precisely that — no duplicate canon ids, no canon id in the
  reserved minted namespace — memoized by `canon.hash`, O(n) against a fixpoint
  that costs far more. Full `inspectCanon` remains the authoring-time tool.

This makes the assumption structurally true *at the point of reliance*, which is
what the brief asks, without branding the type.

### Q4 — What will gate 5's finding be?

Assume the pattern continues. Most likely next level, in order:

1. **`canonicalJson`'s own injectivity.** It becomes load-bearing four ways.
   Known soft spots: `JSON.stringify` maps symbols and functions to the same
   token as `undefined` (outside the declared value type, but the type is
   `unknown` at the encoder boundary); and the encoder is now the definition of
   semantic equality, so any non-injectivity is an INV break by construction.
   **Close now:** make the encoder total and injective over its declared input
   domain, and reject or distinctly encode anything outside it.
2. **Presentation coverage.** A dimension in the representation with no
   `WorldDiff` field would move the hash and be unreportable. **Close now** via
   Q2's coverage test.
3. **Ordering comparators elsewhere.** Any surviving `localeCompare` in a
   semantic path has blocker 2's shape. **Close now:** sweep and convert.
4. **`WorldState` still mixes A/B/C.** The representation subtracts lineage, but
   the source struct keeps them adjacent, so the next field added to
   `WorldState` requires a human to classify it correctly. This is the honest
   residual and I do not propose to fix it in P-007 — it is a
   `WorldState`-decomposition change, and P-007 has already rejected four times.
   **Scope it, record it, recommend it for P-008.**

---

## 8. Verification plan

Existing: `npm run check`, `npm test`, `verify-facts`, both probe scripts,
frozen canon hashes `e4c79cec` / `51f32b2e` / `ef9cbe0c`, frozen tag
`5b41deda…` untouched.

New evidence this design must produce, parameterized over `{verrin, ordos}`:
- the three convergence properties of §5
- coverage and uniqueness of the declaration table (Q2)
- self-diff identity as a *structural consequence*, over ordinary, NaN, `-0`,
  nested-value, group, constraint, contradiction, temporal, multi-occurrence,
  branch and hand-built worlds
- convergent worlds: different histories, one semantic state ⇒ equal
  representation, equal `stateHash`, empty diff, differing `identityHash`
- the four gate-4 blockers, each reproduced and shown closed *through the
  architecture*
- an adversarial pass asking, per dimension: can a semantic field move
  `stateHash` without moving the diff, or vice versa?

## 9. Go / no-go

**Go, conditional on review of §7.** The architecture closes gates 1–4's class
by construction rather than by patch, and its residuals (§6, §7 Q4) are named
rather than discovered. The three answers most likely to be wrong are Q1's
rejection of the diff-derived hash, Q2's claim that key-declaration errors are
detectable, and Q3's choice of narrowed memoized validation over a branded type.

If review finds Q2 unsound — that a wrong key can break INV *undetected* — the
design fails its own standard and should not be built, because it would relocate
the class instead of closing it.
