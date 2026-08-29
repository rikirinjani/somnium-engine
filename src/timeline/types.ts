/**
 * Somnium Engine — timeline types: interventions, rewind points, universes.
 *
 * Interventions are a CLOSED, typed, enumerable vocabulary (not arbitrary
 * state patches). This is what makes deterministic propagation and future
 * minimum-intervention search possible.
 */
import type { CausalEdge } from "../canon/types";

export type InterventionKind =
  | "negateEvent" // do(X never happens)
  | "forceEvent" // do(X happens regardless of prerequisites)
  | "setFact" // override a fact's object
  | "retractFact" // remove a fact
  | "severEdge" // remove a causal edge
  | "addEdge" // add a causal edge
  | "relocate"; // shorthand: set located_in fact

export interface Intervention {
  id: string; // stable within a branch, e.g. "negateEvent:ev/blight-begins"
  kind: InterventionKind;
  target: string; // event id / fact id / edge id / entity id
  params?: Record<string, unknown>; // setFact: { predicate, object }; relocate: { to }
  label: string;
  rpId?: string; // originating rewind point
}

/**
 * A Rewind Point is a canonical cut over narrative time, NOT a tick.
 * cut = downward-closed set of event ids (under PRECEDES) that have already
 * occurred at the anchor moment. Facts whose validFrom lies inside the cut are
 * canonically fixed.
 */
export interface RewindPoint {
  id: string; // e.g. "RP-VERRIN-001"
  canonId: string;
  anchorEvent: string; // the canonical moment
  cut: string[]; // downward-closed event ids
  derivedHash: string; // hash of derived baseline world state at the cut
  label: string;
  tags: string[];
  created: string; // metadata only — never hashed
}

export interface Universe {
  id: string; // e.g. "U-BASELINE", "U-001"
  canonId: string;
  parent: string | null;
  rpId: string | null; // originating rewind point
  interventions: Intervention[]; // full ordered chain from baseline
  label: string;
}

export interface BranchRecord {
  childUniverseId: string;
  parentUniverseId: string;
  rpId: string;
  intervention: Intervention;
  diffHash: string; // hash of the WorldDiff parent -> child
}

/** Typed intervention constructors. Deterministic ids derived from content. */
export function negateEvent(target: string, label?: string): Intervention {
  return { id: `negateEvent:${target}`, kind: "negateEvent", target, label: label ?? `negate ${target}` };
}

export function forceEvent(target: string, label?: string): Intervention {
  return { id: `forceEvent:${target}`, kind: "forceEvent", target, label: label ?? `force ${target}` };
}

export function setFact(subject: string, predicate: string, object: string | number | boolean | null, label?: string): Intervention {
  return {
    id: `setFact:${subject}.${predicate}`,
    kind: "setFact",
    target: subject,
    params: { predicate, object },
    label: label ?? `set ${subject}.${predicate} = ${String(object)}`,
  };
}

export function retractFact(target: string, label?: string): Intervention {
  return { id: `retractFact:${target}`, kind: "retractFact", target, label: label ?? `retract ${target}` };
}

export function severEdge(target: string, label?: string): Intervention {
  return { id: `severEdge:${target}`, kind: "severEdge", target, label: label ?? `sever ${target}` };
}

export function addEdge(edge: CausalEdge, label?: string): Intervention {
  return { id: `addEdge:${edge.id}`, kind: "addEdge", target: edge.id, params: { edge }, label: label ?? `add ${edge.id}` };
}

export function relocate(subject: string, to: string, label?: string): Intervention {
  return {
    id: `relocate:${subject}`,
    kind: "relocate",
    target: subject,
    params: { to },
    label: label ?? `relocate ${subject} to ${to}`,
  };
}
