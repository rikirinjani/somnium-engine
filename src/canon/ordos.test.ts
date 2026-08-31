/**
 * Somnium Engine — Ordos seed library unit tests (P-004 second canon).
 *
 * Structural assertions only: the cross-canon behavioural suite is a separate
 * lane's job. These pin the ten P-004 properties to exact ids, the Rewind Point
 * contract, and a baseline derivation sanity check (contradiction-free, the
 * load-bearing unknown stays UNKNOWN, the fact-gated rite is ESTABLISHED).
 */
import { describe, expect, it } from "vitest";
import { ordosCanon, ordosRewindPoint, ORDOS_IDS } from "./ordos";
import { computeRewindHash, hashCanon } from "./hash";
import { validateCanon } from "./canon";
import { derive } from "../derive/world-state";
import { negateEvent } from "../timeline/types";
import { validateRewindPoint } from "../timeline/rewind-point";

const seal = ORDOS_IDS.objects.seal;
const chapter = ORDOS_IDS.institution.chapter;

function canonEntities(): string[] {
  return ordosCanon().entities.map((e) => e.id);
}

function factIds(): Set<string> {
  return new Set(ordosCanon().facts.map((f) => f.id));
}

function eventIds(): Set<string> {
  return new Set(
    ordosCanon()
      .entities.filter((e) => e.kind === "Event")
      .map((e) => e.id)
  );
}

/** PRECEDES reachability (transitive) — used for the partial-order assertion. */
function precedesReaches(canon: ReturnType<typeof ordosCanon>, from: string, to: string): boolean {
  const adj = new Map<string, string[]>();
  for (const e of canon.edges) {
    if (e.kind !== "PRECEDES") continue;
    const list = adj.get(e.from) ?? [];
    list.push(e.to);
    adj.set(e.from, list);
  }
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (cur === to) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
  return false;
}

/** Downward-closure check: every PRECEDES-ancestor of a cut event is in the cut. */
function isDownwardClosed(canon: ReturnType<typeof ordosCanon>, cut: string[]): boolean {
  const inCut = new Set(cut);
  for (const edge of canon.edges) {
    if (edge.kind !== "PRECEDES") continue;
    if (inCut.has(edge.to) && !inCut.has(edge.from)) return false;
  }
  return true;
}

