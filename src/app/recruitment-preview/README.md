# Recruitment fidelity mockup — read this before you build a recruitment surface

**Branch:** `chore/recruitment-fidelity-mockup`, cut from `main` at `177686c`
(LAN-122, the M-RECRUITMENT mission packet). **Never merged, and never to be
merged.** LAN-200.

**Run it:** `npm ci` in this worktree if you have not, then `npx next dev -p 3211`
and open <http://localhost:3211/recruitment-preview>. **No login, no Supabase and
no database lease** — which matters, because the mission's own packages hold
theirs.

One caveat, and it is the proxy's rather than this page's: `src/proxy.ts` builds
a Supabase client for every request that is not one of the four public token
prefixes, so `.env.local` must exist with `NEXT_PUBLIC_SUPABASE_URL` and a
publishable key or the route answers 500. Nothing here reads either value — the
proxy needs them before this page is reached. `cp .env.example .env.local` and
the two documented local defaults are enough; the database itself can stay
stopped. Adding this route to the proxy's public list would have been the other
fix, and it is a change to a security-relevant file on a branch that never
merges, so it was not made.

**Drive it:** the dashed strip at the foot of the screen switches between the ten
surfaces. It is scaffolding, not product. So is every other dashed panel in here.

**One thing to know before you edit:** `next dev` appends a ten-line
`nextjs-agent-rules` block to `AGENTS.md` on startup, which pushes that file past
the 250-line cap `tests/agent-harness.test.ts` enforces. Discard it
(`git checkout -- AGENTS.md`) before running `npm run verify` or committing.

---

## What this is

A **running** mockup of every recruitment surface in `M-RECRUITMENT`, built so
the interaction model can be driven rather than inferred.

It exists because every screen in `missions/intake/M-RECRUITMENT/mockups/` is a
photograph of a _different_ page with a proposal evaluated into it. That was the
right way to get 39 screens approved in a day, and it has a hard limit: a
photograph cannot be clicked. The things the mission actually argues about are
all interactions —

- in-cell status editing, and which values interrupt;
- the flip confirmation, which exists in no application and was drawn once;
- the duplicate resolution, and which door runs which check;
- **what a recruit actually sees after tapping a WhatsApp invitation**, which
  took three attempts in prose and was still wrong twice;
- and the consent gate, which was settled after the screens were approved and
  therefore appears on none of them.

Now you can click all of it.

## What this is **not**

- **Not the implementation.** Do not copy it into `src/app/operate/recruitment/`.
  It is a reference for _how it should feel_, not a source of code. There is no
  service, no server action, no authorization and no persistence anywhere in it.
- **Not an authority.** Where it disagrees with a file in
  `missions/intake/M-RECRUITMENT/workflows/`, **that file wins** — except on
  consent, where the model settled with Brian on 2026-08-31 supersedes `W4`,
  `W5`, `W6`, `W7` and `W10`, and this mockup follows the model.
- **Not authorized.** It sits outside `/operate` because that prefix is protected
  in `src/proxy.ts` and its layout resolves a real operator against a real
  session. A mockup needing a login and a database lease is a mockup nobody
  opens. The consequence is stated plainly: **this page has no authorization and
  must never carry a real record.** That is fine on a branch that is never
  merged, and it is the reason this branch is never merged.
- **Not approved.** Two surfaces here have no approved screen behind them at all
  — consent end to end, and the opt-out — and several carry decisions Brian has
  recorded as open. Every one of those is marked on the screen itself, not only
  here.

---

## The ten surfaces, and what each is for

| Surface                                     | Workflows              | What to look at                                                                |
| ------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| **The recruit board**                       | `W1` `W13` `W14`       | In-cell status editing, and the four values that interrupt                     |
| **One recruit's record**                    | `W2`                   | Six shipped cards with their content replaced; the refusal stated three times  |
| **Walk-up capture**                         | `W5`                   | The shipped form, the corrected word, and the sentence about what saving sends |
| **Add a recruit, and the duplicate check**  | `W6` `W8`              | The check at the door, with each candidate's identity on it                    |
| **The sign-up form, the consent gate**      | `W7` + Questionnaire A | Both entry paths; the group link appears in exactly one of four outcomes       |
| **The season QR page**                      | `W1-04` `W10`          | Minting, where it points, deactivating a live code, reminting                  |
| **Questionnaire B**                         | `W4`                   | The six fields, and three link states including the uniform invalid page       |
| **Recruitment event attendance**            | `W12`                  | Recruits as their own group at the top, in the sheet's own group markup        |
| **The recruit's event flow after WhatsApp** | `W11`                  | The whole path, on one page, including the No that never asks why              |
| **Consent states, end to end**              | new                    | Five states, how each is reached, and how somebody gets out                    |

