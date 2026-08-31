// W14-03 — Refused: she already holds a membership this season. Invariant I2,
// said plainly rather than failing.
const card = drawnSurface({
  title: "Marguerite Ashdown is already on the team",
  subtitle: "She holds a 2026-27 membership, so there is nothing to flip.",
  chrome: "Interrupts the status change on the recruit board",
  width: 620,
});
const why = drawnPanel("Why");
why.append(
  makeRow("She holds", "2026-27 · onboarding · created 9 May"),
  makeRow("The rule", "One membership per person per season — invariant I2"),
  makeRow("What was written", "Nothing"),
  makeRow("Instead", "Open her roster record"),
);
card.append(
  why,
  note(
    "This is a constraint refusing, not a duplicate check. Task 09 D7 is explicit that there is no duplicate check at the flip — the person has existed for weeks, and I2 is the only guard. A constraint violation should read as a sentence, not as a failed save.",
  ),
);
