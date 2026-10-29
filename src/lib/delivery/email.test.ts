// @vitest-environment node
/**
 * The automated email transport — LAN-169.
 *
 * Everything here is asserted without a network, because `createEmailProvider`
 * takes its transport as an argument for exactly that reason. What is worth
 * asserting is the same short list the WhatsApp adapter's suite pins:
 *
 *   * the exact request body, because a rendered email is what a player reads;
 *   * the refusal of anything that is not an address, because this is the
 *     **automatic** fallback and nobody presses anything before it sends;
 *   * the retryable/terminal split, because `retryable` decides whether the
 *     scheduler burns the attempt ceiling on something a human has to fix.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { EmailConfig } from "./config";
import {
  NO_USABLE_EMAIL_REASON,
  buildEmailBody,
  createEmailProvider,
  emailFromHeader,
  interpretEmailResponse,
  looksLikeAnEmailAddress,
} from "./email";
import type { OutboundMessage } from "./provider";

const CONFIG: EmailConfig = {
  apiBaseUrl: "https://api.resend.example",
  apiKey: "test-key-not-a-real-one",
  // The origin the shell builds the crest's `src` from. `email-parts.test.ts`
  // is where that rendering is asserted; this suite only needs it to resolve.
  appBaseUrl: "https://app.oxfordlancers.example",
  // Bare, because that is the shape `docs/deployment.md` requires of
  // `EMAIL_FROM_ADDRESS` and the shape LAN-398 prepends the club's name to.
  fromAddress: "events@lancers.example",
  replyToAddress: null,
  recipientOverride: null,
};

const MESSAGE: OutboundMessage = {
  kind: "reminder",
  recipient: "jamie@example.com",
  inviteeName: "Jamie",
  eventName: "Michaelmas week 3",
  whenLabel: "Wednesday 14 October, 20:00",
  rsvpUrl: "https://lancers.example/rsvp/abc",
  venue: "Iffley Road",
  deadlineLabel: "Tuesday 13 October, 20:00",
  attendingCount: 18,
};

function transportReturning(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const transport = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, transport };
}

describe("the request body", () => {
  it("carries a subject, a text part and an HTML part rendered from one declaration", () => {
    const body = buildEmailBody(CONFIG, MESSAGE) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
    };

    expect(body.from).toBe(
      "Oxford University Lancers American Football Club <events@lancers.example>",
    );
    expect(body.to).toEqual(["jamie@example.com"]);
    expect(body.subject).toBe("Action required: RSVP for Michaelmas week 3");
    expect(body.text).toContain("the club still needs your answer");
    expect(body.text).toContain("Iffley Road");
    // The event is named in the subject rather than repeated in the first line,
    // which is the approved W2-02 shape: the card head carries "Action
    // required: RSVP for <event>" and the heading beneath it says what is
    // outstanding.
    expect(body.text).not.toContain("Michaelmas week 3");
    // Both parts, because a text-only email lands in more spam filters and an
    // HTML-only one is unreadable in a client that refuses HTML. Same lines:
    // LAN-398 gave the HTML part the club's shell and left each line its own
    // paragraph inside it. `email-parts.test.ts` holds that to all fifteen.
    expect(body.html).toContain("<p ");
    expect(body.html).toContain("Iffley Road");
  });

  it("arrives from the club by name, whatever shape the address was configured in", () => {
    // LAN-398, Brian 2026-09-18: the bar is the club's university mailbox,
    // which iPhone Mail shows as its full name. The address is the
    // deployment's and is never rewritten; the second case is the deployment
    // that still carries the `Name <address>` form `.env.example` used to
    // document, which must not compose into `A <B <c@d>>` and a terminal 422.
    expect(emailFromHeader("events@lancers.example")).toBe(
      "Oxford University Lancers American Football Club <events@lancers.example>",
    );
    expect(emailFromHeader("Oxford Lancers <events@lancers.example>")).toBe(
      "Oxford University Lancers American Football Club <events@lancers.example>",
    );
    // The reply-to is a different address for a different purpose and is left
    // exactly as the club set it.
    expect(
      buildEmailBody({ ...CONFIG, replyToAddress: "committee@lancers.example" }, MESSAGE),
    ).toMatchObject({ reply_to: "committee@lancers.example" });
  });

  it("escapes the body rather than interpolating it into HTML", () => {
    const body = buildEmailBody(CONFIG, {
      ...MESSAGE,
      venue: "Iffley Road <script>alert(1)</script>",
    }) as { html: string };

    expect(body.html).not.toContain("<script>");
    expect(body.html).toContain("&lt;script&gt;");
  });

  it("honours the loopback recipient override without touching the message", () => {
    const body = buildEmailBody(
      { ...CONFIG, recipientOverride: "developer@example.com" },
      MESSAGE,
    ) as { to: string[] };
    expect(body.to).toEqual(["developer@example.com"]);
  });

  it("adds a reply-to only when the club has set one", () => {
    expect(buildEmailBody(CONFIG, MESSAGE)).not.toHaveProperty("reply_to");
    expect(
      buildEmailBody({ ...CONFIG, replyToAddress: "committee@lancers.example" }, MESSAGE),
    ).toMatchObject({ reply_to: "committee@lancers.example" });
  });
});

describe("the egress", () => {
  it("sends to any address the dispatcher addressed it to — LAN-287", async () => {
    // The deployment-wide address allowlist is gone (Brian, LAN-168,
    // 2 September 2026). Who may be emailed is decided where the job is
    // created — membership, recorded consent, withdrawal, departure — and this
    // transport carries out the send it was given.
    const { calls, transport } = transportReturning(200, { id: "re_1" });
    const provider = createEmailProvider(CONFIG, transport);

    const outcome = await provider.send({ ...MESSAGE, recipient: "someone@elsewhere.example" });

    expect(outcome.status).toBe("accepted");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      to: ["someone@elsewhere.example"],
    });
  });

  it("refuses a recipient that is not an address at all", async () => {
    const { calls, transport } = transportReturning(200, { id: "re_1" });
    const provider = createEmailProvider(CONFIG, transport);

    const outcome = await provider.send({ ...MESSAGE, recipient: "447700900001" });

    expect(outcome).toMatchObject({ reason: NO_USABLE_EMAIL_REASON, retryable: false });
    expect(calls).toHaveLength(0);
  });

  it("recognises an address without pretending to validate one", () => {
    expect(looksLikeAnEmailAddress("jamie@example.com")).toBe(true);
    expect(looksLikeAnEmailAddress("jamie@localhost")).toBe(false);
    expect(looksLikeAnEmailAddress("447700900001")).toBe(false);
    expect(looksLikeAnEmailAddress("")).toBe(false);
  });
});

describe("interpreting the provider's answer", () => {
  it("accepts a 200 carrying an identifier", () => {
    expect(interpretEmailResponse(200, { id: "re_abc" })).toEqual({
      status: "accepted",
      providerMessageId: "re_abc",
    });
  });

  it("treats an acceptance with no identifier as a retryable refusal", () => {
    // Acceptance this system cannot use: the attempt would have nothing to
    // match a bounce callback against, and `delivery_attempts` refuses an
    // accepted row with no message id. Recorded rather than silently succeeded.
    expect(interpretEmailResponse(200, {})).toMatchObject({
      status: "refused",
      retryable: true,
    });
  });

  it("splits retryable from terminal the way the scheduler needs", () => {
    // Retryable means "the identical send could plausibly succeed without
    // anybody changing anything". A dead key and an unverified domain are not
    // that, and retrying them would burn the ceiling and hide the cause behind
    // "failed 5 times".
    expect(interpretEmailResponse(429, {})).toMatchObject({ retryable: true });
    expect(interpretEmailResponse(500, {})).toMatchObject({ retryable: true });
    expect(interpretEmailResponse(503, {})).toMatchObject({ retryable: true });
    expect(interpretEmailResponse(401, {})).toMatchObject({ retryable: false });
    expect(interpretEmailResponse(403, {})).toMatchObject({ retryable: false });
    expect(interpretEmailResponse(422, {})).toMatchObject({ retryable: false });
  });

  it("never quotes the recipient or the key in a refusal", () => {
    for (const status of [401, 422, 429, 500]) {
      const outcome = interpretEmailResponse(status, {
        message: "jamie@example.com rejected with key test-key-not-a-real-one",
      });
      expect(outcome.status).toBe("refused");
      if (outcome.status === "refused") {
        // The reason column is read by an operator in the application, and the
        // provider's raw text routinely quotes both.
        expect(outcome.reason).not.toContain("jamie@example.com");
        expect(outcome.reason).not.toContain(CONFIG.apiKey);
      }
    }
  });
});

describe("sending", () => {
  it("posts to the provider with a bearer token and JSON", async () => {
    const { calls, transport } = transportReturning(200, { id: "re_abc" });
    const provider = createEmailProvider(CONFIG, transport);

    const outcome = await provider.send(MESSAGE);

    expect(outcome).toEqual({ status: "accepted", providerMessageId: "re_abc" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.example/emails");
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${CONFIG.apiKey}`,
    );
  });

  it("declares the provider-neutral channel the operator surface reads", () => {
    expect(createEmailProvider(CONFIG).channel).toBe("email");
    expect(createEmailProvider(CONFIG).name).toBe("resend");
  });

  it("reports a network fault as retryable without quoting the host", async () => {
    const provider = createEmailProvider(CONFIG, async () => {
      throw new Error("getaddrinfo ENOTFOUND api.resend.example for jamie@example.com");
    });

    const outcome = await provider.send(MESSAGE);

    expect(outcome).toMatchObject({ status: "refused", retryable: true });
    if (outcome.status === "refused") {
      expect(outcome.reason).not.toContain("jamie@example.com");
      expect(outcome.reason).not.toContain("api.resend.example");
    }
  });
});

describe("LAN-514 — attachments, idempotency and Resend's 409s", () => {
  const FILE = Buffer.from("%PDF-1.4 special teams");
  const WITH_FILE: OutboundMessage = {
    kind: "club_message",
    recipient: "jamie@example.com",
    inviteeName: "Jamie",
    eventName: "",
    whenLabel: "",
    rsvpUrl: "",
    subject: "Playbook",
    bodyText: "Attached.",
    idempotencyKey:
      "club-message:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222",
    attachments: [
      {
        filename: "playbook.pdf",
        contentType: "application/pdf",
        byteSize: FILE.length,
        readSlice: async (offset, length) => FILE.subarray(offset, offset + length),
      },
    ],
  };

  it("sends the job's key as Idempotency-Key and the file in a body of exact length", async () => {
    const { calls, transport } = transportReturning(200, { id: "re_1" });
    const outcome = await createEmailProvider(CONFIG, transport).send(WITH_FILE);
    expect(outcome).toEqual({ status: "accepted", providerMessageId: "re_1" });
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("idempotency-key")).toBe(WITH_FILE.idempotencyKey);
    const body = Buffer.from(await new Response(calls[0].init.body).arrayBuffer());
    expect(headers.get("content-length")).toBe(String(body.length));
    const parsed = JSON.parse(body.toString("utf8")) as {
      attachments: { filename: string; content: string; content_type: string }[];
    };
    expect(parsed.attachments).toEqual([
      {
        filename: "playbook.pdf",
        content: FILE.toString("base64"),
        content_type: "application/pdf",
      },
    ]);
  });

  it("sends no Idempotency-Key where the message carries none", async () => {
    const { calls, transport } = transportReturning(200, { id: "re_2" });
    await createEmailProvider(CONFIG, transport).send(MESSAGE);
    expect(new Headers(calls[0].init.headers).has("idempotency-key")).toBe(false);
    expect(typeof calls[0].init.body).toBe("string");
  });

  it("refuses, without calling Resend, files over its 40 MB after encoding", async () => {
    const { calls, transport } = transportReturning(200, { id: "re_3" });
    const [file] = WITH_FILE.attachments ?? [];
    const outcome = await createEmailProvider(CONFIG, transport).send({
      ...WITH_FILE,
      attachments: [{ ...file, byteSize: 31_000_000 }],
    });
    expect(calls).toHaveLength(0);
    expect(outcome).toMatchObject({ status: "refused", retryable: false, faultScope: "message" });
  });

  it("retries later when the earlier attempt with the same key is still in progress", () => {
    expect(
      interpretEmailResponse(409, { statusCode: 409, name: "concurrent_idempotent_requests" }),
    ).toMatchObject({ status: "refused", retryable: true, faultScope: "message" });
  });

  it("reads a reused key with a changed body as the earlier attempt having reached Resend", () => {
    const outcome = interpretEmailResponse(409, {
      statusCode: 409,
      name: "invalid_idempotent_request",
    });
    expect(outcome).toMatchObject({
      status: "refused",
      retryable: false,
      earlierAttemptReachedProvider: true,
    });
  });

  it("leaves any other 409 a plain terminal refusal", () => {
    const outcome = interpretEmailResponse(409, { name: "resource_locked" });
    expect(outcome).toMatchObject({ status: "refused", retryable: false });
    expect(outcome).not.toHaveProperty("earlierAttemptReachedProvider");
  });
});
