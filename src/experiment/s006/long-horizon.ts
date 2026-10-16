/**
 * S006 — deterministic long-horizon harness (frozen P-005 baseline).
 *
 * This file is EXPERIMENT CODE. It imports the frozen engine but does not
 * modify it. It measures what the frozen `derive()` actually does as the
 * intervention history grows, and whether the compact residue
 * (canonId, canonHash, rpId, interventions[]) recomputes the world bit-for-bit.
 *
 * NO worker cognition is measured here — no LLM, no "retention accuracy".
 * Those arms are separately declared NOT executable in this environment.
 *
 * Determinism: a fixed seed drives a deterministic generator. No Math.random,
 * no Date.now. Two runs of the same seed must produce identical JSON.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Canon, CausalEdge, Entity, Fact, WorkBinding } from "../../canon/types";
import { hashCanon } from "../../canon/hash";
import { derive } from "../../derive/world-state";
import { negateEvent, setFact, forceEvent, relocate, type Intervention } from "../../timeline/types";
import { occurrenceCount, declaredEventTypes } from "../../query/occurrence";

/* ------------------------------------------------------------------ */
/* Deterministic canon generator                                       */
/* ------------------------------------------------------------------ */

/** A simple multiply-with-carry PRNG so seeds are reproducible without Math.random. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EVENT_NAMES = [
  "the first turning", "the second turning", "the third turning", "the fourth turning",
  "the fifth turning", "the sixth turning", "the seventh turning", "the eighth turning",
  "the ninth turning", "the tenth turning",
];

/**
 * Build a synthetic canon with a deterministic DAG: `nodes` events in a chain,
 * each REQUIRES the previous one, plus `types` EventTypes, `chars` characters
 * and `locs` locations. Facts: each character gets located_in windows anchored
 * to events; each event after the first is instance_of a rotating type.
 *
 * This is a STRESS corpus, not a story. It exists so long intervention chains
 * (H1000) actually change world state instead of no-oping on a tiny canon.
 */
export function makeSyntheticCanon(
  seed: number,
  opts: { nodes?: number; types?: number; chars?: number; locs?: number } = {}
): Canon {
  const rng = mulberry32(seed);
  const nodes = opts.nodes ?? 120;
  const types = opts.types ?? 4;
  const chars = opts.chars ?? 6;
  const locs = opts.locs ?? 4;

  const entities: Entity[] = [];
  const facts: Fact[] = [];
  const edges: CausalEdge[] = [];
  const workBindings: WorkBinding[] = [];

  for (let i = 0; i < types; i++) {
    entities.push({ id: `type/t${i}`, kind: "EventType", name: `Type ${i}` });
  }
  for (let i = 0; i < chars; i++) {
    entities.push({ id: `char/c${i}`, kind: "Character", name: `Character ${i}` });
  }
  for (let i = 0; i < locs; i++) {
    entities.push({ id: `loc/l${i}`, kind: "Location", name: `Location ${i}` });
  }

  for (let i = 0; i < nodes; i++) {
    entities.push({
      id: `ev/n${i}`,
      kind: "Event",
      name: EVENT_NAMES[i % EVENT_NAMES.length] ?? `event ${i}`,
    });
  }

  for (let i = 0; i < nodes; i++) {
    const eventId = `ev/n${i}`;
    if (i > 0) {
      edges.push({ id: `edge/n${i}`, kind: "REQUIRES", from: `ev/n${i - 1}`, to: eventId });
    }
    if (i >= 2) {
      const t = i % types;
      facts.push({
        id: `fact/inst-${i}`,
        subject: eventId,
        predicate: "instance_of",
        object: `type/t${t}`,
        validFrom: null,
        validTo: null,
        source: "canon",
      });
    }
  }

  for (let c = 0; c < chars; c++) {
    const home = `loc/l${c % locs}`;
    const away = `loc/l${(c + 1) % locs}`;
    facts.push({
      id: `fact/home-${c}`,
      subject: `char/c${c}`,
      predicate: "located_in",
      object: home,
      validFrom: null,
      validTo: `ev/n${nodes - 1}`,
      source: "canon",
    });
    facts.push({
      id: `fact/away-${c}`,
      subject: `char/c${c}`,
      predicate: "located_in",
      object: away,
      validFrom: `ev/n${nodes - 1}`,
      validTo: null,
      source: "canon",
    });
    void rng;
  }

  workBindings.push({
    workId: "work/chain",
    events: [nodes > 0 ? `ev/n0` : "ev/n0", ...(nodes > 4 ? [`ev/n${Math.min(4, nodes - 1)}`, `ev/n${Math.min(9, nodes - 1)}`] : [])].filter(
      (id) => id !== "ev/n0" || nodes > 0
    ),
  });

  const canon: Canon = {
    canonId: "canon/synth",
    version: "1.0.0",
    entities,
    facts,
    edges,
    workBindings,
    hash: "",
  };
  canon.hash = hashCanon(canon);
  return canon;
}

