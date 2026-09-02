// W10-02 — Active, with an unfinished checklist.
//
// R3: this is the normal case, not an exception. Activation completes nothing,
// waives nothing and closes nothing — every outstanding item stays outstanding,
// stays chased by W8, and stays on the record.
//
// So the point of this screen is what is *absent* from it: no warning, no
// blocked action, nothing flagged, and a chase that carries on exactly as it
// did the day before.
selectRosterNav();

const onboarding = onboardingSection();
setSectionTitle(onboarding, "Onboarding · 3 of 7 resolved");

// 1 — still three of seven, the day after activation. Nothing about becoming
//     active resolved, waived or closed a single item.
mark(onboarding, 1);

// 2 — and the alert still names what is outstanding, in the same words it used
//     while they were onboarding.
mark(
  setOutstandingAlert(
    onboarding,
    "2 required items are still outstanding: Subscription invoiced, Comms groups joined.",
  ),
  2,
);

// 3 — active. The only gate this mission has, and it gates squad membership
//     rather than anything a checklist could withhold.
const season = must($('[data-testid="section-season"]'), "this page has no season section");
const status = must(
  season.querySelector('[data-testid="record-row"][data-label="Status"]'),
  "the season section has no status row",
);
setMembershipChip(status, "Active");
mark(status, 3);

await settle();
