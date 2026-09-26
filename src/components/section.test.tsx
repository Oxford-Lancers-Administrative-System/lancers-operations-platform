import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BAND_COLOURS, Section } from "./section";
import { BandColoursProvider } from "./band-colours-provider";
import { bandColoursForSwatch, DEFAULT_ROSTER_GROUP_COLOURS } from "./band-colours";
import { CLUB } from "@/theme-tokens";

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

  it("renders a banded card on the seeded colours", () => {
    render(
      <Section title="Person" variant="banded" band="person" testId="person">
        body
      </Section>,
    );
    expect(screen.getByTestId("section-person")).toHaveAttribute("data-band", "person");
    expect(BAND_COLOURS.person.header).toBe(CLUB.oxfordBlue);
    expect(BAND_COLOURS.season.header).toBe(CLUB.royalBlue);
    // LAN-430 (W2, round 4): the Old Gold groups moved to Lancer Gold.
    expect(BAND_COLOURS.onboarding.header).toBe(CLUB.gold);
    // The purple attendance band is gone: attendance and history read neutral.
    expect(BAND_COLOURS.attendance.header).toBe(BAND_COLOURS.history.header);
  });

  it("prints charcoal band text on Lancer Gold and Orange, white elsewhere", () => {
    expect(bandColoursForSwatch("lancer_gold").text).toBe(CLUB.charcoal);
    expect(bandColoursForSwatch("orange").text).toBe(CLUB.charcoal);
    expect(bandColoursForSwatch("blue").text).toBe(CLUB.white);
    expect(BAND_COLOURS.kit.text).toBe(CLUB.charcoal);
    expect(BAND_COLOURS.person.text).toBe(CLUB.white);
  });

  it("draws a roster group in the colour the club chose, and leaves a record-only band alone", () => {
    render(
      <BandColoursProvider groupColours={{ ...DEFAULT_ROSTER_GROUP_COLOURS, kit: "red" }}>
        <Section title="Kit" variant="banded" band="kit" testId="kit">
          body
        </Section>
        <Section title="History" variant="banded" band="history" testId="history">
          body
        </Section>
      </BandColoursProvider>,
    );
    const head = (id: string) =>
      screen.getByTestId(id).querySelector("h2")!.parentElement as HTMLElement;
    expect(getComputedStyle(head("section-kit")).backgroundColor).toBe("rgb(198, 40, 40)");
    expect(getComputedStyle(head("section-kit")).color).toBe("rgb(255, 255, 255)");
    expect(getComputedStyle(head("section-history")).backgroundColor).not.toBe("rgb(198, 40, 40)");
  });
});
