// W11-02 — What dropping the flag actually removes.
//
// Brian, 2026-09-01: "Yes, drop the flag/not flag distinction, please." The
// approved item-and-ask inventory records the consequence: "This supersedes
// Task 10 R3-G's retention of 'required' as a display flag."
//
// Two shipped things lose their meaning with it, and both are on W6's approved
// screens because both ship today. A decision recorded only in a brief is a
// decision nobody sees until implementation, so this photographs it.
selectRosterNav();

const section = onboardingSection();
setSectionTitle(section, "Onboarding · 3 of 7 resolved");

// 1 — the Required chip, on every row that carries one today. With the flag
//     gone it marks nothing: every item counts the same, and the Monday queue
//     ranks a person by everything outstanding.
const chips = $$(".MuiChip-root", section).filter((c) => /required/i.test(c.textContent ?? ""));
must(chips, "no Required chips on this record");
for (const chip of chips) {
  chip.style.opacity = "0.35";
  chip.style.textDecoration = "line-through";
}
mark(chips[0], 1);

// 2 — and the alert beneath, which counts only the flagged ones. It becomes a
//     plain count of everything outstanding, which is what the queue already
//     ranks by.
mark(
  setOutstandingAlert(section, "4 items are still outstanding: Subscription invoiced, Subscription paid, Squad photo, Comms groups joined."),
  2,
);

await settle();
