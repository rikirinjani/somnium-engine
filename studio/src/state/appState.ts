import { create } from 'zustand';
import { coreAdapter } from '../core-adapter/adapter';
import { verrinProject as staticVerrinProject } from '../demo/verrin-project';
import type {
  Canon,
  Entity,
  EventStatus,
  Fact,
  Intervention,
  RewindPoint,
  WorldState,
  WorldDiff,
} from '../core-adapter/types';

export type DerivationStatus = 'idle' | 'deriving' | 'done' | 'failed';

export interface Branch {
  branchId: string;
  parentBranchId: string | null;
  rpId: string | null;
  interventions: Intervention[];
  label: string;
  worldHash: string;
  stateHash: string;
}

export interface Project {
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  canon: Canon;
  rewindPoints: RewindPoint[];
  branches: Branch[];
}

export interface InterventionDraft {
  kind: 'negateEvent' | 'forceEvent' | 'setFact' | 'retractFact' | 'severEdge' | 'relocate';
  target: string;
  predicate?: string;
  object?: string | number | boolean | null;
  to?: string;
  label: string;
  errors: string[];
}

export interface AppState {
  // Persistent project state
  project: Project | null;
  activeBranchId: string | null;

  // Derived/cached state
  worlds: Map<string, WorldState>;
  diffs: Map<string, WorldDiff>;

  // Temporary interaction state
  selectedEntityId: string | null;
  activeTab: 'canon' | 'timeline' | 'whatif' | 'diff' | 'world' | 'why';
  interventionDraft: InterventionDraft | null;
  derivationStatus: DerivationStatus;
  derivationError: string | null;
  selectedDiffItemId: string | null;
  selectedEvidenceNodeId: string | null;

  // Actions
  loadDemoProject: () => void;
  setActiveBranch: (branchId: string) => void;
  selectEntity: (entityId: string | null) => void;
  setActiveTab: (tab: AppState['activeTab']) => void;
  setInterventionDraft: (draft: InterventionDraft | null) => void;
  deriveActiveIntervention: () => Promise<void>;
  selectDiffItem: (id: string | null) => void;
  selectEvidenceNode: (id: string | null) => void;
  switchToWhyFor: (id: string) => void;
}

