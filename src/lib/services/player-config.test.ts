import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveHudlJoinLink, resolvePlayerGroupLink } from "./player-config";

/** Dummy values only — the club's real links are configuration and never enter this repository (LAN-327, LAN-333). */
const DUMMY_GROUP = "https://chat.example.invalid/group";
const DUMMY_HUDL = "https://www.example.invalid/hudl-join";

describe("resolvePlayerGroupLink", () => {
  it("returns the trimmed configured link", () => {
    expect(resolvePlayerGroupLink({ PLAYER_WHATSAPP_GROUP_LINK: `  ${DUMMY_GROUP} ` })).toBe(
      DUMMY_GROUP,
    );
  });

  it("returns null when unset — the offer disappears rather than breaking", () => {
    expect(resolvePlayerGroupLink({})).toBeNull();
  });

  it("returns null for a blank value", () => {
    expect(resolvePlayerGroupLink({ PLAYER_WHATSAPP_GROUP_LINK: "   " })).toBeNull();
  });

  it("is not the recruits' variable — the two groups are different destinations", () => {
    expect(resolvePlayerGroupLink({ RECRUITMENT_WHATSAPP_GROUP_LINK: DUMMY_GROUP })).toBeNull();
  });
});

describe("resolveHudlJoinLink", () => {
  it("returns the trimmed configured link", () => {
    expect(resolveHudlJoinLink({ HUDL_JOIN_LINK: ` ${DUMMY_HUDL}  ` })).toBe(DUMMY_HUDL);
  });

  it("returns null when unset", () => {
    expect(resolveHudlJoinLink({})).toBeNull();
  });

  it("returns null for a blank value", () => {
    expect(resolveHudlJoinLink({ HUDL_JOIN_LINK: "\t\n" })).toBeNull();
  });
});
