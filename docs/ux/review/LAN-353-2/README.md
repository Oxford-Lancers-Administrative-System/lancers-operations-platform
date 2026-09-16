# LAN-353 batch 2 — visual evidence

Every screenshot below was taken by `npm run visual:preflight` against a local
production build on the overflow slot, through the real login, at the two
required widths: **desktop**, measured 1440×900, and **phone375**, measured
375×812. The four interaction states a plain navigation cannot reach — a
confirmation that only appears after a submit, and two dialogs — were taken by
the same Playwright driver immediately afterwards, at the same two widths, in
the same session.

The routes carry secret tokens, so the filenames do not: a screenshot is named
for what it shows.

## LAN-376 — the RSVP that could not be changed

| File                                                                                                    | What it shows                                                                                                                      |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `desktop-rsvp-change.png`, `phone375-rsvp-change.png`                                                   | The change path: a standing answer, with both controls live.                                                                       |
| `desktop-rsvp-decline.png`, `phone375-rsvp-decline.png`                                                 | The decline path, reached from a recorded Yes.                                                                                     |
| `desktop-event-participation-answers.png`, `phone375-event-participation-answers.png`                   | The answer column: an answered row's chip is now the control, and an unanswered row still reads **Record answer**. Nothing stacks. |
| `desktop-record-answer-over-a-standing-answer.png`, `phone375-record-answer-over-a-standing-answer.png` | The form over an answer that already stands, showing **Current answer — No, given 13 Sept 2026, 19:00**. No confirm step.          |

The busy panel a throttled link now gets is covered by
`src/app/rsvp/[token]/screens.test.tsx` rather than by a screenshot: producing
it needs twenty requests inside one minute, which is not a state a preflight
can hold still.

## LAN-372 — roster players are exempt from Stop

| File                                                                | What it shows                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `desktop-stop-roster-player.png`, `phone375-stop-roster-player.png` | A roster player's own Stop link: the membership sentence, and nothing to press. |
| `desktop-stop-recruit.png`, `phone375-stop-recruit.png`             | A recruit's, unchanged.                                                         |

## LAN-365 — no academic section: everything folds into the personal group

| File                                                                | What it shows                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `desktop-person-record.png`, `phone375-person-record.png`           | Correction round: no separate **Academic** heading anywhere. **How to reach them** now renders first; **Who they are** follows it and ends College, Matriculation year, Expected graduation, Degree field, Student number, then BAFA registration number, in that order. |
| `desktop-person-record-edit.png`, `phone375-person-record-edit.png` | The same fold and reorder on the edit form.                                                                                                                                                                                                                              |
| `desktop-onboarding-details.png`, `phone375-onboarding-details.png` | Unchanged by this round: the student number with its Bod-card guidance, and no BAFA field at all.                                                                                                                                                                        |

## LAN-354 — the club link expires seven days after the event

| File                                                              | What it shows                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `desktop-event-share-panel.png`, `phone375-event-share-panel.png` | The share panel with a live link and the label **Expires 7 days after the event**. |
| `desktop-club-link-expired.png`, `phone375-club-link-expired.png` | Day eight: the same refusal an unknown token gets, saying nothing about the squad. |

## LAN-366 — the middle name

| File                                                                | What it shows                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `desktop-person-record.png`, `phone375-person-record.png`           | **Middle name** between the first and last name.                |
| `desktop-person-record-edit.png`, `phone375-person-record-edit.png` | The same field on the edit form, optional.                      |
| `desktop-onboarding-details.png`, `phone375-onboarding-details.png` | The details step asking for it, optional, beside the two names. |

The same three routes as LAN-365: one save, one screen, two issues.

## LAN-371 — an operator withdraws or records a recruit's consent

| File                                                                          | What it shows                                                                                                     |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `desktop-recruit-record.png`, `phone375-recruit-record.png`                   | **Stop messages** in the record's own actions, and **WhatsApp granted** as the status.                            |
| `desktop-stop-messages-dialog.png`, `phone375-stop-messages-dialog.png`       | The dialog: the short list of reasons, and the operator's own words beside it.                                    |
| `desktop-person-record-messaging.png`, `phone375-person-record-messaging.png` | The same control on a recruit's person record, under **Messaging**. A roster player's record has no such section. |
| `desktop-recruitment-board.png`, `phone375-recruitment-board.png`             | The board's consent column: **WhatsApp granted** and **Revoked (by operator, date)**.                             |

## LAN-379 — "Please respond ASAP"

| File                                                                    | What it shows                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| `desktop-rsvp-deadline-passed.png`, `phone375-rsvp-deadline-passed.png` | The deadline line on a link whose deadline has already gone. |

## LAN-367 — a changed question voids its answers, and the sweep sends the re-ask

| File                                                                                    | What it shows                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `desktop-questions-editor.png`, `phone375-questions-editor.png`                         | The editor before a save.                                                                                                                                                                                          |
| `desktop-questions-editor-confirm.png`, `phone375-questions-editor-confirm.png`         | The confirmation: **1 question changed, 19 people will be asked again**, with the correction tick.                                                                                                                 |
| `desktop-player-questions-outstanding.png`, `phone375-player-questions-outstanding.png` | Correction round: the player's own page afterwards. The changed question now carries its own **Question changed** label beside it, told apart from the unchanged one, which keeps its answer; their yes/no stands. |
