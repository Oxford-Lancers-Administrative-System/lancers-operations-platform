# W2 — Subscribe to the club calendar

## What this workflow is for

Somebody who wants the club's schedule in the calendar app they already use gets
it there in one action, and it keeps itself current without them doing anything
again. No account, no login, and the same public content `W1` shows.

- **Primary actor:** anyone with a browser and a calendar app. Players, coaches,
  parents, prospects and operators all take the same path; an operator is not a
  special case.
- **Trigger:** they have just looked at the club calendar and want to stop having
  to come back to it.
- **Entry point:** the **Add to your calendar** action in the header of the
  public calendar and the public event page, and beside **Create event** in the
  operator Events header.
- **Route/placement:** a subscribe control on the reading surfaces `W1` defines,
  and one public feed route per season serving `text/calendar`.
- **User-visible result:** the season's events appear inside their own calendar
  app, and later changes to those events arrive there on their own.
- **Controlling source:** Brian, 2026-08-20 and 2026-08-21, closing D11 and Q3.

## Required actions

The whole workflow is one dialog. Brian, 2026-08-21: “When I click Add to
Calendar, there should be a pop-up that shows up … it’s just the three buttons.
I have 1 through 3, I click it, and then it says Done. I can close that screen,
and that’s it. That’s the whole workflow.”

1. **Press Add to your calendar.** A dialog opens.
2. **Pick a destination** — Google, Apple or Outlook — or copy the address.
3. **Their own calendar app opens and asks them to confirm.** That confirmation
   belongs to that app, not to this one: Apple opens the iPhone’s Subscribe to
   Calendar sheet, Google its Add calendar prompt. This workflow gets them there
   in one tap and stops.
4. **The dialog says Done. They close it.**

Nothing else on the page changes, and there is no second surface.

## What the subscriber gets

The feed carries exactly what the public tier of `W1` carries, and nothing more.
Brian, 2026-08-21: _"Right now, it's just one public calendar that has all the
gory details on it."_

| In the feed                  | Not in the feed                                 |
| ---------------------------- | ----------------------------------------------- |
| Name                         | Any person, in any capacity                     |
| Type                         | Audience, invitations, RSVP, attendance         |
| Date and time, Europe/London | Delivery state                                  |
| Venue, or that it is online  | **The joining URL of an online event**          |
| Description                  | Anything requiring the club link or an operator |
| Required equipment           |                                                 |
| Mandatory or optional        |                                                 |
| Cancelled, when it is        |                                                 |

## State transitions

**None.** Subscribing changes nothing in the application: it is a read, exactly
as `W1` is. The subscriber's own calendar changes, and that is outside the
system.

## Handoffs

- **← `W1`** — every entry point to this workflow is a `W1` surface.
- **← `W5`, `W6`** — an amendment or a cancellation changes what the feed emits
  on its next fetch.
- **Never Mission 4.** A feed is not a message. See the non-guarantee below.

## Exceptions and recovery

| Situation                                 | Behaviour                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The season has no events yet              | The feed is valid and empty. A calendar app subscribing to it succeeds and shows nothing, rather than erroring |
| An event is cancelled                     | It **stays in the feed, marked cancelled** (Brian, 2026-08-21). It does not vanish                             |
| An event is deleted as an abandoned draft | It leaves the feed. A draft that never became an event was never a commitment                                  |
| An event is amended                       | The same entry updates in place rather than appearing twice — see the identity rule below                      |
| The season ends                           | The feed keeps serving that season as history. The subscriber adds next season's feed when they want it        |
| A subscriber's app never refreshes        | Outside our control, and the reason for the non-guarantee below                                                |

## The refresh non-guarantee — record this, do not soften it

The subscriber's calendar provider decides when to re-fetch. None of them accept
a push, and our published refresh hints are advisory and widely ignored.

| Provider            | Observed refresh                      | Subscriber control                                             |
| ------------------- | ------------------------------------- | -------------------------------------------------------------- |
| Google              | roughly 12–24 hours, sometimes longer | none; no manual refresh exists                                 |
| Microsoft / Outlook | roughly 3–24 hours, inconsistent      | none                                                           |
| Apple               | about hourly by default               | yes — 5 minutes to weekly on macOS; iOS follows Fetch New Data |

**Therefore the calendar feed is not a notification channel, and nothing in the
club's operation may depend on it as one.** A practice cancelled at 07:00 on the
morning will not reach a Google subscriber before the session. Cancellations and
amendments still travel by Mission 4's messaging; the feed is a convenience over
that, never a substitute. This belongs in the packet as an explicit
non-guarantee, because the failure mode — people arriving at a cancelled
session — is silent and lands on the club rather than on the software.

## Safety, privacy, consent, and authority boundaries

- **The feed URL is public, permanent and unauthenticated**, and it is the same
  posture D1 already approved for the public calendar. It will be fetched by
  machines, cached, and possibly indexed.
- **A feed URL outlives the page that produced it.** It sits in a subscriber's
  phone for a season and re-fetches from wherever it first pointed.
- **No person appears in the feed**, so there is no consent question in it.
- **An online event's joining URL is never emitted.** A feed is the worst place
  to put one: it is public, cached, and copied into third-party services.

## Repository reconciliation

Nothing to reconcile — there is no feed, no `.ics` code and no calendar library
on `main` at `2072ecd`. This workflow is entirely new.

Two facts that shape the work:

