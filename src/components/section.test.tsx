import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BAND_COLOURS, Section } from "./section";
import { CLUB } from "@/theme";

describe("Section", () => {
  it("renders a plain card with an h2 at the h3 size", () => {
    render(
      <Section title="Operator account" description="Can this person sign in" testId="account">
        body
      </Section>,
    );
    const section = screen.getByTestId("section-account");
    expect(section.querySelector("h2")).toHaveTextContent("Operator account");
    expect(section).toHaveTextContent("Can this person sign in");
    expect(section).toHaveTextContent("body");
  });

  it("renders a banded card on the brief's colours", () => {
    render(
      <Section title="Person" variant="banded" band="person" testId="person">
        body
      </Section>,
    );
    expect(screen.getByTestId("section-person")).toHaveAttribute("data-band", "person");
    expect(BAND_COLOURS.person.header).toBe(CLUB.oxfordBlue);
    expect(BAND_COLOURS.season.header).toBe(CLUB.royalBlue);
    expect(BAND_COLOURS.onboarding.header).toBe(CLUB.oldGold);
    // The purple attendance band is gone: attendance and history read neutral.
    expect(BAND_COLOURS.attendance.header).toBe(BAND_COLOURS.history.header);
  });
});
