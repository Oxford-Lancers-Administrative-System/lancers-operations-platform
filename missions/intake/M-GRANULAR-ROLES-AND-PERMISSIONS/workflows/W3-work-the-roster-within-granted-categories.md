# W3 — Work the roster within granted categories

**Status: specification draft (short form, round 2), pending Brian's approval.**

- Purpose/intended outcome: a seat sees and changes exactly the roster data its job needs.
- Primary actor: any seat holding at least View on one roster category.
- Entry point: Roster (and Recruitment for the Recruits category).
- Route/placement: `/operate/roster`, `/operate/roster/[membershipId]`, `/operate/recruitment` and its record,
  new and QR routes. No new route.
- User-visible result: only granted groups' columns and record sections exist; only Edit ones are editable.

## Current `main` grounding

- Every roster and recruitment route is gated by `person_record_authority` (five seats). Coaches see the
  attendance-only shell. Evidence, each photographed both sides at 1280 and 375 and narrowed by proposal
  script from the review account (no local login exists for these seats):
  - W3-01 the board as the Kit Manager (unchanged this round);
  - W3-02 the board as a coach: View Person; Edit Availability and the five assignment groups; no record opening;
  - W3-03 one player's record as the Kit Manager: only Person and Kit exist;
  - W3-04 the recruitment board with View on Recruits only and no record switch.

## Rules (from the locked decisions)

- None: the group's columns, filters, card chips, summary tiles and record section are absent, not hidden.
- View: values shown, not editable; values are text, not links into editing; the column caption reads _view_.
- Edit: as today.
- _May open individual records (roster)_ off: the name is plain text and the card opens nothing.
- _May open individual records (recruits)_ off: the same on the recruitment board.
- _May add people to the roster_ off: no _Add players_.
- _May add recruits_ off: no _Add recruit_ and no _QR code_.
- Contact rows on the record (mobile, personal email, emergency contact) belong to Contact & emergency.
- A seat with no roster grant does not see Roster in the sidebar. Coaches leaving the attendance-only shell
  when granted is this workflow's acceptance (LAN-424).

## Core decisions

| Decision                                                                | Classification              | Governing evidence or recommended default | Status    |
| ----------------------------------------------------------------------- | --------------------------- | ----------------------------------------- | --------- |
| Twelve categories incl. Contact & emergency (record-only) and Recruits  | locked                      | LAN-424 decision 2                        | recorded  |
| Four independent switches per seat                                      | locked                      | Brian, round-1 feedback on W1-03          | recorded  |
| Ungranted groups, sections and tiles absent, not hidden                 | locked                      | Brian, round 2 (W3-03 wording)            | recorded  |
| Contactable → Contact & emergency; Missing → Onboarding (board columns) | proposed for owner approval | W3-02 drawn this way                      | open      |
| Record subtitle drops entry route and status without Membership         | proposed for owner approval | W3-03                                     | open      |
| Edit on Recruits no longer includes adding (now _May add recruits_)     | proposed for owner approval | W3-04                                     | open      |
| Guard derivation per column and record section                          | delegated to Mission Lead   | —                                         | delegated |

## Brian approval

- Exact words: pending
- Date: pending
