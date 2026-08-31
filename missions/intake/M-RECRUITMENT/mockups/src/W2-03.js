// W2-03 — Where one recruit has reached in the sign-on ladder, on her own
// record. Moved here from W3 when Brian folded that workflow into the doors and
// W10 on 2026-08-31.
//
// This replaces an invented WhatsApp chat thread. What exists is a sequence of
// templates with delivery receipts, not a conversation — nobody types to a
// recruit, so there is no thread to draw.
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
// 1. The ladder, step by step, with the delivery state of each.
mark(
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
  ),
  1,
);
// 2. What the club can honestly claim to know, and what it cannot. Group
//    membership is not observable through the Cloud API at all.
mark(
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
  ),
  2,
);
