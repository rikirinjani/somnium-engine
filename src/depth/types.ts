/**
 * Somnium Engine — counterfactual depth and divergence.
 *
 * Depth is NOT a scalar count of interventions (docs/ARCHITECTURE-RECONNAISSANCE.md §8).
 * Two orthogonal measures are reported:
 *
 *   1. genealogicalDepth — length of the parent chain from the baseline universe.
 *      This is bookkeeping: it says how many intervention generations produced
 *      this world, not how different the world is.
 *   2. divergence — a STRUCTURAL measure of how far the world actually moved.
 *      Five no-op interventions score 0; one world-altering intervention scores
 *      high. This is the meaningful metric.
 *
 *      divergence is a DISTANCE from the baseline world, not monotone along an
 *      intervention chain: an intervention that restores a canonical value
 *      legitimately lowers it (the world moves BACK toward baseline).
 */

export interface DivergenceScore {
  /** entities whose status differs from the baseline world */
  changedStatusCount: number;
  /**
   * Narrative state changes: effective facts compared by (subject, predicate)
   * where the object VALUE differs between the two worlds (a key present in
   * only one world counts as a change). This measures what actually changed in
   * the world, as opposed to changedFactCount, which counts fact-record churn
   * by id and can stay constant across genuinely different worlds.
   */
  changedStateCount: number;
  /** fact additions + removals + overrides vs baseline */
  changedFactCount: number;
  /** canonical Works whose classification differs from baseline */
  impactedWorkCount: number;
  /**
   * Maximum shortest-path distance, over the post-intervention REQUIRES ∪ ENABLES
   * graph (directed prerequisite -> dependent), from any intervention target to
   * any changed-status node. An intervention target itself is distance 0.
   * 0 when nothing changed.
   */
  causalReach: number;
  /**
   * Deterministic weighted composite:
   *   changedStatusCount * 1 + changedStateCount * 1 + changedFactCount * 0.5
   *   + impactedWorkCount * 2 + causalReach * 1
   */
  score: number;
}

export interface DepthMetrics {
  /** parent-chain length from baseline; baseline itself is 0 */
  genealogicalDepth: number;
  /** number of interventions in the chain — explicitly NOT the depth measure */
  interventionCount: number;
  divergence: DivergenceScore;
}