---

## Four things worth stealing outright

**1. The column model is data, not markup.** `columns.ts` drives banding,
widths, sorting, filtering, which cells edit in place and which route to the
person record. It is the same idea `src/app/operate/roster/board-columns.ts`
already ships, and it is a separate file for one reason: a recruit holds no
membership, so two of the roster's three bands describe nothing. Adding a
recruitment column should be one entry in `buildColumns()`, never a new
`<TableCell>` in four places.

**2. One event is one band over two columns.** The Events band appends one band
per recruitment event at the right end, oldest first, and each band is the
event's own name and date over an `RSVP` column and an `Attendance` column side
by side. This is the **shipped two-row banded header used exactly as it already
works** — no third header row, no new structure — and the two facts are plain
text, which is how `[membershipId]/attendance-section.tsx` already renders the
same two facts. That table is the closest shipped analogue to this problem, and
it is what boundary item 36 asked for.

The treatment it replaced is worth remembering. Two earlier ones were wrong, and
the second was wrong in a way that matters: a two-line cell stacking a presence
chip over a prefixed RSVP was **described to Brian as reuse of the shipped
attendance vocabulary, and that was overstated.** The words were shipped; the
composition was invented. He asked "Where else are we using this particular UI
element?" and the answer was nowhere. Check that question against anything you
add here.

**3. One store behind every surface.** A status changed in a cell is changed on
the record, on the event sheet, in the consent table and in the audit stream,
because all five read `store.ts`. Mark a recruit present on the attendance sheet
and watch their rung move `identified → engaged` on the board — that transition
is `W12`'s, and it is the strongest signal the platform can honestly observe.

**4. The consent gate is one surface, and the group link is its only exit.** The
sign-up form is the personal-details questionnaire _and_ the consent gate, and
ticking the box is what reveals the WhatsApp community group link on the saved
page. Submit the form four ways — QR and WhatsApp link, ticked and not — and the
link appears in exactly one of them. That is the whole model in one interaction.

---

## The consent model, and what it changed

Settled with Brian on 2026-08-31, **after** `W4` through `W10` were approved, so
it appears on no approved screen. It supersedes five workflows where they
disagree, and this mockup follows it:

- **The sign-up form is the single consent gate**, and it is the same surface as
  Questionnaire A. Every door leads to it.
- **QR points straight at it.** Walk-up and operator add send exactly one
  WhatsApp template carrying a signed, prefilled link to it.
- **No WhatsApp message ever asks permission to send WhatsApp messages.**
- Consent is **season-scoped**. Granted for a season it carries from recruit
  through onboarding to player; each new season is re-approved.
- **Ticking it and saving reveals the group link.** Never before.
- **`recruit_details_ask` is withdrawn** — the welcome carries the form and is
  itself the ask. It is drawn struck through on the event-flow surface rather
  than deleted, because a step removed by a decision is more useful on the screen
  than absent from it.

---

## What the mockup deliberately gets wrong

Do not read these as design. Each is a simplification, and each is a real
decision somebody will have to make.

**A view switch, not ten routes.** The real surfaces are real routes and
**should be** — `/operate/recruitment`, `/operate/recruitment/[prospectId]`,
`/operate/recruitment/new`, `/operate/recruitment/qr`,
`/operate/events/[id]/attendance`, `/a/[token]`, `/rsvp/[token]`, and a public
page on the club's own domain. But every surface here reads one set of rows, and
keeping that true across a navigation needs a server, which is the one thing this
route does not have. The shared state is the thing worth demonstrating.

**Nothing persists.** Reload and it is back to the fixtures. There is no
optimistic update, no failure path, no retry and no delivery state, because there
is nothing to fail.

**The audit is a dashed panel.** In the real implementation a commit writes onto
the recruit's own status history, so a change made on the board is answerable in
the same place as one made on the record. The panel exists because "every commit
writes an audit event" is otherwise an invisible claim.

**`void` is drawn as a seventh status value.** That is what the schema has, and
`W13` **recommends the opposite** — a separate marker, leaving six values that
are all about the person, so a record marked committed by mistake keeps the
status it had and un-voiding is trivial. Brian's own instinct, recorded at Stage
1, is that `void` is not a claim about the recruit. The mockup draws what exists
and says so on the dialog.

