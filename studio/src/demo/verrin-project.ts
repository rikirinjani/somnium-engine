import { verrinCanon } from 'somnium-core/canon/verrin';
import { verrinRewindPoint } from 'somnium-core/canon/verrin';
import type { Project } from '../state/appState';

const canon = verrinCanon();
const rp = verrinRewindPoint();

export const verrinProject: Omit<Project, 'canon'> & { canon: unknown } = {
  projectId: 'proj-verrin-demo',
  name: 'Verrin Demo',
  createdAt: '2026-09-17T00:00:00.000Z',
  updatedAt: '2026-09-17T00:00:00.000Z',
  canon,
  rewindPoints: [rp],
  branches: [
    {
      branchId: 'branch-baseline',
      parentBranchId: null,
      rpId: null,
      interventions: [],
      label: 'Baseline',
      worldHash: '',
      stateHash: '',
    },
  ],
};
