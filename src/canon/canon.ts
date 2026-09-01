/**
 * Somnium Engine — canon loader + validator.
 *
 * A canon is an immutable, content-hashed constraint document. `loadCanon`
 * performs structural validation and computes the content hash via `hashCanon`
 * (the single source of truth in ./hash.ts — never reimplemented). The input's
 * own `hash` field, if any, is never trusted: it is always recomputed.
 *
 * ERRORS vs NOTICES (P-004). The P-001 validator treated three things as fatal
 * that P-003 then made first-class engine features:
 *
 *   - a reference to an undeclared id (the case-K mechanism: absence of
 *     knowledge must never become falsehood);
 *   - a REQUIRES cycle (well-founded semantics rejects an unfounded set as
 *     unsupported — a deliberate, tested outcome);
 *   - a PRECEDES cycle (reported as a `temporalViolation` when it occurs among
 *     occurring events — again deliberate and tested).
 *
 * The validator had learned Verrin's shape — complete and acyclic — while the
 * engine had moved on. The adversarial canon that P-003 ships as a test fixture
 * derives a perfectly usable world and yet `validateCanon` called it invalid on
 * seven counts. Nothing caught this because nothing ever validated that canon.
 *
 * So validation now separates:
 *   - **errors**   — the canon is genuinely broken and cannot be trusted
 *                    (duplicate ids, a subject that is not an entity, a
 *                    work binding pointing at a non-Work, an object that looks
 *                    like a typo'd id, an UNDECLARED dangling reference).
 *   - **notices**  — the canon is deliberately incomplete or cyclic in a way the
 *                    engine handles by design (declared unspecified ids, and the
 *                    two cycle kinds). Informational, never fatal.
 *
 * A canon declares its intentional gaps in `Canon.unspecified`. Structurally a
 * deliberate unknown and a typo are the same thing — a reference to an id that
 * does not exist — so the canon must say which it means. That is what lets the
 * validator enforce referential integrity without outlawing incompleteness.
 *
 * `validateCanon` returns only the errors, so every existing caller keeps its
 * meaning. `inspectCanon` returns both.
 */
import { hashCanon } from "./hash";
import { buildFactVocabulary, factAssertionError } from "./fact-rules";
import type { Canon, CausalEdge, EdgeKind, Entity, EntityKind, Fact, WorkBinding } from "./types";

const ENTITY_KINDS: ReadonlySet<string> = new Set([
  "Character",
  "Location",
  "Faction",
  "Institution",
  "Object", // P-004: artifacts/relics/regalia — in the core because it is
  // ubiquitous across fictional canons, not an Ordos peculiarity.
  "Event",
  "EventType", // P-005: the KIND of a happening, as distinct from an Event,
  // which has always been a single occurrence. Not a causal node.
  "Work",
]);

const EDGE_KINDS: ReadonlySet<string> = new Set([
  "REQUIRES",
  "ENABLES",
  "MOTIVATES",
  "PRECEDES",
  "EXCLUDES",
  "INVARIANT",
]);

/* -------------------------------------------------------------------------- */
/* loader                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Validate the structure of `raw` (throwing on malformed shape or fatal
 * semantic errors) and return a canon with its content hash recomputed via
 * `hashCanon`. Notices (deliberate incompleteness, cycles the engine handles by
 * design) are NOT fatal — use `inspectCanon` to read them.
 */
export function loadCanon(raw: unknown): Canon {
  const record = asRecord(raw, "canon");
  const canonId = requireString(record.canonId, "canonId");
  const version = requireString(record.version, "version");
  const entities = requireArray(record.entities, "entities").map((v, i) => parseEntity(v, i));
  const facts = requireArray(record.facts, "facts").map((v, i) => parseFact(v, i));
  const edges = requireArray(record.edges, "edges").map((v, i) => parseEdge(v, i));
  const workBindings = requireArray(record.workBindings, "workBindings").map((v, i) => parseWorkBinding(v, i));

  const canon: Canon = { canonId, version, entities, facts, edges, workBindings, hash: "" };
  // P-004: declared intentional gaps. Absent key => absent from the canon AND
  // from the content hash, so pre-P-004 canons hash bit-for-bit identically.
  if (record.unspecified !== undefined) {
    canon.unspecified = requireArray(record.unspecified, "unspecified").map((v, i) =>
      requireString(v, `unspecified[${i}]`)
    );
  }

  const problems = validateCanon(canon);
  if (problems.length > 0) {
    throw new Error(`invalid canon "${canonId}": ${problems.join("; ")}`);
  }

  canon.hash = hashCanon(canon);
  return canon;
}

