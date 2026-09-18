# LAN-394 — Messaging safety, visual evidence

> **Read `feedback/` first.** Brian's visual pass of 18 September 2026
> rearranged the section, and the captures in the top-level folder below are of
> the arrangement he asked to be changed. They are kept because they are the
> evidence the independent review was given, not because they are current.

What to look at, and what each capture is showing. Every one is
`/operate/admin/messaging`, captured through a real application sign-in on the
local stack at the exact head of this branch. Measured widths are in
`measurements.json`: the browser context reported 1440 and 375, which is the
figure that matters — a self-reported phone width is not evidence.

The section is the **last** thing on the page, as decided (Brian, 17 September
2026). The `*-messaging-*.png` captures are the whole page, so the placement is
checkable; the `*-safety-*.png` captures are the section alone, so the contents
are readable.

| Capture                                                         | State                                             | What it shows                                                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desktop-messaging-normal.png`, `phone375-messaging-normal.png` | Sending normally                                  | The whole page. The section sits below Recruitment, Onboarding and Event messaging, and there is no notice at the top because there is nothing to say.                            |
| `desktop-safety-normal.png`, `phone375-safety-normal.png`       | Sending normally                                  | State, the one sentence, what is waiting, the limits behind a disclosure, the pause control, no holds, no recent changes.                                                         |
| `desktop-messaging-paused.png`, `phone375-messaging-paused.png` | Paused                                            | The notice at the top of the page, linking to the section. The controls are at the bottom, so a paused state would otherwise be a scroll away on the one page that can end it.    |
| `desktop-safety-paused.png`, `phone375-safety-paused.png`       | Paused                                            | Who paused it, their reason, when — and **Resume messaging** in place of **Pause messaging**. Exactly one of the two is ever offered.                                             |
| `desktop-messaging-held.png`, `phone375-messaging-held.png`     | Provider temporarily unavailable, one person held | The whole page in the state an operator would open it in after something went wrong.                                                                                              |
| `desktop-safety-limits.png`                                     | Sending normally, disclosure open                 | "Limits and current use" expanded: every threshold, read-only, with the current use beside it and the decision line under it. There is no input, no stepper and no save.          |
| `desktop-safety-held.png`, `phone375-safety-held.png`           | Provider temporarily unavailable, one person held | The holds list: a person named by name with their own **Resume**, and the WhatsApp circuit with the time it rests until and no control, because a provider cools down on its own. |

## What to check

1. **The order.** Current state, then the one sentence, then what is waiting,
   then the limits and current use, then the controls, then active holds, then
   recent changes. That is the approved UX contract's order exactly.
2. **The limits are read-only.** `desktop-safety-limits.png` is that section
   open. There is no input, no stepper and no save anywhere in it — they are
   constants in code with the decision line under them, and the section shows
   "Set by — Brian, 17 September 2026".
3. **There is no "send all now" and no "clear counters".** Neither exists, on
   either width.
4. **A held number is named by the people it reaches**, never by its
   fingerprint. The fingerprint never leaves the server; a shared number says so
   in as many words.
5. **375 px stacks.** Every label/value row becomes two lines, every control is
   full width and at least 44 px tall, and nothing scrolls sideways.
6. **Nothing explains itself twice.** The only prose in the section is the one
   sentence the design quotes; everything else is a label, a value or a state.

Every number in these captures is the **local** database's — a synthetic
dataset plus whatever the test suites left behind when they ran. "Scheduled
later: 4,947" and an unresolved-attempt count in the hundreds are artefacts of
that, not of the club. What is under review is the section's contents, order and
behaviour at both widths.

## How these were produced

Playwright, two contexts, one real sign-in each, against `next start` on the
slot's own port with the seeded synthetic dataset. The three states were set up
by writing the safety scope rows directly — a pause, a person hold and a
provider cooldown — because reaching them for real would mean sending three
thousand messages, ten to one person, and breaking a provider.

`phone375-safety-normal.png` and `desktop-safety-limits.png` were taken in a
second pass after the independent review (A-07). The page's app bar is sticky,
so an element capture of the section scrolled to the top of the viewport had the
bar sitting over the "Now" line; for the section-only captures the bar is taken
out of the flow first, which is why the section reads from its first row. The
whole-page captures are untouched and still show the bar where it belongs.

The login is an **agent-only** local account created for this capture, not
Brian's review account: that credential is not initialized in this worktree, and
seeding a different value into it would lock him out of every later environment.
The account is local, the password is machine-local and is in no file this
repository tracks, and nothing about it exists on hosted.
