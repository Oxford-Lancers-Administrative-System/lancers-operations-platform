import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireGrant, createClubMessage, redirect } = vi.hoisted(() => ({
  requireGrant: vi.fn(),
  createClubMessage: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("@/lib/auth/guards", () => ({ requireGrant }));
vi.mock("@/lib/services/club-messages", () => ({ createClubMessage }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { NotPermitted } from "@/lib/db";
import { SEND_MESSAGES } from "@/lib/auth/roster-access";
import { sendClubMessageAction } from "./actions";

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const entry of Array.isArray(value) ? value : [value]) data.append(key, entry);
  }
  return data;
}

beforeEach(() => {
  requireGrant.mockReset();
  createClubMessage.mockReset();
  redirect.mockClear();
});

describe("LAN-514 — who may send a message", () => {
  // LAN-520: May send Messages, the seat-page switch, not `delivery_administration`.
  it("is the May send Messages switch", () => {
    expect(SEND_MESSAGES).toEqual({
      subject: { kind: "switch", key: "send_messages" },
      minimum: "yes",
    });
  });

  it("checks May send Messages on the session and sends nothing when refused", async () => {
    requireGrant.mockRejectedValue(new NotPermitted("Not permitted."));
    const state = await sendClubMessageAction({ error: null }, form({ subject: "Hi" }));
    expect(requireGrant).toHaveBeenCalledWith(SEND_MESSAGES);
    expect(createClubMessage).not.toHaveBeenCalled();
    expect(state.error).toBe("Not permitted.");
  });

  it("posts the selection, the files and the schedule, then opens the message", async () => {
    // The sender's own grants go with the selection: it resolves against what they were shown.
    const grants = { roster: {}, recruiting: {}, templates: {}, switches: {} };
    requireGrant.mockResolvedValue({ personId: "person-1", grants });
    createClubMessage.mockResolvedValue({ id: "message-1", queued: 2, unreachable: 0 });
    await expect(
      sendClubMessageAction(
        { error: null },
        form({
          subject: "Playbook",
          body: "Attached.",
          audienceKey: ["player:a", "coach:b"],
          audienceGroup: ["special_teams:kick_return"],
          attachmentId: ["file-1"],
          when: "schedule",
          sendDay: "2026-11-02",
          sendTime: "18:00",
        }),
      ),
    ).rejects.toThrow("redirect:/operate/messages/message-1?sent=1");
    expect(createClubMessage).toHaveBeenCalledWith({
      actorPersonId: "person-1",
      grants,
      subject: "Playbook",
      body: "Attached.",
      audienceKeys: ["player:a", "coach:b"],
      audienceGroups: ["special_teams:kick_return"],
      attachmentIds: ["file-1"],
      schedule: { day: "2026-11-02", time: "18:00" },
    });
  });

  it("sends now when Send now is chosen", async () => {
    requireGrant.mockResolvedValue({ personId: "person-1" });
    createClubMessage.mockResolvedValue({ id: "message-2", queued: 1, unreachable: 0 });
    await expect(
      sendClubMessageAction({ error: null }, form({ when: "now", sendDay: "2026-11-02" })),
    ).rejects.toThrow("redirect:");
    expect(createClubMessage.mock.calls[0][0].schedule).toBeNull();
  });
});
