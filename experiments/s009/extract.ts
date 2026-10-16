import { readFileSync } from "node:fs";
const r = JSON.parse(readFileSync("experiments/s009/results/results.json", "utf8"));
console.log("=== COMMUTATION ===");
for (const c of r.commute) console.log(c.canon.padEnd(7), c.pair.padEnd(32), "sameState=" + c.sameState, "sameReduced=" + c.sameReduced);
console.log("=== COVERAGE ===");
for (const g of r.cov) {
  console.log("-- " + g.canon);
  for (const row of g.rows) console.log("  " + row.operation.padEnd(12) + " rule=" + row.rule.padEnd(7) + " tested=" + String(row.tested).padStart(5) + " cex=" + row.counterexamples);
}
console.log("=== CEX ===");
console.log(JSON.stringify(r.cex, null, 1));
console.log("=== CEX GUARDED ===");
console.log(JSON.stringify(r.cexGuarded, null, 1));
