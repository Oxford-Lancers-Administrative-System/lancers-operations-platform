/**
 * UX-60, UX-61, UX-62, UX-63/64/65 and UX-66 — LAN-79.
 *
 * The service layer is mocked. What is under test is the screen: what a player
 * is shown, what they are offered, and — the part this ticket exists for —
 * what is *not* in the response.
 *
 * Three things here are load-bearing rather than decorative:
 *
 *   * **The uniform terminal response.** Brian's 12 August decision requires an
 *     unknown link, an expired one, a revoked one and a started event to be
 *     publicly indistinguishable. A test that merely renders the not-found
 *     screen and reads its words would keep passing if `page.tsx` started
 *     branching before it. So these drive the real page for every terminal
 *     state and assert it refuses in the same way each time.
 *
 *   * **No peer visibility.** The privacy rule is about an event with several
 *     invitees, so the fixture has several and the assertion is against the
 *     whole rendered output, not against a field.
 *
 *   * **The reason requirement in the form.** The acceptance criterion asks for
 *     it "before the request is made *and* on the server". The server half is
 *     proved in `src/lib/services/rsvp.test.ts` against the real database; the
 *     form half is the `required` attribute, and it is asserted here because a
 *     refactor to a controlled component would silently drop it.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const notFoundCalls = vi.fn();
vi.mock("next/navigation", () => ({
  notFound: () => {
    notFoundCalls();
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, withTransaction: vi.fn() };
});
vi.mock("@/lib/services/rsvp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/rsvp")>();
  return { ...actual, readSignedRsvpPageIn: vi.fn() };
});
vi.mock("@/lib/services/rsvp-tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/rsvp-tokens")>();
  return { ...actual, resolveRsvpTokenIn: vi.fn() };
});
vi.mock("./actions", () => ({
  noteRsvpLinkOpened: vi.fn(),
  submitAttending: vi.fn(),
  submitNotAttending: vi.fn(),
  // LAN-343. "See all your events." on the saved page — a form, because that
  // page needs a durable credential and this route's GET must keep writing
  // nothing.
  openEventsPage: vi.fn(),
}));

import { withTransaction } from "@/lib/db";
import { readSignedRsvpPageIn, type SignedRsvpPage } from "@/lib/services/rsvp";
import { resolveRsvpTokenIn, type TokenState } from "@/lib/services/rsvp-tokens";
import {
  RATE_LIMIT_MAX_PER_ADDRESS,
  RATE_LIMIT_MAX_PER_LINK,
  resetRsvpRateLimit,
  UNIFORM_TERMINAL_RESPONSE_MS,
} from "@/lib/rsvp/public-surface";
import RsvpPage from "./page";
import RsvpLinkUnusable from "./not-found";
import {
  ANSWER_ATTENDING,
  ANSWER_NONE,
  ANSWER_NOT_ATTENDING,
  ATTENDING,
  BUSY_HEADING,
  DEADLINE_PASSED_VALUE,
  CONTACT_THE_CLUB,
  DECLINE_PROMPT,
  NOT_ATTENDING,
  SAVE_NOT_ATTENDING,
  TERMINAL_BODY,
  TERMINAL_HEADING,
} from "./presentation";

const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM0123";

const PAGE: SignedRsvpPage = {
  invitationId: "00000000-0000-4000-8000-000000000079",
  capacity: "player",
  eventName: "Team Practice",
  templateName: "Game",
  eventType: "game",
  eventStatus: "approved",
  scheduledOn: "2026-10-14",
  startsAt: "20:00",
  endsAt: "22:30",
  venue: "Iffley Road Astro",
  description: null,
  requiredEquipment: null,
  eventStartsAt: new Date("2026-10-14T19:00:00Z"),
  playerName: "Avery Fielding",
  responseDeadline: new Date("2026-10-13T17:00:00Z"),
  deadlinePassed: false,
  currentResponse: null,
};

function givenToken(state: TokenState, page: SignedRsvpPage | null = PAGE) {
  vi.mocked(resolveRsvpTokenIn).mockResolvedValue({
    state,
    invitation:
      page === null
        ? null
        : {
            invitationId: page.invitationId,
            eventId: "00000000-0000-4000-8000-0000000000ee",
            eventName: page.eventName,
            eventStatus: page.eventStatus,
            startsAt: page.eventStartsAt,
            inviteeName: page.playerName,
            expiresAt: page.responseDeadline,
          },
    writable: state === "valid",
  });
  vi.mocked(readSignedRsvpPageIn).mockResolvedValue(page ?? PAGE);
}

async function renderPage(query: Record<string, string> = {}): Promise<ReturnType<typeof render>> {
  const element = await RsvpPage({
    params: Promise.resolve({ token: TOKEN }),
    searchParams: Promise.resolve(query),
  });
  return render(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRsvpRateLimit();
  // The page runs its resolution inside one transaction; the mock simply runs
  // the callback with a transaction object nothing here actually queries.
  vi.mocked(withTransaction).mockImplementation(async (work: (tx: never) => unknown) =>
    work({ query: vi.fn() } as never),
  );
});

// ---------------------------------------------------------------------------
// UX-60
// ---------------------------------------------------------------------------

describe("UX-60 — the invitation", () => {
  it("names the event, the player, the venue and the deadline", async () => {
    givenToken("valid");
    const { container } = await renderPage();
    const text = container.textContent ?? "";

    expect(text).toContain("Team Practice");
    expect(text).toContain("Wednesday, 14 October 2026");
    expect(text).toContain("20:00–22:30");
    expect(text).toContain("Avery Fielding");
    expect(text).toContain("Iffley Road Astro");
    // The response deadline, which is NOT the write cutoff.
    expect(text).toContain("Tuesday, 13 October at 18:00");
    expect(text).toContain("Late responses accepted until start");
  });

  // LAN-264 — D17's whole reason for a separate field is the player, and this
  // was the one screen an invited player opens that never said what to bring.
  it("says what to bring, keeping the lines the operator typed", async () => {
    givenToken("valid", {
      ...PAGE,
      requiredEquipment: "Gumshield\nStuds\nWater bottle",
    });
    const { container } = await renderPage();

    const fact = container.querySelector('[data-testid="rsvp-equipment"]');
    expect(fact?.textContent).toContain("What to bring");
    expect(fact?.textContent).toContain("Gumshield");
    expect(fact?.querySelector("dd p")).toHaveStyle({ whiteSpace: "pre-line" });
  });

  it("says nothing about equipment for an event that lists none", async () => {
    givenToken("valid");
    const { container } = await renderPage();

    expect(container.querySelector('[data-testid="rsvp-equipment"]')).toBeNull();
  });

  // LAN-323 — the answer page carried the equipment but never what the
  // operator wrote about the event, so a player deciding here could not read
  // it. Two separately labelled facts; the fold into one string belongs to the
  // calendar feed alone.
  it("shows the description, separately labelled from the equipment", async () => {
    givenToken("valid", {
      ...PAGE,
      description: "Full pads.\nMeet at the clubhouse.",
      requiredEquipment: "Gumshield",
    });
    const { container } = await renderPage();

    const description = container.querySelector('[data-testid="rsvp-description"]');
    expect(description?.textContent).toContain("Description");
    expect(description?.textContent).toContain("Full pads.");
    expect(description?.querySelector("dd p")).toHaveStyle({ whiteSpace: "pre-line" });

    const equipment = container.querySelector('[data-testid="rsvp-equipment"]');
    expect(equipment?.textContent).toContain("What to bring");
    expect(equipment?.textContent).toContain("Gumshield");
    // Separate facts, never one folded value.
    expect(equipment?.textContent).not.toContain("Full pads.");
    expect(description?.textContent).not.toContain("Gumshield");
  });

  it("renders no description label at all for an event that has none", async () => {
    givenToken("valid", { ...PAGE, description: null });
    const { container } = await renderPage();

    expect(container.querySelector('[data-testid="rsvp-description"]')).toBeNull();
    expect(container.textContent).not.toContain("Description");
  });

  it("says what kind of event it is, in the same words the operator screens use", async () => {
    // Brian's visual review: "game or practice?" is the first thing a player
    // wants off a link. The word is the template's own name, read off the same
    // row the operator screens read it from (LAN-265) — so the two surfaces
    // cannot drift into calling one event different things, and a rename
    // reaches a player's page like every other surface.
    givenToken("valid");
    expect((await renderPage()).container.textContent).toContain("Game");

    givenToken("valid", {
      ...PAGE,
      eventType: "strength_and_conditioning",
      templateName: "Strength and conditioning",
    });
    expect((await renderPage()).container.textContent).toContain("Strength and conditioning");
  });

  it("offers both answers with the approved labels", async () => {
    givenToken("valid");
    const { getByText } = await renderPage();
    expect(getByText(ATTENDING)).toBeTruthy();
    expect(getByText(NOT_ATTENDING)).toBeTruthy();
  });

  it("reports no standing answer, then each answer, in the shared vocabulary", async () => {
    givenToken("valid");
    expect((await renderPage()).container.textContent).toContain(ANSWER_NONE);

    givenToken("valid", {
      ...PAGE,
      currentResponse: { response: "yes", reason: null, respondedAt: new Date() },
    });
    expect((await renderPage()).container.textContent).toContain(ANSWER_ATTENDING);

    givenToken("valid", {
      ...PAGE,
      currentResponse: { response: "no", reason: "Injury", respondedAt: new Date() },
    });
    expect((await renderPage()).container.textContent).toContain(ANSWER_NOT_ATTENDING);
  });

  it("shows no other player, no peer response, and no count of either", async () => {
    // The service returns one invitation because it can only return one. The
    // assertion is that the screen adds nothing: no roster, no totals, and no
    // "3 of 12 replied" summary invented in the presentation layer.
    givenToken("valid", {
      ...PAGE,
      currentResponse: { response: "yes", reason: null, respondedAt: new Date() },
    });
    const { container } = await renderPage();
    const text = container.textContent ?? "";

    expect(text).toContain("Avery Fielding");
    for (const peer of ["Rowan Ashdown", "Peerson", "Morgan Pike"]) {
      expect(text).not.toContain(peer);
    }
    // No aggregate of any kind. These are the shapes a "helpful" addition takes.
    expect(text).not.toMatch(/\b\d+\s+(of|attending|going|replied|responses?)\b/i);
    expect(text).not.toMatch(/\b(others?|team|squad)\s+(attending|responded)\b/i);
  });

  it("carries the player's own reason nowhere into the invitation screen", async () => {
    // A previous Not attending is shown as "Not attending", never as the text
    // the player typed — the reason is private to the response record.
    givenToken("valid", {
      ...PAGE,
      currentResponse: {
        response: "no",
        reason: "Tutorial clash with my collections paper",
        respondedAt: new Date(),
      },
    });
    const { container } = await renderPage();
    expect(container.textContent).not.toContain("collections paper");
  });
});

// ---------------------------------------------------------------------------
// UX-61
// ---------------------------------------------------------------------------

describe("UX-61 — declining", () => {
  it("requires a reason in the form itself, so a submission is refused before it is made", async () => {
    givenToken("valid");
    const { container, getByText } = await renderPage({ step: "decline" });

    const reason = container.querySelector('input[name="reason"]');
    expect(reason).toBeTruthy();
    expect(reason?.hasAttribute("required")).toBe(true);

    // One reason, and only one. Brian removed the wireframe's optional
    // "Additional detail" box on 14 August 2026, so a second field reappearing
    // here is a regression rather than an addition.
    expect(container.querySelectorAll("input[type='text'], textarea")).toHaveLength(1);
    expect(container.querySelector('[name="detail"]')).toBeNull();

    expect(getByText(SAVE_NOT_ATTENDING)).toBeTruthy();
    expect(container.textContent).toContain(DECLINE_PROMPT);
  });

  it("posts a form rather than requiring script, and carries the token", async () => {
    givenToken("valid");
    const { container } = await renderPage({ step: "decline" });

    const form = container.querySelector("form");
    expect(form).toBeTruthy();
    const token = container.querySelector('input[name="token"]');
    expect(token?.getAttribute("value")).toBe(TOKEN);
  });

  it("marks the reason field invalid when the server sent the player back", async () => {
    givenToken("valid");
    const { container } = await renderPage({ step: "decline", error: "reason" });
    const reason = container.querySelector('input[name="reason"]');
    expect(reason?.getAttribute("aria-invalid")).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// UX-62
// ---------------------------------------------------------------------------

describe("UX-62 — saved", () => {
  it("confirms the standing answer and says the window stays open", async () => {
    givenToken("valid", {
      ...PAGE,
      currentResponse: { response: "no", reason: "Injury", respondedAt: new Date() },
    });
    const { container } = await renderPage({ saved: "1" });
    const text = container.textContent ?? "";

    expect(text).toContain("Your response is saved");
    expect(text).toContain(ANSWER_NOT_ATTENDING);
    expect(text).toContain("until the event starts");
    // Still not the reason text.
    expect(text).not.toContain("Injury");
  });
});

// ---------------------------------------------------------------------------
// UX-63, UX-64, UX-65 — the uniform terminal response
// ---------------------------------------------------------------------------

describe("UX-63, UX-64 and UX-65 — one response for every unusable link", () => {
  const TERMINAL: TokenState[] = ["unknown", "expired", "revoked", "superseded", "event_started"];

  it.each(TERMINAL)("refuses a %s link through the not-found path", async (state) => {
    // `event_started` resolves to a real invitation and must still refuse; the
    // others resolve to none. Both shapes are covered by the same expectation.
    givenToken(state, state === "event_started" ? PAGE : null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each(TERMINAL)("holds a %s link to the uniform timing floor", async (state) => {
    // The wiring, not the helper.
    //
    // Independent review removed `|| outcome.state === "event_started"` from
    // the predicate in `page.tsx` and every test still passed — which would
    // have returned a started link in about 5ms while a revoked one took 250,
    // a 50x difference measurable from a phone and a direct breach of the
    // "non-distinguishable timing behavior" clause. `public-surface.test.ts`
    // proves the floor works; only this proves the page asks for it.
    givenToken(state, state === "event_started" ? PAGE : null);

    const startedAt = Date.now();
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(UNIFORM_TERMINAL_RESPONSE_MS - 5);
  });

  it("does not make a usable link wait", async () => {
    // The counterweight: if the predicate ever returned true for everything,
    // every test above would still pass and every player would pay 250ms.
    givenToken("valid");

    const startedAt = Date.now();
    await renderPage();
    expect(Date.now() - startedAt).toBeLessThan(UNIFORM_TERMINAL_RESPONSE_MS);
  });

  it("renders the approved copy and nothing about the link", async () => {
    const { container } = render(<RsvpLinkUnusable />);
    const text = container.textContent ?? "";

    expect(text).toContain(TERMINAL_HEADING);
    expect(text).toContain(TERMINAL_BODY);

    // No event, no player, no time, no token history, and no word that would
    // let a holder tell which of the four situations they are in.
    //
    // "started" is deliberately absent from this list: the approved copy says
    // "If the event has already started, response changes are closed" to *every*
    // holder, which discloses nothing precisely because it is unconditional.
    for (const forbidden of [
      "Team Practice",
      "Avery",
      "Iffley",
      "October",
      "expired",
      "revoked",
      "superseded",
      "unknown",
    ]) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("offers no way to retry, guess again, or reach a sign-in prompt", async () => {
    const { container } = render(<RsvpLinkUnusable />);
    // A form would be a place to submit a different token.
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();

    // Close used to link to "/", which carries a **Sign in** button and a
    // **Protected page** button — putting a stranger holding a dead link one
    // tap from an operator sign-in, which this ticket forbids. Asserting on the
    // immediate href was not enough to catch that, so the landing page's own
    // destinations are named here too.
    for (const link of Array.from(container.querySelectorAll("a"))) {
      const href = link.getAttribute("href") ?? "";
      expect(href).not.toMatch(/\/operate|\/login|\/dashboard/);
      expect(href).not.toBe("/");
    }
  });

  it("renders no contact action while the club's address is undecided", async () => {
    // Brian deferred the address on 14 August 2026. A button is better absent
    // than present and inert: the first version shipped a `mailto:` to a
    // reserved `.example` domain behind an environment variable declared
    // nowhere, so tapping the club's own approved action did nothing at all.
    const { container } = render(<RsvpLinkUnusable />);
    const html = container.innerHTML;

    expect(html).not.toContain("mailto:");
    expect(html).not.toContain(".example");
    expect(container.textContent).not.toContain(CONTACT_THE_CLUB);
  });

  it("renders the contact action as a mailto once an address is configured", async () => {
    // The other half: proving the absence above is a consequence of the
    // deferral rather than of the action having been quietly deleted.
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_CLUB_CONTACT_EMAIL", "committee@oxfordlancers.org.uk");
    try {
      const { default: Configured } = await import("./not-found");
      const { container } = render(<Configured />);

      expect(container.textContent).toContain(CONTACT_THE_CLUB);
      const mailto = container.querySelector('a[href^="mailto:"]');
      expect(mailto?.getAttribute("href")).toBe("mailto:committee@oxfordlancers.org.uk");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

// ---------------------------------------------------------------------------
// UX-66
// ---------------------------------------------------------------------------

describe("UX-66 — a valid link to a cancelled event", () => {
  it("names the cancelled event and its date, and offers no answer", async () => {
    givenToken("cancelled", { ...PAGE, eventStatus: "cancelled" });
    const { container, queryByText } = await renderPage();
    const text = container.textContent ?? "";

    expect(text).toContain("This event has been cancelled");
    expect(text).toContain("Team Practice on Wednesday, 14 October will not take place");
    // Nothing to answer, so neither action is offered.
    expect(queryByText(ATTENDING)).toBeNull();
    expect(queryByText(NOT_ATTENDING)).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });

  it("shows no other player and no roster information", async () => {
    givenToken("cancelled", { ...PAGE, eventStatus: "cancelled" });
    const { container } = await renderPage();
    const text = container.textContent ?? "";
    expect(text).not.toContain("Rowan Ashdown");
    expect(text).not.toMatch(/\b\d+\s+(invited|attending|players?)\b/i);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe("rate limiting", () => {
  // LAN-376. A flood on the per-link bucket used to render the uniform
  // terminal page, and that is what made Brian's and Glen's links look
  // permanently dead after six answer changes in a minute. Filling this bucket
  // means holding one real token and using it twenty times, so it is said
  // plainly; a guesser presents a different token each time and never reaches
  // it. The per-address bucket, which is the one a guesser does reach, still
  // produces the uniform terminal response — asserted below.
  it("tells the holder their link is busy, not dead, once the per-link allowance is spent", async () => {
    givenToken("valid");

    let busy = 0;
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_PER_LINK + 5; attempt += 1) {
      const { container } = await renderPage();
      if ((container.textContent ?? "").includes(BUSY_HEADING)) busy += 1;
    }
    expect(busy).toBeGreaterThan(0);
  });

  it("never shows the old answer on the busy page", async () => {
    givenToken("valid");

    let text = "";
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_PER_LINK + 2; attempt += 1) {
      text = (await renderPage()).container.textContent ?? "";
    }
    expect(text).toContain(BUSY_HEADING);
    expect(text).not.toContain(PAGE.eventName);
    expect(text).not.toMatch(/current answer/i);
  });

  // This one renders the page RATE_LIMIT_MAX_PER_ADDRESS + 5 times, which is
  // ~2 s on a quiet machine and past the 5 s default on a loaded CI runner
  // (main's push run failed on it twice at 8bc2166d). The budget is the
  // render count's, not a sign of slowness in the page.
  it(
    "keeps the uniform terminal response for the per-address bucket a guesser reaches",
    { timeout: 60_000 },
    async () => {
      givenToken("valid");

      let refusals = 0;
      for (let attempt = 0; attempt < RATE_LIMIT_MAX_PER_ADDRESS + 5; attempt += 1) {
        // A fresh token each time, exactly as a guesser presents one: the
        // per-link bucket is never filled, the per-address one eventually is.
        try {
          render(
            await RsvpPage({
              params: Promise.resolve({
                token: `${TOKEN.slice(0, 39)}${String(attempt).padStart(4, "0")}`,
              }),
              searchParams: Promise.resolve({}),
            }),
          );
        } catch (error) {
          expect((error as Error).message).toBe("NEXT_NOT_FOUND");
          refusals += 1;
        }
      }
      expect(refusals).toBeGreaterThan(0);
    },
  );

  it("says so in the log, because the player is told nothing", async () => {
    // The uniform response is what makes throttling undiscoverable: a player
    // sees "this link can't be used" and asks for a new link, superseding the
    // working one they had. The server is the only thing that can report it.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      givenToken("valid");
      for (let attempt = 0; attempt < RATE_LIMIT_MAX_PER_LINK + 2; attempt += 1) {
        await renderPage().catch(() => {});
      }
      expect(warn).toHaveBeenCalled();
      expect(String(warn.mock.calls.at(-1)?.[0])).toContain("rate limit");
      // Never the token: it is a secret, and never the address: it is personal.
      for (const call of warn.mock.calls) {
        expect(String(call[0])).not.toContain(TOKEN);
      }
    } finally {
      warn.mockRestore();
    }
  });

  it("throttles one link without touching another player's", async () => {
    givenToken("valid");
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_PER_LINK + 2; attempt += 1) {
      await renderPage().catch(() => {});
    }

    // A different token, same (absent) address. It must still render.
    const other = await RsvpPage({
      params: Promise.resolve({ token: "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ" }),
      searchParams: Promise.resolve({}),
    });
    expect(render(other).container.textContent).toContain("Team Practice");
  });
});

/**
 * LAN-379, Brian 2026-09-16. An event created inside its own invite window has
 * a deadline already behind the player reading the page, and quoting it back
 * at them reads as a broken screen.
 */
describe("a response deadline that has already passed", () => {
  it("says to respond as soon as possible instead of quoting a time already gone", async () => {
    givenToken("valid", { ...PAGE, deadlinePassed: true });
    const { container } = await renderPage();

    expect(container.textContent).toContain(DEADLINE_PASSED_VALUE);
    expect(container.textContent).not.toContain("Tuesday, 13 October at 18:00");
  });

  it("still prints a real future deadline", async () => {
    givenToken("valid");
    const { container } = await renderPage();

    expect(container.textContent).toContain("Tuesday, 13 October at 18:00");
    expect(container.textContent).not.toContain(DEADLINE_PASSED_VALUE);
  });
});
