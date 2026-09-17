# LAN-353 batch 4 — visual evidence

Four issues from Clint and Ian's 16–17 September testing, on one branch. This
folder holds the screenshots for the ones that change a screen; LAN-390 changes
an attribute a screenshot cannot show and has none.

Everything here was taken from a production build of this branch served on port
3010 against the `overflow` local Supabase slot, signed in through the real
application login. Every shot exists at both required widths — desktop 1440×900
and phone 375×812 — and the width was measured by the browser context, not
claimed.

| Issue   | Folder     | What it shows                                                       |
| ------- | ---------- | ------------------------------------------------------------------- |
| LAN-390 | —          | Nonvisual: an input attribute a handset reads. Proved by unit test. |
| LAN-389 | `LAN-389/` | The confirm box on the sign-up form and the edit-person form.       |
| LAN-388 | `LAN-388/` | The Onboarding group on the event audience picker.                  |
| LAN-391 | `LAN-391/` | A draft event's type changed, and what the change reset.            |

## LAN-389 — the confirm field

`/join/[code]` and `/operate/people/[personId]/edit`, the two forms the issue
names.

| File                          | State                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `*_signup_pair.png`           | The pair, agreeing. Sign me up is available.                                            |
| `*_signup_mismatch.png`       | The two entries disagree: the error is on the confirm box, Sign me up is held.          |
| `*_edit-person_untouched.png` | A number already on file, nobody touched it: the confirm box is empty and not required. |
| `*_edit-person_mismatch.png`  | The number changed and the confirmation disagrees: the error is on the confirm box.     |
| `*_edit-person_pair.png`      | The two entries agree, and the value that will be saved is the first field's.           |

The sign-up form is the one entry point of the ten that is not an HTML form —
it saves from a button — so its refusal is a held Save button with its existing
reason line, rather than a refused submission.

## LAN-388 — the Onboarding group

`/operate/events/[id]?step=audience`, on a practice draft, with the local seed's
six mid-onboarding memberships.

| File                             | State                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `*_picker_groups.png`            | The group row: **Onboarding (6)** beside the four Active groups and BPS.                                        |
| `*_picker_onboarding-chosen.png` | Onboarding pressed: six people ticked, each row reading `Player · Onboarding`, and the Active groups untouched. |

Before this, those six were in neither the Active groups nor the Recruits group,
so there was no way to put them on an event at all.
