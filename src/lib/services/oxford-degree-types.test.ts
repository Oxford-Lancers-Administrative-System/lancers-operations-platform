// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DEGREE_TYPE_OPTIONS,
  DEGREE_TYPE_OTHER,
  DEGREE_TYPE_VALUES,
  degreeTypeDisplay,
  isDegreeType,
} from "./oxford-degree-types";

// LAN-494. The University's own award types, grouped, plus Visiting and Other.
describe("the Oxford degree type list", () => {
  it("covers every group the issue names, in its order, with Other last", () => {
    const groups = [...new Set(DEGREE_TYPE_OPTIONS.map((option) => option.group))];
    expect(groups).toEqual([
      "Undergraduate",
      "Integrated master's",
      "Postgraduate taught",
      "Research",
      "Certificates, diplomas and non-degree study",
      "Other Oxford awards",
      "Other",
    ]);
    expect(DEGREE_TYPE_VALUES.at(-1)).toBe(DEGREE_TYPE_OTHER);
  });

  it("holds the awards the issue verified, and the two the implementation check added", () => {
    for (const code of [
      "BA",
      "BM BCh",
      "MBiochem",
      "MMathPhys",
      "MSci",
      "MSt",
      "EMBA",
      "BCL",
      "MJur",
      "PGCE",
      "DPhil",
      "MSc by Research",
      "DClinPsych",
      "UGAdvDip",
      "FCert",
      "Visiting",
      "MA",
      "DMus",
      "CertHE",
      "Diploma in Legal Studies",
    ]) {
      expect(isDegreeType(code), code).toBe(true);
    }
  });

  it("adds no generic degree Oxford does not award", () => {
    for (const code of ["PhD", "MRes", "MEd", "LLM", "MSc in Education"]) {
      expect(isDegreeType(code), code).toBe(false);
    }
  });

  it("has no code twice", () => {
    expect(new Set(DEGREE_TYPE_VALUES).size).toBe(DEGREE_TYPE_VALUES.length);
  });

  it("labels an award with its abbreviation and full name", () => {
    expect(degreeTypeDisplay("DPhil", null)).toBe("DPhil — Doctor of Philosophy");
    expect(degreeTypeDisplay("MSc by Research", null)).toBe("MSc by Research");
    expect(degreeTypeDisplay("Visiting", null)).toBe("Visiting or recognised student (non-degree)");
  });

  it("shows an Other type by its own name, and nothing for no answer", () => {
    expect(degreeTypeDisplay("Other", "MRes (visiting)")).toBe("Other — MRes (visiting)");
    expect(degreeTypeDisplay("Other", null)).toBe("Other");
    expect(degreeTypeDisplay(null, null)).toBeNull();
    expect(degreeTypeDisplay(undefined, undefined)).toBeNull();
  });
});
