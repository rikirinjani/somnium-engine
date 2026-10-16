import { useAppState } from '../state/appState';
import { coreAdapter } from '../core-adapter/adapter';

export function DiffPresenter() {
  const { project, activeBranchId, worlds, diffs, selectedDiffItemId, selectDiffItem, switchToWhyFor } = useAppState();

  if (!project) return <div className="card">No project loaded.</div>;

  const branch = project.branches.find((b) => b.branchId === activeBranchId);
  const diff = diffs.get(activeBranchId ?? '');
  const world = activeBranchId ? worlds.get(activeBranchId) : null;

  if (!diff || !world || !branch) {
    return <div className="card">Derive a counterfactual to see the WorldDiff.</div>;
  }

  if (diff.statusChanges.length === 0 && diff.factAdditions.length === 0 && diff.factRemovals.length === 0 &&
      diff.factOverrides.length === 0 && diff.workStatusChanges.length === 0 && diff.edgeChanges.length === 0 &&
      diff.contradictionsIntroduced.length === 0) {
    return <div className="card">This intervention did not change the effective world state.</div>;
  }

  const summary = `Status changes: ${diff.statusChanges.length}; Work changes: ${diff.workStatusChanges.length}; Fact overrides: ${diff.factOverrides.length}; Edge changes: ${diff.edgeChanges.length}`;

  return (
    <div>
      <h2>WorldDiff</h2>
      <div className="card">
        <p>{summary}</p>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Branch {branch.label} ({branch.branchId}) — worldHash {branch.worldHash.slice(0, 16)}…
        </p>
      </div>

      {diff.statusChanges.length > 0 ? (
        <div className="card">
          <h3>Status changes</h3>
          {diff.statusChanges.map((c) => {
            const entity = project.canon.entities.find((e) => e.id === c.entityId);
            const id = `status-${c.entityId}`;
            return (
              <div
                key={id}
                className={`diff-row ${selectedDiffItemId === id ? 'selected' : ''}`}
                onClick={() => selectDiffItem(id)}
              >
                <span className="status-badge status-UNKNOWN">{c.entityId}</span>
                <span>{entity?.name ?? c.entityId}</span>
                <span style={{ color: 'var(--muted)' }}>{c.from} → {c.to}</span>
                <button onClick={(e) => { e.stopPropagation(); switchToWhyFor(c.entityId); }}>Why?</button>
              </div>
            );
          })}
        </div>
      ) : null}

      {diff.workStatusChanges.length > 0 ? (
        <div className="card">
          <h3>Work changes</h3>
          {diff.workStatusChanges.map((w) => {
            const work = project.canon.entities.find((e) => e.id === w.workId);
            const id = `work-${w.workId}`;
            return (
              <div key={id} className="diff-row" onClick={() => selectDiffItem(id)}>
                <span className="status-badge status-UNKNOWN">{w.workId}</span>
                <span>{work?.name ?? w.workId}</span>
                <span style={{ color: 'var(--muted)' }}>{w.from} → {w.to}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {diff.factOverrides.length > 0 ? (
        <div className="card">
          <h3>Fact overrides</h3>
          {diff.factOverrides.map((o, i) => {
            const id = `fact-${o.factId}-${i}`;
            return (
              <div key={id} className="diff-row" onClick={() => selectDiffItem(id)}>
                <span className="status-badge status-UNKNOWN">{o.factId}</span>
                <span>{o.field}</span>
                <span style={{ color: 'var(--muted)' }}>{JSON.stringify(o.from)} → {JSON.stringify(o.to)}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {diff.edgeChanges.length > 0 ? (
        <div className="card">
          <h3>Edge changes</h3>
          {diff.edgeChanges.map((e) => {
            const id = `edge-${e.edgeId}`;
            return (
              <div key={id} className="diff-row" onClick={() => selectDiffItem(id)}>
                <span className="status-badge status-UNKNOWN">{e.edgeId}</span>
                <span>
                  {e.added ? 'added' : 'removed'} {e.kind} {e.from} → {e.to}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {diff.contradictionsIntroduced.length > 0 ? (
        <div className="card">
          <h3>Contradictions introduced</h3>
          {diff.contradictionsIntroduced.map((c) => (
            <div key={c.id} className="diff-row">
              <span>{c.detail}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
