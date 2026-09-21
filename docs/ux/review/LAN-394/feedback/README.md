# LAN-394 — the owner-feedback rounds, 18 September 2026

What Brian said on each visual pass, and what each capture shows now. These
files hold the **second** round; the first round's captures are in the parent
directory.

## First pass — the order

> "This is an emergency page. When I get here I need to work immediately."

Two jobs, in that order: **stop a runaway** and **find and clear a blockage**.
The section was rebuilt as the answers to them: status and control first, then
the send counts, then what is blocking, then the held people, then the limits
and the history.

## Second pass — the dress

> "I hate this section. The narrative UI is really terrible. 'Is it running
> away?' — for God's sake, have a professional tone. Just say what the thing is:
> how many messages were sent in the last 24 hours. The UX at the top is
> completely invented. We should find UX we already use in the app and do that.
> We should not be creating new UX inventions here. I do like why the message is
> being paused. I like the default send. Everything else is fine."

The order and the content are unchanged. The **dress** is now the application's
own, element by element:

| What                           | Was                                          | Is now                                                                         |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------ |
| The state                      | A green/amber/red panel with a left edge bar | A **Status** row whose value is the one `StatusChip`, in its own colours       |
| Reason, By, When               | Bespoke label–value lines inside that panel  | Label–value rows, as on every person and roster record                         |
| The control                    | Beside the state in a two-column grid        | Directly under those rows, in the Messaging schedule form's own fields and bar |
| "Is it running away?"          | Three coloured tiles with big numbers        | **Messages sent** — three rows: `0 of 50`, `0`, `0 of 3,000`                   |
| "Is it stuck?"                 | Sentences with an em dash and a trailing act | **Waiting** — one label–value row per cause                                    |
| "Nothing is holding messages." | A sentence                                   | A row: **Holding — Nothing**                                                   |
| Held people                    | Bespoke outlined cards                       | The boards' person-line card, with the same small Resume                       |
| Headings                       | Questions                                    | Noun phrases: Messaging status, Messages sent, Waiting                         |

Nothing new was invented: everything is `Section`, `Fact`/`FactList`,
`StatusChip`, `ChoiceField`/`Field`/`ActionBar` and `RowCard`, each already in
use elsewhere in the application. The one sentence in the section is still the
one under the pause button.

## The captures

Every capture is `/operate/admin/messaging`, the whole page, taken through a
real application sign-in against a production build of this branch's finished
code on the local stack. Measured widths are in `measurements.json`: the browser
context reported 1440 and 375, which is the figure that matters — a
self-reported phone width is not evidence. The `headSha` it records is this
commit's parent, because the captures are of this commit's own code and were
taken before it existed; they were then committed with it.

| Capture                                                         | State            | What it shows                                                                                                                                                                                                                           |
| --------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desktop-messaging-normal.png`, `phone375-messaging-normal.png` | Messages waiting | The section un-paused, on the amber chip the local queue earns: Reason and By read **not recorded**, **Waiting** reads **Holding — Nothing**, **People held back** reads **Nobody**.                                                    |
| `desktop-messaging-paused.png`, `phone375-messaging-paused.png` | Paused           | The same section on the red **Paused** chip, carrying the reason, who paused it and when; **Resume messaging** in place of **Pause messaging**; and **Waiting** carrying the row **Paused — Resume**, the link landing on that control. |

Both states were reached through the control itself, with the **Testing**
preset, so **Recent changes** shows a pause and a resume by the operator who
made them.

## What to check

1. **The status is a chip, not a panel.** Exactly one of Sending normally
   (green), Messages waiting or Provider cooling down (amber), Paused or
   Emergency stop (red) — in the same chip the roster, the recruitment board and
   the event pages already use. Reason, By and Last change are rows under it,
   and the control is directly under those.
2. **The reason is one tap.** Runaway sends, Provider outage, Testing, under
   the noun-phrase label **Reason for pausing**. The preset on its own is a
   complete reason; the free-text box adds to it.
3. **Messages sent.** Five minutes against 50, the hour against no ceiling,
   24 hours against 3,000. At 80 % of a ceiling the row says **Nearing limit**
   and at it **At limit** — the word, not only a colour. The captures are of a
   quiet local database, so all three read 0 and none carries a word.
4. **Waiting.** Due now with the oldest wait, then one row per blocking cause
   with the act that clears it, or **Holding — Nothing** when none does.
5. **People held back.** One person-line card per held person or number, named
   and linked to their record, with the limit they reached and their own Resume.
   A provider cooling down is not a person and appears only under Waiting.
6. **375 px.** Everything stacks, the status and its control are the first thing
   in the section, every control is full width and at least 44 px tall, and
   nothing scrolls sideways.

The numbers in these captures are the **local** database's — a synthetic dataset
plus whatever the test suites left behind. "Scheduled later: 4,947" and an
unresolved-attempt count in the hundreds are artefacts of that, not of the club.

The login is the same **agent-only** local account the first round used: local,
machine-local password, in no file this repository tracks, and nothing about it
exists on hosted.
