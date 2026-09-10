# LAN-293 — event audience captures

Agent browser preflight, real login, seeded club, overflow slot at
`http://127.0.0.1:3010`. Measured by the Playwright context, not self-reported:
`desktop 1440x900`, `phone375 375x812`.

| Capture                                 | Route                                                             |
| --------------------------------------- | ----------------------------------------------------------------- |
| `desktop_operate_events_new.png`        | `/operate/events/new`                                             |
| `phone375_operate_events_new.png`       | `/operate/events/new`                                             |
| `desktop_audience-picker_practice.png`  | `/operate/events/<draft>?step=audience`, a `practice`-class draft |
| `phone375_audience-picker_practice.png` | the same, at 375px                                                |

What to look for in the two picker captures — LAN-294 and LAN-295:

- **Bertram** appears **once**, reading
  `Player · Active · Both · Committee · President · bertram@ashridge.ox.ac.example`.
  He was two rows before this change.
- **Caspian Hallowfield** appears **once**, reading
  `Player · Active · Both · Committee · IT Officer, Media Secretary, Secretary · 7700900515` —
  four memberships, one row, three seats joined on the one line.
- **Ulric Winterbourne-Quy** appears once as `Player · … · Coach · Defensive Coordinator`,
  which is the player-and-coach overlap rather than the committee one.
- **No recruit row anywhere**, and no **Recruits** group button beside the other
  five. This is a practice event, so recruits are not in the catalogue at all.

The draft in the captures was created for the preflight and is not seeded — it is
gone after the next `db:reset`.