/* -------------------------------------------------------------------------- */
/* validator                                                                 */
/* -------------------------------------------------------------------------- */

/** What validation found: fatal problems, and deliberate-by-design observations. */
export interface CanonInspection {
  /** The canon is genuinely broken; do not trust a world derived from it. */
  errors: string[];
  /** Deliberate incompleteness or cycles the engine handles by design. */
  notices: string[];
}

/**
 * Full validation. Separates fatal errors from notices about structures the
 * engine handles deliberately (see the module header).
 */
export function inspectCanon(canon: Canon): CanonInspection {
  const errors: string[] = [];
  const notices: string[] = [];

  /* --- id uniqueness across every id-bearing node ---------------------- */
  const declaredAs = new Map<string, string>();
  const register = (id: string, where: string): void => {
    const prior = declaredAs.get(id);
    if (prior !== undefined) {
      errors.push(`duplicate id "${id}" (declared as ${prior} and as ${where})`);
    } else {
      declaredAs.set(id, where);
    }
  };
  for (const e of canon.entities) register(e.id, `entity (kind ${e.kind})`);
  for (const f of canon.facts) register(f.id, "fact");
  for (const ed of canon.edges) register(ed.id, "edge");
  // NOTE: workBinding.workId is intentionally NOT a global id declaration —
  // it references the Work entity of the same id (kind "Work" + binding).
  for (const dup of findDuplicates(canon.workBindings.map((w) => w.workId))) {
    errors.push(`duplicate work binding "${dup}" (more than one binding for the same work)`);
  }

  const entityIds = new Set(canon.entities.map((e) => e.id));
  const eventIds = new Set(canon.entities.filter((e) => e.kind === "Event").map((e) => e.id));
  const factIds = new Set(canon.facts.map((f) => f.id));

  /**
   * Ids the canon declares as intentionally undeclared. A reference to one of
   * these is a NOTICE (the case-K mechanism); a reference to anything else
   * unknown is an ERROR (a typo).
   */
  const unspecified = new Set(canon.unspecified ?? []);
  for (const id of unspecified) {
    if (entityIds.has(id) || factIds.has(id)) {
      errors.push(`unspecified id "${id}" is also declared — it cannot be both`);
    }
  }

  /** Route a dangling reference to errors or notices per the canon's intent. */
  const reference = (id: string, message: string): void => {
    if (unspecified.has(id)) {
      notices.push(`${message} — declared unspecified, so it stays UNKNOWN by design`);
    } else {
      errors.push(message);
    }
  };

  /* --- fact references ------------------------------------------------- */
  //
  // Subject and object legality come from `factAssertionError` in
  // ./fact-rules.ts — the SAME function the intervention path uses. That shared
  // call is what makes the invariant differential and checkable:
  //
  //   > An intervention may assert no more than canon may.
  //
  // Before P-005/ncr-004 these were two independent implementations, and they
  // diverged in both directions: the intervention path allowed a canon FACT id
  // as a subject (which canon forbids), and canon's object check was
  // convention-based (`includes("/")`) so a slash-free phantom slipped past both.
  //
  // The ONE remaining difference is deliberate and one-directional: canon may
  // DOWNGRADE an unresolved-object error to a notice when the id is declared in
  // `canon.unspecified`, because a canon can declare intent and an intervention
  // cannot. That makes the intervention path strictly no MORE permissive than
  // canon, which is the direction that matters.
  const factVocabulary = buildFactVocabulary(canon);
  for (const f of canon.facts) {
    const assertionError = factAssertionError(f.subject, f.predicate, f.object, factVocabulary);
    if (assertionError !== null) {
      const message = `fact ${f.id}: ${assertionError.detail}`;
      // Only an unresolved id reference may be excused by `unspecified`; a bad
      // subject or a mistyped `instance_of` is always an error.
      if (assertionError.reason === "object-unresolved-id") {
        reference(assertionError.offender, message);
      } else {
        errors.push(message);
      }
    }
    if (f.validFrom !== null && !eventIds.has(f.validFrom)) {
      reference(f.validFrom, `fact ${f.id}: validFrom "${f.validFrom}" is not a known event`);
    }
    if (f.validTo !== null && !eventIds.has(f.validTo)) {
      reference(f.validTo, `fact ${f.id}: validTo "${f.validTo}" is not a known event`);
    }
  }

  /* --- edge references ------------------------------------------------- */
  const knownEndpoints = new Set([...entityIds, ...factIds]);
  for (const ed of canon.edges) {
    if (!knownEndpoints.has(ed.from)) {
      reference(ed.from, `edge ${ed.id}: from "${ed.from}" is not a known entity or fact`);
    }
    if (!knownEndpoints.has(ed.to)) {
      reference(ed.to, `edge ${ed.id}: to "${ed.to}" is not a known entity or fact`);
    }
  }

  /* --- work binding references ----------------------------------------- */
  const workEntityIds = new Set(canon.entities.filter((e) => e.kind === "Work").map((e) => e.id));
  for (const wb of canon.workBindings) {
    if (!workEntityIds.has(wb.workId)) {
      errors.push(`workBinding "${wb.workId}": workId is not a known Work entity`);
    }
    for (const ev of wb.events) {
      if (!eventIds.has(ev)) {
        reference(ev, `workBinding "${wb.workId}": event "${ev}" is not a known event`);
      }
    }
    for (const ev of findDuplicates(wb.events)) {
      errors.push(`workBinding "${wb.workId}": duplicate event "${ev}" in binding`);
    }
    for (const fid of wb.facts ?? []) {
      if (!factIds.has(fid)) {
        errors.push(`workBinding "${wb.workId}": fact "${fid}" is not a known fact`);
      }
    }
  }

  /* --- cycles: NOTICES, not errors ------------------------------------- */
  // P-003 made both of these first-class engine behaviours, so a canon
  // containing one is not broken:
  //   REQUIRES cycle  -> an unfounded set; well-founded semantics rejects it as
  //                      UNSUPPORTED unless some group reaches outside the cycle.
  //   PRECEDES cycle  -> a temporalViolation when it occurs among occurring
  //                      events; the events themselves stay ESTABLISHED.
  const requiresCycle = findCycle(buildAdjacency(canon.edges, "REQUIRES"));
  if (requiresCycle !== null) {
    notices.push(
      `REQUIRES cycle: ${requiresCycle.join(" -> ")} — unfounded unless externally grounded (well-founded semantics)`
    );
  }
  const precedesCycle = findCycle(buildAdjacency(canon.edges, "PRECEDES"));
  if (precedesCycle !== null) {
    notices.push(
      `PRECEDES cycle: ${precedesCycle.join(" -> ")} — reported as a temporalViolation when these events occur`
    );
  }

  return { errors, notices };
}