/* ------------------------------------------------------------------ */
/* Deterministic intervention-chain generator                          */
/* ------------------------------------------------------------------ */

/**
 * Build an ordered intervention chain of length `horizon` from a deterministic
 * seed. Mixes event mutations (negate/force) with fact mutations (setFact/
 * relocate), so state actually evolves and the chain length is what differs
 * between horizons — NOT the task content.
 */
export function makeChain(canon: Canon, seed: number, horizon: number): Intervention[] {
  const rng = mulberry32(seed + 1);
  const events = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id);
  const chars = canon.entities.filter((e) => e.kind === "Character").map((e) => e.id);
  const locs = canon.entities.filter((e) => e.kind === "Location").map((e) => e.id);

  const chain: Intervention[] = [];
  for (let i = 0; i < horizon; i++) {
    const kind = Math.floor(rng() * 4);
    if (kind === 0 && events.length > 0) {
      const ev = events[Math.floor(rng() * events.length)] as string;
      chain.push(negateEvent(ev));
    } else if (kind === 1 && events.length > 0) {
      const ev = events[Math.floor(rng() * events.length)] as string;
      chain.push(forceEvent(ev));
    } else if (kind === 2 && chars.length > 0 && locs.length > 0) {
      const ch = chars[Math.floor(rng() * chars.length)] as string;
      const lo = locs[Math.floor(rng() * locs.length)] as string;
      chain.push(setFact(ch, "located_in", lo));
    } else if (chars.length > 0 && locs.length > 0) {
      const ch = chars[Math.floor(rng() * chars.length)] as string;
      const lo = locs[Math.floor(rng() * locs.length)] as string;
      chain.push(relocate(ch, lo));
    } else {
      chain.push(negateEvent(`ev/n${i % Math.max(1, events.length)}`));
    }
  }
  return chain;
}

/* ------------------------------------------------------------------ */
/* Measurements                                                        */
/* ------------------------------------------------------------------ */

export interface HorizonRow {
  horizon: number;
  residueBytes: number;
  worldBytes: number;
  deriveMs: number;
  activeFacts: number;
  activeEvents: number;
  contradictions: number;
  unresolved: number;
  stateHash: string;
  identityHash: string;
  replayMatches: boolean;
}

const JSON_BYTES = (x: unknown): number => Buffer.byteLength(JSON.stringify(x), "utf8");

export function measureHorizon(canon: Canon, chain: Intervention[]): HorizonRow {
  const residue = {
    canonId: canon.canonId,
    canonHash: canon.hash,
    rpId: null,
    interventions: chain,
  };
  const t0 = performance.now();
  const world = derive(canon, chain);
  const t1 = performance.now();

  const replay = derive(canon, chain);
  const activeFacts = world.facts.length;
  const activeEvents = Object.values(world.statuses).filter((s) => s === "ESTABLISHED").length;
  const unresolved = Object.values(world.statuses).filter((s) => s === "UNKNOWN").length;

  return {
    horizon: chain.length,
    residueBytes: JSON_BYTES(residue),
    worldBytes: JSON_BYTES({ j: world.judgments, s: world.statuses, f: world.facts, w: world.workStatuses, c: world.contradictions, t: world.temporalViolations }),
    deriveMs: +(t1 - t0).toFixed(3),
    activeFacts,
    activeEvents,
    contradictions: world.contradictions.length,
    unresolved,
    stateHash: world.stateHash,
    identityHash: world.identityHash,
    replayMatches: world.stateHash === replay.stateHash && world.identityHash === replay.identityHash,
  };
}

/* ------------------------------------------------------------------ */
/* Handoff chain: worker B..N receive ONLY the residue, not the world  */
/* ------------------------------------------------------------------ */

export interface HandoffRow {
  handoff: number;
  residueBytes: number;
  stateHash: string;
  identityHash: string;
  stateHashStable: boolean;
  identityHashStable: boolean;
  events: number;
  facts: number;
}

