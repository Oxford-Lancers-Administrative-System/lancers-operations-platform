# Mockup conventions for this intake

Additions to `docs/ux/mockup-standards.md` agreed during review. Binding on
every mockup from `W2` onward. Proposed for the standard itself at the Stage 5
retro; until that lands, this file is the rule for this mission.

## 1. Current versus new must be unmistakable — Brian, 2026-08-21

> "I want it to be more clear what the current is versus the new. That's not
> distinguished enough in the report. I figured it out, but I want that to be
> more distinguished next time."

`W1` embedded the current-build screenshot above the proposal with a one-line
caption, and that was too quiet. From `W2`:

- Label both sides explicitly and identically every time — **CURRENT — on
  `main` today** and **PROPOSED — this mission**. Never rely on position or on
  a caption alone to say which is which.
- Give each side a visible band or rule in its own colour, applied
  consistently across every screen and every workflow, and explain the two
  labels once in the page legend.
- State the surface's disposition on the screen head as **Existing**,
  **Modified** or **New**, in those words.
- When a screen changes an existing surface, name the specific deltas in the
  screen head as a short list, so the reader is told what to look for rather
  than asked to diff two images.
- A surface with no current equivalent says so — **New surface, nothing to
  compare** — rather than silently omitting the current side.

## 2. Callouts are review commentary, not product — Brian, 2026-08-21

> "I hate the callouts. You should not have the callout at the bottom. That
> should not be in the real UI."

Explanatory alerts must not appear inside a frame. Anything the reviewer needs
to be told goes in the screen head, outside the browser chrome. The exception is
a screen whose subject _is_ the application's own alerts — empty, refusal and
error states, as on `W1-06`.

## 3. Condense before the phone frame is presented

The 375 frame must show the workflow's content within roughly one screen of the
top. Stacked full-width control buttons that push content below the fold are a
defect, not a rendering artefact: collapse controls into one compact control and
render rows as single condensed cards, matching the breakpoint behaviour the
application already uses.
