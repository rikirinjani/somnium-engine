import { loadCanon } from 'somnium-core/canon/canon';
import { validateRewindPoint } from 'somnium-core/timeline/rewind-point';
import { worldDiff } from 'somnium-core/diff/diff';
import { typedDiff, projectDiff } from 'somnium-core/diff/projections';
import { statusOf, workStatusOf } from 'somnium-core/query/status';
import { subjectFact, reachable } from 'somnium-core/query/query';
import { runDerive } from './worker-impl';
import {
  negateEvent,
  forceEvent,
  setFact,
  retractFact,
  severEdge,
  addEdge,
  relocate,
} from 'somnium-core/timeline/types';
import type { Canon, Fact } from 'somnium-core/canon/types';
import type { Intervention } from 'somnium-core/timeline/types';
import type { EventStatus, WorkStatus } from 'somnium-core/derive/lattice';
import type { WorldState } from 'somnium-core/derive/world-state';
import type { WorldDiff, TypedDiff } from 'somnium-core/diff/types';
import type { RewindPoint } from 'somnium-core/timeline/types';
import type { CoreAdapter as ICoreAdapter, InterventionKind, DeriveInput } from './types';

const constructors: Record<InterventionKind, (...args: unknown[]) => Intervention> = {
  negateEvent: (target: unknown, label?: unknown) =>
    negateEvent(String(target), typeof label === 'string' ? label : undefined),
  forceEvent: (target: unknown, label?: unknown) =>
    forceEvent(String(target), typeof label === 'string' ? label : undefined),
  setFact: (subject: unknown, predicate: unknown, object: unknown, label?: unknown) =>
    setFact(
      String(subject),
      String(predicate),
      object as string | number | boolean | null,
      typeof label === 'string' ? label : undefined
    ),
  retractFact: (target: unknown, label?: unknown) =>
    retractFact(String(target), typeof label === 'string' ? label : undefined),
  severEdge: (target: unknown, label?: unknown) =>
    severEdge(String(target), typeof label === 'string' ? label : undefined),
  addEdge: (edge: unknown, label?: unknown) =>
    addEdge(edge as Parameters<typeof addEdge>[0], typeof label === 'string' ? label : undefined),
  relocate: (subject: unknown, to: unknown, label?: unknown) =>
    relocate(String(subject), String(to), typeof label === 'string' ? label : undefined),
};

export class CoreAdapter implements ICoreAdapter {
  loadCanon(raw: unknown): Canon {
    return loadCanon(raw);
  }

  validateRewindPoint(rp: RewindPoint, canon: Canon): { ok: boolean; errors: string[] } {
    return validateRewindPoint(rp, canon);
  }

  derive(input: { canon: Canon; interventions: Intervention[]; rp?: RewindPoint }): Promise<WorldState> {
    const id = crypto.randomUUID();

    // In browser environments with Worker support, use the dedicated worker.
    // In Node/test environments, run derive synchronously on the main thread.
    if (typeof Worker !== 'undefined' && typeof window !== 'undefined') {
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

        worker.onmessage = (event: MessageEvent<{ type: 'derived' | 'error'; id: string; worldState?: WorldState; error?: string }>) => {
          const { type, worldState, error } = event.data;
          worker.terminate();
          if (type === 'derived' && worldState) {
            resolve(worldState);
          } else {
            reject(new Error(error ?? 'Unknown derivation error'));
          }
        };

        worker.onerror = (err) => {
          worker.terminate();
          reject(new Error(`Worker error: ${err.message}`));
        };

        worker.onmessageerror = (err) => {
          worker.terminate();
          reject(new Error(`Worker message error: ${String(err)}`));
        };

        const request: DeriveInput = {
          type: 'derive',
          id,
          payload: {
            canon: input.canon,
            interventions: input.interventions,
            rp: input.rp,
          },
        };
        worker.postMessage(request);
      });
    }

    const response = runDerive({
      type: 'derive',
      id,
      payload: input,
    });

    if (response.type === 'derived') {
      return Promise.resolve(response.worldState);
    }
    return Promise.reject(new Error(response.error));
  }

  worldDiff(baseline: WorldState, branch: WorldState): WorldDiff {
    return worldDiff(baseline, branch);
  }

  typedDiff(diff: WorldDiff, canon: Canon): TypedDiff {
    return typedDiff(diff, canon);
  }

  projectDiff(diff: WorldDiff, canon: Canon, kind: Parameters<typeof projectDiff>[2]): WorldDiff {
    return projectDiff(diff, canon, kind);
  }

  statusOf(world: WorldState, entityId: string): EventStatus {
    return statusOf(world, entityId);
  }

  workStatusOf(world: WorldState, workId: string): WorkStatus {
    return workStatusOf(world, workId);
  }

  subjectFact(world: WorldState, subjectId: string, predicate: string): Fact | undefined {
    const view = subjectFact(world, subjectId, predicate);
    if (!view) return undefined;
    // Cast to Fact shape for UI consumption; valid fields align.
    return view as unknown as Fact;
  }

  reachable(world: WorldState, eventId: string): boolean {
    return reachable(world, eventId);
  }

  interventionConstructor(kind: InterventionKind, args: unknown[]): Intervention {
    const ctor = constructors[kind];
    if (!ctor) throw new Error(`Unknown intervention kind: ${kind}`);
    return ctor(...args);
  }
}

export const coreAdapter = new CoreAdapter();
