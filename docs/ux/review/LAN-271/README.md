# LAN-271 — review screenshots

Exact-head captures from the local review slot, through the real login, at a
measured 1440 and 375. All data is synthetic seeded scenario data; no real
member appears.

## The record's send control, in each of its states (LAN-266)

Each image is the Onboarding card of `/operate/roster/[membershipId]`, so the
button is seen where it lives — beneath the checklist and the outstanding
banner, full width, with its two status lines under it.

| State                                  | Status lines                                                                   | Desktop                           | 375                              |
| -------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------- | -------------------------------- |
| Never asked (Odile Marchmont)          | `Not sent` · `No phone number on file`                                         | `state-not-sent-1440.png`         | `state-not-sent-375.png`         |
| Sent, chase running (Jorvik Kirkbride) | `Sent 1 Sept 2026, 10:00 · delivered` · `Chase 1 of 4 sent · next 4 Sept 2026` | `state-sent-and-chasing-1440.png` | `state-sent-and-chasing-375.png` |
| Chase exhausted (Isolde Thistlewood)   | `Sent 30 Aug 2026, 10:00 · delivered` · `Chase exhausted`                      | `state-chase-exhausted-1440.png`  | `state-chase-exhausted-375.png`  |
| No reachable number (Kenelm Netherby)  | `Sent 30 Aug 2026, 10:00 · delivered` · `No phone number on file`              | `state-no-phone-number-1440.png`  | `state-no-phone-number-375.png`  |

The button reads `SEND …` until an ask has been queued and `RESEND …`
afterwards. The second line's five phrases are the missing-data queue's own
(`formatChaseNext`), imported rather than reproduced.

## The two blocker fixes, from the player's side

- `m7-reopened-photo-release-375.png` — LAN-240. After the operator sets Photo
  release back to `No`, the player's own step reads **3. PHOTO RELEASE —
  Outstanding** in the navigator _and_ offers the agreement again. The sweep's
  screenshot of the same screen showed "Already agreed — version …, on 8 Sept
  2026" under that same "Outstanding".
- `m7-future-dob-inline-message-375.png` — LAN-245. A date of birth of
  31/12/2030 gets an inline field message instead of the generic error boundary
  and a 500.
