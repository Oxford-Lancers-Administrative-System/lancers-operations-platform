# The player surfaces — audit and findings, September 2026

LAN-225's addendum (Brian, 5 September 2026). The [LAN-224
audit](../design-audit-2026-09/findings.md) chose its screens before LAN-214,
LAN-215 and LAN-216 landed, so the nine routes a player actually touches were
photographed but never audited: six of its 133 findings name one of them, and
`/me/[token]/details` — the whole five-step questionnaire — is absent from its
route inventory entirely.

This page is that audit. It walks all nine at desktop (1440×900) and measured
375×812 and catalogues what it finds, in the same shape LAN-224 used: id,
route, the screenshot that shows it, one sentence saying what is wrong, the
[`standards.md`](../../standards.md) rule it breaks if any, a one-line
recommendation, a size, and a class — `visual` (theme, token or component; no
behaviour change) or `product` (changes what a screen does or says, and is
Brian's).

Three of the nine are then mocked up to the same standard as the original
eight; the other six carry findings and no built target, and the
implementation mission picks them up from here.

**Where the screenshots are.** The current side is
[`screens-current/`](screens-current/) — captured on 5 September 2026 from a
separate checkout of `main` at `73577d6`, served on its own port against the
same local Supabase slot, so that both sides of every pair are photographs of a
running application and the proposed side's palette never leaks into the
current one. Where LAN-224 already photographed a state, this page cites its
capture in [`../design-audit-2026-09/screens/`](../design-audit-2026-09/screens/)
rather than taking a second one.

**How the token routes were reached at all.** The seed mints no player tokens:
`person_access_tokens` and `rsvp_access_tokens` are both empty after
`db:reset` + `db:seed`, so every token-scoped route 404s until something issues
one. [`capture-current.mjs`](capture-current.mjs) issues the three it needs in
process, following the services' own rules, and records none of them — not in
its manifest, not in a file, not on stdout. `recruitment_signup_codes` is the
one exception the seed does fill, and its `code` column is plaintext.

**The subject.** Alaric Brindlewood — the active player with the most
invitations still needing an answer, which is the same rule
`src/app/design-preview/picks.ts` uses to choose the proposal's subject, so
both sides of every pair are the same person and the same events. His name is
on both captures; that is what makes the pairing checkable by eye.

## Route inventory

| Route                 | Page file                     | What it is                            | Audited by LAN-224 | Mocked up here |
| --------------------- | ----------------------------- | ------------------------------------- | ------------------ | -------------- |
| `/me/[token]`         | `me/[token]/page.tsx`         | Player home — invitations and answers | captured only      | **S9**         |
| `/me/[token]/details` | `me/[token]/details/page.tsx` | The five-step questionnaire (LAN-216) | **not at all**     | **S10, S10b**  |
| `/rsvp/[token]`       | `rsvp/[token]/page.tsx`       | The event invitation                  | not-found only     | S5 (existing)  |
| `/a/[token]`          | `a/[token]/page.tsx`          | One-tap yes/no answer                 | captured only      | **S11**        |
| `/join/[code]`        | `join/[code]/page.tsx`        | Arrival door — join by code           | captured only      | findings only  |
| `/me/join/[token]`    | `me/join/[token]/page.tsx`    | Arrival door — invited link           | captured only      | findings only  |
| `/me`                 | `me/page.tsx`                 | Arrival door — bare, session-gated    | captured only      | findings only  |
| `/me/stop/[token]`    | `me/stop/[token]/page.tsx`    | Unsubscribe                           | captured only      | findings only  |
| `/e/[token]`          | `e/[token]/page.tsx`          | The club participation link           | captured only      | findings only  |

Two corrections to the addendum's own notes, established while capturing:

- **`/a/[token]` does take a token this evidence can mint**, once the shape is
  right. It is not a bare secret: the string is `<y|n>.<invitationId>.<nonce>`
  and the row is a `single_use` `person_access_tokens` entry whose hash covers
  the whole string. The first pass 404'd because it was handed an RSVP token.
- **`/rsvp/[token]`'s live state is capturable after all.** LAN-224 recorded it
  as unreachable because the link travels by email and the local scheduler does
  not run future jobs; minting the token directly reaches it, which closes the
  gap S5's current side had to paper over by borrowing `/a/[token]`'s chrome.

And one the addendum got right and this page keeps: **`/me` is not a player
route.** It resolves an operator session and redirects to `/login` signed out,
so it belongs with the operator surfaces. Its findings are below because the
addendum asked for all nine, not because it is a player's page.

## A · Chrome and brand

| Id  | Route(s)                                                                          | Screenshot(s)                                                                                              | What is wrong                                                                                                                                                                                                                                                                                                                                              | Rule | Recommendation                                                                               | Size | Class  |
| --- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------- | ---- | ------ |
| P1  | all nine                                                                          | `screens-current/C9-player-home--desktop.png`, `join-code--valid--phone.png`, `me--signed-in--desktop.png` | Nine routes carry five different chromes and no crest anywhere: a 12px letter-spaced `LANCERS OPERATIONS` line on the four token routes, `OXFORD LANCERS` on `/join/[code]`, the **person's own name** in blue capitals and no club mark at all on `/me/join/[token]`, nothing on `/me/stop/[token]` and `/e/[token]`, and no chrome of any kind on `/me`. | 7    | `PublicShell` — one Oxford Blue masthead with the crest, one `<main>`, on every one of them. | M    | visual |
| P2  | `/me`                                                                             | `me--signed-in--desktop.png`                                                                               | A session-gated route drawn as a bare `Container` floating in white: no operator shell, no masthead, an `h5` heading, and one uppercase button. It is the only signed-in page in the application with no shell at all.                                                                                                                                     | 7    | The operator shell, and the page's own `PageHeader` inside it.                               | S    | visual |
| P3  | the four token routes plus `/join/[code]`, `/me/join/[token]`, `/me/stop/[token]` | `screens-current/C10-details--desktop.png`                                                                 | The page ground is `bgcolor: "grey.100"` — MUI's neutral grey, not the club's warm off-white. Every one of these pages sets it by hand.                                                                                                                                                                                                                    | 7    | `background.default` from the theme; no page names its own ground.                           | S    | visual |

## B · Type and hierarchy

| Id  | Route(s)                                           | Screenshot(s)                                 | What is wrong                                                                                                                                                                                                                                                                   | Rule | Recommendation                                                                                  | Size | Class  |
| --- | -------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- | ---- | ------ |
| P4  | `/me/[token]`, `/me/[token]/details`, `/a/[token]` | `screens-current/C9-player-home--desktop.png` | Every heading and every line of body copy picks its own pixel size in `sx`: `/me/[token]` alone uses 28, 24, 20, 18, 16, 15, 14, 13, 12.5 and 12, and none of them is a `Typography` variant. The page title is a `Typography` with `component="h1"` and a hand-written weight. | 7    | The `§2` scale: `h1` for the title, `h2` for a record name, `body1`/`body2`/`caption` below it. | M    | visual |
| P5  | `/me/stop/[token]`, `/join/[code]`                 | `me-stop-token--pristine--phone.png`          | Where a size is not hand-written it is MUI's default `h5`/`h6`, which is a fourth scale again — the same heading reads at three sizes across three player pages.                                                                                                                | 7    | As P4.                                                                                          | S    | visual |
| P6  | `/me/[token]/details`                              | `screens-current/C10b-agreement--desktop.png` | The strongest disclaimer on the surface — `PLACEHOLDER WORDING — the real text is owed under LAN-213` — is set as 12px `warning.main` text, which makes it the smallest thing on the page.                                                                                      | —    | A `Notice`. A warning is a notice or it is not a warning.                                       | S    | visual |

## C · Controls

| Id  | Route(s)                                            | Screenshot(s)                                                                                  | What is wrong                                                                                                                                                                                                         | Rule | Recommendation                                                                          | Size | Class  |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------- | ---- | ------ |
| P7  | all nine                                            | `me--signed-in--desktop.png`, `join-code--valid--phone.png`, `a-token--confirm-yes--phone.png` | Every button is MUI's default capitals: `OPEN YOUR PAGE`, `STOP MESSAGING ME`, `SIGN ME UP`, `SAVE MY DETAILS`, `SAVE OPTIONS`, `CLOSE`. The audit's E1 named this for the operator surfaces; it holds here too.      | 7    | Sentence case, from the theme's `MuiButton` default.                                    | S    | visual |
| P8  | `/me/[token]`, `/a/[token]`                         | `a-token--confirm-yes--phone.png`                                                              | The affirmative control is filled MUI green (`color="success"`) — a colour the club palette does not contain, repeated down fourteen rows on the player's home.                                                       | —    | `contained` primary. Emphasis still points at Yes; it points in Oxford Blue.            | S    | visual |
| P9  | `/me/[token]/details`, `/a/[token]`, `/join/[code]` | `join-code--valid--phone.png`                                                                  | Three surfaces carry three private checkbox modules (`details/checkbox-field.tsx`, `a/[token]/multi-select-checkboxes.tsx`, `join/[code]`'s inline pair) because the kit named every form control except a tick box.  | 7    | `CheckField` in `src/components/field.tsx`, once.                                       | S    | visual |
| P10 | `/join/[code]`, `/me/join/[token]`                  | `join-code--valid--phone.png`, `me-join-token--prefilled--phone.png`                           | The consent tick box sits beside a six-line label inside its own bordered box, vertically centred against none of it, and the sentence that would enable the disabled button is below the button rather than at it.   | 4    | `CheckField` with the label as its own block; the enabling sentence on the `ActionBar`. | S    | visual |
| P11 | `/me/[token]`                                       | `screens-current/C9-player-home--desktop.png`                                                  | Four chips are built by hand at the call site — `color="primary"` for the event type, `success`/`error` for the answer, outlined `primary` for `Next`/`Awaiting answer` — so the colour is chosen per page, not read. | 7    | `StatusChip` on the one vocabulary. The event **type** is not a status and stays words. | M    | visual |
| P12 | `/e/[token]`                                        | `e-token--cancelled--desktop.png`                                                              | A cancelled event's chip is `color="warning"` — the same amber the delivery states use for "needs attention, not failed". A cancelled session is not a thing to attend to; it is a thing not to turn up to.           | 7    | `StatusChip domain="event"`.                                                            | S    | visual |
| P13 | `/me/[token]`                                       | `screens-current/C9-player-home--desktop.png`                                                  | The long tail is a hand-rolled `<details>` with `listStyle: none` and a `::-webkit-details-marker` reset, inside a `Paper` that is not the page's `Section`.                                                          | 7    | `Section` with `collapsible` — a section that hides its body is still a section.        | S    | visual |

## D · Dates and raw values

| Id  | Route(s)                                     | Screenshot(s)                                 | What is wrong                                                                                                                                                                                             | Rule  | Recommendation                                                                    | Size | Class       |
| --- | -------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------- | ---- | ----------- |
| P14 | `/me/[token]/details`                        | `screens-current/C10b-agreement--desktop.png` | The already-agreed line prints `agreedAt.toISOString().slice(0, 10)` — a raw ISO date, to a player, on the one screen whose whole purpose is a record they may later need to rely on.                     | **3** | The shared formatter: `27 Aug 2026`.                                              | S    | visual      |
| P15 | `/me/[token]/details`                        | `screens-current/C10b-agreement--desktop.png` | The same line prints the first eight characters of the agreement version's UUID as the version the player agreed to.                                                                                      | —     | A version a player can read, or no version. Brian's: it is what the record says.  | S    | **product** |
| P16 | `/me/[token]`, `/a/[token]`, `/rsvp/[token]` | `screens-current/C9-player-home--desktop.png` | Dates read `Sunday, 6 September 2026 · 14:00–16:30` — correct, parsed, and a fourth date form: the design system's is `6 Sep 2026`. The weekday is genuinely useful to a player deciding about a session. | —     | Brian's. Keep the weekday on player surfaces, or drop it for one form everywhere. | S    | **product** |
| P17 | `/me/[token]/details`                        | `screens-current/C10-details--desktop.png`    | The finishing page links each outstanding item with a bare `<a style={{ color: "#1565c0", textDecoration: "underline" }}>` — the only hard-coded link colour left in the application.                     | 7     | The theme's link colour, Royal Blue.                                              | S    | visual      |

## E · Sequence and 375px

| Id  | Route(s)                    | Screenshot(s)                                 | What is wrong                                                                                                                                                                                                                                                    | Rule | Recommendation                                                                     | Size | Class       |
| --- | --------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------- | ---- | ----------- |
| P18 | `/me/[token]/details`       | `screens-current/C10-details--phone.png`      | The five-step map is a `<dl>` grid of 11px labels over 13px values, five columns at `sm` and two at `xs`, so on a phone the sequence reads as a three-row table of facts rather than as a path with a place in it.                                               | —    | `StepTrail` — numbered, one chip per step, the current one on the Sky Blue ground. | S    | visual      |
| P19 | `/me/join/[token]`          | `me-join-token--prefilled--phone.png`         | A long personal email is clipped inside its own field at 375px: `caspian.hallowfield@bramshott.ox.ac.` is what the player sees of a value they are being asked to check.                                                                                         | —    | The field's own value wraps or scrolls; a checked value is never truncated.        | S    | visual      |
| P20 | `/e/[token]`                | `e-token--active--phone.png`                  | The whole participation list renders at 375px as the desktop table: 7,965px of it, fifty-odd rows, each one a name, a capacity, an answer and an attendance crammed into 343px. It is the audit's A4 and F2 on the one surface whose reader has no other way in. | —    | `RowCard`s below `md`, and a bound (P21).                                          | M    | visual      |
| P21 | `/me/[token]`, `/e/[token]` | `screens-current/C9-player-home--desktop.png` | Both lists are unbounded. The player's home ran to 3,269px at desktop and 4,106px at 375px for a seeded player with fourteen outstanding invitations, and grows with the season's event count; the club link grows with the squad.                               | —    | The audit's F2. Paging, a cap with a "show the rest", or a deliberate no.          | M    | **product** |

## `product` register

Three findings change what a screen says or does. Each is Brian's, and none is
taken in the mockup.

| Id  | Decision                                                                                                           | Cost of not deciding                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| P15 | Does the player see the agreement's version id, and in what form?                                                  | The record shows a UUID prefix to somebody who cannot use it, on the club's own consent evidence. |
| P16 | Do player-facing dates keep the weekday (`Sunday, 6 September 2026`) or take the system's one form (`6 Sep 2026`)? | Four date forms across the application; the player's is the odd one and also arguably the best.   |
| P21 | Is a player's own list of invitations bounded, and how?                                                            | The audit's F2, at its worst instance. A four-thousand-pixel phone page today, longer each week.  |

## What the mockup answers

S9, S10, S10b and S11 on [`/design-preview`](../../../../src/app/design-preview/README.md)
answer P1, P3, P4, P6, P7, P8, P9, P11, P13, P14, P17 and P18 by construction —
they are built from the theme and the kit and cannot express those findings.
P2, P5, P10, P12, P19 and P20 belong to the six routes that were not mocked up
and stay findings. P15, P16 and P21 stay Brian's.

Two kit members and two kit changes came out of this audit and are now in
`src/components/`: `StepTrail` (P18), `CheckField` (P9), `Section`'s
`collapsible` (P13), and `RowCard`'s own `actions` — a list whose rows are
answered in place rather than opened, which is what a player's invitations are.
