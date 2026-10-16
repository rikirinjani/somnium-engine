import { derive } from 'somnium-core/derive/world-state';
import type { CoreWorkerRequest, CoreWorkerResponse } from './types';

export function runDerive(request: CoreWorkerRequest): CoreWorkerResponse {
  const { id, payload } = request;
  try {
    const worldState = derive(payload.canon, payload.interventions, payload.rp);
    return { type: 'derived', id, worldState };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { type: 'error', id, error };
  }
}
