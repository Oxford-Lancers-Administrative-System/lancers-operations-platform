// @vitest-environment node
/**
 * Every link the club sends points at a page the application serves — LAN-343.
 *
 * ## The failure this exists to stop
 *
 * A template's URL is built in one file, the route that serves it is a directory
 * in another, and nothing has ever compared the two. So seven of the eight
 * approved link bases could be rebuilt in WhatsApp Manager against paths the
 * application did not have, and the only way anybody found out was a tester
 * tapping a button and getting a 404 on a phone. `templates.test.ts` pins the
 * parameter order and the button count; it renders against whatever URLs its own
 * fixture invented, so it cannot catch a path.
 *
 * This test renders **every** template with URLs built by the real builders in
 * `src/lib/delivery/config.ts`, pulls every URL back out of the rendered body
 * and out of the WhatsApp button components, and resolves each one against the
 * route tree in `src/app`. A template that grows a link, a builder whose path
 * changes, or a route that moves, fails here.
 *
 * It found one on the day it was written: the escalation sent the President to
 * `/operate/follow-ups`, a path that has never existed — the page is
 * `/operate/admin/follow-ups`.
 *
 * ## Why the route tree and not a running server
 *
 * A Next route is a directory of segments ending in `page.tsx` or `route.ts`,
 * and matching a path against that tree is the whole of what the framework's own
 * resolution does for these links: none of them is behind a rewrite, and
 * `next.config.ts` declares none. Booting a server to learn the same fact would
 * make this suite the slowest in the repository for no additional guarantee.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  eventQuestionsUrl,
  onboardingUrl,
  playerAnswerUrl,
  playerEventsUrl,
  recruitBackgroundUrl,
  rsvpUrl,
  signupUrl,
  stopMessagesUrl,
} from "@/lib/delivery/config";
import type { MessageKind, OutboundMessage } from "@/lib/delivery/provider";
import { MESSAGE_KINDS, MESSAGE_TEMPLATES } from "@/lib/delivery/templates";

const REPO = path.resolve(import.meta.dirname, "..");
const APP = path.join(REPO, "src", "app");

const BASE = "https://app.example.test";

/** A 43-character token, the shape every builder is handed. */
const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM0123";
const ANSWER_TOKEN = `y.11111111-1111-1111-1111-111111111111.${TOKEN}`;
const NO_ANSWER_TOKEN = `n.11111111-1111-1111-1111-111111111111.${TOKEN}`;

/**
 * One message with every URL field a template might read, each built by the
 * function that builds it in production. The two operator-facing queue links are
 * written out because the scheduler writes them inline rather than through a
 * builder — which is exactly how one of them came to be wrong.
 */
const MESSAGE: OutboundMessage = {
  recipient: "447700900900",
  inviteeName: "Avery",
  eventName: "Team Practice",
  whenLabel: "Tuesday 14 October, 20:00",
  venue: "Iffley Road",
  deadlineLabel: "Monday 13 October, 18:00",
  attendingCount: 3,
  changeSummary: "The venue has changed.",
  cancellationReason: "The pitch is frozen.",
  outstandingCount: 4,
  rsvpUrl: rsvpUrl(BASE, TOKEN),
  questionsUrl: eventQuestionsUrl(BASE, TOKEN),
  yesUrl: playerAnswerUrl(BASE, "yes", ANSWER_TOKEN),
  noUrl: playerAnswerUrl(BASE, "no", NO_ANSWER_TOKEN),
  formUrl: onboardingUrl(BASE, TOKEN),
  stopUrl: stopMessagesUrl(BASE, TOKEN),
  queueUrl: `${BASE}/operate/admin/follow-ups`,
};

/** The other three `formUrl` destinations, by the kinds that carry them. */
const FORM_URL_BY_KIND: Partial<Record<MessageKind, string>> = {
  recruit_welcome: signupUrl(BASE, TOKEN),
  recruit_details_reminder: signupUrl(BASE, TOKEN),
  recruit_interest_ask: recruitBackgroundUrl(BASE, TOKEN),
  recruit_interest_reminder: recruitBackgroundUrl(BASE, TOKEN),
};

const QUEUE_URL_BY_KIND: Partial<Record<MessageKind, string>> = {
  onboarding_chase_escalation: `${BASE}/operate/people/missing`,
};

function messageFor(kind: MessageKind): OutboundMessage {
  return {
    ...MESSAGE,
    kind,
    formUrl: FORM_URL_BY_KIND[kind] ?? MESSAGE.formUrl,
    queueUrl: QUEUE_URL_BY_KIND[kind] ?? MESSAGE.queueUrl,
  };
}

