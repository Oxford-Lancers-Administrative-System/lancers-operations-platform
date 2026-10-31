import { describe, expect, it } from "vitest";

import {
  academicProblems,
  COLLEGE_OPTIONS,
  DEGREE_LETTER_OPTIONS,
  degreeLettersDisplay,
  isOxfordCollege,
  isSubjectFor,
  listedCollegeFor,
  listedLettersFor,
  listedSubjectFor,
  subjectsForLetters,
} from "./oxford-academic";
import { SUBJECTS_BY_LETTERS } from "./oxford-academic-data";

describe("LAN-512 — the college list", () => {
  it("is the 39 colleges, the 5 permanent private halls and Ripon College Cuddesdon", () => {
    const groups = COLLEGE_OPTIONS.reduce<Record<string, number>>((counts, option) => {
      counts[option.group] = (counts[option.group] ?? 0) + 1;
      return counts;
    }, {});
    expect(groups).toEqual({
      Colleges: 39,
      "Permanent private halls": 5,
      "External colleges": 1,
    });
    for (const name of [
      "All Souls College",
      "Christ Church",
      "St Catherine's College",
      "The Queen's College",
      "Blackfriars",
      "St Stephen's House",
      "Ripon College Cuddesdon",
    ]) {
      expect(isOxfordCollege(name), name).toBe(true);
    }
    expect(new Set(COLLEGE_OPTIONS.map((option) => option.value)).size).toBe(45);
  });

  it("writes the names as the University does: St with no full stop, a straight apostrophe", () => {
    for (const { value } of COLLEGE_OPTIONS) {
      expect(value).not.toMatch(/St\./);
      expect(value).not.toMatch(/[‘’]/);
    }
    expect(isOxfordCollege("St. Catz")).toBe(false);
    expect(isOxfordCollege("Christ Church College")).toBe(false);
  });

  it("matches an exact name whatever its case, punctuation or curly apostrophe", () => {
    expect(listedCollegeFor("st catherine’s college")).toBe("St Catherine's College");
    expect(listedCollegeFor("St. Anne's College")).toBe("St Anne's College");
    expect(listedCollegeFor("St Catz")).toBeNull();
  });
});

describe("LAN-512 — the degree letters", () => {
  it("are the 37 awards on offer, the six most common first", () => {
    expect(DEGREE_LETTER_OPTIONS).toHaveLength(37);
    expect(DEGREE_LETTER_OPTIONS.slice(0, 6).map((option) => option.value)).toEqual([
      "DPhil",
      "BA",
      "MSc",
      "MPhil",
      "MSt",
      "MBA",
    ]);
    const rest = DEGREE_LETTER_OPTIONS.slice(6).map((option) => option.value);
    expect(rest).toEqual(
      [...rest].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
    );
    expect(DEGREE_LETTER_OPTIONS.map((option) => option.value)).toContain("DClinPsych");
    expect(DEGREE_LETTER_OPTIONS.map((option) => option.value)).not.toContain("Other");
    expect(DEGREE_LETTER_OPTIONS.map((option) => option.value)).not.toContain("MSc by Research");
  });

  it("labels each set of letters with the award's full name, and shows an unlisted value as stored", () => {
    expect(degreeLettersDisplay("DPhil")).toBe("DPhil — Doctor of Philosophy");
    expect(degreeLettersDisplay("Other")).toBe("Other");
    expect(degreeLettersDisplay(null)).toBeNull();
    expect(listedLettersFor("dphil")).toBe("DPhil");
  });
});

