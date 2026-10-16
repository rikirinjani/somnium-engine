import { useMemo } from 'react';
import { useAppState } from '../state/appState';

export function TimelineController() {
  const { project, selectedEntityId, selectEntity, setActiveTab } = useAppState();

  const events = useMemo(() => {
    if (!project) return [];
    return project.canon.entities
      .filter((e) => e.kind === 'Event')
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [project]);

  const precedes = useMemo(() => {
    if (!project) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const edge of project.canon.edges) {
      if (edge.kind === 'PRECEDES') {
        const list = map.get(edge.from) ?? [];
        list.push(edge.to);
        map.set(edge.from, list);
      }
    }
    return map;
  }, [project]);

  const selectedEvent = useMemo(() => {
    if (!project || !selectedEntityId) return null;
    return project.canon.entities.find((e) => e.id === selectedEntityId && e.kind === 'Event') ?? null;
  }, [project, selectedEntityId]);

  const descendants = useMemo(() => {
    if (!selectedEvent) return [];
    const out: string[] = [];
    const queue = [...(precedes.get(selectedEvent.id) ?? [])];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      out.push(id);
      queue.push(...(precedes.get(id) ?? []));
    }
    return out;
  }, [selectedEvent, precedes]);

  return (
    <div>
      <h2>Timeline</h2>
      <div className="card">
        <p>
          Select an event to create a Rewind Point and ask "What if?" The arrows show PRECEDES
          relationships.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {events.map((event) => {
          const next = precedes.get(event.id) ?? [];
          return (
            <div
              key={event.id}
              className={`card ${selectedEntityId === event.id ? 'selected' : ''}`}
              style={{ cursor: 'pointer', borderColor: selectedEntityId === event.id ? 'var(--accent)' : undefined }}
              onClick={() => selectEntity(event.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{event.name}</strong>
                <span className="status-badge status-UNKNOWN">{event.id}</span>
              </div>
              {next.length > 0 ? (
                <div style={{ marginTop: '0.5rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  → {next.map((id) => project?.canon.entities.find((e) => e.id === id)?.name ?? id).join(', ')}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {selectedEvent ? (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3>{selectedEvent.name}</h3>
          <p>{selectedEvent.description}</p>
          {descendants.length > 0 ? (
            <p>
              <strong>Downstream events:</strong>{' '}
              {descendants.map((id) => project?.canon.entities.find((e) => e.id === id)?.name ?? id).join(', ')}
            </p>
          ) : null}
          <button
            className="primary"
            style={{ marginTop: '0.5rem' }}
            onClick={() => setActiveTab('whatif')}
          >
            What if {selectedEvent.name} changed?
          </button>
        </div>
      ) : null}
    </div>
  );
}
