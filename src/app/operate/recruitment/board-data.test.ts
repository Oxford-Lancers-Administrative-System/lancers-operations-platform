import { describe, expect, it } from "vitest";

import type { RecruitmentBoardRow } from "@/lib/services/recruitment-board";
import { applyBoard } from "./board-data";

function row(overrides: Partial<RecruitmentBoardRow>): RecruitmentBoardRow {
  return {
    prospectId: "p1",
    personId: "person1",
    displayName: "Rosalind Penhaligon",
    aliases: [],
    college: null,
    matriculationYear: null,
    expectedGraduationYear: null,
    degreeField: null,
    hasMobile: false,
    hasEmail: false,
    status: "identified",
    source: null,
    firstContactOn: null,
    personalSent: false,
    recruitmentSent: false,
    consent: "never_asked",
    playedBefore: null,
    watchedBefore: null,
    positionInterest: null,
    gearOwned: null,
    howTheyHeard: null,
    anythingElse: null,
    events: {},
    attendedAnyEvent: false,
    ...overrides,
  };
}

describe("applyBoard", () => {
  it("defaults to ladder order, then most recent first contact — W1", () => {
    const rows = [
      row({ prospectId: "declined", status: "declined" }),
      row({ prospectId: "identified-older", status: "identified", firstContactOn: "2026-01-01" }),
      row({ prospectId: "identified-newer", status: "identified", firstContactOn: "2026-06-01" }),
      row({ prospectId: "joined", status: "joined" }),
    ];
    const sorted = applyBoard(rows, { search: "", filters: {}, sort: null }).map(
      (r) => r.prospectId,
    );
    expect(sorted).toEqual(["identified-newer", "identified-older", "joined", "declined"]);
  });

  it("finds a recruit by name or alias", () => {
    const rows = [
      row({ prospectId: "a", displayName: "Rosalind Penhaligon" }),
      row({ prospectId: "b", displayName: "Tobias Wrenfield", aliases: ["Toby"] }),
    ];
    expect(
      applyBoard(rows, { search: "toby", filters: {}, sort: null }).map((r) => r.prospectId),
    ).toEqual(["b"]);
    expect(
      applyBoard(rows, { search: "rosalind", filters: {}, sort: null }).map((r) => r.prospectId),
    ).toEqual(["a"]);
  });

  it("filters by status, consent, and the sent booleans", () => {
    const rows = [
      row({ prospectId: "a", status: "engaged", consent: "granted", personalSent: true }),
      row({ prospectId: "b", status: "declined", consent: "never_asked", personalSent: false }),
    ];
    expect(
      applyBoard(rows, { search: "", filters: { status: "declined" }, sort: null }).map(
        (r) => r.prospectId,
      ),
    ).toEqual(["b"]);
    expect(
      applyBoard(rows, { search: "", filters: { consent: "granted" }, sort: null }).map(
        (r) => r.prospectId,
      ),
    ).toEqual(["a"]);
    expect(
      applyBoard(rows, { search: "", filters: { personalSent: "yes" }, sort: null }).map(
        (r) => r.prospectId,
      ),
    ).toEqual(["a"]);
    expect(
      applyBoard(rows, { search: "", filters: { personalSent: "no" }, sort: null }).map(
        (r) => r.prospectId,
      ),
    ).toEqual(["b"]);
  });

  it("filters by whether they attended any event, combinably with search", () => {
    const rows = [
      row({ prospectId: "a", displayName: "Attended Anna", attendedAnyEvent: true }),
      row({ prospectId: "b", displayName: "Never Nora", attendedAnyEvent: false }),
    ];
    expect(
      applyBoard(rows, { search: "", filters: { attendedAnyEvent: "yes" }, sort: null }).map(
        (r) => r.prospectId,
      ),
    ).toEqual(["a"]);
  });

  it("combines filters — every predicate must hold", () => {
    const rows = [
      row({ prospectId: "a", status: "engaged", consent: "granted" }),
      row({ prospectId: "b", status: "engaged", consent: "never_asked" }),
    ];
    expect(
      applyBoard(rows, {
        search: "",
        filters: { status: "engaged", consent: "granted" },
        sort: null,
      }).map((r) => r.prospectId),
    ).toEqual(["a"]);
  });

  it("sorts by an explicit column, reversing on repeat", () => {
    const rows = [
      row({ prospectId: "a", college: "Balliol" }),
      row({ prospectId: "b", college: "Wadham" }),
    ];
    expect(
      applyBoard(rows, { search: "", filters: {}, sort: { key: "college", direction: "asc" } }).map(
        (r) => r.prospectId,
      ),
    ).toEqual(["a", "b"]);
    expect(
      applyBoard(rows, {
        search: "",
        filters: {},
        sort: { key: "college", direction: "desc" },
      }).map((r) => r.prospectId),
    ).toEqual(["b", "a"]);
  });

  it("never invents a value — a null field sorts last regardless of direction", () => {
    const rows = [
      row({ prospectId: "known", college: "Balliol" }),
      row({ prospectId: "unknown", college: null }),
    ];
    expect(
      applyBoard(rows, { search: "", filters: {}, sort: { key: "college", direction: "asc" } }).map(
        (r) => r.prospectId,
      ),
    ).toEqual(["known", "unknown"]);
    expect(
      applyBoard(rows, {
        search: "",
        filters: {},
        sort: { key: "college", direction: "desc" },
      }).map((r) => r.prospectId),
    ).toEqual(["known", "unknown"]);
  });
});
