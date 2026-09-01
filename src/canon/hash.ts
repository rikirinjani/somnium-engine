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

/** Deterministic serialization: object keys recursively sorted. */
export function canonicalJson(value: unknown): string {
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
