/// <reference lib="webworker" />

import { derive } from 'somnium-core/derive/world-state';
import type { CoreWorkerRequest, CoreWorkerResponse } from './types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<CoreWorkerRequest>) => {
  const { type, id, payload } = event.data;

  if (type !== 'derive') {
    ctx.postMessage({
      type: 'error',
      id,
      error: `Unknown worker request type: ${type}`,
    } satisfies CoreWorkerResponse);
    return;
  }

  try {
    const worldState = derive(payload.canon, payload.interventions, payload.rp);
    ctx.postMessage({
      type: 'derived',
      id,
      worldState,
    } satisfies CoreWorkerResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({
      type: 'error',
      id,
      error: message,
    } satisfies CoreWorkerResponse);
  }
};
