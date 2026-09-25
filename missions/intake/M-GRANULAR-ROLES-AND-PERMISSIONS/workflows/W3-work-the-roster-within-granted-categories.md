# W3 — Work the roster and recruits within granted categories

**Status: specification draft (short form, round 3), pending Brian's approval.**

- Purpose/intended outcome: a seat sees and changes exactly the roster and recruiting data its job needs.
- Primary actor: any seat holding at least View on one roster or recruiting category.
- Entry point: Roster; Recruitment.
- Route/placement: `/operate/roster`, `/operate/roster/[membershipId]`, `/operate/recruitment` and its record,
  new and QR routes. No new route.
- User-visible result: the board shows only granted groups' columns; the record shows every section, with
  None sections collapsed and locked; only Edit categories are editable.

## Current `main` grounding

- Every roster and recruitment route is gated by `person_record_authority` (five seats). Coaches see the
  attendance-only shell. Evidence, each photographed both sides at 1280 and 375 and narrowed by proposal
  script from the review account (no local login exists for these seats):
  - W3-01 the board as the Kit Manager (View Person, Edit Kit);
  - W3-02 the board as a coach (example grants: View Person; Edit Availability and the five assignment groups);
  - W3-03 one player's record as the Kit Manager: Person and Kit open, every other section locked;
  - W3-04a the recruitment board with View on Recruit details only;
  - W3-04b one prospect's record as the same seat: Person information and Event details locked.

## Rules (from the locked decisions)

- Board, None: the group's columns, filters and card chips are absent.
- Record, None: the section stays in its place, collapsed, a lock in place of the chevron; it cannot be
  expanded, and its contents are never sent to the browser. The name stays at the top. Summary tiles built
  from None categories are absent.
- View: values shown as text, not links into editing; the column caption reads _view_. View on the board is
  view in the record.
- Edit: as today.
- Records open for anyone who can reach the roster or recruits; there is no records switch.
- _May add to the roster_ off: no _Add players_. _May add recruits_ off: no _Add recruit_ and no _QR code_.
- Contact & emergency becomes its own record section (Mobile phone, Personal email, Emergency contact), split
  out of Person. On the board, Contactable stays in Person and Missing stays where it is.
- Recruiting: Person information is the recruit's Person group on the board and Personal questionnaire, How to
  reach them, Who they are, Restricted, Where they stand and Their seasons on the record; Recruit details is the
  Recruitment group and section; Event details is every event group and Recruitment events.
- A seat with no roster grant does not see Roster in the sidebar; none on recruiting, no Recruitment. Coaches
  leaving the attendance-only shell when granted is this workflow's acceptance (LAN-424).

## Core decisions

| Decision                                                                         | Classification              | Governing evidence or recommended default | Status    |
| -------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------- | --------- |
| Roster: ten groups plus Contact & emergency; Recruiting: three categories        | locked                      | Round 3 brief, item 2                     | recorded  |
| Records open for anyone who reaches the roster or recruits                       | locked                      | Round 3 brief, item 5                     | recorded  |
| None sections collapsed and locked, contents never sent; name stays              | locked                      | Round 3 brief, item 5                     | recorded  |
| Board and record congruent                                                       | locked                      | Round 3 brief, item 5                     | recorded  |
| Contactable stays in Person; Missing stays where it is                           | locked                      | Round 3 brief, W3-02                      | recorded  |
| Contactable's Mobile chip dials the number under View on Person                  | proposed for owner approval | W3-02                                     | open      |
| Record Attendance section locked with the rest                                   | proposed for owner approval | W3-03                                     | open      |
| Notes, What changed and Status history read as Recruit details                   | proposed for owner approval | W3-04b                                    | open      |
| Guard derivation per column and section; server-side omission of locked contents | delegated to Mission Lead   | —                                         | delegated |

## Brian approval

- Exact words: pending
- Date: pending
