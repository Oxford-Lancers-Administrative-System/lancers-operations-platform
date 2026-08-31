// W2-01 — One recruit's record. Built on the player record's own banded shell
// at /operate/roster/[membershipId], because that is the page this should be
// structured like — not the person record, which is where the first draft
// wrongly started. Reached by clicking a row on the recruit board.
setHeading("Rosalind Penhaligon");
setSubtitle("Recruit · 2026-27 · opened from the recruit board");
replaceSummaryStrip([
  [{ chip: "identified" }, "Recruitment status"],
  ["4 days", "Since first contact"],
  ["1", "Events invited to"],
  ["0", "Events attended"],
  ["Not sent", "Recruit-stage ask"],
]);
setPersonRows([
  recordRow("Name", "Rosalind Penhaligon"),
  recordRow("Aliases", "Not recorded", { muted: true }),
  recordRow("Mobile phone", "07700 900318"),
  recordRow("Personal email", "Not recorded", { muted: true }),
  recordRow("College", "Dunsfold"),
  recordRow("Matriculation year", "2026"),
  recordRow("Expected graduation", "2029"),
  recordRow("Degree field", "Human Sciences"),
]);

// PERSON stays exactly as it is: the same rows, read-only, routing out.
// ONBOARDING has nothing to describe for somebody who holds no membership.
rebuildCard(
  recordCard("ONBOARDING"),
  "RECRUITMENT",
  [
    recordRow("Status", "", { chip: "identified" }),
    recordRow("Came in through", "QR · Freshers' Fair stand"),
    recordRow("First contact", "28 April 2026"),
    recordRow("Committed on", "Not yet", { muted: true }),
    recordRow("On WhatsApp · 2026-27", "Not yet", { muted: true }),
  ],
  { proposed: true, colour: "#00695c" },
);

rebuildCard(
  recordCard("SEASON"),
  "EVENTS · 2026-27",
  [
    recordRow("Freshers' Fair · 30 Apr", "Invited · no answer · did not attend"),
    recordRow("Taster 1 · 30 Apr", "Not invited", { muted: true }),
    recordRow("Taster 2 · 7 May", "Not invited", { muted: true }),
  ],
  { proposed: true },
);

rebuildCard(
  recordCard("ATTENDANCE"),
  "WHAT WE HAVE SAID",
  [
    recordRow("Welcome + group invite", "28 Apr · delivered"),
    recordRow("Event invitation", "29 Apr · delivered · no reply"),
    recordRow("Recruit-stage ask", "Not sent", { muted: true }),
  ],
  { proposed: true },
);

rebuildCard(
  recordCard("THEIR OTHER SEASONS"),
  "NOTES",
  [recordRow("Caspian Hallowfield · 28 Apr", "Came to the stand with a friend from Dunsfold.")],
  { proposed: true },
);
