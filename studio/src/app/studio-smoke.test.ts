import { describe, it, expect } from 'vitest';
import { coreAdapter } from '../core-adapter/adapter';
import { verrinProject } from '../demo/verrin-project';

describe('Studio smoke', () => {
  const canon = coreAdapter.loadCanon(verrinProject.canon);
  const eventEntities = canon.entities.filter((e) => e.kind === 'Event');

  it('loads demo project with expected canon structure', () => {
    expect(canon.canonId).toBe('canon/verrin');
    expect(canon.entities).toBeDefined();
    expect(canon.entities.some((e) => e.id === 'char/vara')).toBe(true);
    expect(eventEntities.some((e) => e.id === 'ev/blight-begins')).toBe(true);

    const rp = verrinProject.rewindPoints[0];
    expect(rp.id).toBe('RP-VERRIN-001');
    expect(rp.anchorEvent).toBe('ev/blight-begins');

    const validation = coreAdapter.validateRewindPoint(rp, canon);
    expect(validation.ok).toBe(true);
  });

  it('derives baseline world via Worker and returns structured state', async () => {
    const world = await coreAdapter.derive({ canon, interventions: [] });

    expect(world).toBeDefined();
    expect(world.canonId).toBe('canon/verrin');
    expect(world.identityHash).toBeTruthy();
    expect(world.stateHash).toBeTruthy();
    expect(world.statuses['ev/blight-begins']).toBe('ESTABLISHED');
    expect(world.workStatuses['work/verrin-ashfall']).not.toBe('UNKNOWN');
  });

  it('applies negateEvent(blight-begins) at RP-VERRIN-001 and produces expected diff', async () => {
    const rp = verrinProject.rewindPoints[0];
    const intervention = coreAdapter.interventionConstructor('negateEvent', [
      'ev/blight-begins',
      'What if the Blight never began?',
    ]);

    const baseline = await coreAdapter.derive({ canon, interventions: [], rp });
    const branch = await coreAdapter.derive({ canon, interventions: [intervention], rp });

    expect(baseline.stateHash).not.toBe(branch.stateHash);
    expect(branch.statuses['ev/blight-begins']).toBe('EXCLUDED');
    expect(branch.statuses['ev/exodus']).not.toBe('ESTABLISHED');

    const diff = coreAdapter.worldDiff(baseline, branch);
    expect(diff.statusChanges.length).toBeGreaterThan(0);
    expect(diff.statusChanges.some((s) => s.entityId === 'ev/blight-begins')).toBe(true);

    const typed = coreAdapter.typedDiff(diff, canon);
    expect(typed.event.statusChanges.length).toBeGreaterThan(0);
  });

  it('posts a Worker request matching the CoreWorkerRequest contract', async () => {
    const rp = verrinProject.rewindPoints[0];
    const posted: unknown[] = [];

    // Mock a Worker that captures the first message and mirrors a success response.
    const OriginalWorker = globalThis.Worker;
    class MockWorker extends EventTarget {
      onmessage: ((ev: MessageEvent<unknown>) => void) | null = null;
      onerror: ((ev: ErrorEvent) => void) | null = null;
      onmessageerror: ((ev: MessageEvent<unknown>) => void) | null = null;
      constructor() {
        super();
      }
      postMessage(msg: unknown) {
        posted.push(msg);
        const response = {
          type: 'derived',
          id: (msg as { id: string }).id,
          worldState: { canonId: 'canon/verrin', identityHash: 'h1', stateHash: 'h2', statuses: {}, workStatuses: {}, facts: {}, snapshots: {}, provenance: {} },
        };
        queueMicrotask(() => {
          if (this.onmessage) {
            this.onmessage(new MessageEvent('message', { data: response }));
          }
        });
      }
      terminate() {}
    }
    globalThis.Worker = MockWorker as unknown as typeof Worker;

    try {
      await coreAdapter.derive({ canon, interventions: [], rp });
    } finally {
      globalThis.Worker = OriginalWorker;
    }

    expect(posted).toHaveLength(1);
    const req = posted[0] as { type: string; id: string; payload: { canon: unknown; interventions: unknown[]; rp: unknown } };
    expect(req.type).toBe('derive');
    expect(req.id).toBeTruthy();
    expect(req.payload).toBeDefined();
    expect(req.payload.canon).toBe(canon);
    expect(req.payload.interventions).toEqual([]);
    expect(req.payload.rp).toBe(rp);
  });

  it('returns a structured error for invalid input instead of hanging', async () => {
    let caught: Error | undefined;
    try {
      // @ts-expect-error deliberately invalid canon
      await coreAdapter.derive({ canon: { id: 'bad', entities: [] }, interventions: [] });
    } catch (err) {
      caught = err instanceof Error ? err : new Error(String(err));
    }

    expect(caught).toBeDefined();
    expect(caught!.message).not.toBe('');
  });
});
