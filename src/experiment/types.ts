/**
 * Somnium Engine — experiment artifacts.
 *
 * Carries KE's ExperimentSet artifact shape (src/experiment/types.ts) MINUS the
 * statistical layer: Monte Carlo replicates, confidence intervals and Cohen's d
 * are vacuous in a deterministic non-stochastic engine
 * (docs/ARCHITECTURE-RECONNAISSANCE.md §2 item 5, §11).
 *
 * An experiment is therefore a single deterministic run, not a distribution.
 */
import type { Intervention } from "../timeline/types";
import type { WorldDiff } from "../diff/types";
import type { DepthMetrics } from "../depth/types";

export interface ExperimentRun {
  runId: string;
  canonId: string;
  canonHash: string;
  rpId: string | null;
  universeId: string;
  /** full ordered intervention chain from baseline */
  interventions: Intervention[];
  depth: DepthMetrics;
  diff: WorldDiff;
  /** derived WorldState hash — the replay fingerprint */
  worldHash: string;
  /** metadata only — never hashed, never compared */
  createdAt: string;
}

export interface ExperimentSet {
  setId: string;
  label: string;
  canonId: string;
  /** one run per depth for a chain experiment; every intermediate state is inspectable */
  runs: ExperimentRun[];
  /** metadata only — never hashed */
  generatedAt: string;
}
