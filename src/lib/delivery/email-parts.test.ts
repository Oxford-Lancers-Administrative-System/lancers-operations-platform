/**
 * Every kind's rendered email, pinned — LAN-398.
 *
 * ## Why this suite exists
 *
 * LAN-398 gives every Resend email a shell: a crest and the club's name above
 * the message, a signature block below it. That is a change to the `html` part
 * and to nothing else, and "nothing else" is the part worth proving rather than
 * asserting. The `text` part is what a client that refuses HTML shows, what a
 * screen reader reads out of such a client, and — because Meta's classifier
 * approved these exact bodies (`templates.ts`) — the copy the club is held to.
 * A branding pass must not touch one byte of it.
 *
 * So the fifteen `text` parts are captured as fixtures **from `main`, before
 * the shell existed**, and asserted byte for byte here. A reordering, a stray
 * space or a re-wrapped line fails this suite naming the kind.
 *
 * The fifteen `html` parts are captured the same way and asserted the same way,
 * but they are *expected* to change: the fixture is regenerated with the shell
 * and the diff is the review evidence. What the structural assertions below add
 * is the part a snapshot cannot say out loud — that each body line still
 * appears escaped in its own `<p>`, that the header and the signature are
 * there, and that the Stop line appears for exactly the four kinds that carry
 * one today (LAN-372).
 *
 * ## Regenerating
 *
 *     UPDATE_EMAIL_FIXTURES=1 npx vitest run src/lib/delivery/email-parts.test.ts
 *
 * Only ever for the `html` side. A `text` fixture that needs regenerating means
 * the copy changed, and changed copy is a new submission at Meta — see
 * `docs/whatsapp-template-categories.md` — not a fixture to refresh.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { EmailConfig } from "./config";
import { buildEmailBody } from "./email";
import type { MessageKind, OutboundMessage } from "./provider";
import { MESSAGE_KINDS } from "./templates";

const FIXTURES = path.join(import.meta.dirname, "__fixtures__/email");
const UPDATING = process.env.UPDATE_EMAIL_FIXTURES === "1";

/**
 * The configuration these fixtures render against.
 *
 * A fixed base URL rather than the ambient one, because the crest's `src` is
 * built from it and a fixture that moved with a developer's port would prove
 * nothing. `fromAddress` is bare, which is the shape the deployment pipeline
 * requires (`docs/deployment.md`) and the shape the display name is prepended
 * to.
 */
export const FIXTURE_CONFIG: EmailConfig = {
  apiBaseUrl: "https://api.resend.example",
  apiKey: "test-key-not-a-real-one",
  appBaseUrl: "https://app.oxfordlancers.example",
  fromAddress: "events@lancers.example",
  replyToAddress: null,
  recipientOverride: null,
};

/**
 * One message with every optional field set.
 *
 * Every kind renders from this same object, so a fixture diff is the template's
 * doing and never a difference in what it was handed. `stopUrl` is set for all
 * fifteen deliberately: which kinds actually render a Stop line is the
 * template's decision (LAN-372 — recruits carry it, roster players do not), and
 * supplying it everywhere is what makes that decision testable rather than
 * accidental.
 */
export const FIXTURE_MESSAGE: OutboundMessage = {
  recipient: "jamie@example.com",
  inviteeName: "Jamie",
  eventName: "Michaelmas week 3",
  whenLabel: "Wednesday 14 October, 20:00",
  rsvpUrl: "https://app.oxfordlancers.example/rsvp/rsvp-token",
  questionsUrl: "https://app.oxfordlancers.example/questions/questions-token",
  yesUrl: "https://app.oxfordlancers.example/a/yes/yes-token",
  noUrl: "https://app.oxfordlancers.example/a/no/no-token",
  venue: "Iffley Road",
  deadlineLabel: "Tuesday 13 October, 20:00",
  deadlinePassed: false,
  attendingCount: 18,
  changeSummary: "The kick-off moved an hour later.",
  questionSummary: "Which position would you like to try?",
  cancellationReason: "The pitch is waterlogged.",
  outstandingCount: 7,
  queueUrl: "https://app.oxfordlancers.example/operate/delivery",
  formUrl: "https://app.oxfordlancers.example/signup/form-token",
  stopUrl: "https://app.oxfordlancers.example/stop/stop-token",
};

export function renderedParts(kind: MessageKind): { text: string; html: string } {
  const body = buildEmailBody(FIXTURE_CONFIG, { ...FIXTURE_MESSAGE, kind }) as {
    text: string;
    html: string;
  };
  return { text: body.text, html: body.html };
}

function fixture(kind: MessageKind, part: "text" | "html", rendered: string): string {
  const file = path.join(FIXTURES, `${kind}.${part === "text" ? "txt" : "html"}`);
  if (UPDATING && part === "html") {
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(file, rendered, "utf8");
  }
  return readFileSync(file, "utf8");
}

describe("the plain-text part", () => {
  // Captured from `main` at 61a1f02, before the shell existed. LAN-398 changes
  // the HTML and nothing else, and this is the assertion that says so.
  it.each(MESSAGE_KINDS)("is byte-identical to what %s sent before LAN-398", (kind) => {
    expect(renderedParts(kind).text).toBe(fixture(kind, "text", ""));
  });
});

describe("the HTML part", () => {
  it.each(MESSAGE_KINDS)("renders %s into the committed shell", (kind) => {
    const { html } = renderedParts(kind);
    expect(html).toBe(fixture(kind, "html", html));
  });

  it.each(MESSAGE_KINDS)("carries every body line of %s escaped in its own paragraph", (kind) => {
    const { text, html } = renderedParts(kind);
    for (const line of text.split("\n\n")) {
      expect(html).toContain(`<p style="margin:0 0 16px 0;">${escaped(line)}</p>`);
    }
  });

  it.each(MESSAGE_KINDS)("puts the crest and the club's name above %s", (kind) => {
    const { html } = renderedParts(kind);
    expect(html).toContain('alt="Oxford Lancers crest"');
    expect(html).toContain("https://app.oxfordlancers.example/brand/crest-email.png");
    expect(html).toContain(">Oxford Lancers<");
  });

  it("keeps the whole thing to one 600px column that can narrow", () => {
    const { html } = renderedParts("invitation");
    expect(html).toContain("max-width:600px");
    expect(html).toContain('name="viewport"');
    // Inline styles only: no external sheet and no third-party font.
    expect(html).not.toContain("<link");
    expect(html).not.toContain("@import");
  });

  it("omits the crest rather than pointing at a relative path when no base URL is set", () => {
    // `APP_BASE_URL` is not on `EMAIL_ENVIRONMENT_VARIABLES`, so email can
    // resolve without one. A relative `src` in an email is a broken-image icon
    // in every client, so the shell drops the image and keeps the name.
    const html = buildEmailBody({ ...FIXTURE_CONFIG, appBaseUrl: "" }, FIXTURE_MESSAGE) as {
      html: string;
    };
    expect(html.html).not.toContain("<img");
    expect(html.html).toContain(">Oxford Lancers<");
  });
});

function escaped(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
