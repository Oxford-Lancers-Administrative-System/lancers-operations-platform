# M-GRANULAR-ROLES-AND-PERMISSIONS v1

**Status:** `approved` — the boundary, overview, four-workflow inventory and every workflow's specification,
mockups and acceptance carry Brian's words of 2026-09-25. Awaiting Brian's merge; no execution is authorized
before it.

LAN-424 (parent LAN-423), post-delivery additional work, against the Scope and Quote v2 of 25 September 2026.
Baseline `main` @ `0d4b6ce5`.

## Outcome

Every seat gets exactly the access its job needs, and the club changes it on the seat's page without a code
change.

## Four workflows

| ID   | Workflow                                               | Surfaces                                                                                     |
| ---- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `W1` | Administer a seat's grants on the seat page            | `/operate/admin/roles/[roleId]` — **exists, Access replaces Permissions**; Roles index as is |
| `W2` | Edit roster group colours                              | `/operate/roster` — Edit categories and the Roster categories dialog                         |
| `W3` | Work the roster and recruits within granted categories | `/operate/roster`, the player record, `/operate/recruitment`, the prospect record            |
| `W4` | Work events of a granted template, view or manage      | `/operate/events`, the calendar, event pages, `/operate/admin/follow-ups`                    |

## The locked model

- **Access is edited on the seat page and nowhere else.** Holders of `role_management` (President, General
  Manager, IT Officer) edit it; the Roles index is unchanged.
- **Roster**: the board's ten groups plus Contact & emergency, None / View / Edit. **Recruiting**: Person
  information, Recruit details (None / View / Edit), Event details (None / View).
- **Events per template**, None / View / Manage, for every template including those added later. No types, no
  categories; templates keep their colours; the event templates page is unchanged.
- **Two switches**: may add to the roster; may add recruits. No records switch.
- **Records open** for anyone who can reach the roster or recruits. A None section is collapsed and locked and
  its contents never leave the server; the name stays. With None on Person a roster row shows the name only.
- **Floor**: President, General Manager, IT Officer full and fixed; Vice-President and Secretary start full and
  are removable; every other seat starts with None.
- **Copy access from another seat** and **Grant everything** on the seat page, each one audited action. No
  time-limited delegation.
- **Audit**: every grant and colour change in `audit_events`.
- **Roster group colours** editable from _Edit categories_ (the same Button as _Add players_) on thirteen
  swatches: key `blue` becomes Oxford Blue `#002147`, Lancer Gold `#C09723` added, no Lancer Blue.
- **Attendance** is outside the access list; recording is unchanged for every seat.

## Out of scope

Per-group scoping for coaches; who may pause messaging (LAN-407); erasure; the Roles page's seat-replacement
rules; the generalised messaging module; the Monday report; the attendance-sheet email.

## Reading the mockups

`mockups/index.html` is the generated hub; `REVIEW.html` is the index Brian reviewed from. Every screen is
**photographed on both sides** at a browser-measured 1280 and 375 — the running page on `main` and the same
page changed only by the proposal in `mockups/proposals/`. Nothing is drawn. The specifications and the
coverage maps live in the ledger, `missions/intake/M-GRANULAR-ROLES-AND-PERMISSIONS/`.

Known limitations of the evidence: W1 and W4 screens show today's template colours (key `blue` becomes Oxford
Blue under W2); W3-02 predates the name-only rule under None on Person. The build follows the rules.

## Files

- `packet.json` — the validated contract
- `sources.md` — sources and provenance
- `acceptance/W1.md` … `acceptance/W4.md` — Brian's words per workflow
- `mockups/` — the four pages, `shots/`, `proposals/`, the hub
- `REVIEW.html` — the sprint's review index
