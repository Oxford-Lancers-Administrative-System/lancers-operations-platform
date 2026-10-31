// LAN-520 (Brian, 31 October 2026): Messages answers to May send Messages, the
// seat-page switch, instead of `delivery_administration`.
//
// Only the session is stubbed (`resolveOperatorAccess`) and the club-messages
// service is a spy, so the real `gateShellPage`, `requireGrant` and sidebar
// rules decide. Each seat is asked the same five questions: does the sidebar
// draw Messages, do the three pages open, and does the send reach the service.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const { resolveOperatorAccess, service, redirect } = vi.hoisted(() => ({
  resolveOperatorAccess: vi.fn(),
  service: {
    listClubMessages: vi.fn(),
    readClubMessageAudience: vi.fn(),
    readClubMessage: vi.fn(),
    createClubMessage: vi.fn(),
  },
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("@/lib/auth/operator", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/operator")>()),
  resolveOperatorAccess,
}));
vi.mock("@/lib/services/club-messages", () => service);
vi.mock("next/navigation", () => ({
  redirect,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/login/actions", () => ({ signOut: vi.fn() }));
// The chooser is the event builder's own and tested there.
vi.mock("@/app/operate/events/audience-chooser", () => ({
  AudienceChooser: () => null,
  useAudienceChoice: () => ({
    selected: new Set<string>(),
    setSelected: vi.fn(),
    pressedGroups: new Set<string>(),
    setPressedGroups: vi.fn(),
  }),
}));

import { roleCodesPermit, seededGrantsFor } from "@/lib/auth/capabilities";
import { mergeGrantRows, type OperatorGrants } from "@/lib/auth/grants";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { destinationsFor } from "../destinations";
import { sendClubMessageAction } from "./actions";
import MessagesPage from "./page";
import NewMessagePage from "./new/page";
import MessagePage from "./[id]/page";

function signedInAs(roleCodes: string[], grants: OperatorGrants): ResolvedOperator {
  const operator: ResolvedOperator = {
    authUserId: "auth-lan-520",
    personId: "person-lan-520",
    displayName: "Caspian Hallowfield",
    roleCodes,
    grants,
    isActive: true,
  };
  resolveOperatorAccess.mockResolvedValue({ state: "active", operator });
  return operator;
}

function withSendMessages(grants: OperatorGrants, level: "none" | "yes"): OperatorGrants {
  return { ...grants, switches: { ...grants.switches, send_messages: level } };
}

/** A coach seat holding May send Messages and nothing else. */
const COACH_WITH_SWITCH = mergeGrantRows([
  { subject_kind: "switch", subject_key: "send_messages", template_id: null, level: "yes" },
]);

const FIVE_SEATS = ["president", "vice_president", "secretary", "general_manager", "it_officer"];

function form(): FormData {
  const data = new FormData();
  data.append("subject", "Training moved");
  data.append("body", "Thursday, 19:00.");
  data.append("audienceGroup", "players");
  data.append("when", "now");
  return data;
}

async function opens(page: () => Promise<React.ReactElement>, testId: string): Promise<boolean> {
  cleanup();
  render(await page());
  const opened = screen.queryByTestId(testId) !== null;
  if (!opened) expect(screen.getByTestId("operator-not-permitted")).toBeTruthy();
  return opened;
}

const list = () => MessagesPage();
const compose = () => NewMessagePage();
const one = () =>
  MessagePage({
    params: Promise.resolve({ id: "message-1" }),
    searchParams: Promise.resolve({}),
  } as never);

beforeEach(() => {
  resolveOperatorAccess.mockReset();
  for (const spy of Object.values(service)) spy.mockReset();
  redirect.mockClear();
  service.listClubMessages.mockResolvedValue([]);
  service.readClubMessageAudience.mockResolvedValue({
    catalogue: { candidates: [], counts: { player: 0, recruit: 0, coach: 0, committee: 0 } },
    unreachable: {},
  });
  service.readClubMessage.mockResolvedValue({
    id: "message-1",
    subject: "Training moved",
    audienceGroups: [],
    recipientCount: 0,
    unreachableCount: 0,
    attachmentCount: 0,
    scheduledFor: "2026-10-30T18:00:00.000Z",
    sentBy: "Caspian Hallowfield",
    progress: "sent",
    queued: 0,
    body: "Thursday, 19:00.",
    attachments: [],
    recipients: [],
    recipientsNamed: false,
  });
  service.createClubMessage.mockResolvedValue({ id: "message-2", queued: 3, unreachable: 0 });
});

describe("LAN-520 — May send Messages off", () => {
  const seats: [string, string[], OperatorGrants][] = [
    ["a seat with no grants", ["treasurer"], seededGrantsFor(["treasurer"])],
    // The decisive case: the seat still administers delivery, and that no longer opens Messages.
    [
      "the Secretary with the switch turned off",
      ["secretary"],
      withSendMessages(seededGrantsFor(["secretary"]), "none"),
    ],
  ];

  it.each(seats)("hides Messages and refuses every page for %s", async (_name, codes, grants) => {
    const operator = signedInAs(codes, grants);
    expect(destinationsFor(operator).map((entry) => entry.href)).not.toContain("/operate/messages");
    expect(await opens(list, "club-messages-screen")).toBe(false);
    expect(await opens(compose, "compose-screen")).toBe(false);
    expect(await opens(one, "club-message-screen")).toBe(false);
    expect(service.listClubMessages).not.toHaveBeenCalled();
    expect(service.readClubMessageAudience).not.toHaveBeenCalled();
    expect(service.readClubMessage).not.toHaveBeenCalled();
  });

  it.each(seats)("refuses the send for %s and queues nothing", async (_name, codes, grants) => {
    signedInAs(codes, grants);
    const state = await sendClubMessageAction({ error: null }, form());
    expect(state.error).toMatch(/access your seat does not hold/);
    expect(service.createClubMessage).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("is the switch that refuses, not the capability", () => {
    expect(roleCodesPermit(["secretary"], "delivery_administration")).toBe(true);
  });
});

describe("LAN-520 — May send Messages on, for a seat without delivery_administration", () => {
  it("is a coach seat that does not administer delivery", () => {
    expect(roleCodesPermit(["head_coach"], "delivery_administration")).toBe(false);
  });

  it("draws Messages and opens every page", async () => {
    const operator = signedInAs(["head_coach"], COACH_WITH_SWITCH);
    expect(destinationsFor(operator).map((entry) => entry.href)).toContain("/operate/messages");
    expect(await opens(list, "club-messages-screen")).toBe(true);
    expect(await opens(compose, "compose-screen")).toBe(true);
    expect(await opens(one, "club-message-screen")).toBe(true);
  });

  it("sends, as the seat, with the seat's own grants", async () => {
    signedInAs(["head_coach"], COACH_WITH_SWITCH);
    await expect(sendClubMessageAction({ error: null }, form())).rejects.toThrow(
      "redirect:/operate/messages/message-2?sent=1",
    );
    expect(service.createClubMessage).toHaveBeenCalledTimes(1);
    expect(service.createClubMessage.mock.calls[0][0]).toMatchObject({
      actorPersonId: "person-lan-520",
      grants: COACH_WITH_SWITCH,
      audienceGroups: ["players"],
    });
  });
});

describe("LAN-520 — nobody loses Messages", () => {
  it.each(FIVE_SEATS)("keeps Messages, its pages and the send for the %s", async (code) => {
    const operator = signedInAs([code], seededGrantsFor([code]));
    expect(operator.grants.switches.send_messages).toBe("yes");
    expect(destinationsFor(operator).map((entry) => entry.href)).toContain("/operate/messages");
    expect(await opens(list, "club-messages-screen")).toBe(true);
    expect(await opens(compose, "compose-screen")).toBe(true);
    expect(await opens(one, "club-message-screen")).toBe(true);
    await expect(sendClubMessageAction({ error: null }, form())).rejects.toThrow("redirect:");
    expect(service.createClubMessage).toHaveBeenCalledTimes(1);
  });
});
