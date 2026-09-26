/**
 * `/operate/recruitment/qr` — `W1-04`'s one mint control, and when it is there.
 *
 * Brian, 2026-09-23: a live sign-up code is printed on posters nobody can
 * recall, so nothing on this page may replace it. The control is *removed*
 * while a code is live rather than disabled, and that is what this file holds
 * still — a disabled button would pass a "cannot press it" assertion while
 * still telling the operator that re-minting is a thing they do here.
 *
 * The view is rendered directly rather than through `page.tsx`, which reads the
 * season and the live code from PostgreSQL: what is proved here is which
 * controls reach the DOM for each of the two states, and that is a property of
 * the props, not of the reader. `recruitment-signup-codes.test.ts` proves the
 * minting itself against the real database, and the server action is untouched
 * by this change.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./actions", () => ({
  mintRecruitmentSignupCodeAction: vi.fn().mockResolvedValue({ error: null }),
}));

import QrCodeView from "./qr-code-view";

const JOIN_URL = "https://example.test/join/LANCERS26";
const MINTED_AT = "2026-09-01T10:00:00.000Z";

describe("no live code yet", () => {
  it("offers MINT CODE, so a first code can still be issued", () => {
    render(
      <QrCodeView
        seasonLabel="2026-27"
        joinUrl={null}
        cardImageSrc={null}
        figures={null}
        mintedAt={null}
      />,
    );

    expect(screen.getByTestId("recruitment-qr-none")).toBeTruthy();
    const mint = screen.getByTestId("recruitment-qr-mint");
    expect(mint.textContent).toBe("MINT CODE");
    expect(mint.hasAttribute("disabled")).toBe(false);
  });
});

describe("a live code", () => {
  function renderLive() {
    render(
      <QrCodeView
        seasonLabel="2026-27"
        joinUrl={JOIN_URL}
        cardImageSrc="/join/LANCERS26/opengraph-image.png"
        figures={{ visits: 31, partial: 9, completed: 4 }}
        mintedAt={MINTED_AT}
      />,
    );
  }

  it("has no mint control at all — the printed code cannot be replaced from here", () => {
    renderLive();

    expect(screen.queryByTestId("recruitment-qr-mint")).toBeNull();
    expect(screen.queryByText("MINT NEW CODE")).toBeNull();
    expect(screen.queryByText("MINT CODE")).toBeNull();
    expect(screen.queryByRole("button", { name: /mint/i })).toBeNull();
  });

  it("keeps the code, COPY LINK and the minted caption", () => {
    renderLive();

    expect(screen.getByTestId("recruitment-qr-image")).toBeTruthy();
    expect(screen.getByText(JOIN_URL)).toBeTruthy();
    expect(screen.getByTestId("recruitment-qr-copy").textContent).toBe("COPY LINK");
    expect(screen.getByTestId("recruitment-qr-download").textContent).toBe("DOWNLOAD");
    expect(screen.getByText(/^Minted /)).toBeTruthy();
  });

  /** LAN-428, item 4: three numbers at the top, in the page's own Metric. */
  it("shows Visits, Partial and Completed at the top, in that order", () => {
    renderLive();

    const figures = screen.getByTestId("recruitment-qr-figures");
    expect(screen.getByTestId("recruitment-qr-visits").textContent).toBe("31Visits");
    expect(screen.getByTestId("recruitment-qr-partial").textContent).toBe("9Partial");
    expect(screen.getByTestId("recruitment-qr-completed").textContent).toBe("4Completed");
    expect([...figures.children].map((child) => child.getAttribute("data-testid"))).toEqual([
      "recruitment-qr-visits",
      "recruitment-qr-partial",
      "recruitment-qr-completed",
    ]);
    // Above the code, not below it.
    expect(
      figures.compareDocumentPosition(screen.getByTestId("recruitment-qr-image")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("sign-ins this season")).toBeNull();
  });
});

describe("no live code, no numbers", () => {
  it("shows no figures when nothing is live", () => {
    render(
      <QrCodeView
        seasonLabel="2026-27"
        joinUrl={null}
        cardImageSrc={null}
        figures={null}
        mintedAt={null}
      />,
    );

    expect(screen.queryByTestId("recruitment-qr-figures")).toBeNull();
  });
});
