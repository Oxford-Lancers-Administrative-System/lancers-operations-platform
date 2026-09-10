# LAN-274 — G5, recruitment and admin small fixes

Every capture below was taken through the real application login on the primary
local slot, at a measured 1440×900 and a measured 375×812 (`npm run
visual:preflight` for the plain routes; two short Playwright scripts for the
three states a route list cannot reach on its own — a collapsed section, a
filter with a value in it, and a dialog mid-flow). The data is the synthetic
local seed plus writes made through the application's own controls; nothing was
staged in SQL.

| Capture                                        | What it evidences                                                                                                                                                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `*_recruit-record.png`                         | LAN-253 — Recruitment events and Notes are full width, stacked under Person and Recruitment, in table order. LAN-248 — the Notes stamps read `10 Sept 2026, 03:50`. LAN-247 — First contact is a date, not "not recorded". |
| `*_recruit-record-status-history-expanded.png` | LAN-248 — the Status history "When" column, which ships behind a closed disclosure, reads `10 Sept 2026, 03:49`: day-month-year, 24-hour, club time.                                                                       |
| `*_roles-candidate-selected-by-name.png`       | LAN-251 — Replace role, after clicking the candidate's **name** (never the radio): the row is selected, the form is intact and the page has not navigated.                                                                 |
| `*_admin-role.png`                             | LAN-251 — the role record the dialog is opened from, unchanged.                                                                                                                                                            |
| `*_admin-messaging.png`                        | LAN-250 — the messaging schedule whose panels now clear a server-rendered message when a field is edited. The clearing itself is behavioural and is pinned by test, not by a still.                                        |
| `*_follow-ups-date-range.png`                  | LAN-281 — `Events from` / `Events to` with 05/05/2026–12/05/2026 applied, the list narrowed to that window, and the by-player rows, sort, columns, search, Status and When all unchanged.                                  |
| `*_player-questionnaire.png`                   | LAN-289 — the step navigator. See the limitation below.                                                                                                                                                                    |

## Limitation

The seeded player behind the live `/me/[token]` link has **no `onboarding_items`
rows at all** — the F2 state `readQuestionnaireView` is explicit about ("a season
with no configured item types yields no items… a real configuration state, not a
failure"). Every step therefore reads Outstanding in that capture, correctly, and
it does not photograph the contradiction LAN-289 filed, which needs a BUCS Play
or Hudl item in a **resolved** state. That case is pinned by four tests in
`src/app/me/[token]/details/screens.test.tsx` instead — a confirmed item, a
claimed item, an invited one that must still read Outstanding, and the Done list
agreeing with the navigator. Minting a `/me` token for one of the fifteen
memberships that do hold a confirmed BUCS Play item is not something the
application offers outside a real send, and no fixture was invented to fake it.

There is no delivery capture: LAN-252 writes a `delivery_attempts` row and shows
nothing new on any screen. It is proved against the real local database in
`src/lib/services/delivery.test.ts`.
