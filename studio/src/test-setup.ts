import { webcrypto } from 'node:crypto';

if (typeof globalThis.Worker === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Worker = undefined;
}

if (typeof globalThis.crypto === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}

// Vitest node environment does not run real Web Workers, so we run derive()
// synchronously on the main thread when the adapter falls back here.
await import('./core-adapter/worker-impl');