describe("ordosCanon identity", () => {
  it("has the required identity and version", () => {
    const canon = ordosCanon();
    expect(canon.canonId).toBe("canon/ordos");
    expect(canon.version).toBe("1.0.0");
  });

  it("hashes deterministically via hashCanon", () => {
    const a = ordosCanon();
    const b = ordosCanon();
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toBe(hashCanon(a));
    expect(a.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is a validatable canon: validateCanon returns zero errors (the gate)", () => {
    expect(validateCanon(ordosCanon())).toEqual([]);
  });

  it("has no validation objections beyond the deliberately-undeclared anchor", () => {
    // Documents the load-bearing unknown: the only conceivable validator
    // objection is that fact/heir-claim-valid's window references an event that
    // is intentionally NOT declared as an entity (property 6 / case-K window
    // variant). Everything else must validate clean.
    const problems = validateCanon(ordosCanon());
    const unrelated = problems.filter((p) => !p.includes(ORDOS_IDS.undeclared.heirProofSworn));
    expect(unrelated).toEqual([]);
  });
});

describe("ordosCanon — the ten P-004 properties", () => {
  it("P1: declares two Object entities — the Seal and the charter document", () => {
    const canon = ordosCanon();
    const objects = canon.entities.filter((e) => e.kind === "Object");
    expect(objects.map((e) => e.id)).toEqual(
      expect.arrayContaining([ORDOS_IDS.objects.seal, ORDOS_IDS.objects.charter])
    );
    expect(ORDOS_IDS.objects.seal).toBe("obj/seal-of-office");
    expect(ORDOS_IDS.objects.charter).toBe("obj/charter-document");
  });

  it("P2: possession is a windowed fact — held_by with windows anchored to the death and the investiture", () => {
    const canon = ordosCanon();
    const holders = canon.facts.filter((f) => f.predicate === "held_by" && f.subject === seal);
    expect(holders.map((f) => f.id)).toEqual(
      expect.arrayContaining([
        ORDOS_IDS.facts.sealHeldAnselm,
        ORDOS_IDS.facts.sealHeldPetronius,
        ORDOS_IDS.facts.sealHeldVaela,
        ORDOS_IDS.facts.sealHeldGalen,
      ])
    );
    expect(canon.facts.find((f) => f.id === ORDOS_IDS.facts.sealHeldAnselm)).toMatchObject({
      subject: seal,
      predicate: "held_by",
      object: ORDOS_IDS.characters.anselm,
      validFrom: null,
      validTo: ORDOS_IDS.events.oldWardenDies,
    });
    expect(canon.facts.find((f) => f.id === ORDOS_IDS.facts.sealHeldPetronius)).toMatchObject({
      validFrom: ORDOS_IDS.events.oldWardenDies,
      validTo: ORDOS_IDS.events.vaelaInvested,
    });
    expect(canon.facts.find((f) => f.id === ORDOS_IDS.facts.sealHeldVaela)).toMatchObject({
      validFrom: ORDOS_IDS.events.vaelaInvested,
      validTo: null,
    });
  });

  it("P3: exactly one EXCLUDES edge, and both endpoints are fact ids (at most one holder)", () => {
    const canon = ordosCanon();
    const excludes = canon.edges.filter((e) => e.kind === "EXCLUDES");
    expect(excludes).toHaveLength(1);
    const facts = factIds();
    expect(facts.has(excludes[0]!.from)).toBe(true);
    expect(facts.has(excludes[0]!.to)).toBe(true);
    expect(excludes[0]!.from).toBe(ORDOS_IDS.facts.sealHeldVaela);
    expect(excludes[0]!.to).toBe(ORDOS_IDS.facts.sealHeldGalen);
  });

  it("P4: a fact-gated event — REQUIRES from a fact to an event (the working rite)", () => {
    const canon = ordosCanon();
    const factIdsSet = factIds();
    const eventIdsSet = eventIds();
    const factGated = canon.edges.some(
      (e) => e.kind === "REQUIRES" && factIdsSet.has(e.from) && eventIdsSet.has(e.to)
    );
    expect(factGated).toBe(true);
    // the load-bearing instance: the rite of binding requires the Seal-held-by fact
    expect(
      canon.edges.some(
        (e) =>
          e.kind === "REQUIRES" &&
          e.from === ORDOS_IDS.facts.sealHeldVaela &&
          e.to === ORDOS_IDS.events.riteBindingVaela
      )
    ).toBe(true);
  });

  it("P5: alternative sufficient causes — one target supported by two DIFFERENT groups", () => {
    const canon = ordosCanon();
    const target = ORDOS_IDS.events.vaelaRecognised;
    const requiresFor = canon.edges.filter((e) => e.kind === "REQUIRES" && e.to === target);
    const groups = new Set(requiresFor.map((e) => e.group ?? "0"));
    expect(groups.size).toBeGreaterThanOrEqual(2);
    expect(groups.has("acclaim")).toBe(true);
    expect(groups.has("blood")).toBe(true);
    // the settlement is disjunctive too: either rite settles the succession
    const settled = canon.edges.filter(
      (e) => e.kind === "REQUIRES" && e.to === ORDOS_IDS.events.successionSettled
    );
    expect(new Set(settled.map((e) => e.group ?? "0")).size).toBeGreaterThanOrEqual(2);
  });

  it("P6: the disputed-parentage anchor event is referenced but NOT an entity", () => {
    const canon = ordosCanon();
    const heirClaim = canon.facts.find((f) => f.id === ORDOS_IDS.facts.heirClaimValid);
    expect(heirClaim).toMatchObject({
      subject: ORDOS_IDS.characters.galen,
      predicate: "rightful_heir_of",
      object: ORDOS_IDS.characters.anselm,
    });
    // anchored to the undeclared event
    expect(heirClaim?.validFrom).toBe(ORDOS_IDS.undeclared.heirProofSworn);
    expect(heirClaim?.validTo).toBeNull();
    // the anchor is genuinely referenced (as a window anchor) but never declared
    expect(canonEntities()).not.toContain(ORDOS_IDS.undeclared.heirProofSworn);
    expect(
      canon.facts.some(
        (f) =>
          f.validFrom === ORDOS_IDS.undeclared.heirProofSworn ||
          f.validTo === ORDOS_IDS.undeclared.heirProofSworn
      )
    ).toBe(true);
    // and the dependent chain is wired to it
    expect(
      canon.edges.some(
        (e) =>
          e.kind === "REQUIRES" &&
          e.from === ORDOS_IDS.facts.heirClaimValid &&
          e.to === ORDOS_IDS.events.galenClaimsInheritance
      )
    ).toBe(true);
  });

  it("P7: partially ordered — the two rival chains share no PRECEDES ordering", () => {
    const canon = ordosCanon();
    // internally ordered (sanity: our chains are real chains)
    expect(precedesReaches(canon, ORDOS_IDS.events.oldWardenDies, ORDOS_IDS.events.vaelaInvested)).toBe(true);
    expect(precedesReaches(canon, ORDOS_IDS.events.oldWardenDies, ORDOS_IDS.events.galenInvested)).toBe(true);
    // but canon genuinely does not order the rival routes against each other
    expect(precedesReaches(canon, ORDOS_IDS.events.vaelaInvested, ORDOS_IDS.events.galenInvested)).toBe(false);
    expect(precedesReaches(canon, ORDOS_IDS.events.galenInvested, ORDOS_IDS.events.vaelaInvested)).toBe(false);
    expect(precedesReaches(canon, ORDOS_IDS.events.riteBindingVaela, ORDOS_IDS.events.riteBindingGalen)).toBe(false);
    expect(precedesReaches(canon, ORDOS_IDS.events.galenClaimsInheritance, ORDOS_IDS.events.vaelaAcclaimed)).toBe(false);
  });

  it("P8: the Chapter is an entity with no location at all", () => {
    const canon = ordosCanon();
    expect(canon.entities.some((e) => e.id === chapter)).toBe(true);
    expect(canon.facts.some((f) => f.subject === chapter && f.predicate === "located_in")).toBe(false);
  });

  it("P9: at least two atemporal facts — the Seal is silver; the charter grants a veto", () => {
    const canon = ordosCanon();
    const atemporal = canon.facts.filter((f) => f.validFrom === null && f.validTo === null);
    expect(atemporal.length).toBeGreaterThanOrEqual(2);
    expect(canon.facts.find((f) => f.id === ORDOS_IDS.facts.sealIsSilver)).toMatchObject({
      subject: seal,
      predicate: "made_of",
      object: "silver",
      validFrom: null,
      validTo: null,
    });
    expect(canon.facts.find((f) => f.id === ORDOS_IDS.facts.charterGrantsVeto)).toMatchObject({
      subject: ORDOS_IDS.objects.charter,
      predicate: "grants_veto_to",
      object: chapter,
      validFrom: null,
      validTo: null,
    });
  });

  it("P10: at least one Work binding carries a facts requirement", () => {
    const canon = ordosCanon();
    const investiture = canon.workBindings.find(
      (w) => w.workId === ORDOS_IDS.works.investitureOfVaela
    );
    expect(investiture?.facts).toEqual([ORDOS_IDS.facts.sealHeldVaela]);
    expect(canon.workBindings.some((w) => (w.facts?.length ?? 0) > 0)).toBe(true);
    expect(canon.workBindings.length).toBe(3);
  });
});

describe("ordosRewindPoint", () => {
  it("anchors at the Old Warden's death with a downward-closed cut and fixed metadata", () => {
    const rp = ordosRewindPoint();
    expect(rp.id).toBe("RP-ORDOS-001");
    expect(rp.canonId).toBe("canon/ordos");
    expect(rp.anchorEvent).toBe(ORDOS_IDS.events.oldWardenDies);
    expect(rp.cut).toEqual([ORDOS_IDS.events.oldWardenDies]);
    expect(rp.label).toBe("The Old Warden Dies");
    expect(rp.tags).toEqual(["succession", "seal", "office"]);
    expect(rp.created).toBe("2026-08-31T00:00:00.000Z");
  });

  it("derivedHash matches computeRewindHash exactly (single source of truth)", () => {
    const rp = ordosRewindPoint();
    const canon = ordosCanon();
    expect(rp.derivedHash).toBe(
      computeRewindHash(ORDOS_IDS.canon, rp.anchorEvent, rp.cut, canon.hash)
    );
    expect(rp.derivedHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("passes validateRewindPoint, and the cut is downward-closed under PRECEDES", () => {
    const rp = ordosRewindPoint();
    const canon = ordosCanon();
    expect(validateRewindPoint(rp, canon).ok).toBe(true);
    expect(isDownwardClosed(canon, rp.cut)).toBe(true);
  });

  it("is deterministic", () => {
    const a = ordosRewindPoint();
    const b = ordosRewindPoint();
    expect(a).toEqual(b);
    expect(a.derivedHash).toBe(b.derivedHash);
  });
});

describe("ordosCanon — baseline derivation sanity", () => {
  it("derives a contradiction-free baseline with no temporal violations", () => {
    const baseline = derive(ordosCanon(), []);
    expect(baseline.contradictions).toEqual([]);
    expect(baseline.temporalViolations).toEqual([]);
  });

  it("keeps the disputed-parentage chain UNKNOWN (never UNSUPPORTED, never EXCLUDED)", () => {
    const baseline = derive(ordosCanon(), []);
    expect(baseline.statuses[ORDOS_IDS.events.galenRecognised]).toBe("UNKNOWN");
    expect(baseline.statuses[ORDOS_IDS.events.galenClaimsInheritance]).toBe("UNKNOWN");
    expect(baseline.statuses[ORDOS_IDS.events.galenInvested]).toBe("UNKNOWN");
    expect(baseline.statuses[ORDOS_IDS.facts.heirClaimValid]).toBe("UNKNOWN");
    expect(baseline.statuses[ORDOS_IDS.facts.sealHeldGalen]).toBe("UNKNOWN");
    expect(baseline.statuses[ORDOS_IDS.events.riteBindingGalen]).toBe("UNKNOWN");
    expect(baseline.statuses[ORDOS_IDS.events.charterVetoInvoked]).toBe("UNKNOWN");
  });

  it("grounds the fact-gated rite: the Seal in Vaela's hands makes the rite ESTABLISHED", () => {
    const baseline = derive(ordosCanon(), []);
    expect(baseline.statuses[ORDOS_IDS.facts.sealHeldVaela]).toBe("ESTABLISHED");
    expect(baseline.statuses[ORDOS_IDS.events.riteBindingVaela]).toBe("ESTABLISHED");
    expect(baseline.statuses[ORDOS_IDS.events.successionSettled]).toBe("ESTABLISHED");
  });

  it("shows exactly one effective holder of the Seal at baseline", () => {
    const baseline = derive(ordosCanon(), []);
    const holders = baseline.facts.filter((f) => f.predicate === "held_by" && f.subject === seal);
    expect(holders.map((f) => f.id)).toEqual([ORDOS_IDS.facts.sealHeldVaela]);
  });

  it("alternative sufficient causes: removing acclamation leaves Vaela recognised by blood", () => {
    const canon = ordosCanon();
    const noAcclaim = derive(canon, [negateEvent(ORDOS_IDS.events.vaelaAcclaimed)]);
    // one sufficient route removed, the other (settled blood) carries the outcome
    expect(noAcclaim.statuses[ORDOS_IDS.events.vaelaRecognised]).toBe("ESTABLISHED");
    expect(noAcclaim.statuses[ORDOS_IDS.events.riteBindingVaela]).toBe("ESTABLISHED");
    expect(noAcclaim.statuses[ORDOS_IDS.events.successionSettled]).toBe("ESTABLISHED");
    expect(noAcclaim.contradictions).toEqual([]);
  });
});
