// W5-02 — Refused: no mobile. Brian's knowingly-accepted limitation, made
// visible rather than left in a decision log.
appendCard(
  "Add a walk-up",
  [
    makeRow("First name", "Peregrine"),
    makeRow("Last name", "Oakhollow"),
    makeRow("Mobile", "Not given"),
    makeRow("Email", "Not given"),
  ],
  "",
);
const refusal = drawnPanel("This person cannot be captured");
refusal.style.border = "1px solid rgba(178,106,0,0.55)";
refusal.style.background = "#fdf6ec";
refusal.append(
  makeRow("Why", "A mobile is required at every door."),
  makeRow("What still happened", "Nothing. No person, no recruit, no attendance row."),
  makeRow("What to do", "Ask for a number, or let them go."),
);
refusal.append(
  note(
    "Brian, Task 04 D-1, knowingly: “I don't care if it limits us… a walk-up we can't reach isn't in the pipeline.” This is deliberate and is not to be softened into an optional field without a new owner decision — so the screen says it plainly rather than hiding a disabled button.",
  ),
);
const anchor = cardTemplate();
(anchor?.parentElement ?? document.body).append(refusal);
