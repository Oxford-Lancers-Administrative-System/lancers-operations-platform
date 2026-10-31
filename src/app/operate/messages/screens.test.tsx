// LAN-514, Brian's walk on 31 October: the compose form and the sent message
// page — the plain size limit, the message and its files in one box, and the
// recipients closed until opened.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const { readClubMessage, audience } = vi.hoisted(() => ({
  readClubMessage: vi.fn(),
  audience: { keys: [] as string[], chooserProps: null as Record<string, unknown> | null },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock("./actions", () => ({ sendClubMessageAction: vi.fn() }));
vi.mock("@/app/operate/gate", () => ({
  gateShellPage: vi.fn(async () => ({ operator: { grants: {} } })),
}));
vi.mock("@/lib/services/club-messages", () => ({ readClubMessage }));
// The chooser is the event builder's own and tested there; here it only supplies a choice.
vi.mock("@/app/operate/events/audience-chooser", () => ({
  AudienceChooser: (props: Record<string, unknown>) => {
    audience.chooserProps = props;
    return null;
  },
  useAudienceChoice: () => ({
    selected: new Set(audience.keys),
    setSelected: vi.fn(),
    pressedGroups: new Set<string>(),
    setPressedGroups: vi.fn(),
  }),
}));

import type { AudienceCandidate } from "@/lib/services/audience-selection";
import type { ClubMessageDetail } from "@/lib/services/club-messages";
import { ComposeForm } from "./compose-form";
import MessagePage from "./[id]/page";

function candidate(id: string, name: string): AudienceCandidate {
  return {
    key: `player:m-${id}`,
    capacity: "player",
    anchorId: `m-${id}`,
    personId: `p-${id}`,
    displayName: name,
    standing: "Active",
    unit: null,
    contact: null,
  };
}

const CANDIDATES = [
  candidate("1", "Ann Abbot"),
  candidate("2", "Ben Brook"),
  candidate("3", "Cal Croft"),
];

function compose() {
  return render(
    <ComposeForm
      candidates={CANDIDATES}
      counts={{ player: 3, recruit: 0, coach: 0, committee: 0 }}
      unreachable={{ "p-3": "no_email" }}
    />,
  );
}

beforeEach(() => {
  audience.keys = CANDIDATES.map((entry) => entry.key);
  readClubMessage.mockReset();
});

describe("composing a message", () => {
  it("states the limit as a plain label, not a running total", () => {
    compose();
    expect(screen.getByTestId("compose-size").textContent).toBe("Max attachment size: 20 MB");
    expect(screen.queryByText(/ of 20/)).toBeNull();
  });

  it("puts the files inside the message's own box", () => {
    compose();
    const box = screen.getByTestId("compose-message-box");
    expect(within(box).getByTestId("compose-body")).toBeTruthy();
    expect(within(box).getByTestId("compose-attachments")).toBeTruthy();
    expect(within(box).getByRole("button", { name: "Attach files" })).toBeTruthy();
    // Inside the field's outline: the same input root holds the text and the files.
    const root = box.querySelector(".MuiInputBase-root")!;
    expect(root.contains(screen.getByTestId("compose-attachments"))).toBe(true);
  });

  // LAN-514, Brian's second walk: the people picker starts closed too.
  it("asks the audience chooser to start closed", () => {
    compose();
    expect(audience.chooserProps?.collapsed).toBe(true);
  });

  it("closes the recipients on arrival, the counts in the header", () => {
    compose();
    const section = screen.getByTestId("compose-recipients-section");
    expect(section.getAttribute("data-open")).toBe("false");
    expect(within(section).getByText("Recipients · 2 people")).toBeTruthy();
    expect(within(section).getByText("Not reachable · 1 person")).toBeTruthy();
    expect(screen.queryByTestId("compose-recipients")).toBeNull();
  });

  it("opens to the exact list of people it goes to, and who it cannot reach", () => {
    compose();
    fireEvent.click(screen.getByTestId("compose-recipients-section-toggle"));
    expect(screen.getByTestId("compose-recipients-section").getAttribute("data-open")).toBe("true");
    expect(screen.getByTestId("compose-recipients").textContent).toBe("Ann Abbot, Ben Brook");
    expect(screen.getByTestId("compose-unreachable").textContent).toContain("Cal Croft (No email)");
  });

  it("shows no not-reachable count when everybody can be emailed", () => {
    audience.keys = [CANDIDATES[0].key];
    compose();
    expect(screen.queryByText(/Not reachable/)).toBeNull();
    expect(screen.getByText("Recipients · 1 person")).toBeTruthy();
  });
});

function detail(patch: Partial<ClubMessageDetail> = {}): ClubMessageDetail {
  return {
    id: "message-1",
    subject: "Special teams playbook",
    audienceGroups: [],
    recipientCount: 2,
    unreachableCount: 1,
    attachmentCount: 1,
    scheduledFor: "2026-10-30T18:00:00.000Z",
    sentBy: "Caspian Hallowfield",
    progress: "sent",
    queued: 0,
    body: "Hello all,\nThe playbook is attached.",
    attachments: [{ id: "a-1", filename: "playbook.pdf", byteSize: 1_600_000 }],
    recipients: [
      { personId: "p-1", displayName: "Ann Abbot", state: "delivered", lastError: null },
      { personId: "p-2", displayName: "Ben Brook", state: "failed", lastError: null },
    ],
    recipientsNamed: true,
    ...patch,
  };
}

async function sent(message: ClubMessageDetail) {
  readClubMessage.mockResolvedValue(message);
  return render(
    await MessagePage({
      params: Promise.resolve({ id: message.id }),
      searchParams: Promise.resolve({}),
    } as never),
  );
}

describe("the sent message", () => {
  it("shows the message and its files in one box", async () => {
    await sent(detail());
    const body = screen.getByTestId("section-club-message-body");
    expect(body.textContent).toContain("The playbook is attached.");
    const files = within(body).getByTestId("club-message-attachments");
    expect(files.textContent).toContain("playbook.pdf · 1.6 MB");
    // No second card of its own.
    expect(body.querySelectorAll(".MuiPaper-root")).toHaveLength(0);
  });

  it("has no files part when nothing was attached", async () => {
    await sent(detail({ attachments: [], attachmentCount: 0 }));
    expect(screen.queryByTestId("club-message-attachments")).toBeNull();
  });

  it("closes the recipients on arrival, the counts in the header", async () => {
    await sent(detail());
    const section = screen.getByTestId("club-message-recipients");
    expect(section.getAttribute("data-open")).toBe("false");
    expect(within(section).getByText("Recipients · 2")).toBeTruthy();
    expect(within(section).getByText("Not reachable: 1")).toBeTruthy();
    expect(screen.queryByTestId("club-message-recipient-list")).toBeNull();
  });

  it("opens to the exact list of people it went to", async () => {
    await sent(detail());
    fireEvent.click(screen.getByTestId("club-message-recipients-toggle"));
    const list = screen.getByTestId("club-message-recipient-list");
    expect(within(list).getByText("Ann Abbot")).toBeTruthy();
    expect(within(list).getByText("Ben Brook")).toBeTruthy();
  });
});
