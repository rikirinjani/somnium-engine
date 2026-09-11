/**
 * S010 — find a minimal M-H failure and diagnose it.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive } from "../../src/derive/world-state";
import {
  type Intervention,
  setFact,
  negateEvent,
  forceEvent,
  retractFact,
  severEdge,
  addEdge,
} from "../../src/timeline/types";
import { retainByStateChange, sameWorld } from "./retain";

function constructed(canon: Canon): [string, Intervention[]][] {
  const events = canon.entities.filter((e) => e.kind === "Event").map((e) => e.id).sort();
  const ents = canon.entities.filter((e) => e.kind !== "Event" && e.kind !== "EventType").map((e) => e.id).sort();
  const facts = [...canon.facts].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...canon.edges].sort((a, b) => a.id.localeCompare(b.id));
  const e0 = events[0]!;
  const e1 = events[1] ?? events[0]!;
  const s0 = ents[0]!;
  const f0 = facts[0]!;
  const out: [string, Intervention[]][] = [
    ["negate-force-negate", [negateEvent(e0, "c"), forceEvent(e0, "c"), negateEvent(e0, "c")]],
    ["force-negate-force", [forceEvent(e0, "c"), negateEvent(e0, "c"), forceEvent(e0, "c")]],
    ["negate-e0-negate-e1-negate-e0", [negateEvent(e0, "c"), negateEvent(e1, "c"), negateEvent(e0, "c")]],
    ["force-e0-force-e1-force-e0", [forceEvent(e0, "c"), forceEvent(e1, "c"), forceEvent(e0, "c")]],
    ["write-retract-write", [setFact(f0.subject, f0.predicate, "V1", "c"), retractFact(f0.id, "c"), setFact(f0.subject, f0.predicate, "V2", "c")]],
    ["retract-write-retract", [retractFact(f0.id, "c"), setFact(f0.subject, f0.predicate, "V", "c"), retractFact(f0.id, "c")]],
    ["write-write", [setFact(f0.subject, f0.predicate, "A", "c"), setFact(f0.subject, f0.predicate, "B", "c")]],
    ["negate-write-negate", [negateEvent(e0, "c"), setFact(f0.subject, f0.predicate, "V", "c"), negateEvent(e0, "c")]],
  ];
  if (edges.length > 0) {
    out.push(["sever-add-sever", [severEdge(edges[0]!.id, "c"), addEdge({ ...edges[0]! }, "c"), severEdge(edges[0]!.id, "c")]]);
    out.push(["add-sever-add", [addEdge({ ...edges[0]! }, "c"), severEdge(edges[0]!.id, "c"), addEdge({ ...edges[0]! }, "c")]]);
  }
  void s0;
  return out;
}

for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  console.log(`\n=== ${name} ===`);
  for (const [hname, H] of constructed(canon)) {
    const R = retainByStateChange(canon, H);
    const eq = sameWorld(derive(canon, H), derive(canon, R));
    const flag = eq.equal ? "ok " : "FAIL";
    console.log(
      `  ${flag} ${hname.padEnd(32)} H=${H.length} R=${R.length} ` +
        `R=[${R.map((i) => `${i.kind}:${i.target}`).join(", ")}]`
    );
    if (!eq.equal) {
      console.log(`        H=[${H.map((i) => `${i.kind}:${i.target}`).join(", ")}]`);
      console.log(`        semantic=${eq.semanticEqual} hash=${eq.hashEqual} diff=${eq.diffEmpty}`);
    }
  }
}