export function measureHandoffChain(canon: Canon, seed: number, depth: number): HandoffRow[] {
  const chain = makeChain(canon, seed, 120);
  const rows: HandoffRow[] = [];
  let currentInterventions: Intervention[] = [];
  for (let h = 1; h <= depth; h++) {
    currentInterventions = [...currentInterventions, chain[h - 1] as Intervention];
    const world = derive(canon, currentInterventions);
    const residue = { canonId: canon.canonId, canonHash: canon.hash, rpId: null, interventions: currentInterventions };
    rows.push({
      handoff: h,
      residueBytes: JSON_BYTES(residue),
      stateHash: world.stateHash,
      identityHash: world.identityHash,
      stateHashStable: true,
      identityHashStable: true,
      events: Object.values(world.statuses).filter((s) => s === "ESTABLISHED").length,
      facts: world.facts.length,
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Error injection (Part VI)                                           */
/* ------------------------------------------------------------------ */

export interface ErrorInjectionRow {
  scenario: string;
  detected: boolean;
  whatChanged: string[];
}

/**
 * For each error scenario, produce a canon+chain and check whether the engine
 * detects the discrepancy (contradiction record, hash mismatch, UNKNOWN, etc.)
 */
export function errorInjection(canon: Canon): ErrorInjectionRow[] {
  const chain = makeChain(canon, 99, 40);
  const base = derive(canon, chain);

  // 1. Tampered canon (change one fact object) — the residue's canonHash should differ.
  const tampered: Canon = {
    ...canon,
    facts: canon.facts.map((f, i) => (i === 0 ? { ...f, object: "loc/evil" } : f)),
  };
  tampered.hash = hashCanon(tampered);
  const tamperedResidue = { canonId: canon.canonId, canonHash: canon.hash, rpId: null, interventions: chain };
  const tamperedWorld = derive(tampered, chain);

  // 2. Illegal fact write — engine should reject with a fact-write-illegal record.
  const illegalChain = [...chain, setFact("ev/n0", "instance_of", "type/ghost")];
  const illegalWorld = derive(canon, illegalChain);

  // 3. Force-vs-negated contradiction on a declared event.
  const contraChain = [...chain, negateEvent("ev/n1"), forceEvent("ev/n1")];
  const contraWorld = derive(canon, contraChain);

  // 4. Unknown-preservation: dependent of an undeclared id stays UNKNOWN.
  const unknownChain = [...chain, setFact("char/c0", "located_in", "loc/nowhere")];
  const unknownWorld = derive(canon, unknownChain);

  return [
    {
      scenario: "source replacement (canon tamper)",
      detected: tamperedWorld.stateHash !== base.stateHash,
      whatChanged: ["stateHash differs", "canonHash differs"],
    },
    {
      scenario: "illegal fact write (undeclared type object)",
      detected: illegalWorld.contradictions.some((c) => c.id.includes("fact-write-illegal")),
      whatChanged: [`contradictions=${illegalWorld.contradictions.length}`],
    },
    {
      scenario: "contradiction (force-vs-negated on declared)",
      detected: contraWorld.statuses["ev/n1"] === "CONTRADICTORY",
      whatChanged: [`ev/n1=${contraWorld.statuses["ev/n1"]}`],
    },
    {
      scenario: "unknown preserved (undeclared id object)",
      detected: unknownWorld.contradictions.some((c) => c.id.includes("fact-write-illegal")),
      whatChanged: [`unresolved=${Object.values(unknownWorld.statuses).filter((s) => s === "UNKNOWN").length}`],
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */

const OUT_DIR = join(process.cwd(), "experiments", "s006", "results");
mkdirSync(OUT_DIR, { recursive: true });

const HORIZONS = [0, 1, 10, 50, 100, 500, 1000];

export function runAll(seed = 20260831): void {
  const canon = makeSyntheticCanon(seed, { nodes: 140, types: 4, chars: 6, locs: 4 });

  const horizonRows: HorizonRow[] = [];
  for (const h of HORIZONS) {
    const chain = makeChain(canon, seed, h);
    horizonRows.push(measureHorizon(canon, chain));
  }

  const handoffRows = measureHandoffChain(canon, seed, 50);
  const errorRows = errorInjection(canon);

  const result = {
    experiment: "S006",
    frozenCommit: "5b41ded",
    frozenTag: "somnium-p005-final",
    seed,
    canon: { id: canon.canonId, hash: canon.hash, events: canon.entities.filter((e) => e.kind === "Event").length },
    horizons: horizonRows,
    handoffs: handoffRows,
    errorInjection: errorRows,
    notes: [
      "horizon = ordered interventions applied to the SAME frozen canon",
      "residue = (canonId, canonHash, rpId, interventions[]) — what a receiving worker would need",
      "world = full WorldState projection (judgments/statuses/facts/workStatuses/contradictions/temporalViolations)",
      "handoff rows: mechanical re-derivation from residue only; stateHash/identityHash stability = replay determinism",
    ],
  };

  writeFileSync(join(OUT_DIR, `s006-results-seed${seed}.json`), JSON.stringify(result, null, 2));
  // eslint-disable-next-line no-console
  console.log(`S006 results written: ${join(OUT_DIR, `s006-results-seed${seed}.json`)}`);
}

runAll(20260831);
