# Boundary — M-GRANULAR-ROLES-AND-PERMISSIONS

- Portfolio mission number: none. Post-delivery additional work, commissioned as LAN-424 (parent LAN-423,
  project "Post-Delivery — Additional Work") against the Scope and Quote v2 of 2026-09-25.
- Commissioned outcome and subject: every seat gets exactly the access its job needs, and the club changes it
  on the seat's page without a code change. The subject is per-seat access to the roster, recruiting and
  events, administered by the club, plus editable roster group colours.
- Portfolio row URL and observed version: none (not a portfolio mission). Controlling records: Linear
  [LAN-424](https://linear.app/brian-schuster/issue/LAN-424) as of 2026-09-25, and the Scope and Quote v2 of
  2026-09-25, revised the same day after the call with Stewart.
- Observed `main` SHA: `0d4b6ce517985ca1a04a176cce64d6335a7f435d` (LAN-425, #208). The sprint's photographs
  were taken at `726c9346` and `57480009`, which add only this ledger to that `main`.
- Existing application baseline and locally rendered routes: `/operate/admin/roles` and
  `/operate/admin/roles/[roleId]` (Roles index; seat page with a read-only Permissions list),
  `/operate/roster` and `/operate/roster/[membershipId]`, `/operate/recruitment` and its prospect record,
  `/operate/events`, `/operate/events/calendar`, `/operate/events/[id]`, `/operate/admin/follow-ups`. Access
  on `main` is the capability map in `src/lib/auth/capabilities.ts`: only the core four (President,
  Vice-President, Secretary, General Manager) and the IT Officer can do anything beyond attendance; coaches see
  the attendance-only shell.
- Owned end-to-end:
  - the seat page's Access section, which replaces its Permissions list, and every grant it edits (W1);
  - roster group colours and the shared palette's change (W2);
  - enforcement of roster and recruiting grants on the board and the record, including locked sections whose
    contents never leave the server, and coaches leaving the attendance-only shell (W3);
  - enforcement of per-template event grants on the events list, calendar, event pages, Follow-ups and the
    event actions (W4);
  - the grant floor and seed, and the audit of every grant and colour change.
- Shared coverage and adjacent-mission seams: none. LAN-406 (the interim elevation of named seats) stays in
  place until this ships and is reverted by it; LAN-407 (who may pause messaging) stays in code.
- Administration/configuration owned here: grants per seat (roster categories, recruiting categories, event
  templates, two add switches), Copy access from another seat, Grant everything, roster group colours.
- External tools and this mission's interaction with them: none. Nothing is sent, and no provider, credential
  or third-party account is involved.
- Grounded additions and gaps resolved here: Contact & emergency split out of Person as its own category and
  record section (privacy); Recruiting as its own group; roster group colours made editable; record header
  status rendered as text; with None on Person a roster row shows the name only.
- Out of scope: per-group scoping for coaches (a coach with edit on a category edits it for the whole squad);
  who may pause messaging (LAN-407); erasure; the Roles page's seat-replacement rules; the generalised
  messaging module; the Monday report (its scoping to granted templates and who may open it); the
  attendance-sheet email; any change to the event templates page; time-limited delegation.
- Split decision: no split.
- Boundary approval covers: the complete proposed boundary above as one decision, together with the overview
  and the four-workflow inventory.
- Brian approval words: "Other than that, I think this is approved. We can go ahead and create the packet and
  push it."
- Approval date: 2026-09-25
