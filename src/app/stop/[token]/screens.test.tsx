/**
 * The opt-out surface's two faces — LAN-202's own flow, and LAN-372's
 * exemption.
 *
 * Brian, 2026-09-16: "A roster player who wants the club to stop messaging
 * them is asking to leave the team; that is a membership conversation, not an
 * opt-out. Consent and Stop are recruit concepts only." No `messaging_stop`
 * credential is minted for a player any more, but the ones already sent keep
 * resolving until their season closes, so this is what they land on.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import StopFlow, { MEMBERSHIP_HEADING, MEMBERSHIP_SENTENCE } from "./stop-flow";

const withdraw = vi.fn(async () => ({ ok: true }));

describe("a roster player's stop link", () => {
  it("shows the membership sentence and offers nothing to press", () => {
    render(<StopFlow seasonLabel="Michaelmas 2026" rosterMember withdraw={withdraw} />);

    expect(screen.getByText(MEMBERSHIP_HEADING)).toBeTruthy();
    expect(screen.getByText(MEMBERSHIP_SENTENCE)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("a recruit's stop link", () => {
  it("still offers the opt-out LAN-202 shipped", () => {
    const { container } = render(
      <StopFlow seasonLabel="Michaelmas 2026" rosterMember={false} withdraw={withdraw} />,
    );

    expect(container.textContent).not.toContain(MEMBERSHIP_SENTENCE);
    expect(screen.getByRole("button", { name: /stop messaging me/i })).toBeTruthy();
  });
});
