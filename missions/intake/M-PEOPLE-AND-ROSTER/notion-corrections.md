# Notion corrections

Applied 2026-08-26 on Brian's instruction — he reviewed the proposed set of
eleven changes across eight records and answered **"Go do it."**

Every edit is an **appended dated amendment callout**, matching the pattern the
corpus already uses ("these notes govern where they differ from the text
above"). No approved prose was rewritten, with one exception noted below, so the
original decisions stay readable alongside what superseded them.

| Page                                                                                        | Old text                                                                                                                                                                                          | Proposed new text                                                                                                                                                                                                                                                                        | Exact approval | Applied and verified at                                                             |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| [Task 08 brief](https://app.notion.com/p/3bd488886d57812e9534cb00102abef8)                  | §4 rows 3–4 (known-as and aliases), 8 (channel presence, durable), 14 (emergency contact: name, phone, relationship), 15 (kit ownership, durable), 16 (Blues, durable count); row 17 as one field | Appended amendment: rows 3–4 collapse to alias; row 8 is seasonal, named **On WhatsApp**, built in Mission 6; row 14 holds five fields; row 15 is seasonal; row 16 is seasonal awards with a derived total; row 17 is four separate things. Plus the First name / Last name naming rule. | "Go do it."    | **Verified by refetch 2026-08-26T18:28Z.**                                          |
| [Task 10 brief](https://app.notion.com/p/3bd488886d5781078f48f13a47c529c6)                  | Item 3 "returning **not applicable** if kit ownership already recorded"; item 8 presence records; item 9 rollup with no named required set; §9 gate "what BPS stands for"                         | Appended amendment: the item-3 carve-out is removed because formalwear is reasked each season; item 8's presence records move to Mission 6; item 9 gains the named required set; §9's BPS gate is answerable — **Blues Performance Scheme**, from the 7/30 workshop.                     | "Go do it."    | **Verified by refetch 2026-08-26T18:28Z.**                                          |
| [Task 14 brief](https://app.notion.com/p/3bf488886d5781cc8505efc85d3a416f)                  | OD-3 single-inactive callout; §4 withdrawn/departed rows; §6 committee-year timing                                                                                                                | Appended amendment: OD-3 superseded with the six-value ladder and the three struck enum values; committee year pairs to the season by label with date overlap rejected; no season picker anywhere.                                                                                       | "Go do it."    | **Verified by refetch 2026-08-26T18:28Z** — callout and its table render correctly. |
| [Task 08 brief](https://app.notion.com/p/3bd488886d57812e9534cb00102abef8) (second edit)    | "Mission 5 also delivers a minimal season row so the roster has a scope" in the 2026-08-26 Portfolio v2 note                                                                                      | Struck through and corrected in place: the bootstrap moved to Mission 7 later the same day. **Found by refetch.**                                                                                                                                                                        | "Go do it."    | **Verified by refetch 2026-08-26T18:28Z.**                                          |
| [Task 14 brief](https://app.notion.com/p/3bf488886d5781cc8505efc85d3a416f) (second edit)    | "**Minimal season bootstrap.** Mission 5 · People & Roster delivers a minimal season row so the roster has a scope…"                                                                              | Struck through and corrected in place: the bootstrap moved to Mission 7 later the same day; the principle stands but Mission 5 creates no season. **The only in-place edit; made because the refetch showed it contradicting the new amendment.**                                        | "Go do it."    | **Verified by refetch 2026-08-26T18:28Z.**                                          |
| [Task 05 brief](https://app.notion.com/p/3bc488886d5781f59921def11d74e503)                  | OD-2: the Monday review lists offboarding items "when a member goes inactive"                                                                                                                     | Appended amendment: D-9 and the no-action-engine ruling stand; the **trigger** moves to `departed`, because inactive now means still on the team and possibly returning.                                                                                                                 | "Go do it."    | **Verified by refetch 2026-08-26T18:29Z** — renders correctly.                      |
| [Release 1 Authority Manifest](https://app.notion.com/p/3bf488886d57818aa53ec09f4fc5f757)   | §5 OD-3 recorded as CLOSED (single-inactive); §6 committee-year boundary gate                                                                                                                     | Appended amendment: OD-3 superseded, pointing at Task 14 and Task 05 for the full record; the §6 gate does not govern the People-surface pairing; Scope 4's split moved further during this intake.                                                                                      | "Go do it."    | **Verified by refetch 2026-08-26T18:29Z.**                                          |
| [Task 16 brief](https://app.notion.com/p/3c0488886d5781f9bb86d38b79d57dac)                  | §3 row 2 (settings shows email and roles, display-name changes only); §6 parked change-email                                                                                                      | Appended amendment: a person editing their own record is **not** this mission's and no settings surface is built for it — they use the signed link, per Task 11 §2.1 and §7. Parked rows untouched.                                                                                      | "Go do it."    | **Verified by refetch 2026-08-26T18:29Z.**                                          |
| [Lancers Current Project Status](https://app.notion.com/p/3bb488886d578126a88cdd747f590a01) | Portfolio v2 rows 5, 6, 7, 8, 10 and 11 as approved 2026-08-26                                                                                                                                    | Appended amendment covering all six rows: row 5 loses the season bootstrap, channel presence, formalwear and Blues, and gains the mission id and the status rebuild; row 6 gains channel presence; row 7 gains the bootstrap; rows 8, 10 and 11 gain what they inherit.                  | "Go do it."    | **Verified by refetch 2026-08-26T18:30Z.**                                          |

## Verification

**All seven pages were refetched and read back on 2026-08-26**, after Brian said
to check rather than trust the API acknowledgements. Every amendment landed at
the end of its page and renders correctly, including the status table inside the
Task 14 note.

The refetch was worth doing: it caught **two stale sentences**, not one. Both
Task 14 and Task 08 carried an earlier 2026-08-26 note — written hours before,
with the Portfolio v2 restructure — still saying _"Mission 5 also delivers a
minimal season row so the roster has a scope."_ The season bootstrap moved to
Mission 7 later the same day, so both pages contradicted their own new
amendment. Each was struck through and corrected in place.

Those two are the only in-place edits made to approved prose. Everything else is
an appended dated callout.

## Not applied

The Mission 1 finding — that a club role cannot be recorded without granting a
login, because `event-audience.ts:200` resolves coaches only through
`role_assignments` and `operator-invitations.ts:1571` is its sole writer — was
recorded in the portfolio amendment under row 5 rather than edited into the Task
06 brief. Mission 1 is delivered and its brief describes what was built; the
finding belongs where the next mission will read it, and Mission 9's coach
registry is flagged as the one that meets it.
