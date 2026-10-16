/**
 * S010 — find a minimal M-H failure in the random corpus and minimize it.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive } from "../../src/derive/world-state";
import { effectiveSemanticState } from "../../src/derive/semantic";
import { canonicalJson } from "../../src/canon/hash";
import { type Intervention } from "../../src/timeline/types";
import { retainByStateChange, sameWorld } from "./retain";
import { randomHistory } from "./checks";

function minimize(canon: Canon, H: Intervention[]): Intervention[] {
  // delta-debug: remove elements while the failure persists
  let best = [...H];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < best.length; i++) {
      const cand = [...best.slice(0, i), ...best.slice(i + 1)];
      const R = retainByStateChange(canon, cand);
      if (!sameWorld(derive(canon, cand), derive(canon, R)).equal) {
        best = cand;
        changed = true;
        break;
      }
    }
  }
  return best;
}

for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  console.log(`\n=== ${name} random M-H failures ===`);
  let found = 0;
  for (let i = 0; i < 500 && found < 3; i++) {
    const H = randomHistory(canon, 25, 20260913 + i * 7919);
    const R = retainByStateChange(canon, H);
    const eq = sameWorld(derive(canon, H), derive(canon, R));
    if (!eq.equal) {
      found++;
      const m = minimize(canon, H);
      const mR = retainByStateChange(canon, m);
      const meq = sameWorld(derive(canon, m), derive(canon, mR));
      console.log(`  FAIL seed=${i} H=${H.length} R=${R.length}`);
      console.log(`    minimized H(${m.length})=[${m.map((x) => `${x.kind}:${x.target}:${JSON.stringify(x.params ?? {})}`).join(", ")}]`);
      console.log(`    minimized R(${mR.length})=[${mR.map((x) => `${x.kind}:${x.target}`).join(", ")}]`);
      console.log(`    still fails: ${!meq.equal} (semantic=${meq.semanticEqual} hash=${meq.hashEqual} diff=${meq.diffEmpty})`);
      const a = derive(canon, m);
      const b = derive(canon, mR);
      // Show which dimension differs
      const ra = effectiveSemanticState(a);
      const rb = effectiveSemanticState(b);
      for (const dim of Object.keys(ra)) {
        if (canonicalJson(ra[dim]) !== canonicalJson(rb[dim])) {
          console.log(`    DIM ${dim} differs`);
          console.log(`      H : ${canonicalJson(ra[dim]).slice(0, 300)}`);
          console.log(`      R : ${canonicalJson(rb[dim]).slice(0, 300)}`);
        }
      }
    }
  }
  if (found === 0) console.log("  (none found in 500 random histories)");
}
