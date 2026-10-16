import { coreAdapter } from '../core-adapter/adapter';
import type { Project, Branch } from '../state/appState';

export interface SerializedProject {
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  canon: unknown;
  rewindPoints: unknown[];
  branches: Array<Omit<Branch, 'worldHash' | 'stateHash'> & { worldHash?: string; stateHash?: string }>;
}

export function serializeProject(project: Project): SerializedProject {
  return {
    projectId: project.projectId,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: new Date().toISOString(),
    canon: project.canon,
    rewindPoints: project.rewindPoints,
    branches: project.branches.map((b) => ({
      branchId: b.branchId,
      parentBranchId: b.parentBranchId,
      rpId: b.rpId,
      interventions: b.interventions,
      label: b.label,
      worldHash: b.worldHash,
      stateHash: b.stateHash,
    })),
  };
}

export function deserializeProject(serialized: SerializedProject): Project {
  return {
    projectId: serialized.projectId,
    name: serialized.name,
    createdAt: serialized.createdAt,
    updatedAt: serialized.updatedAt,
    canon: coreAdapter.loadCanon(serialized.canon),
    rewindPoints: serialized.rewindPoints.map((rp) => rp as Project['rewindPoints'][number]),
    branches: serialized.branches.map((b) => ({
      branchId: b.branchId,
      parentBranchId: b.parentBranchId ?? null,
      rpId: b.rpId ?? null,
      interventions: b.interventions,
      label: b.label,
      worldHash: b.worldHash ?? '',
      stateHash: b.stateHash ?? '',
    })),
  };
}

export function projectToJson(project: Project): string {
  return JSON.stringify(serializeProject(project), null, 2);
}

export function projectFromJson(json: string): Project {
  return deserializeProject(JSON.parse(json) as SerializedProject);
}

export async function saveProjectToFile(project: Project): Promise<void> {
  const blob = new Blob([projectToJson(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/\s+/g, '-').toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function loadProjectFromFile(file: File): Promise<Project> {
  const text = await file.text();
  return projectFromJson(text);
}
