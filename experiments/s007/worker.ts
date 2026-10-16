/**
 * S007 — Experiment E worker (persistent).
 *
 * Protocol:
 *   -> workerData: { canonRaw }
 *   <- { type: "ready" }                       (canon loaded; startup excluded)
 *   -> { type: "job", id, chains }
 *   <- { type: "result", id, hashes, ms }
 *
 * The canon is cast directly rather than passed through loadCanon: loadCanon
 * re-normalizes and was observed to DROP ordos cardinality constraints
 * (ordos round-trips to the "without-constraints" hash), which would make the
 * worker derive a different world than the main thread. The raw canon object is
 * already a valid Canon.
 */
import { parentPort, workerData } from "node:worker_threads";
import { derive } from "../../src/derive/world-state";
import type { Canon } from "../../src/canon/types";
import type { Intervention } from "../../src/timeline/types";
import { performance } from "node:perf_hooks";

interface WorkerInput {
  canonRaw: unknown;
}

const input = workerData as WorkerInput;
const canon = input.canonRaw as Canon;

parentPort?.postMessage({ type: "ready" });

parentPort?.on("message", (msg: { type: "job"; id: number; chains: Intervention[][] }) => {
  const t0 = performance.now();
  const hashes: string[] = [];
  for (const chain of msg.chains) hashes.push(derive(canon, chain).stateHash);
  parentPort?.postMessage({ type: "result", id: msg.id, hashes, ms: performance.now() - t0 });
});
