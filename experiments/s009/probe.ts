/**
 * S009 — probe: multi-fact cells + the R1 multi-fact attack.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import { multiFactCells, runAttacks } from "./counterexamples";

for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  console.log(`\n=== ${name} ===`);
  const mf = multiFactCells(canon);
  console.log(`multi-fact cells: ${mf.length}`);
  for (const c of mf) console.log(`  ${c.cell} -> ${c.factIds.join(", ")}`);

  console.log("\n-- attacks (S008 rule, no guard) --");
  const results = runAttacks(canon);
  const failed = results.filter((r) => !r.ok);
  console.log(`passed ${results.length - failed.length}/${results.length}`);
  for (const f of failed) {
    console.log(
      `  FAIL [${f.rule}] ${f.name} len=${f.historyLen} reduced=${f.reducedLen} ` +
        `semantic=${f.semanticEqual} hash=${f.hashEqual} diff=${f.diffEmpty}` +
        (f.note ? ` note=${f.note}` : "")
    );
  }

  console.log("\n-- attacks (multi-fact guard ON) --");
  const guarded = runAttacks(canon, { multiFactGuard: true });
  const gfailed = guarded.filter((r) => !r.ok);
  console.log(`passed ${guarded.length - gfailed.length}/${guarded.length}`);
  for (const f of gfailed) {
    console.log(`  FAIL [${f.rule}] ${f.name} len=${f.historyLen} reduced=${f.reducedLen} semantic=${f.semanticEqual} hash=${f.hashEqual} diff=${f.diffEmpty}`);
  }
}
