/**
 * Send again? — LAN-508, W1-05. On the edit page of an approved event, saving
 * a change to an event message that has already gone stops and asks; the only
 * two answers are Cancel and Save and send again, and the second posts the
 * form with the answer the server requires. A change to a message that has not
 * gone saves without asking.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("../change-actions", () => ({
  editApprovedEventAction: vi.fn(async (state: unknown) => state),
}));

import AmendForm from "./amend-form";
import type { RawEventMessage } from "@/lib/services/event-messages-input";

const SENT_ID = "66666666-6666-4666-8666-666666666666";
const UNSENT_ID = "77777777-7777-4777-8777-777777777777";

function message(id: string, body: string): RawEventMessage {
  return {
    id,
    hoursBefore: "48",
    channel: "both",
    recipients: "everyone",
    body,
    fromTemplate: "false",
  };
}

function renderForm() {
  return render(
    <AmendForm
      eventId="33333333-3333-4333-8333-333333333333"
      eventName="vs Ivybridge Ravens"
      initial={{
        name: "vs Ivybridge Ravens",
        templateId: "55555555-5555-4555-8555-555555555555",
        scheduledOn: "2026-11-08",
        startsAt: "14:00",
        endsAt: "16:30",
        deliveryMode: "in_person",
        venue: "Iffley Road Astro",
        description: "",
        requiredEquipment: "",
        joiningUrl: "",
        attendance: "optional",
      }}
      before={{
        name: "vs Ivybridge Ravens",
        templateId: "55555555-5555-4555-8555-555555555555",
        scheduledOn: "2026-11-08",
        startsAt: "14:00",
        endsAt: "16:30",
        deliveryMode: "in_person",
        venue: "Iffley Road Astro",
        description: null,
        requiredEquipment: null,
        joiningUrl: null,
        isMandatory: false,
      }}
      terms={[]}
      audience={{ invited: 38, saidYes: 20, saidNo: 3, noAnswer: 15 }}
      unsentMessages={0}
      isFuture
      today="2026-11-07"
      initialQuestions={[]}
      eventTypeLabel="Game"
      eventType="game"
      mayEditQuestions
      initialEventMessages={[message(SENT_ID, "# GAMEDAY"), message(UNSENT_ID, "# Social")]}
      sentEventMessages={{ [SENT_ID]: "2026-11-06T14:00:00.000Z" }}
    />,
  );
}

function editBody(index: number, value: string) {
  const card = screen.getAllByTestId("event-message-card")[index];
  const box = within(card).getByRole("textbox", { name: "Message" });
  fireEvent.change(box, { target: { value } });
}

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 403 }));
});
afterEach(() => vi.restoreAllMocks());

describe("Send again?", () => {
  it("asks before saving a change to a message that has gone, in the wireframe's words", () => {
    renderForm();
    editBody(0, "# GAMEDAY — kick-off moved");
    fireEvent.click(screen.getByTestId("continue-to-review"));
    expect(screen.getByTestId("change-event-messages")).toBeTruthy();

    fireEvent.click(screen.getByTestId("save-amendment"));
    const dialog = screen.getByTestId("send-again-dialog");
    expect(within(dialog).getByRole("heading", { name: "Send again?" })).toBeTruthy();
    expect(
      within(dialog).getByText(
        "This event message was sent on 6 November at 14:00. Saving sends it again to everyone it went to.",
      ),
    ).toBeTruthy();
    const buttons = within(dialog)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(buttons).toEqual(["Cancel", "Save and send again"]);

    // The confirm button posts this form with the answer the server requires.
    const confirm = within(dialog).getByTestId("send-again-confirm");
    expect(confirm.getAttribute("type")).toBe("submit");
    expect(confirm.getAttribute("form")).toBe("amend-form");
    expect(confirm.getAttribute("name")).toBe("resendEventMessages");
    expect(confirm.getAttribute("value")).toBe("1");
    expect(document.getElementById("amend-form")).toBeTruthy();
  });

  it("closes on Cancel and saves nothing", () => {
    renderForm();
    editBody(0, "# GAMEDAY — kick-off moved");
    fireEvent.click(screen.getByTestId("continue-to-review"));
    fireEvent.click(screen.getByTestId("save-amendment"));
    fireEvent.click(screen.getByTestId("send-again-cancel"));
    expect(screen.getByTestId("save-amendment").getAttribute("type")).toBe("button");
  });

  it("does not ask for a change to a message that has not gone", () => {
    renderForm();
    editBody(1, "# Social — moved to the bar");
    fireEvent.click(screen.getByTestId("continue-to-review"));
    expect(screen.getByTestId("save-amendment").getAttribute("type")).toBe("submit");
    expect(screen.queryByTestId("send-again-dialog")).toBeNull();
  });

  it("offers Remove only on the message that has not gone", () => {
    renderForm();
    const [sent, unsent] = screen.getAllByTestId("event-message-card");
    expect(within(sent).queryByTestId("remove-event-message")).toBeNull();
    expect(within(unsent).getByTestId("remove-event-message")).toBeTruthy();
  });
});
