// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { RecruitmentBoardRow } from "@/lib/services/recruitment-board";
import { applyBoard, recruitmentSortFields } from "./board-data";
import { eventColumns, RECRUITMENT_COLUMNS } from "./board-columns";

const EVENT = { eventId: "e1", name: "Taster session", date: null, colourKey: null };

function row(overrides: Partial<RecruitmentBoardRow>): RecruitmentBoardRow {
  return {
    prospectId: "p1",
    personId: "person1",
    displayName: "Rosalind Penhaligon",
    givenName: "Rosalind",
    familyName: "Penhaligon",
    aliases: [],
    college: null,
    matriculationYear: null,
    expectedGraduationYear: null,
    degreeField: null,
    hasMobile: false,
    hasEmail: false,
    phoneForCall: null,
    status: "identified",
    source: null,
    firstContactOn: null,
    personalSent: false,
    recruitmentSent: false,
    consent: "never_asked",
    consentChangedAt: null,
    consentByOperator: false,
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
      row({
        prospectId: "identified-older",
        status: "identified",
        firstContactOn: "2026-01-01T10:00:00.000Z",
      }),
      row({
        prospectId: "identified-newer",
        status: "identified",
        firstContactOn: "2026-06-01T10:00:00.000Z",
      }),
      row({ prospectId: "joined", status: "joined" }),
    ];
    const sorted = applyBoard(rows, { search: "", filters: {}, sort: [] }).map((r) => r.prospectId);
    expect(sorted).toEqual(["identified-newer", "identified-older", "joined", "declined"]);
  });

  it("LAN-486 — sorts First contact chronologically to the minute, within one day", () => {
    const rows = [
      row({ prospectId: "evening", firstContactOn: "2026-10-07T18:31:00.000Z" }),
      row({ prospectId: "morning", firstContactOn: "2026-10-07T08:05:00.000Z" }),
      row({ prospectId: "a-minute-later", firstContactOn: "2026-10-07T18:32:00.000Z" }),
      row({ prospectId: "never", firstContactOn: null }),
    ];
    const ascending = applyBoard(rows, {
      search: "",
      filters: {},
      sort: [{ key: "firstContact", direction: "asc" }],
    }).map((r) => r.prospectId);
    expect(ascending).toEqual(["morning", "evening", "a-minute-later", "never"]);

    const byDefault = applyBoard(rows, { search: "", filters: {}, sort: [] }).map(
      (r) => r.prospectId,
    );
    expect(byDefault).toEqual(["a-minute-later", "evening", "morning", "never"]);
  });

  it("finds a recruit by name or alias", () => {
    const rows = [
      row({ prospectId: "a", displayName: "Rosalind Penhaligon" }),
      row({ prospectId: "b", displayName: "Tobias Wrenfield", aliases: ["Toby"] }),
    ];
    expect(
      applyBoard(rows, { search: "toby", filters: {}, sort: [] }).map((r) => r.prospectId),
    ).toEqual(["b"]);
    expect(
      applyBoard(rows, { search: "rosalind", filters: {}, sort: [] }).map((r) => r.prospectId),
    ).toEqual(["a"]);
  });

  it("filters by status, consent, and the sent booleans", () => {
    const rows = [
      row({ prospectId: "a", status: "engaged", consent: "granted", personalSent: true }),
      row({ prospectId: "b", status: "declined", consent: "never_asked", personalSent: false }),
    ];
    expect(
      applyBoard(rows, { search: "", filters: { status: "declined" }, sort: [] }).map(
        (r) => r.prospectId,
      ),
    ).toEqual(["b"]);
    expect(
      applyBoard(rows, { search: "", filters: { consent: "granted" }, sort: [] }).map(
        (r) => r.prospectId,
      ),
    ).toEqual(["a"]);
    expect(
      applyBoard(rows, { search: "", filters: { personalSent: "yes" }, sort: [] }).map(
        (r) => r.prospectId,
      ),
    ).toEqual(["a"]);
    expect(
      applyBoard(rows, { search: "", filters: { personalSent: "no" }, sort: [] }).map(
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
      applyBoard(rows, { search: "", filters: { attendedAnyEvent: "yes" }, sort: [] }).map(
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
        sort: [],
      }).map((r) => r.prospectId),
    ).toEqual(["a"]);
  });

  it("sorts by an explicit column, reversing on repeat", () => {
    const rows = [
      row({ prospectId: "a", college: "Balliol" }),
      row({ prospectId: "b", college: "Wadham" }),
    ];
    expect(
      applyBoard(rows, {
        search: "",
        filters: {},
        sort: [{ key: "college", direction: "asc" }],
      }).map((r) => r.prospectId),
    ).toEqual(["a", "b"]);
    expect(
      applyBoard(rows, {
        search: "",
        filters: {},
        sort: [{ key: "college", direction: "desc" }],
      }).map((r) => r.prospectId),
    ).toEqual(["b", "a"]);
  });

  it("never invents a value — a null field sorts last regardless of direction", () => {
    const rows = [
      row({ prospectId: "known", college: "Balliol" }),
      row({ prospectId: "unknown", college: null }),
    ];
    expect(
      applyBoard(rows, {
        search: "",
        filters: {},
        sort: [{ key: "college", direction: "asc" }],
      }).map((r) => r.prospectId),
    ).toEqual(["known", "unknown"]);
    expect(
      applyBoard(rows, {
        search: "",
        filters: {},
        sort: [{ key: "college", direction: "desc" }],
      }).map((r) => r.prospectId),
    ).toEqual(["known", "unknown"]);
  });
});

