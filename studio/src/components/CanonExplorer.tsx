import { useMemo } from 'react';
import { useAppState } from '../state/appState';
import type { Entity } from '../core-adapter/types';

const kindOrder: Record<string, number> = {
  Character: 0,
  Location: 1,
  Faction: 2,
  Institution: 3,
  Event: 4,
  EventType: 5,
  Work: 6,
  Object: 7,
};

export function CanonExplorer() {
  const { project, selectedEntityId, selectEntity } = useAppState();

  const grouped = useMemo(() => {
    if (!project) return [] as { kind: string; entities: Entity[] }[];
    const map = new Map<string, Entity[]>();
    for (const entity of project.canon.entities) {
      const list = map.get(entity.kind) ?? [];
      list.push(entity);
      map.set(entity.kind, list);
    }
    return [...map.entries()]
      .map(([kind, entities]) => ({ kind, entities: entities.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => (kindOrder[a.kind] ?? 99) - (kindOrder[b.kind] ?? 99));
  }, [project]);

  const selected = useMemo(() => {
    if (!project || !selectedEntityId) return null;
    return project.canon.entities.find((e) => e.id === selectedEntityId) ?? null;
  }, [project, selectedEntityId]);

  return (
    <div>
      <h2>Canon</h2>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ minWidth: 220, maxWidth: 260 }}>
          {grouped.map(({ kind, entities }) => (
            <div key={kind} className="card">
              <h4 style={{ margin: '0 0 0.5rem', color: 'var(--accent)' }}>{kind}s</h4>
              <ul className="entity-list">
                {entities.map((entity) => (
                  <li
                    key={entity.id}
                    className={selectedEntityId === entity.id ? 'selected' : ''}
                    onClick={() => selectEntity(entity.id)}
                  >
                    {entity.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          {selected ? (
            <div className="card">
              <h3>{selected.name}</h3>
              <p>
                <strong>ID:</strong> {selected.id}
              </p>
              <p>
                <strong>Kind:</strong> {selected.kind}
              </p>
              {selected.description ? <p>{selected.description}</p> : null}
            </div>
          ) : (
            <div className="card">Select an entity to inspect.</div>
          )}
        </div>
      </div>
    </div>
  );
}
