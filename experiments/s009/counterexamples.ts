/**
 * S009 — counterexample search.
 *
 * Targets every reduction rule with adversarial histories, including the
 * specific attack surface identified while formalizing R1: a cell holding MORE
 * THAN ONE effective fact (validity windows) with a retract between two writes.
 *
 * For each case: compare derive(H) vs derive(reduceChain(H)).
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon, Fact } from "../../src/canon/types";
import { derive, type WorldState } from "../../src/derive/world-state";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { canonicalJson } from "../../src/canon/hash";
import { worldDiff } from "../../src/diff/diff";
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
import { reduceChain, reduceChainDetailed } from "./reduction";

export interface CaseResult {
  name: string;
  rule: string;
  historyLen: number;
  reducedLen: number;
  semanticEqual: boolean;
  hashEqual: boolean;
  diffEmpty: boolean;
  legacyHash: string;
  reducedHash: string;
  ok: boolean;
  note?: string;
}

export function isEmptyDiff(d: ReturnType<typeof worldDiff>): boolean {
  return (
    d.statusChanges.length === 0 &&
    d.factAdditions.length === 0 &&
    d.factRemovals.length === 0 &&
    d.factOverrides.length === 0 &&
    d.edgeChanges.length === 0 &&
    d.contradictionsIntroduced.length === 0 &&
    d.contradictionsResolved.length === 0 &&
    d.constraintViolationsIntroduced.length === 0 &&
    d.constraintViolationsResolved.length === 0 &&
    d.temporalViolationsIntroduced.length === 0 &&
    d.temporalViolationsResolved.length === 0 &&
    d.reachabilityChanges.length === 0 &&
    d.workStatusChanges.length === 0
  );
}

function safeDerive(canon: Canon, h: Intervention[]): { ws: WorldState | null; err?: string } {
  try {
    return { ws: derive(canon, h) };
  } catch (err) {
    return { ws: null, err: err instanceof Error ? err.message : String(err) };
  }
}

export function checkCase(
  canon: Canon,
  name: string,
  rule: string,
  history: Intervention[],
  opts: { multiFactGuard?: boolean } = {}
): CaseResult {
  const reduced = reduceChain(canon, history, opts);
  const legacy = safeDerive(canon, history);
  const red = safeDerive(canon, reduced);
  if (legacy.ws === null || red.ws === null) {
    const bothThrew = legacy.ws === null && red.ws === null;
    return {
      name,
      rule,
      historyLen: history.length,
      reducedLen: reduced.length,
      semanticEqual: false,
      hashEqual: false,
      diffEmpty: false,
      legacyHash: "",
      reducedHash: "",
      ok: bothThrew,
      note: `legacy=${legacy.err ?? "ok"} reduced=${red.err ?? "ok"}`,
    };
  }
  const semanticEqual =
    canonicalJson(effectiveSemanticState(legacy.ws)) === canonicalJson(effectiveSemanticState(red.ws));
  const hashEqual = legacy.ws.stateHash === red.ws.stateHash;
  const diffEmpty = isEmptyDiff(worldDiff(legacy.ws, red.ws));
  return {
    name,
    rule,
    historyLen: history.length,
    reducedLen: reduced.length,
    semanticEqual,
    hashEqual,
    diffEmpty,
    legacyHash: legacy.ws.stateHash,
    reducedHash: red.ws.stateHash,
    ok: semanticEqual && hashEqual && diffEmpty,
  };
}

/* ------------------------------------------------------------------ */
/* multi-fact cell discovery                                           */
/* ------------------------------------------------------------------ */

export interface MultiFactCell {
  cell: string;
  subject: string;
  predicate: string;
  factIds: string[];
}

export function multiFactCells(canon: Canon): MultiFactCell[] {
  const byCell = new Map<string, Fact[]>();
  for (const f of canon.facts) {
    const key = `${f.subject}\u0000${f.predicate}`;
    const list = byCell.get(key) ?? [];
    list.push(f);
    byCell.set(key, list);
  }
  const out: MultiFactCell[] = [];
  for (const [key, facts] of byCell) {
    if (facts.length > 1) {
      const [subject, predicate] = key.split("\u0000");
      out.push({
        cell: `${subject}.${predicate}`,
        subject: subject!,
        predicate: predicate!,
        factIds: facts.map((f) => f.id).sort(),
      });
    }
  }
  return out.sort((a, b) => a.cell.localeCompare(b.cell));
}

/* ------------------------------------------------------------------ */
/* the attack suite                                                    */
/* ------------------------------------------------------------------ */

export interface Attack {
  name: string;
  rule: string;
  history: Intervention[];
}

