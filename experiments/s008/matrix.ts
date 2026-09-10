/**
 * S008 — adversarial test matrix (Phases 5 & 6).
 *
 * Phase 5 exercises every semantic dimension the P-007 declaration table
 * represents, plus constraints, causal structure, temporal behaviour and the
 * S007 convergence patterns. Phase 6 checks that invalid interventions are
 * handled identically (legacy "rejects" == incremental "rejects"; in Somnium a
 * rejection is a recorded contradiction, and the semantic comparison covers it,
 * while a thrown error must match too).
 *
 * Every case is a differential check: derive(canon, H) vs incrementalDerive(canon, H).
 */
import type { Canon } from "../../src/canon/types";
import { ORDOS_IDS } from "../../src/canon/ordos";
import {
  type Intervention,
  setFact,
  negateEvent,
  forceEvent,
  retractFact,
  severEdge,
  addEdge,
  relocate,
} from "../../src/timeline/types";
import { checkHistory, type EquivalenceResult } from "./equivalence";

export interface MatrixCase {
  dimension: string;
  name: string;
  history: Intervention[];
}

/** Every single intervention over the canon's own elements. */
function singles(canon: Canon): MatrixCase[] {
  const out: MatrixCase[] = [];
  const events = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
  const ents = canon.entities.filter((e) => e.kind !== "Event" && e.kind !== "EventType").map((e) => e.id).sort();
  const locs = canon.entities.filter((e) => e.kind === "Location").map((e) => e.id).sort();
  const facts = [...canon.facts].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...canon.edges].sort((a, b) => a.id.localeCompare(b.id));

  for (const e of events) {
    out.push({ dimension: "causal", name: `negate:${e}`, history: [negateEvent(e, "m")] });
    out.push({ dimension: "causal", name: `force:${e}`, history: [forceEvent(e, "m")] });
  }
  for (const f of facts) {
    out.push({ dimension: "facts", name: `retract:${f.id}`, history: [retractFact(f.id, "m")] });
    out.push({
      dimension: "facts",
      name: `rewrite:${f.id}`,
      history: [setFact(f.subject, f.predicate, f.object === null ? "x" : null, "m")],
    });
  }
  for (const e of edges) {
    out.push({ dimension: "edges", name: `sever:${e.id}`, history: [severEdge(e.id, "m")] });
    out.push({ dimension: "edges", name: `readd:${e.id}`, history: [addEdge({ ...e }, "m")] });
  }
  for (const s of ents) {
    out.push({ dimension: "facts", name: `newcell:${s}`, history: [setFact(s, "s008_probe", true, "m")] });
    if (locs.length > 0) {
      out.push({ dimension: "facts", name: `relocate:${s}`, history: [relocate(s, locs[0]!, "m")] });
    }
  }
  return out;
}

/** Selected interacting pairs — where order dependence lives. */
function pairs(canon: Canon): MatrixCase[] {
  const out: MatrixCase[] = [];
  const events = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
  const facts = [...canon.facts].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...canon.edges].sort((a, b) => a.id.localeCompare(b.id));

  for (let i = 0; i < Math.min(events.length, 6); i++) {
    for (let j = 0; j < Math.min(events.length, 6); j++) {
      const a = events[i]!;
      const b = events[j]!;
      out.push({ dimension: "causal", name: `neg[${a}]+neg[${b}]`, history: [negateEvent(a, "m"), negateEvent(b, "m")] });
      out.push({ dimension: "causal", name: `force[${a}]+neg[${b}]`, history: [forceEvent(a, "m"), negateEvent(b, "m")] });
      out.push({ dimension: "causal", name: `neg[${a}]+force[${b}]`, history: [negateEvent(a, "m"), forceEvent(b, "m")] });
    }
  }
  for (let i = 0; i < Math.min(facts.length, 6); i++) {
    const f = facts[i]!;
    out.push({
      dimension: "facts",
      name: `retract+write[${f.id}]`,
      history: [retractFact(f.id, "m"), setFact(f.subject, f.predicate, "V", "m")],
    });
    out.push({
      dimension: "facts",
      name: `write+retract[${f.id}]`,
      history: [setFact(f.subject, f.predicate, "V", "m"), retractFact(f.id, "m")],
    });
    out.push({
      dimension: "facts",
      name: `write+retract+write[${f.id}]`,
      history: [setFact(f.subject, f.predicate, "V1", "m"), retractFact(f.id, "m"), setFact(f.subject, f.predicate, "V2", "m")],
    });
    out.push({
      dimension: "facts",
      name: `retract+write+retract[${f.id}]`,
      history: [retractFact(f.id, "m"), setFact(f.subject, f.predicate, "V", "m"), retractFact(f.id, "m")],
    });
  }
  for (let i = 0; i < Math.min(edges.length, 6); i++) {
    const e = edges[i]!;
    out.push({ dimension: "edges", name: `sever+add[${e.id}]`, history: [severEdge(e.id, "m"), addEdge({ ...e }, "m")] });
    out.push({ dimension: "edges", name: `add+sever[${e.id}]`, history: [addEdge({ ...e }, "m"), severEdge(e.id, "m")] });
  }
  return out;
}

