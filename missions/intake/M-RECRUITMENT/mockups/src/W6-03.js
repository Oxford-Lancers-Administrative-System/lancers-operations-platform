// W6-03 — The welcome that did not fire, because this door recorded no opt-in
// evidence. Moved here from W3 on 2026-08-31: operator-add is the door that
// carries no natural opt-in, so this consequence belongs to W6.
//
// Task 09 §9.1 is explicit that an operator adding somebody by hand has no
// natural opt-in, so W6 has to capture one. This is what it looks like when it
// did not.
setHeading("Marguerite Ashdown");
setSubtitle("Recruit · 2026-27 · added by hand on 9 May");
setPersonRows([
  recordRow("Name", "Marguerite Ashdown"),
  recordRow("Mobile phone", "07700 900461"),
  recordRow("College", "Kestrelhall"),
]);
replaceSummaryStrip([
  [{ chip: "identified" }, "Recruitment status"],
  ["0 of 5", "Sign-on steps done"],
  ["Blocked", "Sign-on"],
]);
// 1. The ladder, not started, and the reason stated on the recruit it affects.
mark(
  rebuildCard(
    recordCard("ONBOARDING"),
    "SIGN-ON — NOT STARTED",
    [
      recordRow("1 · recruit_welcome", "Not sent", { muted: true }),
      recordRow("Why", "No opt-in evidence was recorded for the operator-add door"),
      recordRow("What would release it", "Record how the club came by her number"),
      recordRow("Until then", "She exists on the board and the club says nothing to her"),
    ],
    { proposed: true, colour: "#b26a00" },
  ),
  1,
);
