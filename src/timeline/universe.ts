/**
 * Somnium Engine — universe identity + genealogy.
 *
 * Universes form a tree rooted at U-BASELINE. A branch is O(1): it stores the
 * FULL ordered intervention chain from baseline (structural depth inheritance),
 * a parent pointer, and its originating rewind point — no mutated state.
 */
import type { Intervention, RewindPoint, Universe } from "./types";

/** Deterministic per-process ids: "U-BASELINE", then "U-001", "U-002", ... */
let universeCounter = 0;

function nextUniverseId(): string {
  if (universeCounter === 0) {
    universeCounter += 1;
    return "U-BASELINE";
  }
  const n = universeCounter;
  universeCounter += 1;
  return `U-${String(n).padStart(3, "0")}`;
}

/** Universe registry (module-level, like the id counter) so lineage walks resolve. */
const registry = new Map<string, Universe>();

function register(u: Universe): Universe {
  registry.set(u.id, u);
  return u;
}

export function createUniverse({ canonId, label }: { canonId: string; label: string }): Universe {
  return register({
    id: nextUniverseId(), // first call => "U-BASELINE"
    canonId,
    parent: null,
    rpId: null,
    interventions: [],
    label,
  });
}

export function branchUniverse(
  parent: Universe,
  rp: RewindPoint,
  interventions: Intervention[],
  label: string
): Universe {
  return register({
    id: nextUniverseId(),
    canonId: parent.canonId,
    parent: parent.id,
    rpId: rp.id,
    interventions: [...parent.interventions, ...interventions], // FULL CHAIN from baseline
    label,
  });
}

/** Ancestry, newest first: [u.id, parent.id, ..., "U-BASELINE"]. */
export function lineageOf(u: Universe): string[] {
  const lineage: string[] = [];
  let current: Universe | undefined = u;
  while (current !== undefined) {
    lineage.push(current.id);
    current = current.parent === null ? undefined : registry.get(current.parent);
  }
  return lineage;
}
