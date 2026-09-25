# W3 — Work the roster within granted categories

**Status: specification draft (short form), pending Brian's approval.**

- Purpose/intended outcome: a seat sees and changes exactly the roster data its job needs.
- Primary actor: any seat holding at least View on one roster category.
- Entry point: Roster (and Recruitment for the Recruits category).
- Route/placement: `/operate/roster`, `/operate/roster/[membershipId]`, `/operate/recruitment` and its record,
  new and QR routes. No new route.
- User-visible result: only granted groups' columns and record sections are drawn; only Edit ones are editable.

## Current `main` grounding

- Every roster and recruitment route is gated by `person_record_authority` (five seats). Coaches see the
  attendance-only shell. Evidence: W3-01, photographed both sides at 1280 and 375, narrowed by proposal.

## Rules (from the locked decisions)

- None: the group's columns, filters, card chips and record section are absent.
- View: values shown, not editable; person values are text, not links into editing.
- Edit: as today.
- Open roster records off: the name is not a link and the card does not open.
- Add to the roster off: no _Add players_. Edit on Recruits includes adding a prospect and the QR sign-up.
- A seat with no roster grant does not see Roster in the sidebar. Coaches leaving the attendance-only shell
  when granted is this workflow's acceptance (LAN-424).

## Core decisions

| Decision                                                               | Classification              | Governing evidence or recommended default | Status    |
| ---------------------------------------------------------------------- | --------------------------- | ----------------------------------------- | --------- |
| Twelve categories incl. Contact & emergency (record-only) and Recruits | locked                      | LAN-424 decision 2                        | recorded  |
| Switches are independent per seat                                      | locked                      | LAN-424 decision 3                        | recorded  |
| Only granted groups' columns are drawn                                 | proposed for owner approval | W3-01                                     | open      |
| Contactable → Contact & emergency; Missing → Onboarding                | proposed for owner approval | W3-01 open question                       | open      |
| Guard derivation per column and record section                         | delegated to Mission Lead   | —                                         | delegated |

## Brian approval

- Exact words: pending
- Date: pending
