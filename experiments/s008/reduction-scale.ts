/**
 * S008 — does the reduced chain stay bounded as H grows?
 *
 * The performance win depends entirely on this: if |reduceChain(history)| grows
 * with H, `derive` stays O(H) per step and the walk stays O(H^2).
 */
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import { reduceChain } from "./incremental";
import { randomHistories } from "./equivalence";

for (const [name, mk] of [["verrin", verrinCanon], ["ordos", ordosCanon]] as const) {
  const canon = mk();
  console.log(`\n=== ${name} ===`);
  for (const h of [10, 100, 1000, 10000, 100000]) {
    const [hist] = randomHistories(canon, 1, h, 20260911);
    const reduced = reduceChain(canon, hist!.history);
    console.log(
      `H=${String(h).padStart(6)}  raw=${String(h).padStart(6)}  reduced=${String(reduced.length).padStart(6)}  ` +
        `removed=${((1 - reduced.length / h) * 100).toFixed(1)}%`
    );
  }
}
