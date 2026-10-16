import { useMemo } from 'react';
import { useAppState } from '../state/appState';
import { coreAdapter } from '../core-adapter/adapter';

export function CausalEvidencePresenter() {
  const { project, activeBranchId, worlds, selectedEvidenceNodeId, selectEvidenceNode } = useAppState();

  const world = activeBranchId ? worlds.get(activeBranchId) : null;

  const node = useMemo(() => {
    if (!project || !world || !selectedEvidenceNodeId) return null;
    return (
      project.canon.entities.find((e) => e.id === selectedEvidenceNodeId) ?? {
        id: selectedEvidenceNodeId,
        kind: 'Unknown',
        name: selectedEvidenceNodeId,
        description: '',
      }
    );
  }, [project, world, selectedEvidenceNodeId]);

  const grounding = useMemo(() => {
    if (!world || !node) return null;

    const status = coreAdapter.statusOf(world, node.id);
    const judgment = world.judgments[node.id];
    const workStatus = project?.canon.entities.some((e) => e.id === node.id && e.kind === 'Work')
      ? coreAdapter.workStatusOf(world, node.id)
      : null;

    const relevantEdges = world.edges.filter(
      (e) => e.from === node.id || e.to === node.id
    );

    const contradictions = world.contradictions.filter(
      (c) => c.a === node.id || c.b === node.id || c.detectedAt === node.id
    );

    return {
      status,
      workStatus,
      truthValue: judgment?.truth ?? 'NEITHER',
      supportKind: judgment?.support ?? 'NONE',
      relevantEdges,
      contradictions,
    };
  }, [world, node, project]);

  if (!node || !grounding) {
    return (
      <div className="card">
        Select a changed node from the WorldDiff or World view to see its grounding.
      </div>
    );
  }

  return (
    <div>
      <h2>Why?</h2>
      <div className="card">
        <h3>{node.name} ({node.id})</h3>
        <p>
          <strong>Status:</strong>{' '}
          <span className={`status-badge status-${grounding.status}`}>{grounding.status}</span>
        </p>
        {grounding.workStatus ? (
          <p>
            <strong>Work status:</strong>{' '}
            <span className="status-badge status-UNKNOWN">{grounding.workStatus}</span>
          </p>
        ) : null}
        <p>
          <strong>Truth:</strong> {grounding.truthValue}
        </p>
        <p>
          <strong>Support:</strong> {grounding.supportKind}
        </p>
      </div>

      {grounding.relevantEdges.length > 0 ? (
        <div className="card">
          <h3>Relevant edges</h3>
          {grounding.relevantEdges.map((edge) => {
            const fromName = project?.canon.entities.find((e) => e.id === edge.from)?.name ?? edge.from;
            const toName = project?.canon.entities.find((e) => e.id === edge.to)?.name ?? edge.to;
            return (
              <div key={edge.id} className="diff-row">
                <span className="status-badge status-UNKNOWN">{edge.kind}</span>
                <span>{fromName} → {toName}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {grounding.contradictions.length > 0 ? (
        <div className="card">
          <h3>Contradictions</h3>
          {grounding.contradictions.map((c) => (
            <div key={c.id} className="diff-row">
              <span>{c.detail}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card">
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          This is deterministic grounding from the Core. It shows how the Core reached its
          verdict; it does not claim attribution beyond the support structure.
        </p>
      </div>
    </div>
  );
}