export const useAppState = create<AppState>((set, get) => ({
  project: null,
  activeBranchId: null,
  worlds: new Map(),
  diffs: new Map(),
  selectedEntityId: null,
  activeTab: 'canon',
  interventionDraft: null,
  derivationStatus: 'idle',
  derivationError: null,
  selectedDiffItemId: null,
  selectedEvidenceNodeId: null,

  loadDemoProject: async () => {
    const canon = coreAdapter.loadCanon(staticVerrinProject.canon);
    try {
      const world = await coreAdapter.derive({ canon, interventions: [] });
      const project: Project = {
        ...staticVerrinProject,
        canon,
        rewindPoints: staticVerrinProject.rewindPoints,
        branches: staticVerrinProject.branches.map((b) => ({
          ...b,
          rpId: b.rpId ?? null,
        })),
      };
      const worlds = new Map<string, WorldState>();
      worlds.set('branch-baseline', world);
      set({ project, activeBranchId: 'branch-baseline', worlds, activeTab: 'timeline' });
    } catch (err) {
      set({ derivationError: String(err) });
    }
  },

  setActiveBranch: (branchId) => {
    set({ activeBranchId: branchId });
  },

  selectEntity: (entityId) => {
    set({ selectedEntityId: entityId });
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },

  setInterventionDraft: (draft) => {
    set({ interventionDraft: draft });
  },

  deriveActiveIntervention: async () => {
    const { project, interventionDraft, activeBranchId, worlds } = get();
    if (!project || !interventionDraft || interventionDraft.errors.length > 0) return;

    set({ derivationStatus: 'deriving', derivationError: null });

    try {
      let intervention: Intervention;
      switch (interventionDraft.kind) {
        case 'negateEvent':
          intervention = coreAdapter.interventionConstructor('negateEvent', [
            interventionDraft.target,
            interventionDraft.label,
          ]);
          break;
        case 'forceEvent':
          intervention = coreAdapter.interventionConstructor('forceEvent', [
            interventionDraft.target,
            interventionDraft.label,
          ]);
          break;
        case 'setFact':
          intervention = coreAdapter.interventionConstructor('setFact', [
            interventionDraft.target,
            interventionDraft.predicate,
            interventionDraft.object,
            interventionDraft.label,
          ]);
          break;
        case 'retractFact':
          intervention = coreAdapter.interventionConstructor('retractFact', [
            interventionDraft.target,
            interventionDraft.label,
          ]);
          break;
        case 'severEdge':
          intervention = coreAdapter.interventionConstructor('severEdge', [
            interventionDraft.target,
            interventionDraft.label,
          ]);
          break;
        case 'relocate':
          intervention = coreAdapter.interventionConstructor('relocate', [
            interventionDraft.target,
            interventionDraft.to,
            interventionDraft.label,
          ]);
          break;
        default:
          throw new Error('Unsupported intervention kind in slice');
      }

      const parentBranchId = activeBranchId ?? 'branch-baseline';
      const parentBranch = project.branches.find((b) => b.branchId === parentBranchId);
      const parentInterventions = parentBranch?.interventions ?? [];
      const interventions = [...parentInterventions, intervention];

      const rpId = parentBranch?.rpId ?? null;
      const rp = project.rewindPoints.find((r) => r.id === rpId);

      const branchWorld = await coreAdapter.derive({
        canon: project.canon,
        interventions,
        rp,
      });

      const baselineWorld = worlds.get('branch-baseline');
      if (!baselineWorld) throw new Error('Baseline world not available');

      const diff = coreAdapter.worldDiff(baselineWorld, branchWorld);

      const branchId = `branch-${project.branches.length.toString().padStart(3, '0')}`;
      const branch: Branch = {
        branchId,
        parentBranchId,
        rpId,
        interventions,
        label: interventionDraft.label,
        worldHash: branchWorld.identityHash,
        stateHash: branchWorld.stateHash,
      };

      const nextWorlds = new Map(worlds);
      nextWorlds.set(branchId, branchWorld);
      const nextDiffs = new Map(get().diffs);
      nextDiffs.set(branchId, diff);

      set({
        project: { ...project, branches: [...project.branches, branch] },
        activeBranchId: branchId,
        worlds: nextWorlds,
        diffs: nextDiffs,
        derivationStatus: 'done',
        activeTab: 'diff',
        interventionDraft: null,
      });
    } catch (err) {
      set({
        derivationStatus: 'failed',
        derivationError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  selectDiffItem: (id) => {
    set({ selectedDiffItemId: id });
  },

  selectEvidenceNode: (id) => {
    set({ selectedEvidenceNodeId: id });
  },

  switchToWhyFor: (id) => {
    set({ selectedEvidenceNodeId: id, activeTab: 'why' });
  },
}));

export function validateInterventionDraft(
  draft: InterventionDraft | null,
  project: Project | null
): InterventionDraft | null {
  if (!draft || !project) return null;
  const errors: string[] = [];

  const entityIds = new Set(project.canon.entities.map((e) => e.id));
  const factIds = new Set(project.canon.facts.map((f) => f.id));
  const edgeIds = new Set(project.canon.edges.map((e) => e.id));

  if (!draft.target) {
    errors.push('Target is required.');
  } else {
    switch (draft.kind) {
      case 'negateEvent':
      case 'forceEvent': {
        if (!entityIds.has(draft.target)) errors.push(`Unknown event: ${draft.target}`);
        break;
      }
      case 'retractFact': {
        if (!factIds.has(draft.target)) errors.push(`Unknown fact: ${draft.target}`);
        break;
      }
      case 'severEdge': {
        if (!edgeIds.has(draft.target)) errors.push(`Unknown edge: ${draft.target}`);
        break;
      }
      case 'setFact':
      case 'relocate': {
        if (!entityIds.has(draft.target)) errors.push(`Unknown entity: ${draft.target}`);
        if (draft.kind === 'relocate' && draft.to && !entityIds.has(draft.to)) {
          errors.push(`Unknown location: ${draft.to}`);
        }
        break;
      }
    }
  }

  return { ...draft, errors };
}
