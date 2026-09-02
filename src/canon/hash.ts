/**
 * Somnium Engine — content hashing (FNV-1a over sorted-key JSON).
 * Carried from KE's `hash.ts` pattern: key-sorted serialization makes hashing
 * stable regardless of insertion order. Used for canon integrity, rewind-point
 * derivedHash, diff hashes and WorldState memoization keys.
 */

function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic serialization: object keys recursively sorted.
 *
 * INJECTIVITY (P-007 gate 1, blocker 2). `JSON.stringify` maps `NaN`,
 * `Infinity` and `-Infinity` all to the literal `null`, so three distinct
 * values and an actual `null` collided into one encoding. Anything built on
 * this function then inherited the collision: `stateHash` could not tell
 * `object: NaN` from `object: null`, while the diff's `!==` comparison said
 * NaN differs from itself — so an empty diff and hash equality disagreed, and
 * `worldDiff(W, W)` stopped being the identity.
 *
 * Non-finite numbers are therefore encoded as UNQUOTED tokens. A string always
 * emerges JSON-quoted (`"@NaN"`), a finite number always as digits, null as
 * `null` — so an unquoted `@NaN` cannot be produced by any other value, and no
 * existing encoding changes (frozen canon hashes are unaffected).
 */
export function canonicalJson(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    if (Number.isNaN(value)) return "@NaN";
    return value > 0 ? "@Infinity" : "@-Infinity";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

/**
 * Value equality AS THE HASH SEES IT (P-007). Two values are the same value iff
 * `canonicalJson` gives them the same encoding.
 *
 * Any comparison that feeds a diff dimension must use this rather than `!==`,
 * or the diff and the hash can disagree — which is precisely the invariant
 * `worldDiff` exists to uphold:
 *
 *   worldDiff(A, B) empty  ⟺  stateHash(A) === stateHash(B)
 *
 * The two places `===` gets this wrong:
 *   - `NaN !== NaN` is true, but both encode as `@NaN` — so `===` reports a
 *     difference the hash cannot see;
 *   - `-0 === 0` is true and both encode as `0`, so here `===` is already
 *     right and `Object.is` would be WRONG (it separates them).
 */
export function sameCanonicalValue(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) {
    return true;
  }
  if (a === b) return true;
  // Structural fallback for the non-scalar case; scalars are settled above.
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    return canonicalJson(a) === canonicalJson(b);
  }
  return false;
}

/** FNV-1a 32-bit hash, hex-encoded (8 chars). */
export function fnv1a(value: string): string {
  return fnv1a32(value).toString(16).padStart(8, "0");
}

/** Hash of an arbitrary object (sorted-key serialized). */
export function hashState(value: unknown): string {
  return fnv1a(canonicalJson(value));
}

/** Hash of a canon document (excluding its own hash field). */
export function hashCanon(canon: {
  canonId: string;
  version: string;
  entities: unknown;
  facts: unknown;
  edges: unknown;
  workBindings: unknown;
  constraints?: unknown;
}): string {
  const base: Record<string, unknown> = {
    canonId: canon.canonId,
    version: canon.version,
    entities: canon.entities,
    facts: canon.facts,
    edges: canon.edges,
    workBindings: canon.workBindings,
  };
  // P-006: constraints are part of the canon document. Absent key => absent
  // from the hash, so a canon that never declares constraints is bit-for-bit
  // identical to pre-P-006.
  if (canon.constraints !== undefined) base.constraints = canon.constraints;
  return hashState(base);
}

/**
 * Hash of a Rewind Point's derived baseline world at its cut.
 * Single source of truth: both canon seeding (verrin.ts) and validation
 * (rewind-point.ts) must use this exact formula so derivedHash always matches.
 */
export function computeRewindHash(canonId: string, anchorEvent: string, cut: string[], canonHash: string): string {
  return hashState({
    canonId,
    anchorEvent,
    cut: [...cut].sort(),
    canonHash,
  });
}
