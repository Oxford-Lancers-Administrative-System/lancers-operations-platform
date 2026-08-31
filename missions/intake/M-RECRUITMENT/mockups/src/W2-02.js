// W2-02 — The same page for a recruit further along: in the group, ask
// answered, two events attended.
setHeading("Tobias Wrenfield");
setSubtitle("Recruit · 2026-27 · opened from the recruit board");
replaceSummaryStrip([
  [{ chip: "engaged" }, "Recruitment status"],
  ["9 days", "Since first contact"],
  ["3", "Events invited to"],
  ["2", "Events attended"],
  ["Answered", "Recruit-stage ask"],
]);
setPersonRows([
  recordRow("Name", "Tobias Wrenfield"),
  recordRow("Aliases", "Toby"),
  recordRow("Mobile phone", "07700 900624"),
  recordRow("Personal email", "t.wrenfield@mail.example"),
  recordRow("College", "Marlbrook"),
  recordRow("Matriculation year", "2025"),
  recordRow("Expected graduation", "2028"),
  recordRow("Degree field", "Not recorded", { muted: true }),
]);

rebuildCard(
  recordCard("ONBOARDING"),
  "RECRUITMENT",
  [
    recordRow("Status", "", { chip: "engaged" }),
    recordRow("Came in through", "Walk-on · Taster session 1"),
    recordRow("First contact", "30 April 2026"),
    recordRow("Committed on", "Not yet", { muted: true }),
    recordRow("On WhatsApp · 2026-27", "In the group · recorded 2 May"),
  ],
  { proposed: true, colour: "#00695c" },
);

rebuildCard(
  recordCard("SEASON"),
  "EVENTS · 2026-27",
  [
    recordRow("Freshers' Fair · 30 Apr", "Invited · said yes · attended"),
    recordRow("Taster 1 · 30 Apr", "Invited · said yes · attended"),
    recordRow("Taster 2 · 7 May", "Invited · no answer yet"),
  ],
  { proposed: true },
);

rebuildCard(
  recordCard("ATTENDANCE"),
  "WHAT WE HAVE SAID",
  [
    recordRow("Welcome + group invite", "30 Apr · delivered"),
    recordRow("Recruit-stage ask", "1 May · delivered · answered 2 May"),
    recordRow("Event invitation · Taster 2", "6 May · delivered"),
  ],
  { proposed: true },
);

rebuildCard(
  recordCard("THEIR OTHER SEASONS"),
  "WHAT HE TOLD US",
  [
    recordRow("Played before", "A bit at school"),
    recordRow("Position interest", "Anywhere, happy to be told"),
    recordRow("Gear owned", "Boots only"),
    recordRow("How he heard of us", "Friend on the team"),
  ],
  { proposed: true },
);