describe("LAN-512 — the subject follows the letters", () => {
  it("offers at least one subject with every set of letters", () => {
    for (const { value } of DEGREE_LETTER_OPTIONS) {
      expect(subjectsForLetters(value).length, value).toBeGreaterThan(0);
    }
    expect(Object.keys(SUBJECTS_BY_LETTERS)).toHaveLength(37);
  });

  it("pairs an undergraduate subject with each award its course page names", () => {
    expect(isSubjectFor("BA", "Geography")).toBe(true);
    expect(isSubjectFor("BA", "Philosophy, Politics and Economics (PPE)")).toBe(true);
    expect(isSubjectFor("MChem", "Chemistry")).toBe(true);
    expect(isSubjectFor("BA", "Chemistry")).toBe(false);
    expect(isSubjectFor("MEarthSci", "Earth Sciences (Geology)")).toBe(true);
    expect(isSubjectFor("BA", "Earth Sciences (Geology)")).toBe(true);
  });

  it("names the overlap awards by the research's proposals", () => {
    expect(subjectsForLetters("MBA")).toEqual(["Business Administration"]);
    expect(subjectsForLetters("EMBA")).toEqual(["Business Administration (Executive)"]);
    expect(subjectsForLetters("MPP")).toEqual(["Public Policy"]);
    expect(subjectsForLetters("BCL")).toEqual(["Civil Law"]);
    expect(subjectsForLetters("MJur")).toEqual(["Law"]);
    expect(subjectsForLetters("DClinPsych")).toEqual(["Clinical Psychology"]);
    expect(subjectsForLetters("BM BCh")).toEqual(["Medicine", "Medicine (graduate entry)"]);
  });

  it("puts the Centre for Doctoral Training programmes under DPhil by their own names", () => {
    expect(isSubjectFor("DPhil", "Fusion Power (EPSRC CDT)")).toBe(true);
    expect(isSubjectFor("DPhil", "Generative Biology (EIT DTP)")).toBe(true);
    // MSc by Research in X is MSc, subject X.
    expect(isSubjectFor("MSc", "Biochemistry")).toBe(true);
    expect(isSubjectFor("PGCE", "Mandarin")).toBe(true);
  });

  it("matches a subject exactly for the letters, whatever its case", () => {
    expect(listedSubjectFor("BA", "geography")).toBe("Geography");
    expect(listedSubjectFor("MBA", "geography")).toBeNull();
    // LAN-512, 31 October: with no letters, any listed subject.
    expect(listedSubjectFor("", "geography")).toBe("Geography");
    expect(listedSubjectFor("", "geogrophy")).toBeNull();
  });
});

describe("LAN-512 — the subject list with no degree chosen (Brian's walk, 31 October)", () => {
  const every = [...new Set(Object.values(SUBJECTS_BY_LETTERS).flat())];

  it("is every subject, once each, sorted", () => {
    const all = subjectsForLetters("");
    expect(new Set(all)).toEqual(new Set(every));
    expect(all).toHaveLength(every.length);
    expect([...all]).toEqual([...all].sort((a, b) => a.localeCompare(b, "en-GB")));
    // "Medicine" is offered with BA, BM BCh and DM, and listed once.
    expect(all.filter((subject) => subject === "Medicine")).toHaveLength(1);
  });

  it("narrows to the degree's own subjects once letters are chosen", () => {
    expect(subjectsForLetters("MBA")).toEqual(["Business Administration"]);
    expect(subjectsForLetters("BA").length).toBeLessThan(subjectsForLetters("").length);
    expect(subjectsForLetters("Visiting")).toEqual([]);
  });

  it("lets a form save a listed subject with no letters, and nothing else", () => {
    expect(academicProblems({ subject: "Geography" })).toEqual({});
    expect(academicProblems({ letters: "", subject: "Fusion Power (EPSRC CDT)" })).toEqual({});
    expect(academicProblems({ subject: "Biochem" })).toEqual({
      subject: "Choose a subject from the list for this degree.",
    });
  });
});

describe("LAN-512 — what a form may save", () => {
  it("allows no answer, and any listed answer", () => {
    expect(academicProblems({})).toEqual({});
    expect(
      academicProblems({ college: "Keble College", letters: "BA", subject: "Geography" }),
    ).toEqual({});
  });

  it("refuses anything not in the lists, and a subject the letters do not offer", () => {
    expect(academicProblems({ college: "St Catz" })).toEqual({
      college: "Choose a college from the list.",
    });
    expect(academicProblems({ letters: "PhD", subject: "Geography" })).toEqual({
      letters: "Choose the degree from the list.",
    });
    expect(academicProblems({ subject: "Geogrophy" })).toEqual({
      subject: "Choose a subject from the list for this degree.",
    });
    expect(academicProblems({ letters: "MBA", subject: "Geography" })).toEqual({
      subject: "Choose a subject from the list for this degree.",
    });
  });
});