**The QR image is a drawn placeholder**, not an encoding of the URL beside it. It
does not scan. A real one is generated from the link at mint time.

**WhatsApp is drawn.** It is not ours to render. The thread on the event-flow
surface is the only invented chrome in the whole mockup, and it is dashed and
labelled.

**Every other sidebar destination is the real link.** Clicking Roster or Events
leaves the mockup for the real, authenticated application. That is honest, and it
is also the fastest way to leave by accident.

**Peregrine Oakhollow's Taster 2 attendance is empty here**, where the approved
`W1-02` frame shows `Present`. Taster 2 is `Upcoming` on the approved `W2-01`
frame, and an upcoming event cannot have observed attendance. One of the two
frames is wrong; the mockup takes the coherent reading and records the conflict
rather than reproducing it. Worth settling when the board is built.

---

## Deviations from the approved screens, and why

| Change                                                                | Reason                                                                                                                                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The sign-up form carries Questionnaire A and the consent tick**     | The consent model of 2026-08-31, which supersedes `W7`. The approved `W7-01` frame shows four fields and no tick                                                     |
| **The saved page reveals the group link only when the box is ticked** | Same. `W7-03` shows the group button unconditionally, because it predates the gate                                                                                   |
| **`recruit_details_ask` is struck**                                   | Same. It appears live in `W11`'s approved ladder table                                                                                                               |
| **A fifth pinned filter, `Attended any event`**                       | `W1`'s required action 3 asks for it in words; no approved frame shows it                                                                                            |
| **`Notes` is a board column**                                         | `W1`'s column table lists it. Brian has said notes "should be in the membership" and the placement is recorded as open — the column is drawn where the table puts it |
| **Consent is a row on the record and a value in the headline**        | New. No approved screen carries consent anywhere                                                                                                                     |
| **The opt-out is three screens**                                      | New. `W10` requires that somebody can withdraw; nobody has drawn how                                                                                                 |
| **A `Reset the data` control**                                        | Scaffolding. There is no such thing in the product                                                                                                                   |

---

## Open questions this mockup surfaces and does not answer

Each of these is Brian's, and each is marked on the screen where it bites.

1. **Is `declined` the same fact as "said no to WhatsApp"?** Today the mission
   records only the first, so a recruit who is keen but will not take WhatsApp
   messages has nowhere to be recorded, and one who declined the club is assumed
   to refuse contact too. They come apart in practice: "not this term, ask me in
   Hilary" refuses no contact at all. The banner is built to carry either cause,
   so nothing has to change if the answer is that they are separate — but
   **whether to record the second fact is unanswered.**
2. **Where do the two send buttons go?** `W2` was approved with an explicit
   reservation: Brian intends to change their placement and accepted the current
   one to stop spending time. Do not defend it.
3. **Is `void` a status or a marker?** See above.
4. **Is the Recruitment band teal?** `#00695c` is proposed, not locked. If the
   recruitment band should reuse the Season blue and the event columns take the
   new colour, that is two hex values in `columns.ts`.
5. **The events card is violet here and the board's event bands are blue.** The
   card takes the shipped `ATTENDANCE` colour; `W1`'s approved event bands are
   `#0b3d91`. Making them consistent changes approved work.
6. **Does channel presence render on a recruit's record at all?** Two sources say
   it does; `On WhatsApp` was struck from the board as not a recruit field, and
   neither approved screen carries such a row. Nothing is drawn for it here.
7. **Is `committed_on` also stamped at `committed`?** It marks reaching `joined`,
   settled. Whether it is _also_ set earlier is explicitly unsettled, so the
   mockup stamps it only at `joined`.
8. **Does `Asked` stay a board column?** The one recruitment column Brian has not
   spoken to either way.
9. **What does turning a cycle step off look like?** `W10` requires that an
   operator can decide whether a step runs at all, and the shipped `schedule-row`
   has no such control. No toggle was drawn, here or in the intake.
10. **Who mints next season's code?** "Once per season" needs something to do the
    minting. Automatically at rollover or by a button somebody presses is
    undecided, and Mission 11 owns the season boundary.
11. **When do the two questionnaires go out, and are they ever combined?**
    Explicitly Brian's — "I'm doing that." The consent model has already combined
    one of them with the sign-up form.
