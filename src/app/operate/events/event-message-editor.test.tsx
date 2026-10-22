/**
 * Writing an event's messages — LAN-508, W1-01 and W1-02. As in the question
 * editor's suite, each test presses the real control and reads what the form
 * would post: the hidden inputs are the only thing that reaches the service.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";

vi.mock("server-only", () => ({}));

import type { RawEventMessage } from "@/lib/services/event-messages-input";
import { clubEventStart } from "@/lib/services/event-messages-input";
import EventMessageEditor from "./event-message-editor";

function brief(overrides: Partial<RawEventMessage> = {}): RawEventMessage {
  return {
    id: "",
    hoursBefore: "48",
    channel: "both",
    recipients: "everyone",
    body: "# GAMEDAY vs Cambridge",
    fromTemplate: "false",
    ...overrides,
  };
}

function Harness({
  initial = [] as RawEventMessage[],
  sentIds,
}: {
  initial?: RawEventMessage[];
  sentIds?: ReadonlySet<string>;
}) {
  const [messages, setMessages] = useState<RawEventMessage[]>(initial);
  return (
    <form data-testid="harness">
      <EventMessageEditor
        messages={messages}
        onChange={setMessages}
        issues={[]}
        eventStart={clubEventStart("2026-11-08", "14:00")}
        sentIds={sentIds}
      />
    </form>
  );
}

function posted(name: string): string[] {
  return [
    ...document.querySelectorAll<HTMLInputElement>(`input[type="hidden"][name="${name}"]`),
  ].map((input) => input.value);
}

afterEach(() => vi.restoreAllMocks());

describe("the Event messages section", () => {
  it("is its heading and one button when there are none (W1-02)", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 403 }));
    render(<Harness />);
    const section = screen.getByTestId("section-event-message-editor");
    expect(within(section).getByRole("heading", { name: "Event messages" })).toBeTruthy();
    expect(screen.queryAllByTestId("event-message-card")).toHaveLength(0);
    expect(within(section).getByRole("button", { name: "Add event message" })).toBeTruthy();
    // Posted even when empty, so "no messages" is distinguishable from "not about messages".
    expect(posted("eventMessagesPresent")).toEqual(["1"]);
    expect(posted("eventMessageBody")).toEqual([]);
  });

  it("adds a card with 48 hours, Both and Everyone invited, and shows the send time", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 403 }));
    render(<Harness />);
    fireEvent.click(screen.getByTestId("add-event-message"));
    const card = screen.getByTestId("event-message-card");
    expect(within(card).getByText("Event message 1")).toBeTruthy();
    expect(within(card).getByText("Fri 6 Nov · 14:00")).toBeTruthy();
    expect(posted("eventMessageHoursBefore")).toEqual(["48"]);
    expect(posted("eventMessageChannel")).toEqual(["both"]);
    expect(posted("eventMessageRecipients")).toEqual(["everyone"]);
  });

  it("writes the toolbar's formats into the box, and the Itinerary line", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 403 }));
    render(<Harness initial={[brief({ body: "Attire" })]} />);
    const card = screen.getByTestId("event-message-card");
    for (const label of ["Title", "Heading", "Bold", "Bullet", "Highlight", "Itinerary line"]) {
      expect(within(card).getByRole("button", { name: label })).toBeTruthy();
    }
    fireEvent.click(within(card).getByRole("button", { name: "Title" }));
    expect(posted("eventMessageBody")).toEqual(["# Attire"]);
    fireEvent.click(within(card).getByRole("button", { name: "Highlight" }));
    expect(posted("eventMessageBody")).toEqual(["> Attire"]);
    fireEvent.click(within(card).getByRole("button", { name: "Heading" }));
    expect(posted("eventMessageBody")).toEqual(["## Attire"]);
    fireEvent.click(within(card).getByRole("button", { name: "Itinerary line" }));
    expect(posted("eventMessageBody")).toEqual(["- 12:00 Attire"]);
  });

  it("opens the formatting guide on click and on the keyboard, lists all six, and closes on Escape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 403 }));
    render(<Harness initial={[brief({ body: "Attire" })]} />);
    const card = screen.getByTestId("event-message-card");
    const help = within(card).getByRole("button", { name: "Formatting guide" });
    expect(screen.queryByTestId("brief-format-guide-card")).toBeNull();

    fireEvent.click(help);
    expect(await screen.findByTestId("brief-format-guide-card")).toBeTruthy();
    expect(screen.getAllByTestId("brief-format-guide-row")).toHaveLength(6);
    for (const typed of [
      "# Game day",
      "## Itinerary",
      "**both**",
      "- Helmet",
      "> Kit check",
      "- 12:00 Event name",
    ]) {
      expect(screen.getByText(typed)).toBeTruthy();
    }
    fireEvent.keyDown(help, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("brief-format-guide-card")).toBeNull());

    // The keyboard: focus opens it.
    act(() => help.focus());
    expect(await screen.findByTestId("brief-format-guide-card")).toBeTruthy();
    fireEvent.keyDown(help, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("brief-format-guide-card")).toBeNull());
  });

  it("offers no Remove on a message that has gone", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 403 }));
    render(
      <Harness
        initial={[brief({ id: "sent-1" }), brief({ id: "unsent-1" })]}
        sentIds={new Set(["sent-1"])}
      />,
    );
    const [sent, unsent] = screen.getAllByTestId("event-message-card");
    expect(within(sent).queryByTestId("remove-event-message")).toBeNull();
    fireEvent.click(within(unsent).getByTestId("remove-event-message"));
    expect(posted("eventMessageId")).toEqual(["sent-1"]);
  });

  it("previews the brief through the server's renderer, under a Preview disclosure", async () => {
    const fetched = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("png", { headers: { "content-type": "image/png" } }));
    const { createObjectURL, revokeObjectURL } = URL;
    URL.createObjectURL = () => "blob:brief";
    URL.revokeObjectURL = () => undefined;
    render(<Harness initial={[brief()]} />);
    const preview = screen.getByTestId("section-event-message-preview");
    expect(within(preview).getByText("Preview")).toBeTruthy();
    expect(await screen.findByTestId("brief-preview-image", {}, { timeout: 2000 })).toBeTruthy();
    expect(fetched).toHaveBeenCalledWith(
      "/api/event-messages/preview",
      expect.objectContaining({ method: "POST" }),
    );
    const sentBody = JSON.parse(String(fetched.mock.calls[0][1]?.body));
    expect(sentBody).toEqual({ body: "# GAMEDAY vs Cambridge" });
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });
});
