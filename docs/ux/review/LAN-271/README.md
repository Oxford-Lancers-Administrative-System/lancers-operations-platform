# LAN-271 — review screenshots

Exact-head captures from the local review slot, through the real login, at a
measured 1440 and 375. All data is synthetic seeded scenario data; no real
member appears.

## The record's send control, in each of its states (LAN-266)

Recaptured after Brian's visual correction of 2026-09-09: the button is the
recruit record's own component with the recruit record's own props, so it is
content-width and left-aligned inside the card rather than stretched across
it. Measured through the browser, it is 266px as `SEND …` and 283px as
`RESEND …`, the same at 1440 and at 375 — not the card's 866px and 309px it
was before.

Each image is the Onboarding card of `/operate/roster/[membershipId]`, so the
button is seen where it lives — beneath the checklist and the outstanding
banner, with its two status lines under it.

| State                                  | Status lines                                                                           | Desktop                           | 375                              |
| -------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------- |
| Never asked (Lysander Croft)           | `Not sent` · `No phone number on file`                                                 | `state-not-sent-1440.png`         | `state-not-sent-375.png`         |
| Sent, chase running (Jorvik Kirkbride) | `Sent 9 Sept 2026, 23:33 · failed — <reason>` · `Chase 1 of 4 sent · next 4 Sept 2026` | `state-sent-and-chasing-1440.png` | `state-sent-and-chasing-375.png` |
| Chase exhausted (Isolde Thistlewood)   | `Sent 30 Aug 2026, 10:00 · delivered` · `Chase exhausted`                              | `state-chase-exhausted-1440.png`  | `state-chase-exhausted-375.png`  |
| No reachable number (Kenelm Netherby)  | `Sent 30 Aug 2026, 10:00 · delivered` · `No phone number on file`                      | `state-no-phone-number-1440.png`  | `state-no-phone-number-375.png`  |

The button reads `SEND …` until an ask has been queued and `RESEND …`
afterwards. The second line's five phrases are the missing-data queue's own
(`formatChaseNext`), imported rather than reproduced.

Two rows moved on between the first capture and this one, because the slot
kept running: the walk's own press and a scheduler tick both wrote asks that
delivery — deliberately unconfigured here — refused. The never-asked row
therefore names a membership that has never been asked at all, and Jorvik's
first line now shows requirement 3's other half, a refusal naming its own
stored reason on the record instead of "could not be completed". `delivered`
is still shown, on the two rows below it.

## The two blocker fixes, from the player's side

- `m7-reopened-photo-release-375.png` — LAN-240. After the operator sets Photo
  release back to `No`, the player's own step reads **3. PHOTO RELEASE —
  Outstanding** in the navigator _and_ offers the agreement again. The sweep's
  screenshot of the same screen showed "Already agreed — version …, on 8 Sept
  2026" under that same "Outstanding".
- `m7-future-dob-inline-message-375.png` — LAN-245. A date of birth of
  31/12/2030 gets an inline field message instead of the generic error boundary
  and a 500.