/** Every absolute URL on this deployment that a rendered message carries. */
function urlsIn(kind: MessageKind): string[] {
  const template = MESSAGE_TEMPLATES[kind];
  const message = messageFor(kind);
  const text = [
    ...template.parameters(message),
    template.subject(message),
    ...template.body(message),
    ...(template.buttonUrls?.(message) ?? []),
  ].join("\n");
  return [...text.matchAll(new RegExp(`${BASE}[^\\s]*`, "g"))].map(([url]) => url);
}

/** Directory entries that name one Next route segment, not a colocated file. */
function segmentsOf(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Whether `src/app` serves this pathname.
 *
 * Walks one segment at a time, preferring a literal directory and falling back
 * to a single dynamic one (`[token]`, `[answer]`, `[id]`) — the same precedence
 * the framework uses. Route groups (`(policies)`) are transparent, so a segment
 * is also tried inside each of them. A path arrives at a route only if the
 * directory it lands in holds `page.tsx` or `route.ts`.
 */
function serves(pathname: string): boolean {
  const wanted = pathname.split("/").filter(Boolean);

  function walk(directory: string, remaining: readonly string[]): boolean {
    if (remaining.length === 0) {
      return (
        fs.existsSync(path.join(directory, "page.tsx")) ||
        fs.existsSync(path.join(directory, "route.ts"))
      );
    }
    const [head, ...tail] = remaining;
    const entries = segmentsOf(directory);

    if (entries.includes(head) && walk(path.join(directory, head), tail)) return true;
    for (const entry of entries) {
      // One dynamic segment, or a transparent route group.
      if (/^\[[^\]]+\]$/.test(entry) && walk(path.join(directory, entry), tail)) return true;
      if (/^\(.+\)$/.test(entry) && walk(path.join(directory, entry), remaining)) return true;
    }
    return false;
  }

  return walk(APP, wanted);
}

describe("the route tree walker this test depends on", () => {
  it("finds a literal route, a dynamic one, and a route inside a group", () => {
    expect(serves("/login")).toBe(true);
    expect(serves("/rsvp/anything")).toBe(true);
    expect(serves("/privacy")).toBe(true);
    expect(serves("/api/health")).toBe(true);
  });

  it("refuses a path the application does not serve, and a directory with no page", () => {
    // The exact defect LAN-343 found: a real prefix, one segment short of a page.
    expect(serves("/operate/follow-ups")).toBe(false);
    expect(serves("/me/anything/at/all")).toBe(false);
    expect(serves("/not-a-route")).toBe(false);
  });
});

describe("every path a message mints", () => {
  it.each(MESSAGE_KINDS)("%s links only at routes the application serves", (kind) => {
    const urls = urlsIn(kind);
    for (const url of urls) {
      const { pathname } = new URL(url);
      expect(serves(pathname), `${kind} links at ${pathname}, which no route serves`).toBe(true);
    }
  });

  it("leaves no kind unchecked, and no kind with nothing to check but the escalations", () => {
    // A template that carries no link at all is a template a reader can do
    // nothing with. The two escalations and the cancellation are the deliberate
    // exceptions: the cancellation offers no control because there is nothing
    // left to answer, and the escalations carry the operator queue only.
    const withoutLinks = MESSAGE_KINDS.filter((kind) => urlsIn(kind).length === 0);
    expect(withoutLinks).toEqual(["cancellation"]);
  });

  it("sends each message to its own approved base — the LAN-343 table, verbatim", () => {
    // The paths the templates were rebuilt against in WhatsApp Manager. Pinned
    // per kind rather than asserted as a set, because "some template links at
    // /stop/" is not the guarantee: the guarantee is that *this* message does.
    const expected: Partial<Record<MessageKind, readonly string[]>> = {
      invitation: ["/a/yes/", "/a/no/"],
      reminder: ["/a/yes/", "/a/no/"],
      recruit_event_followup: ["/a/yes/", "/a/no/"],
      nudge: ["/questions/"],
      change_notice: ["/rsvp/"],
      recruit_welcome: ["/signup/", "/stop/"],
      recruit_details_reminder: ["/signup/", "/stop/"],
      recruit_interest_ask: ["/background/", "/stop/"],
      recruit_interest_reminder: ["/background/", "/stop/"],
      onboarding_welcome: ["/onboarding/", "/stop/"],
      onboarding_chase: ["/onboarding/", "/stop/"],
    };

    for (const [kind, bases] of Object.entries(expected)) {
      const paths = new Set(urlsIn(kind as MessageKind).map((url) => new URL(url).pathname));
      for (const base of bases) {
        expect(
          [...paths].some((pathname) => pathname.startsWith(base)),
          `${kind} carries no link at ${base} (it carries ${[...paths].join(", ")})`,
        ).toBe(true);
      }
      // And nothing else: a message that also carries the old shared path would
      // pass every assertion above.
      for (const pathname of paths) {
        expect(
          bases.some((base) => pathname.startsWith(base)),
          `${kind} carries an unapproved link at ${pathname}`,
        ).toBe(true);
      }
    }
  });
});
