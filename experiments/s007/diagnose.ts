/**
 * S007 — diagnostics for anomalies found in the smoke run.
 *   Q1: why does ordos worker-derived hash differ from the main thread?
 *   Q2: why does `redundant-8-rewrites` (canon vs overridden-with-same-value)
 *       not converge, while `convergent-repetition` does?
 *   Q3: what does the override actually change in the semantic representation?
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import { loadCanon } from "../../src/canon/canon";
import { derive } from "../../src/derive/world-state";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { canonicalJson } from "../../src/canon/hash";
import { setFact } from "../../src/timeline/types";

console.log("=== Q1: JSON round-trip of canon vs original ===");
for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const orig = mk();
  const round = JSON.parse(JSON.stringify(orig));
  const reloaded = loadCanon(round);
  const h0 = derive(orig, []).stateHash;
  const h1 = derive(reloaded, []).stateHash;
  console.log(`${name}: original=${h0} reloaded=${h1} match=${h0 === h1}`);
  // Compare raw canon hashes too
  console.log(`  canon.hash orig=${orig.hash} reloaded=${reloaded.hash} match=${orig.hash === reloaded.hash}`);
  // Find fields that differ under JSON round-trip
  const a = canonicalJson(orig);
  const b = canonicalJson(round);
  console.log(`  canonicalJson equal: ${a === b}`);
  if (a !== b) {
    // locate first divergence
    let i = 0;
    while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
    console.log(`  first diff at ${i}:`);
    console.log(`    orig: ...${a.slice(Math.max(0, i - 60), i + 60)}...`);
    console.log(`    rt:   ...${b.slice(Math.max(0, i - 60), i + 60)}...`);
  }
}

console.log("\n=== Q2/Q3: canon fact vs override-with-same-value ===");
for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  const f = canon.facts[0]!;
  console.log(`\n${name}: first fact ${f.id}`);
  console.log(`  canon: subject=${f.subject} predicate=${f.predicate} object=${JSON.stringify(f.object)} validFrom=${f.validFrom} validTo=${f.validTo}`);

  const base = derive(canon, []);
  const overridden = derive(canon, [setFact(f.subject, f.predicate, f.object, "diag")]);

  console.log(`  stateHash base=${base.stateHash} overridden=${overridden.stateHash} equal=${base.stateHash === overridden.stateHash}`);

  const bf = base.facts.find((x) => x.id === f.id);
  const of = overridden.facts.find((x) => x.id === f.id || (x.subject === f.subject && x.predicate === f.predicate));
  console.log(`  base fact:      ${JSON.stringify(bf)}`);
  console.log(`  overridden fact:${JSON.stringify(of)}`);

  // Diff the semantic representations, dimension by dimension.
  const ra = effectiveSemanticState(base);
  const rb = effectiveSemanticState(overridden);
  for (const dim of Object.keys(ra)) {
    const da = canonicalJson(ra[dim]);
    const db = canonicalJson(rb[dim]);
    if (da !== db) {
      console.log(`  DIMENSION DIFFERS: ${dim}`);
      const keysA = Object.keys(ra[dim]!);
      const keysB = Object.keys(rb[dim]!);
      const onlyA = keysA.filter((k) => !keysB.includes(k));
      const onlyB = keysB.filter((k) => !keysA.includes(k));
      console.log(`    keys only in base: ${JSON.stringify(onlyA)}`);
      console.log(`    keys only in overridden: ${JSON.stringify(onlyB)}`);
      for (const k of keysA.filter((k) => keysB.includes(k))) {
        const va = canonicalJson(ra[dim]![k]);
        const vb = canonicalJson(rb[dim]![k]);
        if (va !== vb) console.log(`    key ${k}:\n      base: ${va}\n      over: ${vb}`);
      }
    }
  }
}