/**
 * Fatal problems only. Returns an empty array when the canon can be trusted.
 * Every pre-P-004 caller keeps its exact meaning; deliberate incompleteness and
 * engine-handled cycles now surface through `inspectCanon().notices` instead.
 */
export function validateCanon(canon: Canon): string[] {
  return inspectCanon(canon).errors;
}

/* -------------------------------------------------------------------------- */
/* structural parsers (used by loadCanon)                                     */
/* -------------------------------------------------------------------------- */

function parseEntity(value: unknown, index: number): Entity {
  const r = asRecord(value, `entities[${index}]`);
  const id = requireString(r.id, `entities[${index}].id`);
  const kindRaw = requireString(r.kind, `entities[${index}].kind`);
  if (!ENTITY_KINDS.has(kindRaw)) {
    throw new TypeError(`entities[${index}].kind "${kindRaw}" is not one of ${[...ENTITY_KINDS].join(", ")}`);
  }
  const name = requireString(r.name, `entities[${index}].name`);
  const entity: Entity = { id, kind: kindRaw as EntityKind, name };
  if (r.description !== undefined) {
    entity.description = requireString(r.description, `entities[${index}].description`);
  }
  return entity;
}

function parseFact(value: unknown, index: number): Fact {
  const r = asRecord(value, `facts[${index}]`);
  const id = requireString(r.id, `facts[${index}].id`);
  const subject = requireString(r.subject, `facts[${index}].subject`);
  const predicate = requireString(r.predicate, `facts[${index}].predicate`);
  const object = requireScalar(r.object, `facts[${index}].object`);
  const validFrom = r.validFrom === null ? null : requireString(r.validFrom, `facts[${index}].validFrom`);
  const validTo = r.validTo === null ? null : requireString(r.validTo, `facts[${index}].validTo`);
  if (r.source !== "canon" && r.source !== "derived") {
    throw new TypeError(`facts[${index}].source must be "canon" or "derived"`);
  }
  return { id, subject, predicate, object, validFrom, validTo, source: r.source };
}

