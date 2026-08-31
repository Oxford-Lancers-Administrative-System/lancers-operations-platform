// W9-03 — Sent, and where it lands. The output the first draft was missing.
setHeading("Rosalind Penhaligon");
setSubtitle("Recruit · 2026-27 · opened from the recruit board");
setPersonRows([
  recordRow("Name", "Rosalind Penhaligon"),
  recordRow("Mobile phone", "07700 900318"),
  recordRow("College", "Dunsfold"),
]);
replaceSummaryStrip([
  [{ chip: "identified" }, "Recruitment status"],
  ["Today", "Since we last said anything"],
  ["Sent today", "Recruit-stage ask"],
]);
const banner = proposedBlock("green");
blockTitle(banner, "recruit_details_ask sent to Rosalind");
blockText(banner, "Queued now · you will see delivery below when the provider confirms it");
const first = cardTemplate();
first?.parentElement?.insertBefore(banner, first);
rebuildCard(
  recordCard("ONBOARDING"),
  "WHAT WE HAVE SAID",
  [
    recordRow("recruit_welcome", "28 Apr · delivered · read"),
    recordRow("recruit_interest_ask", "28 Apr · delivered · no reply"),
    recordRow("recruit_gentle_reminder", "29 Apr · delivered · no reply"),
    recordRow("recruit_details_ask", "Today 14:06 · sent by Caspian Hallowfield · queued"),
  ],
  { proposed: true, colour: "#00695c" },
);
rebuildCard(
  recordCard("SEASON"),
  "WHAT THIS DID NOT DO",
  [
    recordRow("Her status", "Unchanged — still identified"),
    recordRow("Why", "Sending is the club talking, not her answering"),
    recordRow("What would move it", "Her reply, or her turning up"),
  ],
  { proposed: true },
);
