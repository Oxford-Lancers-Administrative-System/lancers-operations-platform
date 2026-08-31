// W9-01 — Where you hit the button: her own record, beside the actions that
// already exist. Not a queue — Mission 4's Follow-ups queue chases members who
// owe the club an answer, and a recruit owes nothing.
setHeading("Rosalind Penhaligon");
setSubtitle("Recruit · 2026-27 · opened from the recruit board");
setPersonRows([
  recordRow("Name", "Rosalind Penhaligon"),
  recordRow("Mobile phone", "07700 900318"),
  recordRow("College", "Dunsfold"),
]);
replaceSummaryStrip([
  [{ chip: "identified" }, "Recruitment status"],
  ["11 days", "Since we last said anything"],
  ["Not sent", "Recruit-stage ask"],
]);
const existing = $$("a, button").find((b) => /open the person record/i.test(b.textContent));
if (existing) {
  const btn = document.createElement("span");
  btn.textContent = "SEND HER SOMETHING →";
  btn.style.cssText =
    "background:#00695c;color:#fff;font-size:12.5px;font-weight:700;letter-spacing:.04em;padding:7px 14px;border-radius:6px;margin-right:14px";
  existing.parentElement?.insertBefore(btn, existing);
}
rebuildCard(
  recordCard("ONBOARDING"),
  "WHAT WE HAVE SAID",
  [
    recordRow("recruit_welcome", "28 Apr · delivered · read"),
    recordRow("recruit_interest_ask", "28 Apr · delivered · no reply"),
    recordRow("recruit_gentle_reminder", "29 Apr · delivered · no reply"),
    recordRow("Since then", "Nothing, for eleven days", { muted: true }),
  ],
  { proposed: true, colour: "#00695c" },
);
