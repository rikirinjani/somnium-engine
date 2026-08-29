/**
 * Somnium Engine — status queries over a derived world.
 */
import type { EventStatus, WorkStatus } from "../derive/lattice";
import type { WorldState } from "../derive/world-state";

/** Status of an entity in a world; UNKNOWN when absent. */
export function statusOf(ws: WorldState, entityId: string): EventStatus {
  return ws.statuses[entityId] ?? "UNKNOWN";
}

/** Classification of a canonical Work in a world; UNKNOWN when absent. */
export function workStatusOf(ws: WorldState, workId: string): WorkStatus {
  return ws.workStatuses[workId] ?? "UNKNOWN";
}