describe("LAN-495 — three sort keys over the recruits", () => {
  const ids = (rows: readonly RecruitmentBoardRow[]) => rows.map((r) => r.prospectId);

  it("offers First name, Last name, Recruit and the columns, First contact as a date, an event's by its name", () => {
    const columns = [...RECRUITMENT_COLUMNS, ...eventColumns([EVENT])];
    const fields = recruitmentSortFields(columns, (band) =>
      band === `events:${EVENT.eventId}` ? EVENT.name : String(band),
    );
    expect(fields.slice(0, 4).map((f) => f.label)).toEqual([
      "First name",
      "Last name",
      "Recruit",
      "College",
    ]);
    expect(fields.find((f) => f.key === "firstContact")?.kind).toBe("date");
    expect(fields.find((f) => f.key === "graduation")?.kind).toBe("number");
    expect(fields.at(-2)?.label).toBe("Taster session · RSVP");
    expect(fields.at(-1)?.label).toBe("Taster session · Attendance");
  });

  it("sorts First contact by instant across zones, a blank last either way", () => {
    const rows = [
      row({ prospectId: "later", firstContactOn: "2026-10-07T18:32:00.000Z" }),
      row({ prospectId: "never", firstContactOn: null }),
      row({ prospectId: "earlier", firstContactOn: "2026-10-07T19:31:00.000+01:00" }),
    ];
    const sorted = (direction: "asc" | "desc") =>
      ids(
        applyBoard(rows, { search: "", filters: {}, sort: [{ key: "firstContact", direction }] }),
      );
    expect(sorted("asc")).toEqual(["earlier", "later", "never"]);
    expect(sorted("desc")).toEqual(["later", "earlier", "never"]);
  });

  it("orders by status, then first contact, then name and id — the same from any input order", () => {
    const rows = [
      row({ prospectId: "c", displayName: "Sam", status: "engaged", firstContactOn: null }),
      row({
        prospectId: "b",
        displayName: "Sam",
        status: "engaged",
        firstContactOn: "2026-10-01T10:00:00.000Z",
      }),
      row({
        prospectId: "a",
        displayName: "Sam",
        status: "engaged",
        firstContactOn: "2026-10-01T10:00:00.000Z",
      }),
      row({ prospectId: "d", displayName: "Ann", status: "committed", firstContactOn: null }),
    ];
    const sort = [
      { key: "status", direction: "asc" as const },
      { key: "firstContact", direction: "desc" as const },
    ];
    const once = ids(applyBoard(rows, { search: "", filters: {}, sort }));
    // Committed before Engaged — alphabetical (LAN-426); then the two equal
    // instants by name (both Sam), then by id; then the blank.
    expect(once).toEqual(["d", "a", "b", "c"]);
    expect(ids(applyBoard([...rows].reverse(), { search: "", filters: {}, sort }))).toEqual(once);
  });
});
