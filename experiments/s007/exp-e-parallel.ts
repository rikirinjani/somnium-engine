/**
 * S007 — Experiment E: Parallel Scaling
 *
 * Independent branches are derived in a PERSISTENT worker pool. `derive` is
 * pure, so parallelism cannot change semantics — the experiment verifies that
 * the hash set is IDENTICAL across worker counts, then measures throughput.
 *
 * Methodology note: the first smoke run measured worker STARTUP (each worker
 * re-imports tsx + the engine) and reported speedup < 1. That is not a scaling
 * result. Here the pool is spawned once and warmed with a handshake; the
 * measured phase excludes startup, and cold-start is reported separately.
 */
import { Worker } from "node:worker_threads";
import { verrinCanon } from "../../src/canon/verrin";
import { ordosCanon } from "../../src/canon/ordos";
import type { Canon } from "../../src/canon/types";
import { derive } from "../../src/derive/world-state";
import {
  type EnvInfo,
  MemorySampler,
  ResourceGuard,
  ResourceAbort,
  fmtBytes,
  fmtMs,
  time,
  seededRng,
} from "./harness";
import { buildTargetPool, makeIntervention, DEFAULT_WEIGHTS } from "./workloads";
import type { Intervention } from "../../src/timeline/types";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

export interface ParallelRow {
  canon: string;
  workers: number;
  items: number;
  coldStartMs: number; // spawn + canon load + ready handshake
  warmWallMs: number; // dispatch + compute + collect, startup excluded
  throughputItemsPerSec: number;
  speedup: number; // vs single-thread reference
  efficiency: number;
  ipcMs: number;
  workerComputeMsMax: number;
  peakRssBytes: number;
  hashesMatch: boolean;
  status: "ok" | "aborted" | "unsupported";
  note?: string;
}

export interface ParallelResult {
  env: EnvInfo;
  rows: ParallelRow[];
  note?: string;
}

const WORKER_URL = new URL("./worker.ts", import.meta.url);

/** Build M independent chains of length H (deterministic from seed). */
function buildItems(canon: Canon, count: number, horizon: number, seed: number): Intervention[][] {
  const pool = buildTargetPool(canon);
  const items: Intervention[][] = [];
  for (let i = 0; i < count; i++) {
    const rng = seededRng(seed + i * 104729);
    const chain: Intervention[] = [];
    for (let k = 0; k < horizon; k++) chain.push(makeIntervention(rng, pool, DEFAULT_WEIGHTS));
    items.push(chain);
  }
  return items;
}

function chunk<T>(xs: T[], parts: number): T[][] {
  const out: T[][] = Array.from({ length: parts }, () => []);
  xs.forEach((x, i) => out[i % parts]!.push(x));
  return out.filter((c) => c.length > 0);
}

interface PoolJobResult {
  hashes: string[];
  ms: number;
}

class WorkerPool {
  private readonly workers: Worker[] = [];
  private readonly pending = new Map<number, { resolve: (r: PoolJobResult) => void; reject: (e: Error) => void }>();
  private readonly readyPromises: Promise<void>[] = [];
  private jobId = 0;
  readonly coldStartMs: number;

  constructor(workerCount: number, canonRaw: unknown) {
    const t0 = performance.now();
    for (let i = 0; i < workerCount; i++) {
      const w = new Worker(WORKER_URL, {
        workerData: { canonRaw },
        execArgv: ["--import", "tsx"],
      });
      this.workers.push(w);
      this.readyPromises.push(
        new Promise<void>((resolve, reject) => {
          const onMessage = (msg: { type: string; id?: number; hashes?: string[]; ms?: number }) => {
            if (msg.type === "ready") {
              w.off("message", onMessage);
              w.on("message", (m: { type: string; id?: number; hashes?: string[]; ms?: number }) => {
                if (m.type === "result" && m.id !== undefined) {
                  const p = this.pending.get(m.id);
                  if (p) {
                    this.pending.delete(m.id);
                    p.resolve({ hashes: m.hashes ?? [], ms: m.ms ?? 0 });
                  }
                }
              });
              resolve();
            }
          };
          w.on("message", onMessage);
          w.once("error", reject);
        })
      );
    }
    this.coldStartMs = 0; // set by waitReady caller via elapsed
    void t0;
  }

  async waitReady(): Promise<number> {
    const t0 = performance.now();
    await Promise.all(this.readyPromises);
    return performance.now() - t0;
  }

  /** Send one job per worker; await all results. */
  async process(chains: Intervention[][]): Promise<{ hashes: string[]; ipcMs: number; computeMax: number }> {
    const chunks = chunk(chains, this.workers.length);
    let ipcMs = 0;
    let computeMax = 0;
    const results = await Promise.all(
      chunks.map((c) => {
        const id = this.jobId++;
        return new Promise<string[]>((resolve, reject) => {
          this.pending.set(id, {
            resolve: (r) => {
              computeMax = Math.max(computeMax, r.ms);
              resolve(r.hashes);
            },
            reject,
          });
          this.workers[chunks.indexOf(c)]!.postMessage({ type: "job", id, chains: c });
        });
      })
    );
    return { hashes: results.flat(), ipcMs, computeMax };
  }