12. **Does a recruit who declines or joins stay on the board?** `W13` and `W14`
    both say they are off it, and the packet makes that a display rule read off
    the one status field. The approved `W1-01` and `W13-01` frames keep
    `declined` and `disengaged` rows on the board, and that is what Brian looked
    at. This mockup follows the frames and shows both readings at once — ladder
    order sinks the exits to the bottom, and the Status filter takes them off.
13. **Does the walk-up door get a duplicate check?** `W5` was approved on the
    condition that its check match the operator-add door's. It does not, because
    Brian removed that path himself. Making them the same would reverse his own
    decision. It needs his word either way.

---

## Owner action this mockup cannot remove

**Four WhatsApp templates must clear Meta before any of this can run.** Only
`event_invitation` exists there today; `recruit_welcome`,
`recruit_details_reminder`, `recruit_interest_ask` and `recruit_interest_reminder`
have not been submitted. Meta review takes days to weeks and is outside the
club's control, so this flow **can be built and cannot run** until Brian has
loaded and cleared them. It is shown on the event-flow surface, per template,
rather than only written down here.

LAN-86 and LAN-101 remain binding: no real recruit data and no real sends.

---

## What building it caught that reading the specifications did not

Recorded because it is the argument for the mockup existing, and because each was
found on the rendered page rather than in the code.

1. **`Events attended` counted people who did not attend.** The first version
   counted every attendance record, so Rosalind — whose only record is `Absent`
   at the Freshers' Fair — read as having attended one event. The approved
   `W2-01` frame shows `1` for exactly that reason. It now counts `Present` and
   `Late`; `Absent` is a record of not turning up, and `Excused` is a record of
   an agreed absence.
2. **Every commit appeared in the audit panel twice.** The audit line was written
   from inside a `setState` updater, which React invokes more than once in
   development precisely to surface an impure one. Invisible in the code, obvious
   the moment the flip was driven. The store now writes the line outside the
   updater, and `store.ts` says so where somebody would otherwise put it back.
3. **The recruit's events table and the template ladder lost columns at 375px**
   rather than scrolling — clipped by their own card, so the page-level
   sideways-scroll check stayed green and said nothing. Both now scroll inside
   their own container with a real minimum width.
4. **The board showed the pinned filters _and_ the Filters button on a phone**,
   which is five stacked selects above a button that opens five more. The shipped
   roster board shows the pinned set from `md` up and the button below it.
5. **`W1-02` and `W2-01` disagree** about Peregrine Oakhollow at Taster 2 — one
   frame records `Present`, the other calls the event `Upcoming`. See the
   deviations table.
6. **`W13`/`W14` and the approved frames disagree** about whether a recruit who
   declines or joins stays on the board. See open question 12.

## File map

| File                   | What it holds                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `fixtures.ts`          | The whole synthetic universe — six recruits, three events, the ladder, the consent states, the QR. **Start here.**                       |
| `columns.ts`           | The board's column model — bands, widths, edit kinds, and the one place a column key maps onto a recruit's fields                        |
| `store.ts`             | One store behind every surface, and the audit every mutation writes                                                                      |
| `chrome.tsx`           | The shipped chrome, borrowed: `ShellNav` imported whole, the `/operate` frame, the recruit-facing paper, the banded card, the record row |
| `recruit-board.tsx`    | `W1` · `W13` · `W14` — the board, the exits, the flip                                                                                    |
| `recruit-record.tsx`   | `W2` — six cards, the refusal, the two send dialogs                                                                                      |
| `add-recruit.tsx`      | `W6` · `W8` — the operator door and the check inside it                                                                                  |
| `attendance-sheet.tsx` | `W5` · `W12` — the shipped sheet, the capture path, recruits on top                                                                      |
| `sign-up.tsx`          | `W7` + Questionnaire A — the consent gate, both entry paths                                                                              |
| `questionnaire-b.tsx`  | `W4` — the recruit-stage field set and three link states                                                                                 |
| `qr-page.tsx`          | `W1-04` · `W10` — minting, deactivating, reminting                                                                                       |
| `event-flow.tsx`       | `W11` — the whole path after WhatsApp, on one page                                                                                       |
| `consent-states.tsx`   | The five states end to end, and the opt-out                                                                                              |
| `preview.tsx`          | The surface picker and the frame it mounts each surface in                                                                               |
| `page.tsx`             | The route, and why it is outside `/operate`                                                                                              |

`npm run typecheck`, `npm run lint` and `npm run build` are clean, and the
browser console is clean on every surface at both widths.
