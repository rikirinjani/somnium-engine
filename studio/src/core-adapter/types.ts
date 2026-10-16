import type { Canon, Entity, EntityKind, Fact } from 'somnium-core/canon/types';
import type { EventStatus, WorkStatus } from 'somnium-core/derive/lattice';
import type { WorldState } from 'somnium-core/derive/world-state';
import type { WorldDiff, TypedDiff } from 'somnium-core/diff/types';
import type { Intervention, RewindPoint } from 'somnium-core/timeline/types';

export type {
  Canon,
  Entity,
  EntityKind,
  EventStatus,
  Fact,
  Intervention,
  RewindPoint,
  WorkStatus,
  WorldDiff,
  WorldState,
  TypedDiff,
};

export type DeriveInput = CoreWorkerRequest;

export type DeriveResult =
  | { kind: 'success'; id: string; worldState: WorldState }
  | { kind: 'error'; id: string; message: string };

export type CoreWorkerRequest = {
  type: 'derive';
  id: string;
  payload: {
    canon: Canon;
    interventions: Intervention[];
    rp?: RewindPoint;
  };
};

export type CoreWorkerResponse =
  | { type: 'derived'; id: string; worldState: WorldState }
  | { type: 'error'; id: string; error: string };

export interface CoreAdapter {
  loadCanon(raw: unknown): Canon;
  validateRewindPoint(rp: RewindPoint, canon: Canon): { ok: boolean; errors: string[] };
  derive(input: { canon: Canon; interventions: Intervention[]; rp?: RewindPoint }): Promise<WorldState>;
  worldDiff(baseline: WorldState, branch: WorldState): WorldDiff;
  typedDiff(diff: WorldDiff, canon: Canon): TypedDiff;
  statusOf(world: WorldState, entityId: string): EventStatus;
  workStatusOf(world: WorldState, workId: string): WorkStatus;
  subjectFact(world: WorldState, subjectId: string, predicate: string): Fact | undefined;
  reachable(world: WorldState, eventId: string): boolean;
  interventionConstructor(kind: InterventionKind, args: unknown[]): Intervention;
}

export type InterventionKind =
  | 'negateEvent'
  | 'forceEvent'
  | 'setFact'
  | 'retractFact'
  | 'severEdge'
  | 'addEdge'
  | 'relocate';
