# Mission-intake mockup standards

Mission-intake mockups are review artifacts, not redesign proposals. Start from
`.claude/skills/mission-intake/assets/mockup-exemplar.html` and preserve its
data-driven single-file rendering approach, shell, tokens, and frame markup.

## Grounding

- Begin the stylesheet with a token-provenance comment naming the exact source
  files, normally `src/theme.ts` and applicable MUI defaults, and the sentence
  **“Nothing here is a redesign.”**
- Capture the current running application with Playwright at desktop and 375px
  and embed the relevant current-state screenshot beside each proposal so the
  delta is visible. Use only synthetic pilot-data names and scenarios.
- When the app cannot run because the local database or migrations are
  unavailable, inspect the implementation and use code-only grounding. Mark the
  acceptance record `grounding: code-only` and report screenshot restoration as
  open. Never imply screenshots were captured when they were not.
- Repository authority wins over a draft requirement. Show the authoritative
  behavior and raise the conflict to Brian explicitly; never silently harmonize
  either direction.

## Current versus proposed

These rules were agreed during the first ledger-driven intake, proved on
`M-EVENTS-CALENDAR-TARGET-STATE` from `W2` onward, and are binding on every
mission-intake mockup. They live here, not in `docs/ux/standards.md`, which is
the single general UX standard and says nothing about intake review artifacts.

- Label both sides explicitly and identically on every screen — the visible
  labels are **CURRENT — on `main` today** and **PROPOSED — this mission**.
  Position and a caption are not enough to say which is which.
- Give each side a visible band or rule in its own colour, applied consistently
  across every screen and every workflow, and explain the two labels once in the
  page legend.
- State the surface's disposition on the screen head as **Existing**,
  **Modified** or **New**, in those words.
- On a modified surface, name the specific deltas in the screen head as a short
  list. The reader is told what to look for rather than asked to diff two images.
- A surface with no current equivalent says **New surface, nothing to compare**,
  and the screen head says which workflow justifies introducing it. Never omit
  the current side silently.
- Explanatory review material goes outside the application frame, in the screen
  head. An alert inside the frame reads as product. The exception is a screen
  whose subject _is_ the application's own empty, refusal or error alerts.
- The 375px frame shows the workflow's useful content within roughly one screen
  of the top. Stacked full-width controls that push content below the fold are a
  defect, not a rendering artefact: collapse them into one compact control and
  render rows as condensed cards, matching the breakpoint behaviour the
  application already uses.
- Reuse an already-approved surface rather than redrawing it. A second,
  divergent copy of an approved screen is a contradiction in the ledger, not a
  convenience; link to the approved workflow's screen instead.

## Review vocabulary and frames

- Mark every surface absent from the current build with a dashed `Proposed` chip
  and explain that vocabulary in a legend.
- Show true 1280px desktop and true 375px phone frames side by side. The desktop
  may be visually scaled to about 72%, but its internal viewport remains 1280px.
- Give every frame browser chrome, its real route URL, and a badge such as
  `W2-03 · DESKTOP 1280` or `W2-03 · 375`.
- Put the stable screen ID on a corner tab. The screen head repeats that ID, a
  title, a two-to-four-sentence explanation of existing versus extended
  behavior, and a clock chip.
- Pin `Now: <date, time>` on every screen. When a rule moves or removes a
  time-dependent value, write the arithmetic in the note.
- Use one named synthetic event and cast throughout a workflow. Do not reset to
  placeholder data between screens. Names must be clearly synthetic and must not
  resemble real roster data.

## Semantic states and authority

- Show meaningful states, exceptions, validation, empty/loading/failure/recovery,
  and permission boundaries—not decorative variants or only a happy path.
- Use the application's approved state vocabulary exactly. Labels and colour must
  communicate the same meaning; colour alone is never the state.
- Surface centrally governed constraints as locked controls with a `Central rule`
  chip and name the governing ADR, configuration, or contract inline.
- Mark omitted unchanged content with “the rest of the page is unchanged.” Never
  fill the region with invented controls that could be mistaken for scope.

## File and navigation contract

- Each `mockups/Wn-<slug>.html` is self-contained and renders its screens from data
  through one shared shell/component layer.
- `mockups/index.html` is **generated**, never hand-maintained:
  `npm run intake -- hub --write` renders it from `state.json` and the
  specification, mockup and acceptance files actually present. It carries one
  row per frozen workflow — ID, name and link, specification and acceptance
  links, screen count, current-versus-proposed disposition, workflow state and
  staleness, and any amendments or open feedback — plus overall progress.
  `npm run intake -- status` fails when the committed hub differs from what the
  ledger generates, so a hand edit is drift, not an update. A mission that
  genuinely draws no surfaces records
  `"mockup_hub": {"not_applicable": "<reason>"}` instead; silence is never the
  not-applicable answer.
- Every workflow page links to the hub and previous/next workflows.
- After creating or revising a mockup, mission intake opens the file in Brian's
  browser. For an already-open file it reopens it or says which workflow to
  refresh. Review requires no commands from Brian.

Feedback is always addressed by screen ID. Drafts may pipeline, but approval order
is serial. A downstream draft invalidated by an earlier decision is marked stale
and regenerated before it is shown again.