export function attacks(canon: Canon): Attack[] {
  const out: Attack[] = [];
  const events = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
  const ents = canon.entities.filter((e) => e.kind !== "Event" && e.kind !== "EventType").map((e) => e.id).sort();
  const locs = canon.entities.filter((e) => e.kind === "Location").map((e) => e.id).sort();
  const facts = [...canon.facts].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...canon.edges].sort((a, b) => a.id.localeCompare(b.id));
  const e0 = events[0]!;
  const e1 = events[1] ?? events[0]!;
  const s0 = ents[0]!;
  const s1 = ents[1] ?? ents[0]!;

  // R1 — legal writes
  if (facts.length > 0) {
    const f = facts[0]!;
    const w = (v: string | number | boolean | null): Intervention => setFact(f.subject, f.predicate, v, "a");
    out.push({ name: "R1 write A then B", rule: "R1", history: [w("A"), w("B")] });
    out.push({ name: "R1 write B then A", rule: "R1", history: [w("B"), w("A")] });
    out.push({ name: "R1 write A→B→A", rule: "R1", history: [w("A"), w("B"), w("A")] });
  }

  // R2 — rejected writes
  const illegal = (s: string, p: string, v: unknown): Intervention => setFact(s, p, v as string, "a");
  if (facts.length > 0) {
    const f = facts[0]!;
    out.push({ name: "R2 rejected then rejected (same id)", rule: "R2", history: [illegal("nope/x", "p", "V1"), illegal("nope/x", "p", "V2")] });
    out.push({ name: "R2 rejected then legal (same cell)", rule: "R2", history: [illegal(f.subject, f.predicate, "BAD"), setFact(f.subject, f.predicate, f.object, "a")] });
    out.push({
      name: "R2 legal then rejected then legal",
      rule: "R2",
      history: [setFact(f.subject, f.predicate, "L1", "a"), illegal(f.subject, f.predicate, "BAD"), setFact(f.subject, f.predicate, "L2", "a")],
    });
    out.push({
      name: "R2 rejected(subject X) then rejected(subject X, other value)",
      rule: "R2",
      history: [illegal("nope/x", "p", "V1"), illegal("nope/x", "p", "V2")],
    });
  }

  // R3/R4 — negate / force
  out.push({ name: "R3 negate A then negate B", rule: "R3", history: [negateEvent(e0, "a"), negateEvent(e1, "a")] });
  out.push({ name: "R3 negate A→negate A", rule: "R3", history: [negateEvent(e0, "a"), negateEvent(e0, "a")] });
  out.push({ name: "R4 force A→force A", rule: "R4", history: [forceEvent(e0, "a"), forceEvent(e0, "a")] });
  out.push({ name: "R3/R4 negate then force same", rule: "R3/R4", history: [negateEvent(e0, "a"), forceEvent(e0, "a")] });
  out.push({ name: "R3/R4 force then negate same", rule: "R3/R4", history: [forceEvent(e0, "a"), negateEvent(e0, "a")] });
  out.push({
    name: "R3/R4 negate→force→negate",
    rule: "R3/R4",
    history: [negateEvent(e0, "a"), forceEvent(e0, "a"), negateEvent(e0, "a")],
  });

  // R5 — retract
  if (facts.length > 0) {
    const f = facts[0]!;
    out.push({ name: "R5 retract A then A", rule: "R5", history: [retractFact(f.id, "a"), retractFact(f.id, "a")] });
    out.push({ name: "R5 retract A then write A then retract A", rule: "R5", history: [retractFact(f.id, "a"), setFact(f.subject, f.predicate, "V", "a"), retractFact(f.id, "a")] });
    out.push({ name: "R5 write A then retract A", rule: "R5", history: [setFact(f.subject, f.predicate, "V", "a"), retractFact(f.id, "a")] });
    out.push({ name: "R5 write→retract→write", rule: "R5", history: [setFact(f.subject, f.predicate, "V1", "a"), retractFact(f.id, "a"), setFact(f.subject, f.predicate, "V2", "a")] });
  }

  // R6 — edges
  if (edges.length > 0) {
    const e = edges[0]!;
    out.push({ name: "R6 sever then sever", rule: "R6", history: [severEdge(e.id, "a"), severEdge(e.id, "a")] });
    out.push({ name: "R6 add then add", rule: "R6", history: [addEdge({ ...e }, "a"), addEdge({ ...e }, "a")] });
    out.push({ name: "R6 sever→add→sever", rule: "R6", history: [severEdge(e.id, "a"), addEdge({ ...e }, "a"), severEdge(e.id, "a")] });
    out.push({ name: "R6 add→sever→add", rule: "R6", history: [addEdge({ ...e }, "a"), severEdge(e.id, "a"), addEdge({ ...e }, "a")] });
  }

  // same semantic target via different syntactic representations
  if (ents.length > 0 && locs.length > 0) {
    out.push({
      name: "SYN relocate vs setFact(located_in)",
      rule: "SYN",
      history: [relocate(s0, locs[0]!, "a"), setFact(s0, "located_in", locs[0]!, "a")],
    });
    out.push({
      name: "SYN setFact then relocate same cell",
      rule: "SYN",
      history: [setFact(s0, "located_in", "X", "a"), relocate(s0, locs[0]!, "a")],
    });
  }

  // *** THE MULTI-FACT CELL ATTACK (R1) ***
  // For each cell holding >1 canon fact: write, retract the LAST fact, write.
  for (const mf of multiFactCells(canon)) {
    const last = mf.factIds[mf.factIds.length - 1]!;
    out.push({
      name: `R1-MULTIFACT write→retract(${last})→write [${mf.cell}]`,
      rule: "R1-multifact",
      history: [
        setFact(mf.subject, mf.predicate, "W1", "a"),
        retractFact(last, "a"),
        setFact(mf.subject, mf.predicate, "W2", "a"),
      ],
    });
    out.push({
      name: `R1-MULTIFACT retract(${last})→write [${mf.cell}]`,
      rule: "R1-multifact",
      history: [retractFact(last, "a"), setFact(mf.subject, mf.predicate, "W2", "a")],
    });
    out.push({
      name: `R1-MULTIFACT write→retract(${mf.factIds[0]})→write [${mf.cell}]`,
      rule: "R1-multifact",
      history: [
        setFact(mf.subject, mf.predicate, "W1", "a"),
        retractFact(mf.factIds[0]!, "a"),
        setFact(mf.subject, mf.predicate, "W2", "a"),
      ],
    });
  }

  void s1;
  return out;
}

export function runAttacks(canon: Canon, opts: { multiFactGuard?: boolean } = {}): CaseResult[] {
  return attacks(canon).map((a) => checkCase(canon, a.name, a.rule, a.history, opts));
}

export { reduceChain, reduceChainDetailed };
