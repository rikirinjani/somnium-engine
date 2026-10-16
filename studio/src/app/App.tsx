import { useEffect } from 'react';
import { useAppState, type AppState } from '../state/appState';
import { CanonExplorer } from '../components/CanonExplorer';
import { TimelineController } from '../components/TimelineController';
import { InterventionComposer } from '../components/InterventionComposer';
import { DiffPresenter } from '../components/DiffPresenter';
import { CausalEvidencePresenter } from '../components/CausalEvidencePresenter';
import { WorldView } from '../components/WorldView';
import { saveProjectToFile } from '../persistence/projectFile';

const tabs = [
  { id: 'canon', label: 'Canon' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'whatif', label: 'What If?' },
  { id: 'diff', label: 'Diff' },
  { id: 'world', label: 'World' },
  { id: 'why', label: 'Why?' },
] as const;

export function App() {
  const state = useAppState();

  useEffect(() => {
    if (!state.project) {
      state.loadDemoProject();
    }
  }, [state.project, state.loadDemoProject]);

  const activeBranch = state.project?.branches.find((b) => b.branchId === state.activeBranchId);
  const statusText =
    state.derivationStatus === 'deriving'
      ? 'Deriving alternate world…'
      : state.derivationError
        ? `Error: ${state.derivationError}`
        : activeBranch
          ? `Active: ${activeBranch.label} (${activeBranch.branchId})`
          : 'No branch active';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <strong>Somnium Studio</strong>
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            {state.project?.name ?? 'Loading…'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {state.project ? (
            <button onClick={() => void saveProjectToFile(state.project!)}>Save project</button>
          ) : null}
        </div>
      </header>

      <aside className="app-sidebar">
        <h3 style={{ marginTop: 0 }}>Branches</h3>
        {state.project?.branches.length ? (
          <ul className="entity-list">
            {state.project.branches.map((b) => (
              <li
                key={b.branchId}
                className={state.activeBranchId === b.branchId ? 'selected' : ''}
                onClick={() => state.setActiveBranch(b.branchId)}
              >
                {b.label}
              </li>
            ))}
          </ul>
        ) : (
          <div className="card">No branches yet.</div>
        )}
      </aside>

      <main className="app-main">
        <div className="tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab ${state.activeTab === t.id ? 'active' : ''}`}
              onClick={() => state.setActiveTab(t.id as typeof state.activeTab)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <TabContent activeTab={state.activeTab} />
      </main>

      <aside className="app-context">
        <ContextPanel />
      </aside>

      <footer className="app-status">
        <span className={state.derivationStatus === 'failed' ? 'error-banner' : undefined}>
          {statusText}
        </span>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          {activeBranch?.worldHash ? `hash ${activeBranch.worldHash.slice(0, 12)}…` : ''}
        </span>
      </footer>
    </div>
  );
}

function TabContent({ activeTab }: { activeTab: AppState['activeTab'] }) {
  switch (activeTab) {
    case 'canon':
      return <CanonExplorer />;
    case 'timeline':
      return <TimelineController />;
    case 'whatif':
      return <InterventionComposer />;
    case 'diff':
      return <DiffPresenter />;
    case 'why':
      return <CausalEvidencePresenter />;
    case 'world':
      return <WorldView />;
    default:
      return <CanonExplorer />;
  }
}

function ContextPanel() {
  const state = useAppState();
  const { project, selectedEntityId, activeTab, selectedEvidenceNodeId } = state;

  const entity = selectedEntityId ? project?.canon.entities.find((e) => e.id === selectedEntityId) : null;
  const world = state.activeBranchId ? state.worlds.get(state.activeBranchId) : null;
  const evidenceEntity = selectedEvidenceNodeId
    ? project?.canon.entities.find((e) => e.id === selectedEvidenceNodeId)
    : null;

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Context</h3>
      {activeTab === 'whatif' ? (
        <div className="card">
          <p>Confirm your intervention and click Derive to run the Core.</p>
          {state.interventionDraft ? (
            <>
              <p>
                <strong>Kind:</strong> {state.interventionDraft.kind}
              </p>
              <p>
                <strong>Target:</strong> {state.interventionDraft.target}
              </p>
              <p>
                <strong>Label:</strong> {state.interventionDraft.label}
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {entity ? (
        <div className="card">
          <h4>{entity.name}</h4>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{entity.id}</p>
          <p>{entity.description}</p>
        </div>
      ) : null}

      {evidenceEntity && activeTab === 'why' ? (
        <div className="card">
          <h4>{evidenceEntity.name}</h4>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{evidenceEntity.id}</p>
        </div>
      ) : null}

      {world && state.activeBranchId ? (
        <div className="card">
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            Branch worldHash: {state.project?.branches.find((b) => b.branchId === state.activeBranchId)?.worldHash.slice(0, 16)}…
          </p>
        </div>
      ) : null}
    </div>
  );
}
