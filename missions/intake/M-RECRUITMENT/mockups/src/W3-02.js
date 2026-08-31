// W3-02 — Where one recruit is in the sign-on ladder, on her own record. This
// replaces the invented chat thread: what exists is a sequence of templates
// with delivery receipts, not a conversation.
setHeading("Rosalind Penhaligon");
setSubtitle("Recruit · 2026-27 · opened from the recruit board");
setPersonRows([
  recordRow("Name", "Rosalind Penhaligon"),
  recordRow("Mobile phone", "07700 900318"),
  recordRow("College", "Dunsfold"),
]);
replaceSummaryStrip([
  [{ chip: "identified" }, "Recruitment status"],
  ["2 of 5", "Sign-on steps done"],
  ["Not yet", "In the community group"],
]);
rebuildCard(
  recordCard("ONBOARDING"),
  "SIGN-ON",
  [
    recordRow("1 · recruit_welcome", "28 Apr 16:42 · delivered · read"),
    recordRow("2 · She accepted", "28 Apr 16:48 · replied YES"),
    recordRow("3 · recruit_interest_ask", "28 Apr 16:49 · delivered · no reply"),
    recordRow("4 · recruit_gentle_reminder", "29 Apr 10:00 · delivered · no reply"),
    recordRow("5 · recruit_details_ask", "Not sent — waiting on step 3", { muted: true }),
  ],
  { proposed: true, colour: "#00695c" },
);
rebuildCard(
  recordCard("SEASON"),
  "WHAT THE CLUB CAN SEE",
  [
    recordRow("Delivered", "Yes — the provider confirmed it"),
    recordRow("Read", "Yes — stored today and mapped to nothing"),
    recordRow("She replied", "Only because YES is a reply we asked for"),
    recordRow("In the community group", "Not observable — she tells us, or we do not know", {
      muted: true,
    }),
  ],
  { proposed: true },
);
