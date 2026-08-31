// W6-02 — The duplicate check, as it actually runs.
//
// Brian, 2026-08-31: "I don't understand at all what W6-02 is doing." Fairly:
// it drew an amber panel refusing to add somebody who is already on the team.
// That refusal was invented, and it was invented on top of a check the form
// already performs.
//
// `/operate/people/new` ships a real `Check for duplicates` step: it lists
// candidates under "Already in the club", handles an exact match, and offers to
// link to the existing person instead of creating a second one. So this screen
// FILLS the shipped form with somebody who is already in the club, PRESSES the
// application's own button, and photographs the answer it gives.
//
// It is also the answer to the condition Brian attached to W5: this is the door
// that has the check, and the walk-up door deliberately has none.
// The same shell as W6-01: this door is reached from ADD RECRUIT on the board,
// so it reads as recruitment rather than as the People form it reuses.
selectRecruitmentNav();
setHeading("Add a recruit");
// The way back is recruitment, not People: this door is reached from the board.
relabelButton("← People", "← Recruitment");

fill("givenName", "Alaric");
fill("familyName", "Brindlewood");
fill("mobile", "07700 900753");

await openControl("check for duplicates", 1400);

const result = must(
  [...document.querySelectorAll(".MuiPaper-root, section, div")].find((n) =>
    /already in the club|duplicate check/i.test(n.innerText ?? ""),
  ),
  "the form did not render a duplicate-check result",
);
mark(result, 1);

await settle();
