# Coverage sweep — every surface and action in the brief, against the frozen inventory

Purpose: prove that the eight frozen workflows cover the mission, or name exactly
what they do not. The intake agent owns this matrix; Brian should be reviewing
decisions, not auditing whether the agent remembered the mission.

Swept 2026-08-20 against the
[Events & Calendar brief](https://app.notion.com/p/3bc488886d5781138de8c03209ed6bcf)
§4.1 (screens and routes) and §4.7 (actions), and the frozen inventory in
`02-workflows.md`.

## §4.1 — the thirteen surfaces

| #   | Surface                   | Tier                 | Covered by                        | Note                                                                                                                                   |
| --- | ------------------------- | -------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Calendar View (Gregorian) | Public               | `W1`                              | Specified                                                                                                                              |
| 2   | Oxford View (term card)   | Public               | `W1`                              | Specified                                                                                                                              |
| 3   | **Event list**            | Operator             | **GAP**                           | Sortable, filterable working list. Its columns (§4.3), filters (§4.4), sorting (§4.5) and D84's grouped projections are in no workflow |
| 4   | Event detail — public     | Public               | `W1`                              | Content settled by Brian 2026-08-20; the surface itself is thinly specified                                                            |
| 5   | Event detail — club link  | Club link            | `W7`                              | Adds headline numbers, audience list, RSVP and attendance                                                                              |
| 6   | Event detail — operator   | Operator             | `W7`, with actions from `W4`–`W6` | Adds delivery flag and every action                                                                                                    |
| 7   | Participation view        | Club link + operator | `W7`                              | One row per person, one column per question                                                                                            |
| 8   | Create / edit event       | Operator             | `W4`                              |                                                                                                                                        |
| 9   | Audience builder          | Operator             | `W4`                              |                                                                                                                                        |
| 10  | Approval                  | Operator             | `W4`                              |                                                                                                                                        |
| 11  | Import                    | Operator             | `W3`                              |                                                                                                                                        |
| 12  | Templates admin           | Operator             | `W8`                              |                                                                                                                                        |
| 13  | Delivery                  | Operator             | **Mission 4**                     | Out of scope by the approved seam; `W7` links to it                                                                                    |

## §4.7 — the sixteen actions

| Action                             | Covered by       | Note                                                                                                                    |
| ---------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Create                             | `W4`             |                                                                                                                         |
| Edit                               | `W4`             |                                                                                                                         |
| **Delete a draft**                 | **GAP**          | D29 — an abandoned draft is deleted, not withdrawn. No workflow says who does it or from where                          |
| Import                             | `W3`             |                                                                                                                         |
| Re-import with change confirmation | `W3`             |                                                                                                                         |
| Mass delete                        | `W3`             |                                                                                                                         |
| Duplicate                          | `W4`             | D39, as an entry path into drafting                                                                                     |
| Choose audience                    | `W4`             |                                                                                                                         |
| Approve                            | `W4`             |                                                                                                                         |
| Return to draft                    | `W5`             | The amendment path's first move                                                                                         |
| Re-notify                          | `W5`             |                                                                                                                         |
| Cancel                             | `W6`             |                                                                                                                         |
| **Issue or share the club link**   | **GAP**          | §4.15 makes it an operator-only action. No workflow owns issuing, sharing, or Q2's expiry/rotation/revocation mechanism |
| View participation                 | `W7`             |                                                                                                                         |
| View delivery                      | `W7` → Mission 4 | Handoff only                                                                                                            |
| Administer templates               | `W8`             |                                                                                                                         |

## Gaps found

1. **The event list as a reading surface.** The largest of the three. In the
   implementation on `main`, `/operate/events` and `/operate/events/calendar`
   are one query in three arrangements behind a `ViewSwitch`; `W1` specified
   two of the three. Missing with it: search by name or venue; status and type
   filters applied immediately with no Apply button (§4.4); sorting on Name,
   Type, Date, Term + Week, Venue, Status and the count columns, with Term +
   Week sorting identically to Date (§4.5); the `Said Yes / Invited` and
   `Showed / Invited` count columns and the "—" rule (§4.3, D74); and D84's
   flat / by-week / by-month / by-term grouped projections rendering as
   discrete tables.
2. **Delete a draft** (D29).
3. **Issue or share the club link** (§4.7, §4.15, Q2).

## Consequence worth naming

The list's count columns are participation data — `Said Yes / Invited` and
`Showed / Invited`. Whichever workflow owns the list therefore inherits the
tier question deferred to `W7`: a public list cannot carry those columns, so
either the list is not a public surface at all, or it renders without its two
most operationally useful columns for anonymous readers. This is the same
decision, arriving from a second direction.

## Status

Reported to Brian 2026-08-20. Closing gaps 1–3 requires an inventory amendment,
because the inventory is frozen and no agent may add, rename or re-scope a
workflow on its own.