  async terminate(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}

export async function runParallel(
  env: EnvInfo,
  opts: {
    canons?: ("verrin" | "ordos")[];
    workerCounts?: number[];
    items?: number;
    horizon?: number;
    seed?: number;
    maxRssBytes?: number;
    maxMs?: number;
  } = {}
): Promise<ParallelResult> {
  const canons = opts.canons ?? ["verrin", "ordos"];
  const workerCounts = opts.workerCounts ?? [1, 2, 4, 8, 16];
  const itemCount = opts.items ?? 200;
  const horizon = opts.horizon ?? 20;
  const seed = opts.seed ?? 20260910;
  const guard = new ResourceGuard({ maxRssBytes: opts.maxRssBytes, maxMs: opts.maxMs });
  const rows: ParallelRow[] = [];

  for (const name of canons) {
    const canon = name === "verrin" ? verrinCanon() : ordosCanon();
    const canonRaw = JSON.parse(JSON.stringify(canon));
    const items = buildItems(canon, itemCount, horizon, seed);

    // Reference: single-threaded derive, used to verify hash identity and as the
    // speedup baseline.
    // Reference: single-threaded derive. Run twice; the second (warm) run is the
    // baseline, matching the warmed worker measurement.
    time(() => items.map((chain) => derive(canon, chain).stateHash));
    const refT = time(() => items.map((chain) => derive(canon, chain).stateHash));
    const refHashes = [...refT.value].sort();
    const baselineWall = refT.ms;
    console.log(`[E] ${name} reference single-thread (warm): ${fmtMs(refT.ms)} for ${itemCount} items`);

    for (const w of workerCounts) {
      guard.check(`parallel ${name} workers=${w}`);
      const sampler = new MemorySampler(20);
      let pool: WorkerPool | null = null;
      try {
        pool = new WorkerPool(w, canonRaw);
        const coldStart = await pool.waitReady();
        // Warmup: one throwaway batch so JIT and allocators are hot before the
        // measured phase (otherwise the first job is cold and inflates cost).
        await pool.process(items);
        const t0 = performance.now();
        const res = await pool.process(items);
        const warmMs = performance.now() - t0;
        const sample = sampler.stop();
        await pool.terminate();
        pool = null;

        const hashesSorted = [...res.hashes].sort();
        const hashesMatch = JSON.stringify(hashesSorted) === JSON.stringify(refHashes);
        const row: ParallelRow = {
          canon: name,
          workers: w,
          items: itemCount,
          coldStartMs: coldStart,
          warmWallMs: warmMs,
          throughputItemsPerSec: warmMs > 0 ? itemCount / (warmMs / 1000) : Infinity,
          speedup: warmMs > 0 ? baselineWall / warmMs : 0,
          efficiency: warmMs > 0 ? baselineWall / warmMs / w : 0,
          ipcMs: res.ipcMs,
          workerComputeMsMax: res.computeMax,
          peakRssBytes: sample.peakRssBytes,
          hashesMatch,
          status: "ok",
        };
        rows.push(row);
        console.log(
          `[E] ${name} W=${w} cold=${fmtMs(coldStart)} warm=${fmtMs(warmMs)} ` +
            `speedup=${row.speedup.toFixed(2)}x eff=${(row.efficiency * 100).toFixed(0)}% ` +
            `computeMax=${fmtMs(res.computeMax)} match=${hashesMatch}`
        );
      } catch (err) {
        sampler.stop();
        if (pool) await pool.terminate().catch(() => undefined);
        if (err instanceof ResourceAbort) {
          rows.push(abortedParallelRow(name, w, itemCount, process.memoryUsage().rss, err.message));
          break;
        }
        rows.push({
          ...abortedParallelRow(name, w, itemCount, process.memoryUsage().rss, err instanceof Error ? err.message : String(err)),
          status: "unsupported",
        });
        console.log(`[E] ${name} W=${w} unsupported: ${err instanceof Error ? err.message : err}`);
        break;
      }
    }
  }
  return { env, rows };
}

function abortedParallelRow(canon: string, workers: number, items: number, peakRss: number, note: string): ParallelRow {
  return {
    canon,
    workers,
    items,
    coldStartMs: -1,
    warmWallMs: -1,
    throughputItemsPerSec: -1,
    speedup: -1,
    efficiency: -1,
    ipcMs: -1,
    workerComputeMsMax: -1,
    peakRssBytes: peakRss,
    hashesMatch: false,
    status: "aborted",
    note,
  };
}

export function writeParallel(result: ParallelResult, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "exp-e-parallel.json");
  writeFileSync(path, JSON.stringify(result, null, 2), "utf8");
  return path;
}
