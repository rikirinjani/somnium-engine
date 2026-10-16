/**
 * S007 — Long-Horizon Semantic State Scaling
 * Shared measurement harness.
 *
 * Host-agnostic. Every experiment is deterministic from (seed, canon, config,
 * commit). Measurement is deliberately split so the bottleneck is identifiable:
 *
 *   canonicalization  -> effectiveSemanticState()
 *   representation    -> canonicalJson(repr) byte size
 *   hashing           -> hashState(repr)
 *   diff              -> worldDiff(A, B) / semanticDelta
 *   derivation        -> derive(canon, interventions)
 *   branch generation -> the workload generator itself
 *
 * Nothing here mutates production semantics. This file is experiment-only.
 */
import { performance } from "node:perf_hooks";
import * as os from "node:os";

/* ------------------------------------------------------------------ */
/* Deterministic RNG (mulberry32) — seed -> identical stream           */
/* ------------------------------------------------------------------ */

export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rng() * xs.length)]!;
}

/* ------------------------------------------------------------------ */
/* Timing                                                              */
/* ------------------------------------------------------------------ */

export interface Timed<T> {
  value: T;
  ms: number;
}

export function time<T>(fn: () => T): Timed<T> {
  const t0 = performance.now();
  const value = fn();
  return { value, ms: performance.now() - t0 };
}

/** Median of repeated runs — used to damp GC/scheduler noise on small ops. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/** Run fn `reps` times, return median ms and the last value. */
export function timeMedian<T>(reps: number, fn: () => T): Timed<T> {
  let value!: T;
  const samples: number[] = [];
  for (let i = 0; i < reps; i++) {
    const t0 = performance.now();
    value = fn();
    samples.push(performance.now() - t0);
  }
  return { value, ms: median(samples) };
}

/* ------------------------------------------------------------------ */
/* Memory sampling                                                     */
/* ------------------------------------------------------------------ */

export interface MemorySample {
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes: number;
  peakRssBytes: number;
}

/**
 * Samples process.memoryUsage() on an interval and tracks peak RSS.
 * `stop()` returns the sample set. Node exposes only current RSS, so peak is
 * maintained by polling; sampling every 20ms is enough to catch derive spikes.
 */
export class MemorySampler {
  private timer: NodeJS.Timeout | null = null;
  private peakRss = 0;
  private last: MemorySample;

  constructor(private readonly intervalMs = 20) {
    this.last = this.snapshot();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  private snapshot(): MemorySample {
    const m = process.memoryUsage();
    return {
      rssBytes: m.rss,
      heapUsedBytes: m.heapUsed,
      heapTotalBytes: m.heapTotal,
      externalBytes: m.external,
      peakRssBytes: m.rss,
    };
  }

  private tick(): void {
    const m = process.memoryUsage();
    if (m.rss > this.peakRss) this.peakRss = m.rss;
    this.last = {
      rssBytes: m.rss,
      heapUsedBytes: m.heapUsed,
      heapTotalBytes: m.heapTotal,
      externalBytes: m.external,
      peakRssBytes: this.peakRss,
    };
  }

  /** Force a fresh sample and update peak (call after heavy work). */
  sample(): MemorySample {
    this.tick();
    return { ...this.last };
  }

  stop(): MemorySample {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.tick();
    return { ...this.last };
  }
}

/* ------------------------------------------------------------------ */
/* Size measurement                                                    */
/* ------------------------------------------------------------------ */

/** Canonical JSON byte size (UTF-8) — the on-the-wire representation size. */
export function bytesOf(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

/* ------------------------------------------------------------------ */
/* Safe-abort guard                                                    */
/* ------------------------------------------------------------------ */

export class ResourceGuard {
  private readonly maxRssBytes: number;
  private readonly maxMs: number;
  private readonly startedAt = performance.now();

  constructor(opts: { maxRssBytes?: number; maxMs?: number } = {}) {
    this.maxRssBytes = opts.maxRssBytes ?? 6 * 1024 * 1024 * 1024; // 6 GB default
    this.maxMs = opts.maxMs ?? 10 * 60 * 1000; // 10 min default
  }

  check(where: string): void {
    const rss = process.memoryUsage().rss;
    if (rss > this.maxRssBytes) {
      throw new ResourceAbort(
        `RSS ${(rss / 1e9).toFixed(2)}GB exceeded limit ${(this.maxRssBytes / 1e9).toFixed(2)}GB at ${where}`
      );
    }
    const elapsed = performance.now() - this.startedAt;
    if (elapsed > this.maxMs) {
      throw new ResourceAbort(`elapsed ${(elapsed / 1000).toFixed(1)}s exceeded limit at ${where}`);
    }
  }

  elapsedMs(): number {
    return performance.now() - this.startedAt;
  }
}

export class ResourceAbort extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceAbort";
  }
}

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

export function gb(bytes: number): number {
  return bytes / 1e9;
}

export function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 1) return `${ms.toFixed(2)} ms`;
  return `${(ms * 1000).toFixed(1)} µs`;
}

/** Least-squares slope/intercept of y on x (for empirical curve fitting). */
export function linearFit(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2 };
}

/** Empirical log-log slope: exponent p in y ~ x^p. */
export function logLogSlope(xs: number[], ys: number[]): number {
  const lx = xs.map((x) => Math.log(x));
  const ly = ys.map((y) => Math.log(y));
  return linearFit(lx, ly).slope;
}

export interface EnvInfo {
  platform: string;
  arch: string;
  cpus: number;
  cpuModel: string;
  totalMemBytes: number;
  freeMemBytes: number;
  nodeVersion: string;
  tsVersion: string;
  commit: string;
  timestamp: string;
}

export function collectEnv(commit: string): EnvInfo {
  const cpus = os.cpus();
  return {
    platform: process.platform,
    arch: process.arch,
    cpus: cpus.length,
    cpuModel: cpus[0]?.model ?? "unknown",
    totalMemBytes: os.totalmem(),
    freeMemBytes: os.freemem(),
    nodeVersion: process.version,
    tsVersion: "5.9.3",
    commit,
    timestamp: new Date().toISOString(),
  };
}
