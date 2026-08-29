#!/usr/bin/env node
/**
 * Somnium Engine — minimal CLI.
 *
 *   npm run dev -- baseline
 *   npm run dev -- intervene negateEvent:ev/blight-begins
 *   npm run dev -- chain negateEvent:ev/blight-begins setFact:char/vara:located_in:loc/thornhollow
 *   npm run dev -- --help
 *
 * Deterministic output: all object keys are sorted recursively before printing.
 */
import { verrinCanon, verrinRewindPoint } from "../canon/verrin";
import { derive } from "../derive/world-state";
import { worldDiff } from "../diff/diff";
import type { Intervention } from "../timeline/types";
import { forceEvent, negateEvent, relocate, retractFact, setFact, severEdge } from "../timeline/types";

/** Recursively sort object keys so output is deterministic regardless of insertion order. */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, sorted(obj[k])]));
  }
  return value;
}

function print(value: unknown): void {
  console.log(JSON.stringify(sorted(value), null, 2));
}

function parseScalar(raw: string): string | number | boolean | null {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  const trimmed = raw.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return raw;
}

function part(parts: string[], index: number, spec: string, name: string): string {
  const v = parts[index];
  if (v === undefined || v === "") throw new Error(`invalid intervention "${spec}": missing ${name}`);
  return v;
}

/** Parse "<kind>:<target>" (optionally "<kind>:<arg>:<arg>:...") into an Intervention. */
function parseIntervention(spec: string): Intervention {
  const [kind, ...parts] = spec.split(":");
  switch (kind) {
    case "negateEvent":
      return negateEvent(part(parts, 0, spec, "target"));
    case "forceEvent":
      return forceEvent(part(parts, 0, spec, "target"));
    case "retractFact":
      return retractFact(part(parts, 0, spec, "target"));
    case "severEdge":
      return severEdge(part(parts, 0, spec, "target"));
    case "relocate":
      return relocate(part(parts, 0, spec, "subject"), part(parts, 1, spec, "to"));
    case "setFact":
      return setFact(part(parts, 0, spec, "subject"), part(parts, 1, spec, "predicate"), parseScalar(part(parts, 2, spec, "object")));
    default:
      throw new Error(
        `unknown intervention kind "${kind}" (expected negateEvent | forceEvent | setFact | retractFact | severEdge | relocate)`
      );
  }
}

function help(): void {
  console.log(`Somnium Engine CLI

Usage:
  baseline                      print canon id + hash + baseline work statuses
  intervene <spec>              apply one intervention, print the WorldDiff JSON
  chain <spec> <spec> ...       apply interventions sequentially; print each world hash + the final diff
  --help                        this help

Intervention spec: <kind>:<target> (extras for parameterized kinds)
  negateEvent:ev/blight-begins
  forceEvent:ev/exodus
  retractFact:fact/vara-located-valdar
  severEdge:edge/exodus-requires-blight
  relocate:char/vara:loc/valdar
  setFact:char/vara:located_in:loc/thornhollow
`);
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === undefined || cmd === "--help" || cmd === "-h") {
    help();
    return;
  }

  const canon = verrinCanon();
  const rp = verrinRewindPoint();
  const baseline = derive(canon, []);

  switch (cmd) {
    case "baseline": {
      print({
        canonId: canon.canonId,
        canonHash: canon.hash,
        rewindPoint: { id: rp.id, anchorEvent: rp.anchorEvent, derivedHash: rp.derivedHash },
        baselineWorkStatuses: baseline.workStatuses,
      });
      break;
    }
    case "intervene": {
      const spec = rest[0];
      if (spec === undefined) throw new Error("intervene requires an intervention spec");
      const branch = derive(canon, [parseIntervention(spec)], rp);
      print(worldDiff(baseline, branch));
      break;
    }
    case "chain": {
      if (rest.length === 0) throw new Error("chain requires at least one intervention spec");
      const steps: { step: number; intervention: string; worldHash: string }[] = [];
      const chain: Intervention[] = [];
      for (const spec of rest) {
        chain.push(parseIntervention(spec));
        const world = derive(canon, [...chain], rp);
        steps.push({ step: steps.length + 1, intervention: spec, worldHash: world.hash });
      }
      const final = derive(canon, chain, rp);
      print({ steps, diff: worldDiff(baseline, final) });
      break;
    }
    default: {
      console.error(`unknown command "${cmd}"`);
      help();
      process.exitCode = 1;
    }
  }
}

main();
