import { useEffect } from 'react';
import { useAppState, validateInterventionDraft, type InterventionDraft } from '../state/appState';
import { coreAdapter } from '../core-adapter/adapter';

export function InterventionComposer() {
  const { project, selectedEntityId, interventionDraft, setInterventionDraft, deriveActiveIntervention, activeBranchId } =
    useAppState();

  useEffect(() => {
    if (!interventionDraft && selectedEntityId && project) {
      const entity = project.canon.entities.find((e) => e.id === selectedEntityId);
      if (entity?.kind === 'Event') {
        setInterventionDraft({
          kind: 'negateEvent',
          target: selectedEntityId,
          label: `${entity.name} never happens`,
          errors: [],
        });
      }
    }
  }, [selectedEntityId, project, interventionDraft, setInterventionDraft]);

  if (!project) return <div className="card">Loading project…</div>;

  const branch = project.branches.find((b) => b.branchId === activeBranchId);
  const rp = project.rewindPoints.find((r) => r.id === branch?.rpId);

  const events = project.canon.entities.filter((e) => e.kind === 'Event');

  function updateDraft(patch: Partial<InterventionDraft>) {
    const next = { ...(interventionDraft ?? { kind: 'negateEvent' as const, target: '', label: '', errors: [] }), ...patch };
    setInterventionDraft(validateInterventionDraft(next, project));
  }

  const isValid = interventionDraft && interventionDraft.errors.length === 0;

  return (
    <div>
      <h2>What If?</h2>
      <div className="card">
        <p>
          <strong>Base world:</strong> {branch?.label ?? 'Baseline'}
        </p>
        <p>
          <strong>Rewind Point:</strong> {rp ? `${rp.label} (${rp.anchorEvent})` : 'Baseline (no rewind point)'}
        </p>
      </div>

      <div className="card">
        <h3>Intervention</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label>
            Kind
            <select
              data-kind
              value={interventionDraft?.kind ?? 'negateEvent'}
              onChange={(e) =>
                updateDraft({
                  kind: e.target.value as InterventionDraft['kind'],
                  target: '',
                  label: '',
                  predicate: undefined,
                  object: undefined,
                  to: undefined,
                })
              }
            >
              <option value="negateEvent">negateEvent</option>
              <option value="forceEvent">forceEvent</option>
              <option value="setFact">setFact</option>
              <option value="retractFact">retractFact</option>
              <option value="severEdge">severEdge</option>
              <option value="relocate">relocate</option>
            </select>
          </label>

          {interventionDraft?.kind === 'negateEvent' || interventionDraft?.kind === 'forceEvent' ? (
            <label>
              Target event
              <select
                value={interventionDraft?.target ?? ''}
                onChange={(e) => {
                  const target = e.target.value;
                  const name = project.canon.entities.find((ent) => ent.id === target)?.name ?? target;
                  updateDraft({
                    target,
                    label:
                      interventionDraft?.kind === 'negateEvent'
                        ? `${name} never happens`
                        : `${name} is forced to happen`,
                  });
                }}
              >
                <option value="">Select event</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} ({ev.id})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {interventionDraft?.kind === 'setFact' ? (
            <>
              <label>
                Subject
                <input
                  value={interventionDraft?.target ?? ''}
                  onChange={(e) => updateDraft({ target: e.target.value })}
                  placeholder="char/vara"
                />
              </label>
              <label>
                Predicate
                <input
                  value={interventionDraft?.predicate ?? ''}
                  onChange={(e) => updateDraft({ predicate: e.target.value })}
                  placeholder="located_in"
                />
              </label>
              <label>
                Object
                <input
                  value={String(interventionDraft?.object ?? '')}
                  onChange={(e) => updateDraft({ object: e.target.value })}
                  placeholder="loc/thornhollow"
                />
              </label>
            </>
          ) : null}

          {interventionDraft?.kind === 'relocate' ? (
            <>
              <label>
                Subject
                <input
                  value={interventionDraft?.target ?? ''}
                  onChange={(e) => updateDraft({ target: e.target.value })}
                  placeholder="char/vara"
                />
              </label>
              <label>
                To
                <input
                  value={interventionDraft?.to ?? ''}
                  onChange={(e) => updateDraft({ to: e.target.value })}
                  placeholder="loc/thornhollow"
                />
              </label>
            </>
          ) : null}

          {(interventionDraft?.kind === 'retractFact' || interventionDraft?.kind === 'severEdge') && (
            <label>
              Target
              <input
                value={interventionDraft?.target ?? ''}
                onChange={(e) => updateDraft({ target: e.target.value })}
                placeholder={interventionDraft?.kind === 'retractFact' ? 'fact/vara-in-valdar' : 'edge/exodus-requires-blight'}
              />
            </label>
          )}

          <label>
            Label
            <input
              value={interventionDraft?.label ?? ''}
              onChange={(e) => updateDraft({ label: e.target.value })}
              placeholder="Describe the change"
            />
          </label>

          {interventionDraft && interventionDraft.errors.length > 0 ? (
            <div className="error-banner">
              {interventionDraft.errors.map((err, i) => (
                <div key={i}>{err}</div>
              ))}
            </div>
          ) : null}

          <button className="primary" disabled={!isValid} onClick={() => void deriveActiveIntervention()}>
            Confirm & Derive
          </button>
        </div>
      </div>
    </div>
  );
}
