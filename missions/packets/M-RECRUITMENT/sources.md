# Sources — M-RECRUITMENT packet v1

| ID                   | Authority class | Durable reference                                                                                                                                  | Observed version                                                                                 | Used for                                                                                                                                |
| -------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| SRC-status           | 2-notion        | [Lancers Current Project Status](https://app.notion.com/p/3bb488886d578126a88cdd747f590a01)                                                        | fetched 2026-08-28T14:48Z; Portfolio v2 approved 2026-08-26                                      | Release One Mission Portfolio v2; the commissioned row for mission 6                                                                    |
| SRC-portfolio-row-6  | 1-owner         | [Release One Mission Portfolio, row 6](https://app.notion.com/p/3bb488886d578126a88cdd747f590a01) — "**6 · Recruitment** _(v2 layer, 2026-08-26)_" | approved by Brian Schuster 2026-08-26                                                            | The commissioned boundary this intake must confirm or amend                                                                             |
| SRC-authority        | 2-notion        | [Release 1 Authority Manifest — Final](https://app.notion.com/p/3bf488886d57818aa53ec09f4fc5f757)                                                  | published 2026-08-17; owner amendment 2026-08-26; fetched 2026-08-26T18:29Z                      | R2/Scope 4 disposition, external gates, exclusions, OD supersessions                                                                    |
| SRC-task-09-brief    | 1-owner         | [Recruitment & Squad Intake — Feature Brief](https://app.notion.com/p/3bd488886d578196a9a4cd9b25d59d1b)                                            | owner-approved 2026-08-15; owner amendments 2026-08-25/26; fetched 2026-08-26T13:33Z             | The primary controlling brief: funnel, doors, dedup, flip, recruitment events, one-time notify                                          |
| SRC-main             | 4-github        | `main@e669331d96fb949a3c29d7475842a6414cfe9e57`                                                                                                    | observed 2026-08-31; rebaselined from `c69d544` (Stages 0-1 were reconciled against that commit) | Implemented reality: recruits audience, walk-up door, ladder and `countByCapacity` defects                                              |
| SRC-packet-m5        | 4-github        | `missions/packets/M-PEOPLE-AND-ROSTER/packet.json`                                                                                                 | packet_version 1, approved, merged PR #96, baseline `be4f53d87385`                               | The base this mission layers onto; its non-goals fix the M5/M6 seam                                                                     |
| SRC-task-04-brief    | 1-owner         | [Attendance & Walk-ups — Verification Brief](https://app.notion.com/p/3bc488886d5781aca18af031c939bf5c)                                            | owner-approved 2026-08-14; owner amendment 2026-08-18; refetched 2026-08-31                      | D-1 to D-8': walk-up capture fields, the welcome flow and its scope, read-back, destination, the open Linear home this mission inherits |
| SRC-task-08-brief    | 1-owner         | [Person, Roster & Player Profile Information — Feature Brief](https://app.notion.com/p/3bd488886d57812e9534cb00102abef8)                           | owner-approved 2026-08-15; owner amendments 2026-08-26 and 2026-08-27; refetched 2026-08-31      | Row 8 channel presence built here; the recruit-stage fields routed here; recruitment facts kept off the person record                   |
| SRC-owner-2026-08-28 | 1-owner         | `missions/intake/M-RECRUITMENT/00-boundary.md` and `01-overview.md`                                                                                | Brian Schuster, 2026-08-28, in the Stage 0 and Stage 1 ledger                                    | The core four, every walk-up a recruit, the seven-value ladder, the board, the QR domain, the off-ramps                                 |
| SRC-owner-2026-08-31 | 1-owner         | `missions/intake/M-RECRUITMENT/01-overview.md`, Owner amendments after approval                                                                    | Brian Schuster, 2026-08-31                                                                       | The never-harsh rule, the joined confirmation, the recruit-only board, and the QR page reopened                                         |

## Evidence drop-in (provenance only)

| File | Origin | Indexed at | Notes |
| ---- | ------ | ---------- | ----- |

## Per-requirement provenance

Every requirement in `packet.json` carries a `source_id` naming which of the
sources above it comes from. The mapping, grouped:

| Source                 | Requirements it carries                                                                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SRC-task-09-brief`    | `REQ-four-doors`, `REQ-duplicate-queue`, `REQ-flip`                                                                                                                                                                                                                    |
| `SRC-task-04-brief`    | `REQ-attendance-recruits-first`                                                                                                                                                                                                                                        |
| `SRC-owner-2026-08-28` | `REQ-walk-up-stays-everywhere`, `REQ-status-ladder`, `REQ-core-four`, `REQ-exit-is-a-status-change`, `REQ-missing-never-blocks`                                                                                                                                        |
| `SRC-owner-2026-08-31` | `REQ-recruit-board`, `REQ-recruit-record`, `REQ-never-harsh`, `REQ-two-ladders`, `REQ-recruitment-cycle`, `REQ-two-questionnaires`, `REQ-recruit-sees-public-only`, `REQ-no-reason-asked`, `REQ-audience-both`, `REQ-approval-shows-both-ladders`, `REQ-qr-per-season` |
| `SRC-main`             | `REQ-ladder-defects`, `REQ-templates-only`, `REQ-rls-and-grants`                                                                                                                                                                                                       |

`SRC-status`, `SRC-portfolio-row-6`, `SRC-authority`, `SRC-task-08-brief` and
`SRC-packet-m5` carry no requirement of their own. They fix the boundary — what
this mission is commissioned to do, what it may not absorb, and where it meets
Missions 5, 7 and 8 — and are pinned because the boundary was drawn against
those exact versions.

## Where the owner sources are, verbatim

`SRC-owner-2026-08-28` and `SRC-owner-2026-08-31` are Brian's own words, held in
the intake ledger rather than in Notion, because they were given in the intake
conversation and recorded there as they were said:

- `missions/intake/M-RECRUITMENT/00-boundary.md` — the 43-item subject inventory
- `missions/intake/M-RECRUITMENT/01-overview.md` — invariants, and the owner
  amendments made after Stage 1 was approved
- `missions/intake/M-RECRUITMENT/02-workflows.md` — the frozen inventory and its
  approval
- `missions/intake/M-RECRUITMENT/acceptance/W1.md` … `W14.md` — one record per
  workflow, each carrying his exact approval words and date
- `missions/intake/M-RECRUITMENT/workflows/W1-….md` … `W14-….md` — the
  specifications, each ending in a Core decisions section classified `locked`,
  `proposed for owner approval`, or `delegated to Mission Lead`
