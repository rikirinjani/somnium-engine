/**
 * S008 — quick equivalence smoke test.
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import {
  constructedHistories,
  randomHistories,
  runEquivalence,
  summarize,
} from "./equivalence";

for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  const results = runEquivalence(canon, name, [
    ...constructedHistories(canon),
    ...randomHistories(canon, 200, 12, 20260911),
  ]);
  const s = summarize(results);
  console.log(`\n=== ${name}: ${s.passed}/${s.total} passed ===`);
  for (const f of s.failed) {
    console.log(
      `  FAIL ${f.name} len=${f.historyLen} reduced=${f.reducedLen} ` +
        `semanticEqual=${f.semanticEqual} hashEqual=${f.hashEqual} diffEmpty=${f.diffEmpty} ` +
        `throwEqual=${f.throwEqual}` + (f.note ? ` note=${f.note}` : "")
    );
  }
  // Reduction effectiveness
  const before = results.reduce((a, r) => a + r.historyLen, 0);
  const after = results.reduce((a, r) => a + r.reducedLen, 0);
  console.log(`  reduction: ${before} -> ${after} (${((1 - after / before) * 100).toFixed(1)}% removed)`);
}