/** Constraint, temporal and validity-window cases. */
function structures(canon: Canon, canonName: string): MatrixCase[] {
  const out: MatrixCase[] = [];
  const events = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
  const facts = [...canon.facts].sort((a, b) => a.id.localeCompare(b.id));

  // Constraint pressure: force many events of the same type (ordos AT_MOST_ONE).
  if (canon.constraints !== undefined && canon.constraints.length > 0) {
    const typeIds = [...new Set(canon.facts.filter((f) => f.predicate === "instance_of").map((f) => String(f.object)))].sort();
    for (const t of typeIds) {
      const instances = canon.facts
        .filter((f) => f.predicate === "instance_of" && String(f.object) === t)
        .map((f) => f.subject)
        .sort();
      if (instances.length >= 2) {
        out.push({
          dimension: "constraints",
          name: `force-both-instances:${t}`,
          history: instances.map((e) => forceEvent(e, "m")),
        });
        out.push({
          dimension: "constraints",
          name: `force-one-instance:${t}`,
          history: [forceEvent(instances[0]!, "m")],
        });
        out.push({
          dimension: "constraints",
          name: `force-both-then-negate:${t}`,
          history: [...instances.map((e) => forceEvent(e, "m")), negateEvent(instances[0]!, "m")],
        });
      }
    }
  }

  // Temporal: PRECEDES cycles.
  const precedes = canon.edges.filter((e) => e.kind === "PRECEDES");
  if (precedes.length >= 2) {
    const targets = [...new Set(precedes.flatMap((e) => [e.from, e.to]))].sort();
    out.push({ dimension: "temporal", name: "force-precedes-endpoints", history: targets.map((e) => forceEvent(e, "m")) });
  }

  // Validity windows: retract a fact whose validFrom is an event, then force it.
  for (const f of facts.slice(0, 6)) {
    if (f.validFrom !== null) {
      out.push({
        dimension: "temporal",
        name: `force-validFrom+retract:${f.id}`,
        history: [forceEvent(f.validFrom, "m"), retractFact(f.id, "m")],
      });
    }
    if (f.validTo !== null) {
      out.push({
        dimension: "temporal",
        name: `force-validTo+write:${f.id}`,
        history: [forceEvent(f.validTo, "m"), setFact(f.subject, f.predicate, "V", "m")],
      });
    }
  }

  // Invalid input (Phase 6): illegal fact writes — undeclared subject, bad object.
  out.push({ dimension: "invalid", name: "illegal-subject", history: [setFact("nope/not-an-entity", "x", true, "m")] });
  out.push({
    dimension: "invalid",
    name: "illegal-object-id-shaped",
    history: [setFact(canon.facts[0]!.subject, canon.facts[0]!.predicate, "not/a/declared/thing", "m")],
  });
  out.push({ dimension: "invalid", name: "illegal-then-legal", history: [
    setFact("nope/not-an-entity", "x", true, "m"),
    setFact(canon.facts[0]!.subject, canon.facts[0]!.predicate, canon.facts[0]!.object, "m"),
  ] });
  out.push({ dimension: "invalid", name: "legal-then-illegal", history: [
    setFact(canon.facts[0]!.subject, canon.facts[0]!.predicate, canon.facts[0]!.object, "m"),
    setFact("nope/not-an-entity", "x", true, "m"),
  ] });
  out.push({ dimension: "invalid", name: "force-undeclared", history: [forceEvent("nope/undeclared-event", "m")] });

  // S007 convergence patterns at the matrix level.
  if (facts.length > 0) {
    const f = facts[0]!;
    out.push({
      dimension: "convergence",
      name: "idempotent-1-vs-8",
      history: [setFact(f.subject, f.predicate, f.object, "m"), ...Array.from({ length: 7 }, () => setFact(f.subject, f.predicate, f.object, "m"))],
    });
    out.push({
      dimension: "convergence",
      name: "commutative-pair",
      history: [setFact(f.subject, "s008_c1", 1, "m"), setFact(f.subject, "s008_c2", 2, "m")],
    });
  }
  if (events.length >= 2) {
    out.push({
      dimension: "convergence",
      name: "redundant-negate",
      history: Array.from({ length: 6 }, () => negateEvent(events[0]!, "m")),
    });
  }
  void canonName;
  return out;
}

export function matrixCases(canon: Canon, canonName: string): MatrixCase[] {
  return [...singles(canon), ...pairs(canon), ...structures(canon, canonName)];
}

export function runMatrix(canon: Canon, canonName: string): { cases: MatrixCase[]; results: EquivalenceResult[] } {
  const cases = matrixCases(canon, canonName);
  const results = cases.map((c) => ({ ...checkHistory(canon, canonName, c.name, c.history), note: `${c.dimension}` }));
  return { cases, results };
}

/** Convenience: the ordos ids, re-exported so a caller need not import canon. */
export { ORDOS_IDS };
