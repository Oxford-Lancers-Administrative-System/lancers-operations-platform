/**
 * `/invitation-link` — LAN-311.
 *
 * The screen exists to say two things and to withhold a third.
 *
 *   * It speaks about an **invitation**. The words it replaces were about a
 *     password reset, written for `/forgot-password`'s journey, and an invited
 *     operator has never had a password to reset.
 *   * It offers the remedy that works: the club re-issues the invitation. The
 *     remedy it must not offer is "request a new link", which is what Clint was
 *     told and which fails identically — "REQUESTING LINK GIVES SAME ERROR".
 *   * It withholds why the token failed. Expired, spent, wrong type and
 *     malformed all arrive here; the route already made them indistinguishable,
 *     and this page must not undo that by naming one.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { INVALID_INVITATION_LINK_MESSAGE } from "@/lib/auth/invitation";
import { INVALID_RECOVERY_LINK_MESSAGE } from "@/lib/auth/recovery";
import InvitationLinkPage from "./page";

function show() {
  return render(<InvitationLinkPage />);
}

describe("the screen a failed invitation lands on", () => {
  it("names the invitation, not a password reset", () => {
    show();

    expect(
      screen.getByRole("heading", { name: "This invitation link cannot be used" }),
    ).toBeVisible();
    expect(screen.getByTestId("invitation-link-unusable")).toHaveTextContent(
      INVALID_INVITATION_LINK_MESSAGE,
    );
  });

  it("offers re-issuing the invitation as the way forward", () => {
    show();

    expect(screen.getByTestId("invitation-link-unusable")).toHaveTextContent(
      /send the invitation again/i,
    );
  });

  /**
   * The defect, as an assertion. `/reset-password` with no session renders
   * `INVALID_RECOVERY_LINK_MESSAGE` and a "Request a new link" button pointing
   * at `/forgot-password`; that is exactly the pair of things an invitee must
   * not be handed, and reverting the route's branch fails here.
   */
  it("never sends the invitee down the password-reset path", () => {
    const { container } = show();

    expect(container.textContent).not.toContain(INVALID_RECOVERY_LINK_MESSAGE);
    expect(container.textContent).not.toMatch(/password[- ]reset|reset link|request a new link/i);
    expect(container.querySelector('a[href="/forgot-password"]')).toBeNull();
  });

  it("says nothing about why the link failed, or about any account", () => {
    const { container } = show();

    expect(container.textContent).not.toMatch(/expired|already used|spent|no account|not found/i);
  });
});
