# LAN-231–235 — combined rollout captures

Representative captures of the application code at
`ec708a8ac0be94cdea2c8d03b3e2f8c7bc2b4aec`, using the existing local synthetic
seed through real login. The evidence-only follow-up commit adds these images,
not application changes. Desktop was measured at 1440px and phone at 375px.
These are agent preflight evidence, not Brian's visual approval.

| Surface                 | Desktop                       | Phone                                 |
| ----------------------- | ----------------------------- | ------------------------------------- |
| Roster, preserved board | [Desktop](roster-desktop.png) | [375px](roster-phone375.png)          |
| Player home             | [Desktop](player-desktop.png) | [375px](player-phone375.png)          |
| Invite operator         | —                             | [375px](invite-operator-phone375.png) |
| Add recruit             | —                             | [375px](add-recruit-phone375.png)     |

The player page measured 1,638px high at 375px. The time-dependent seed now
offers this player two new invitations, not the historical audit's six, so
the 7,488px historical height is not a like-for-like comparison. The answered
and later-event lists are closed disclosures; no invitation was removed.

The full 158-view route/state capture and interaction screenshots remain under
the ignored `.lancers-runtime/` directory. Token-bearing URLs and credentials
are never committed. The existing roster reference is under
`../design-audit-2026-09/screens/`; the approved player-home target is under
`../design-mockup-2026-09/`.
