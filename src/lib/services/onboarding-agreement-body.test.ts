// @vitest-environment node
/**
 * Reading a versioned agreement's body — LAN-347. Pure text, no database: what
 * is under test is that the page can find the section it needs to put a field
 * beside, and that a body written before sections existed still renders.
 */
import { describe, expect, it } from "vitest";

import {
  AGREEMENT_BULLET,
  agreementLine,
  agreementLines,
  agreementSection,
  bodyRequiresPrintedName,
  isPlaceholderVersion,
  parseAgreementBody,
} from "./onboarding-agreement-body";

describe("parseAgreementBody", () => {
  it("divides the body at its section markers, keeping their order", () => {
    const sections = parseAgreementBody(
      ["[[heading]]", "A heading", "[[lead]]", "A lead sentence."].join("\n"),
    );
    expect(sections.map((section) => section.id)).toEqual(["heading", "lead"]);
    expect(sections[0].blocks[0].text).toBe("A heading");
  });

  it("reads a body with no markers as one unnamed section of paragraphs", () => {
    // The Code of Conduct's placeholder, until LAN-282. Nothing about it
    // changes because the photo release grew sections.
    const sections = parseAgreementBody("Placeholder — the real wording is owed.\nSecond line.");
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBeNull();
    expect(sections[0].blocks.map((block) => block.text)).toEqual([
      "Placeholder — the real wording is owed.",
      "Second line.",
    ]);
  });

  it("carries a bullet's own marker rather than inventing one at render time", () => {
    const [section] = parseAgreementBody(["[[permissions]]", "- store copies;"].join("\n"));
    expect(section.blocks[0]).toEqual({
      kind: "bullet",
      text: "store copies;",
      marker: AGREEMENT_BULLET,
    });
  });

  it("keeps a numbered clause's printed number", () => {
    const [section] = parseAgreementBody(
      ["[[clauses]]", "1. The University will process the photograph."].join("\n"),
    );
    expect(section.blocks[0]).toEqual({
      kind: "numbered",
      text: "The University will process the photograph.",
      marker: "1.",
    });
  });

  it("reads a subheading", () => {
    const [section] = parseAgreementBody(["[[privacy]]", "## How we use your data"].join("\n"));
    expect(section.blocks[0]).toEqual({
      kind: "subheading",
      text: "How we use your data",
      marker: null,
    });
  });

  it("drops blank lines rather than rendering empty paragraphs", () => {
    const [section] = parseAgreementBody(["[[lead]]", "", "One line.", "  ", ""].join("\n"));
    expect(section.blocks).toHaveLength(1);
  });

  it("leaves text that merely looks like a marker alone", () => {
    const [section] = parseAgreementBody(
      ["[[lead]]", "See [[the appendix]] for more, and 2. of the clauses."].join("\n"),
    );
    expect(section.blocks[0].kind).toBe("paragraph");
    expect(section.blocks[0].text).toBe("See [[the appendix]] for more, and 2. of the clauses.");
  });
});

describe("finding what the page needs", () => {
  const body = ["[[address]]", "Address", "[[permissions]]", "One", "Two"].join("\n");

  it("returns a named section's first printed line as a field's label", () => {
    expect(agreementLine(parseAgreementBody(body), "address")).toBe("Address");
  });

  it("returns every line of a named section", () => {
    expect(agreementLines(parseAgreementBody(body), "permissions")).toEqual(["One", "Two"]);
  });

  it("is empty, never a guess, for a section this version does not carry", () => {
    expect(agreementSection(parseAgreementBody(body), "print-name")).toBeNull();
    expect(agreementLine(parseAgreementBody(body), "print-name")).toBe("");
    expect(agreementLines(parseAgreementBody(body), "print-name")).toEqual([]);
  });
});

describe("what the wording asks the record to carry", () => {
  it("requires a printed name when the version declares one", () => {
    expect(bodyRequiresPrintedName(["[[print-name]]", "Print name"].join("\n"))).toBe(true);
  });

  it("does not require one of a body that never mentions it", () => {
    expect(bodyRequiresPrintedName("Placeholder — the real wording is owed.")).toBe(false);
  });
});

describe("isPlaceholderVersion", () => {
  it("is the version label's own statement, not a guess about the text", () => {
    expect(isPlaceholderVersion("placeholder-v1")).toBe(true);
    expect(isPlaceholderVersion("oxford-consent-form-v1")).toBe(false);
  });
});