function parseEdge(value: unknown, index: number): CausalEdge {
  const r = asRecord(value, `edges[${index}]`);
  const id = requireString(r.id, `edges[${index}].id`);
  const kindRaw = requireString(r.kind, `edges[${index}].kind`);
  if (!EDGE_KINDS.has(kindRaw)) {
    throw new TypeError(`edges[${index}].kind "${kindRaw}" is not one of ${[...EDGE_KINDS].join(", ")}`);
  }
  const from = requireString(r.from, `edges[${index}].from`);
  const to = requireString(r.to, `edges[${index}].to`);
  const edge: CausalEdge = { id, kind: kindRaw as EdgeKind, from, to };
  if (r.note !== undefined) {
    edge.note = requireString(r.note, `edges[${index}].note`);
  }
  return edge;
}

function parseWorkBinding(value: unknown, index: number): WorkBinding {
  const r = asRecord(value, `workBindings[${index}]`);
  const workId = requireString(r.workId, `workBindings[${index}].workId`);
  const events = requireArray(r.events, `workBindings[${index}].events`).map((e, j) =>
    requireString(e, `workBindings[${index}].events[${j}]`)
  );
  const wb: WorkBinding = { workId, events };
  // P-004: optional fact-requirement list. Absent key => absent from the
  // binding AND from the content hash (backward compatible, pre-P-004 canons
  // hash bit-for-bit identically).
  if (r.facts !== undefined) {
    wb.facts = requireArray(r.facts, `workBindings[${index}].facts`).map((f, j) =>
      requireString(f, `workBindings[${index}].facts[${j}]`)
    );
  }
  return wb;
}

/* -------------------------------------------------------------------------- */
/* graph helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Adjacency (from -> [to...]) restricted to one edge kind. */
function buildAdjacency(edges: CausalEdge[], kind: EdgeKind): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const ed of edges) {
    if (ed.kind !== kind) continue;
    const nexts = adj.get(ed.from);
    if (nexts === undefined) adj.set(ed.from, [ed.to]);
    else nexts.push(ed.to);
  }
  return adj;
}

/**
 * DFS cycle detection (white/gray/black). Returns the offending cycle path
 * (with the closing node repeated) or null when the graph is a DAG.
 */
function findCycle(adj: Map<string, string[]>): string[] | null {
  const color = new Map<string, 0 | 1 | 2>(); // 0 white, 1 gray (on stack), 2 black
  const stack: string[] = [];

  const visit = (node: string): string[] | null => {
    const c = color.get(node);
    if (c === 1) {
      const start = stack.indexOf(node);
      return stack.slice(start).concat(node); // close the loop
    }
    if (c === 2) return null;
    color.set(node, 1);
    stack.push(node);
    for (const next of adj.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle !== null) return cycle;
    }
    stack.pop();
    color.set(node, 2);
    return null;
  };

  for (const node of adj.keys()) {
    const cycle = visit(node);
    if (cycle !== null) return cycle;
  }
  return null;
}

function findDuplicates(items: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const item of items) {
    if (seen.has(item)) dupes.add(item);
    seen.add(item);
  }
  return [...dupes];
}

/* -------------------------------------------------------------------------- */
/* scalar guards                                                              */
/* -------------------------------------------------------------------------- */

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function requireScalar(value: unknown, path: string): string | number | boolean | null {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  throw new TypeError(`${path} must be a string, number, boolean, or null`);
}
