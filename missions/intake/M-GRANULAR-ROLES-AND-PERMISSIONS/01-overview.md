# Overview — M-GRANULAR-ROLES-AND-PERMISSIONS

## Designed outcome

Every seat gets exactly the access its job needs, and the club changes it on the seat's page without a code
change. A Kit Manager opens a player and records kit, with the player's contact, emergency and availability
sections locked. A Social Secretary runs every social event and sees no other event. A coach, once granted,
works the football categories for the whole squad. "Set it and forget it" (Stewart, 2026-09-25).

## Why now

Only the core four (President, Vice-President, Secretary, General Manager) and the IT Officer can do anything
in the app. Every other seat, including every coach, the Social Secretary and the Kit Manager, has no powers
beyond attendance, and the interim elevation of named seats (LAN-406) is a code change standing in for a club
decision. The club needs to give each seat exactly the access its job requires, and change that itself.

## In scope

- Roster access by category: the board's ten groups (Person, Onboarding, Membership, Availability, Coaching,
  Offensive, Defensive, Special teams and Warmup assignments, Kit) plus Contact & emergency, each none / view /
  edit.
- Recruiting as its own group: Person information and Recruit details (none / view / edit), Event details
  (none / view).
- Event access by template: every event template, including any the club adds later, at none / view / manage.
- Two per-seat switches: may add to the roster; may add recruits.
- The seat page's Access section under Roles, with Copy access from another seat and Grant everything, edited
  by the President, General Manager and IT Officer (`role_management`).
- Enforcement on the roster board and record, the recruitment board and prospect record, the events list,
  calendar, event pages and actions, and the Follow-ups queue. Coaches become ordinary operators driven by
  their grants; the attendance-only view is retired.
- Editable roster group colours from an _Edit categories_ control on the roster, on a thirteen-swatch palette
  (key `blue` becomes Oxford Blue `#002147`; Lancer Gold `#C09723` added).

## Out of scope

Per-group scoping for coaches; who may pause messaging (LAN-407); erasure; the Roles page's seat-replacement
rules; the generalised messaging module; the Monday report; the attendance-sheet email; any change to the event
templates page; time-limited delegation.

## Cross-cutting invariants

- Privacy and capability boundary: a category a seat holds None on is absent from the board and collapsed and
  locked in the record; locked sections never send their data to the browser. Controls a seat may not use are
  absent, not disabled. The service layer enforces every grant; RLS remains the backstop.
- State vocabulary: roster and recruiting categories none / view / edit (Event details none / view); event
  templates none / view / manage; switches no / yes.
- Audit posture: every grant change, every Copy access and Grant everything, and every group-colour change is
  written to `audit_events` with the actor, the seat and each grant's before and after.
- Safety, consent, and recovery: seats are fixed; President, General Manager and IT Officer hold everything
  and cannot be reduced, so the club cannot lock itself out; a failed save leaves the stored grant in place.
- Rollout constraints: delivered as one release with the club's existing data and seats intact. On delivery
  the core four and the IT Officer hold everything (Vice-President and Secretary removable one grant at a
  time) and every other seat holds None on every category and template. The interim elevation (LAN-406)
  stays in place until this ships.

## Sources

- Linear [LAN-424](https://linear.app/brian-schuster/issue/LAN-424) (parent LAN-423): the definition, the
  seven decisions, the call with Stewart, the amendments and the round reviews, 2026-09-25.
- Scope and Quote v2, "Granular Roles & Permissions", 25 September 2026, revised the same day after the call
  with Stewart.
- `main` at `0d4b6ce517985ca1a04a176cce64d6335a7f435d`.

## Brian approval

- Exact words: "Other than that, I think this is approved. We can go ahead and create the packet and push it."
- Date: 2026-09-25
