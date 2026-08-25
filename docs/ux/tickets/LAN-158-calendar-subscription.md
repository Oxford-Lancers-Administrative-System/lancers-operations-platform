# LAN-158 — Subscribe to the club calendar

**Workflow:** `W2 — Subscribe to the club calendar`
**Routes:** `/calendar/feed.ics` (the feed); the dialog itself has no route —
it opens from `/calendar`, `/calendar/view`, `/calendar/[id]`,
`/operate/events` and `/operate/events/calendar`
**Shared contract:** [`../slice-ux.md`](../slice-ux.md) ·
[`../standards.md`](../standards.md)
**Builds on:** [`LAN-153-public-calendar-and-tiers.md`](LAN-153-public-calendar-and-tiers.md)
— `W2`'s content is `W1`'s public tier, unmodified

## Why this contract exists

The mission packet's `W2` specification and its mockup were the approved
design, and the packet is not a durable repository contract. This records
what was built from them.

Sources, in the authority order `slice-ux.md` § 1 sets:

- `LAN-158` in Linear, and the owner decisions it cites (Q-11, Q-12, D11, D57,
  Q-3, and the Lead's determinations under Q-21).
- `missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/workflows/W2-subscribe-to-the-club-calendar.md`,
  approved by Brian on 21 August 2026.
- `missions/packets/M-EVENTS-CALENDAR-TARGET-STATE/mockups/W2-subscribe-to-the-club-calendar.html`
  — screens `W2-01` and `W2-02`, desktop 1280 and 375, the two the first
  five-screen draft was cut down to: "you're overcomplicating this … These
  extra screens aren't really necessary" (Brian, 21 August 2026).
- `missions/packets/M-EVENTS-CALENDAR-TARGET-STATE/acceptance/W2.md`.

## What this is, in one sentence

One dialog, reachable from every public and operator calendar surface, that
gets the open season's events into a reader's own calendar app in one action
and keeps them current there without the reader coming back — by pointing
their calendar app at `/calendar/feed.ics`, a standing RFC 5545 document. Not
a download, not a notification, not a second copy of the calendar to
maintain.

## The two screens, and nothing beyond them

One `Dialog` component (`src/app/calendar/subscribe-dialog.tsx`), switched on
local state, with exactly two states:

| Screen  | Shows                                                                                        |
| ------- | -------------------------------------------------------------------------------------------- |
| `W2-01` | The season line, three destination buttons (Google, Apple, Outlook), and the address to copy |
| `W2-02` | A tick, "`<Provider>` has opened…", and Close                                                |

Picking a destination opens it (`window.open`, a `webcal:` address for Apple
and each provider's own HTTPS add-by-URL endpoint for Google and Outlook) and
moves straight to `W2-02` — this control's job ends at handing off to the
reader's own calendar app; the confirmation there belongs to that app.
Copying the address gives inline feedback ("Copied") on the **same** `W2-01`
screen rather than a screen of its own, because the workflow names it as an
alternative to picking a destination, not a third step. There is no per-event
copy action anywhere (the workflow's own `locked` decision) and no loading,
settings, or confirm-of-confirm screen. `src/app/calendar/subscribe-dialog
.test.tsx` proves both states are reachable and that neither leaves a third.

## Entry points — one control, five places

`REQ-subscription`'s "from ONE dialog" is the component, not the count of
buttons that open it. The same `SubscribeToCalendarButton` is placed:

- in the public calendar's header (`/calendar`, `/calendar/view`) — the
  action slot `PublicShell` already offers;
- beside "Back to the calendar" on the public event page (`/calendar/[id]`);
- beside "Create event" in the operator Events header, on both operator
  arrangements (`/operate/events`, `/operate/events/calendar`) — every linked
  operator, not only one who may create an event, since subscribing is the
  same public action wherever it is pressed.

Every instance points at the same `PUBLIC_CALENDAR_FEED_PATH`. There is no
operator-specific feed — "one public feed only … we need to split it later"
(Brian, 21 August 2026) — so an operator subscribing sees exactly what a
stranger would.

## The feed itself

**Route:** `GET /calendar/feed.ics`, `Content-Type: text/calendar;
charset=utf-8`, `Cache-Control: public, max-age=300`. Permanently stable —
no season in the URL. When the season rolls over, a subscriber's entries
change wholesale on their next fetch; that is the intended behaviour
(`src/lib/services/calendar-feed.ts`'s own header records the trade-off).

**Content** — exactly `W1`'s public tier, nothing stricter and nothing
extra, per Q-11/Q-12: drafts included (unapproved draft detail is
world-readable, Brian's explicit acceptance), a cancelled event stays and is
marked cancelled, a deleted draft disappears, an amendment updates the
existing entry.

| In the feed                  | Not in the feed                                     |
| ---------------------------- | --------------------------------------------------- |
| Name, type (in the name)     | Any person, in any capacity                         |
| Date and time, Europe/London | Audience, invitation, RSVP, attendance              |
| Venue, or that it is online  | **The joining URL of an online event**              |
| Cancelled, when it is        | Delivery state, or anything requiring the club link |

**`VEVENT` properties** — the Lead's determination, and the complete list:
`UID`, `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `LOCATION`, `STATUS`,
`SEQUENCE`. No `DESCRIPTION`, no `CATEGORIES` — `SUMMARY` already carries the
type where an operator wrote it into the event's name.

**Identity.** `UID` is the event's own id plus `@app.oxfordlancers.com`,
never regenerated. `SEQUENCE` is whole seconds between `events.updated_at`
and a fixed epoch constant — monotonic, so a real edit always produces a
higher `SEQUENCE`, which is what makes a subscribed calendar replace its copy
of an entry instead of duplicating it.

**No dependency.** RFC 5545 is emitted directly — CRLF line endings, 75-octet
line folding, RFC 5545 §3.3.11 text escaping — rather than adding a library,
which would put `package.json` on the merge gate's prohibited-surface list
(Q-21).

## Empty and exception states

| Situation                                  | What the feed does                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| The season has no events yet               | A complete, valid, zero-`VEVENT` document — subscribing succeeds and shows nothing                            |
| No season is currently open                | The same: a valid, empty document, rather than an HTTP error a calendar app cannot render                     |
| An event has no date yet (a draft)         | Omitted from the document — RFC 5545 requires `DTSTART`, and there is no honest value for a date nobody chose |
| An event has a date but no time            | A whole-day entry (`VALUE=DATE`), not an invented time                                                        |
| An event has a start but no stated end     | A valid zero-duration `VEVENT` (`DTEND` omitted), not an invented duration                                    |
| An event is cancelled                      | Stays, `STATUS:CANCELLED` — never removed (D57)                                                               |
| A venue-less in-person draft               | `LOCATION` omitted rather than emitted blank                                                                  |
| An online event with no stated destination | `LOCATION:Online`                                                                                             |

## The refresh non-guarantee — stated on the dialog, not softened

"Your calendar app decides how often it checks for changes. A cancellation is
also messaged to you directly — do not rely on your calendar app to hear
about it first." The dialog never uses the word "notify" or "notification"
(`subscribe-dialog.test.tsx` asserts this directly). Refresh timing belongs
to the subscriber's provider (roughly 12–24h for Google, 3–24h for Outlook,
about hourly by default for Apple) and this mission's own automated
messaging — Mission 4's — remains the only channel a cancellation is
guaranteed to reach on time.

## Safety, privacy, consent, and authority boundaries

- **The feed URL is public, permanent and unauthenticated** — the same
  posture D1 already approved for the public calendar. No cookie is read or
  set by the route; `tests/calendar-feed-side-effects.test.ts` proves a read
  creates no row in any of the five participation tables.
- **No person appears in the feed**, so there is no consent question in it —
  asserted on the payload, not the page.
- **An online event's joining URL is never emitted.** The type the feed reads
  (`FeedEvent`) has no field for one.
- **The feed URL cannot move** without a permanent redirect — it joins
  LAN-126's existing cutover rule for issued links. This ships on the
  permanent hostname (`app.oxfordlancers.com`) and adds no configuration for
  it.

## Responsive

Both screens are one `Dialog`, `maxWidth="xs"`, and MUI's own dialog
behaviour narrows it to the viewport below that — no separate layout was
built for 375px because none was needed. Every button carries the 44px touch
minimum. `npm run visual:preflight` covers `/calendar` and the dialog at
desktop and 375px.

## Acceptance evidence, and what is outstanding

Everything local-provable is proved by test — see `receipt.json` for the
exact commands and results. **Subscribing successfully from Google, Microsoft
and Apple** needs a publicly reachable URL this worker does not have; the
document's RFC 5545 conformance is proved by a structural parser
(`tests/helpers/icalendar-validate.ts`) instead, and live provider
subscription is Brian's to confirm after deployment.
