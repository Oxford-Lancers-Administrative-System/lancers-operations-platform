# Item and ask inventory — M-ONBOARDING-AND-INFORMATION-COMPLETION

What onboarding asks a player for, settled once here so `W1`, `W3`, `W4`, `W6`,
`W8` and `W11` cite this table rather than re-deciding it screen by screen.

Assembled from Task 10 §3–§4 with its 2026-08-26 amendments, the required set
already shipped in `src/lib/services/person-required.ts`, Mission 6's `W4`
questionnaires, two scout sweeps (the club's own corpus, and Hudl's public
documentation), and Brian's corrections of 2026-09-01.

## The items

**Who completes it** — `operator` a club-side tick on the roster board ·
`player` the player acts through their signed link · `derived` it completes
itself from other recorded facts.

**There is no flagged/unflagged distinction.** Brian dropped it on 2026-09-01:
_"Yes, drop the flag/not flag distinction, please."_ Every item counts the same,
and the Monday queue ranks a person by everything outstanding. The flag's one
useful effect — keeping subs paid from nagging people in Michaelmas — is carried
instead by **due-timing**, which the chase already has to understand.

This supersedes Task 10 R3-G's retention of "required" as a display flag. The
governing half of R3-G is untouched: nothing gates, ever.

| #   | Item                       | Who               | What actually happens                                                                                                                                                                                                                                                                |
| --- | -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Subscription invoiced      | operator          | Did we send it out? An operator goes down the roster ticking. Not a claim anybody makes about themselves.                                                                                                                                                                            |
| 2   | Subscription paid          | operator          | The operator records payment. Never gates anything. **Not due until terms 2–3**, so it does not rank anybody until then.                                                                                                                                                             |
| 3   | Kit sorted                 | operator          | Has this person been given their kit? Binary, ticked by whoever handed it over.                                                                                                                                                                                                      |
| 4   | BUCS Play                  | player → operator | The player downloads the app, registers with their Oxford email and selects Oxford Lancers. Their yes shows as `claimed` until the compliance owner confirms. Re-registered yearly.                                                                                                  |
| 6   | Hudl access                | operator → player | **Two parts, like comms group.** Have they been invited, and have they gone and done it? Assume the email-invite method (Brian, 2026-09-01: "doesn't really matter for my purposes"); Hudl's own roster reads `Pending Invite` in between. A candidate for a real integration later. |
| 7   | Squad photo                | operator          | The Media Secretary ticks it. No photo is ever stored here.                                                                                                                                                                                                                          |
| 8   | Comms group                | operator ×2       | **Two columns.** Have they been assigned to a group? Have they been invited and are they actually in? Both yes before it completes.                                                                                                                                                  |
| 9   | Contact & academic details | derived           | Completes when every required field on their record is present. This item **is** the form, and its missing pieces **are** the queue.                                                                                                                                                 |
| 10  | Code of Conduct            | player            | Reads the Code of Conduct on a page, then confirms they have read and understood it. Dated, stored as theirs.                                                                                                                                                                        |
| 11  | Photo release              | player            | Reads the release on a page and signs it. **Seasonal** — asked of everyone every season (Brian, 2026-09-01).                                                                                                                                                                         |
| 12  | Season welcome & consent   | derived           | **Two things**: has the welcome gone out, and have they approved? Approval is what completes it.                                                                                                                                                                                     |

### Item 5 — BPS — leaves the checklist

Brian, 2026-09-01. The Blues Performance Scheme is a gym scheme limited to about
ten players, rotated on attendance — a coaching selection decision, not
something a player completes. On a checklist that regenerates for everyone every
season it would show outstanding against players who were never in the scheme.
It becomes a plain yes/no on the roster with the other player attributes.

**Settled 2026-09-01:** the column is added here, on the roster, by this
mission. Brian: "it's not a fucking mission change. We are going to add it here
into the roster for the BPS column."

## Why the roster board carries most of it

Seven of the items are an operator going down a list ticking yes. That surface
already exists: Mission 5's roster board edits in the cell, so the onboarding
items become columns on the board an operator already works from, rather than a
new screen. Comms group takes two of those columns. The per-player record keeps
what a cell cannot carry — history, who said what and when, and the activity
log. The import preview stays this mission's only genuinely new operator surface.

## The form, in order

One screen, reached from the welcome link. A person with everything already
recorded confirms rather than retypes.

1. **Consent to be messaged** — the tick, and step one. One-way on their side.
2. First name · 3. Last name · 4. Mobile phone — all required (Brian,
   2026-09-01, superseding the 2026-08-26 note that last name was not).
   Read-back applies to the mobile.
3. Personal email · 6. College · 7. Matriculation year · 8. Expected graduation · 9. Degree field
4. **Date of birth** — restricted; never on a list, board or queue, only the
   under-18 flag derived from it.
5. Emergency contact
6. **Code of Conduct** — a page they read, then confirm. Wording is Clint's,
   from a versioned slot.
7. **Photo release** — a page they read, then sign.
8. **BUCS Play** — instructions, then "have you done it?"
9. **Hudl** — instructions, then "are you in?" Email-invite method assumed.

## What each ask says

| When                           | What goes out                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| On arriving, all three doors   | **The welcome.** "Welcome to the team, 2026–27," carrying the link. The only message permitted before consent exists, and its purpose is to obtain it.      |
| While things are outstanding   | **The follow-up.** The same link, compiled to what is still missing. Bounded; stops for good after the configured number of messages that actually arrived. |
| When an operator presses nudge | **The nudge.** The same compiled link, sent because a human decided to. Outside the cap, logged, and sendable to several people at once from the queue.     |
| When one fact is in doubt      | **The targeted ask.** One fact, not the whole form. Only when nothing else is open.                                                                         |

**Content this mission owes and nobody has written.** Stewart described the BUCS
Play nudge on 2026-08-11 as "giving Jamie Carter the App Store download link for
the app. He downloads it. He fills it out with some instructions in the text
message that say do this this this." Task 10 defers that copy to Task 11, which
is this mission. The same is now true of Hudl's instructions.

## What arrives already filled in

| What they gave                                                                     | From                          | At onboarding                                       |
| ---------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------- |
| First name, last name, mobile                                                      | The recruit door              | Pre-filled; they confirm rather than retype         |
| Preferred name, mobile, email, college, year                                       | Questionnaire A               | Pre-filled into the matching fields                 |
| Played before, watched before, position interest, gear owned, how they heard of us | Questionnaire B               | Carried onto the record; not asked again here       |
| Consent to be messaged                                                             | The recruit door, this season | Already granted — not asked again until next season |
| Their open recruit link                                                            | Recruitment                   | Retired, audited, replaced by the onboarding link   |

**Date of birth, emergency contact, degree field and expected graduation come
from nowhere** — recruitment never asks for them. They are asked fresh at
onboarding, of everyone, whichever door they came through.

## Open

Nothing. All four are settled; the last of them, the flag, was dropped on
2026-09-01.

## Brian approval

- Exact words: "Okay, cool. Let's close this out, and I'm going to restart your session."
- Date: 2026-09-01