- The application already serves public route handlers — `src/app/api/health`,
  `src/app/api/venue-search`, `src/app/api/webhooks/whatsapp` — so a route
  returning `text/calendar` needs no new infrastructure.
- No iCalendar library is present. Emitting the format by hand is possible but
  its line folding and escaping rules are a well-known source of defects.
  Choosing a library, or not, is the Mission Lead's call and carries a
  dependency change.

## Prerequisite gate — LAN-126

**A subscription URL cannot move.** If feeds are published on today's hostname
and LAN-126 later moves the club to its real domain, every existing subscription
quietly stops updating, and no subscriber notices — a stale calendar looks
exactly like a calendar with nothing new in it.

This is already a recognised class of problem: the Release 1 Authority Manifest
records for the LAN-126 cutover that "issued RSVP/club links must be
revoked-and-reissued or preserved by redirect — decide before cutover". Feed
URLs join that decision. Either this workflow ships on the final hostname, or a
permanent redirect from the URL it ships on is guaranteed from the first day it
is published. It is not a reason to delay the mission, and it is not something
the Mission Lead may decide alone.

## Acceptance evidence

- Subscribing from Google, from Microsoft and from Apple all succeed from the
  same published feed, by the route each platform supports.
- The feed validates as iCalendar and is accepted by all three without warnings.
- A feed for a season with no events is valid and subscribes cleanly.
- An event amended in the application updates the existing entry in a
  subscribed calendar rather than creating a second one — the identity rule
  below, asserted by test on the emitted document.
- A cancelled event remains in the feed and is marked cancelled.
- A deleted draft leaves the feed.
- No emitted document contains a person, an RSVP, an attendance record, or an
  online event's joining URL — asserted by test, not by inspection.
- Requesting the feed creates no audience, invitation, RSVP, attendance or
  notification record.
- Times resolve to the correct local time across a British Summer Time
  boundary in all three calendar apps.

## Core decisions

| Decision                                                                                                                           | Classification                                                                | Governing evidence or recommended default                                                                                                                                                            | Status                    |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| The club calendar is offered as a **subscription**, not a download                                                                 | `locked`                                                                      | Brian, 2026-08-20: "Any time the calendar is created, it should automatically have the update." Only a subscription can do that                                                                      | Settled                   |
| Google, Microsoft and Apple are the offered destinations                                                                           | `locked`                                                                      | Brian, 2026-08-20                                                                                                                                                                                    | Settled                   |
| **One feed per season.** A subscriber adds the new season's calendar each year                                                     | `locked`                                                                      | Brian, 2026-08-21: "It's one feed per season. They have to add the calendar every season." Consistent with events being owned by exactly one season                                                  | Settled                   |
| **A cancelled event stays in the feed and is marked cancelled**                                                                    | `locked`                                                                      | Brian, 2026-08-21: "They should stay, but mark as canceled if the event is truly canceled." An event that silently disappears reads as a sync failure                                                | Settled                   |
| **No per-event copy action anywhere**                                                                                              | `locked`                                                                      | Brian, 2026-08-21: "The per-event copy should never be part of the update at all, so no." A copy cannot update, and offering it beside a subscription guarantees somebody ends up with a stale event | Settled                   |
| **One public feed only.** A richer club-link or operator feed is deliberately future scope                                         | `locked`                                                                      | Brian, 2026-08-21: "Right now, it's just one public one for now. We need to split it later."                                                                                                         | Settled                   |
| The feed carries exactly the public tier's content, and never a person or a joining URL                                            | `locked`                                                                      | Inherited from `W1`, settled by Brian 2026-08-20                                                                                                                                                     | Settled                   |
| Refresh timing is the subscriber's provider's, and the feed is not a notification channel                                          | `locked`                                                                      | Provider behaviour, researched 2026-08-21 and tabulated above                                                                                                                                        | Settled                   |
| The feed URL must be final, or permanently redirected from the day it is published                                                 | `locked` as a constraint; the **hostname decision itself belongs to LAN-126** | Authority Manifest, LAN-126 cutover link-domain rule                                                                                                                                                 | Settled here, gated there |
| Whether an iCalendar library is added or the document is emitted directly                                                          | `delegated to Mission Lead`                                                   | Carries a dependency change either way                                                                                                                                                               | Delegated                 |
| The exact feed route and URL shape                                                                                                 | `delegated to Mission Lead`                                                   | Must be stable and season-scoped; nothing else follows from the product                                                                                                                              | Delegated                 |
| Event identity across amendments — a stable per-event identifier and a revision counter, so an edit updates rather than duplicates | `delegated to Mission Lead`                                                   | Ordinary iCalendar correctness, but the one implementation detail with real user-visible risk, so it is named in the acceptance evidence                                                             | Delegated                 |
| Whether a past season's feed keeps serving or is retired                                                                           | `delegated to Mission Lead`                                                   | Recommended default: it keeps serving, because it is history and costs nothing                                                                                                                       | Delegated                 |
| Caching and crawler policy for the feed                                                                                            | `delegated to Mission Lead`                                                   | Provided fetches stay side-effect-free                                                                                                                                                               | Delegated                 |

## Brian approval

- **Exact words:** “Yep, that works, and yeah, it’s so simple. I don’t think we
  need much more, so I approve.” (2026-08-21)
- **Date:** 2026-08-21
- **What it approved:** this specification and the two-screen mockup, after the
  first draft was cut back — Brian: “you’re overcomplicating this … These extra
  screens aren’t really necessary.”
