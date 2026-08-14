# LAN-78 — UX conformance evidence

Captured from the running application at PR #24's head, against the
`scripts/pilot/lan-78` scenario. Every person, event, contact detail and
delivery state shown is synthetic; the phone numbers behind them are in Ofcom's
reserved `07700 900xxx` drama range and reach nobody.

`AGENTS.md` § Workflow requires an implementation pull request to carry a
UX-conformance checklist and screenshots for every applicable presentation.
These are those screenshots; the checklist is below.

## Screens

| Screen | Desktop (1440px)                               | Phone (375px)                                |
| ------ | ---------------------------------------------- | -------------------------------------------- |
| UX-50  | [`overview`](UX-50-overview-desktop.jpg)       | [`overview`](UX-50-overview-375px.png)       |
| UX-51  | [`diagnostics`](UX-51-diagnostics-desktop.jpg) | [`diagnostics`](UX-51-diagnostics-375px.png) |
| UX-52  | [`repair`](UX-52-repair-desktop.jpg)           | [`repair`](UX-52-repair-375px.png)           |

The 375px captures were taken by rendering the route in a 375×812 iframe, which
gives the page its own viewport so the media queries resolve as they would on a
phone. The Chrome window itself would not resize below its minimum.

## Conformance checklist

Against [`docs/ux/tickets/LAN-78-delivery.md`](../../tickets/LAN-78-delivery.md)
and [`docs/ux/slice-ux.md`](../../slice-ux.md).

| #   | Requirement                                              | Result                                                                                                    |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | All owned screen IDs render at their registered route    | ✅ UX-50, UX-51 and UX-52 all at `/operate/events/[id]/delivery`, selected by `?view=` and `?invitation=` |
| 2   | Correct role and record scope                            | ✅ gated on `delivery_administration`; a coaching seat gets UX-05 and the read never runs                 |
| 3   | Primary and secondary actions use the approved labels    | ✅ **View diagnostics**, **Open selected issue**, **Retry delivery**, **Revoke and reissue link**         |
| 4   | Material alternate states reachable and testable         | ✅ Queued, Attempted, Delivered, Failed, Retryable; empty; unauthorized; disabled retry at the ceiling    |
| 5   | Delivery vocabulary per slice-ux § 6                     | ✅ the five states verbatim; RSVP rendered from `invitation_response_state`, never from delivery          |
| 6   | "Delivered never means responded"                        | ✅ separate Result and RSVP columns; a test asserts an attempted row still reads **Outstanding**          |
| 7   | Desktop information hierarchy preserved                  | ✅ wide scannable table, visible filters, one clear primary action                                        |
| 8   | Phone reflow removes no information or action            | ✅ cards replace the table; both repair controls reachable; no horizontal scrolling                       |
| 9   | Touch targets                                            | ✅ 44px minimum on every primary control                                                                  |
| 10  | Status meaning not carried by colour alone               | ✅ every chip carries its word                                                                            |
| 11  | Error association and safe copy                          | ✅ the provider reason is mapped and digit-redacted; no raw provider text, no number, no link             |
| 12  | No inaccessible data in the DOM for an unauthorized role | ✅ asserted: `readEventDelivery` is never called and no invitee name appears                              |
| 13  | No manual send, copy or post control                     | ✅ control inventory across all three views, plus a scheme scan over `src/`                               |

## Recorded deviations

Two, both deliberate.

1. **UX-51's Retry column shows `Scheduled` for a queued row**, matching the
   wireframe, but the underlying value is `retryable` — the same flag that
   renders `Retryable` for a failed row. The wireframe's "Next automated attempt
   12:15" on UX-52 is **not** implemented: nothing schedules a next attempt (see
   the pull request's limitations), so a time there would be untrue.
2. **UX-52's Token fact reads "Not yet issued"** for an invitation that has not
   been attempted, where the wireframe shows "Live". A token is minted at the
   delivery attempt, not at approval, because its plaintext cannot be stored —
   so "Live" before any attempt would be false. ADR 0023 records the reasoning.
