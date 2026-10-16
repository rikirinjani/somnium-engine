import { readFileSync } from "node:fs";
const r = JSON.parse(readFileSync("experiments/s010/results/results.json", "utf8"));
console.log("=== COVERAGE ===");
for (const g of r.cov) {
  console.log("-- " + g.canon);
  for (const row of g.rows) console.log("  " + row.operation.padEnd(12) + " tested=" + String(row.tested).padStart(5) + " M-Bfail=" + String(row.mBFailures).padStart(4) + " M-Hfail=" + String(row.mHFailures).padStart(4));
}
console.log("=== DIFF failures (first 5 each) ===");
for (const d of r.diffs) {
  console.log("-- " + d.canon + " " + d.mechanism + " " + d.equivalent + "/" + d.cases);
  for (const f of d.failures.slice(0, 5)) console.log("   " + f.name + " len=" + f.len + " retained=" + f.retained);
}
