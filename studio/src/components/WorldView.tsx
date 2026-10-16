import { useMemo } from 'react';
import { useAppState } from '../state/appState';
import { coreAdapter } from '../core-adapter/adapter';

export function WorldView() {
  const { project, activeBranchId, worlds, selectEntity, selectedEvidenceNodeId, selectEvidenceNode } = useAppState();

  const world = activeBranchId ? worlds.get(activeBranchId) : null;

  const factsBySubject = useMemo(() => {
    if (!world) return new Map<string, { predicate: string; object: unknown }[]>();
    const map = new Map<string, { predicate: string; object: unknown }[]>();
    for (const fact of world.facts) {
      const list = map.get(fact.subject) ?? [];
      list.push({ predicate: fact.predicate, object: fact.object });
      map.set(fact.subject, list);
    }
    return map;
  }, [world]);

  if (!project) return <div className="card">No project.</div>;
  if (!world) return <div className="card">No derived world. Derive a branch to explore.</div>;

  const activeBranch = project.branches.find((b) => b.branchId === activeBranchId);

  return (
    <div>
      <h2>Alternate World</h2>
      <div className="card">
        <p>
          <strong>Branch:</strong> {activeBranch?.label ?? activeBranchId}
        </p>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          worldHash {activeBranch?.worldHash ?? '—'} | stateHash {activeBranch?.stateHash ?? '—'}
        </p>
      </div>

      <div className="card">
        <h3>Events</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {project.canon.entities
            .filter((e) => e.kind === 'Event')
            .map((event) => {
              const status = coreAdapter.statusOf(world, event.id);
              const reachable = coreAdapter.reachable(world, event.id);
              return (
                <div
                  key={event.id}
                  className={`diff-row ${selectedEvidenceNodeId === event.id ? 'selected' : ''}`}
                  onClick={() => selectEvidenceNode(event.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className={`status-badge status-${status}`}>{status}</span>
                  <span>{event.name}</span>
                  {reachable ? <span style={{ color: 'var(--success)', fontSize: '0.8rem' }}>reachable</span> : null}
                </div>
              );
            })}
        </div>
      </div>

      <div className="card">
        <h3>Characters & effective facts</h3>
        {project.canon.entities
          .filter((e) => e.kind === 'Character')
          .map((char) => {
            const facts = factsBySubject.get(char.id) ?? [];
            return (
              <div key={char.id} style={{ marginBottom: '0.75rem' }}>
                <strong>{char.name}</strong> ({char.id})
                <div style={{ paddingLeft: '1rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
                  {facts.length === 0 ? 'No effective facts.' : (
                    <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                      {facts.map((f, i) => (
                        <li key={i}>{f.predicate}: {JSON.stringify(f.object)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      <div className="card">
        <h3>Works</h3>
        {project.canon.entities
          .filter((e) => e.kind === 'Work')
          .map((work) => {
            const status = coreAdapter.workStatusOf(world, work.id);
            return (
              <div key={work.id} className="diff-row">
                <span className={`status-badge status-${status === 'UNKNOWN' ? 'UNKNOWN' : status}`}>{status}</span>
                <span>{work.name}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
