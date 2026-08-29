/**
 * Somnium Engine — canon loader + validator.
 *
 * A canon is an immutable, content-hashed constraint document. `loadCanon`
 * performs structural validation and computes the content hash via `hashCanon`
 * (the single source of truth in ./hash.ts — never reimplemented). The input's
 * own `hash` field, if any, is never trusted: it is always recomputed.
 *
 * `validateCanon` performs semantic validation:
 *   - global id uniqueness (entities, facts, edges, work bindings)
 *   - referential integrity (fact subjects/validity windows, edge endpoints,
 *     work binding event lists)
 *   - acyclicity of REQUIRES and of PRECEDES (each must form a DAG; the cycle
 *     path is reported in the error string)
 */
import { hashCanon } from "./hash";
import type { Canon, CausalEdge, EdgeKind, Entity, EntityKind, Fact, WorkBinding } from "./types";

const ENTITY_KINDS: ReadonlySet<string> = new Set([
  "Character",
  "Location",
  "Faction",
  "Institution",
  "Event",
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
 * Validate the structure of `raw` (throwing on malformed shape or semantic
 * errors) and return a canon with its content hash recomputed via `hashCanon`.
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

/** Semantic validation. Returns an empty array when the canon is sound. */
export function validateCanon(canon: Canon): string[] {
  const errors: string[] = [];

  /* --- id uniqueness across every id-bearing node ---------------------- */
  const declared = new Map<string, string>();
  const register = (id: string, where: string): void => {
    const prior = declared.get(id);
    if (prior !== undefined) {
      errors.push(`duplicate id "${id}" (declared as ${prior} and as ${where})`);
    } else {
      declared.set(id, where);
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

  /* --- fact references ------------------------------------------------- */
  for (const f of canon.facts) {
    if (!entityIds.has(f.subject)) {
      errors.push(`fact ${f.id}: subject "${f.subject}" is not a known entity`);
    }
    if (f.validFrom !== null && !eventIds.has(f.validFrom)) {
      errors.push(`fact ${f.id}: validFrom "${f.validFrom}" is not a known event`);
    }
    if (f.validTo !== null && !eventIds.has(f.validTo)) {
      errors.push(`fact ${f.id}: validTo "${f.validTo}" is not a known event`);
    }
  }

  /* --- edge references ------------------------------------------------- */
  const knownEndpoints = new Set([...entityIds, ...factIds]);
  for (const ed of canon.edges) {
    if (!knownEndpoints.has(ed.from)) {
      errors.push(`edge ${ed.id}: from "${ed.from}" is not a known entity or fact`);
    }
    if (!knownEndpoints.has(ed.to)) {
      errors.push(`edge ${ed.id}: to "${ed.to}" is not a known entity or fact`);
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
        errors.push(`workBinding "${wb.workId}": event "${ev}" is not a known event`);
      }
    }
    for (const ev of findDuplicates(wb.events)) {
      errors.push(`workBinding "${wb.workId}": duplicate event "${ev}" in binding`);
    }
  }

  /* --- REQUIRES and PRECEDES must each form a DAG ----------------------- */
  const requiresCycle = findCycle(buildAdjacency(canon.edges, "REQUIRES"));
  if (requiresCycle !== null) {
    errors.push(`REQUIRES cycle: ${requiresCycle.join(" -> ")}`);
  }
  const precedesCycle = findCycle(buildAdjacency(canon.edges, "PRECEDES"));
  if (precedesCycle !== null) {
    errors.push(`PRECEDES cycle: ${precedesCycle.join(" -> ")}`);
  }

  return errors;
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
  return { workId, events };
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
