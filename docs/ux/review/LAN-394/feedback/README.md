# LAN-394 — the owner-feedback round, 18 September 2026

What Brian said on the visual pass, and what each capture shows now.

> "This is an emergency page. When I get here I need to work immediately."

Two jobs, in that order: **stop a runaway** — the application firing WhatsApp
messages like crazy, hitting every limit — and **find and clear a blockage** —
messages not going out and nobody knowing why. Everything else is secondary.

What was wrong: the section opened on a grey **State** table that read like
nothing was happening even when an emergency stop had paused it; the control was
far down the section; and **Active holds** told him nothing.

Every capture is `/operate/admin/messaging`, the whole page, taken through a
real application sign-in against a production build of this branch's finished
code on the local stack. Measured widths are in `measurements.json`: the browser
context reported 1440 and 375, which is the figure that matters — a
self-reported phone width is not evidence. The `headSha` it records is this
commit's parent, because the captures are of this commit's own code and were
taken before it existed; they were then committed with it.

| Capture                                                         | State            | What it shows                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desktop-messaging-normal.png`, `phone375-messaging-normal.png` | Sending normally | The new order: one green status line with the control beside it, then "Is it running away?", "Is it stuck?" — reading **Nothing is holding messages.** — "People held back" reading **Nobody**, then the limits and the history. |
| `desktop-messaging-paused.png`, `phone375-messaging-paused.png` | Paused           | The same section in red, carrying the reason, who paused it and when; **Resume messaging** in place of **Pause messaging**; and "Is it stuck?" naming **Paused — Resume**, the link landing on that control.                     |

Both states were reached through the control itself, with the **Testing**
preset, so **Recent changes** shows a pause and a resume by the operator who
made them.

## What to check

1. **The status line is the first thing, and it is coloured.** Exactly one of
   Sending normally (green), Messages waiting or Provider cooling down (amber),
   Paused or Emergency stop (red). The reason, the operator and the time are in
   the same block, and so is the control.
2. **The reason is one tap.** Runaway sends, Provider outage, Testing. The
   preset on its own is a complete reason; the free-text box adds to it.
3. **"Is it running away?"** Five minutes against 50, the hour against no
   ceiling, 24 hours against 3,000. Amber at 80 % of a ceiling, red at it. The
   captures are of a quiet local database, so all three read 0 and none is
   coloured.
4. **"Is it stuck?"** What is due now with the oldest wait, then one line per
   blocking cause with the act that clears it, or **Nothing is holding
   messages.** when none does.
5. **"People held back"** replaces "Active holds": one card per held person or
   number, named and linked to their record, with the limit they reached and
   their own Resume. A provider cooling down is not a person and appears only in
   "Is it stuck?".
6. **375 px.** Everything stacks, the status and its control are the first
   thing in the section, every control is full width and at least 44 px tall,
   and nothing scrolls sideways.

The numbers in these captures are the **local** database's — a synthetic dataset
plus whatever the test suites left behind. "Scheduled later: 4,947" and an
unresolved-attempt count in the hundreds are artefacts of that, not of the club.

The login is the same **agent-only** local account the first round used: local,
machine-local password, in no file this repository tracks, and nothing about it
exists on hosted.
