// W10-01 — Activation, on the control that already ships.
//
// This workflow adds nothing to the flip. setMembershipStatus exists, the
// Season section's Status field is an editable select carrying all five
// statuses, and every flip is written append-only.
//
// Mission 5 also already considered the one thing W10 might have added, and
// withdrew it — from membership.ts's own header: "a warn-only confirmation on
// `onboarding → active` was proposed and then withdrawn in the same
// walkthrough". That is this exact transition.
selectRosterNav();

const onboarding = onboardingSection();
setSectionTitle(onboarding, "Onboarding · 3 of 7 resolved");

// 1 — the context, and it is the page. The checklist sits directly above the
//     status field on the same record; re-presenting it inside the control
//     would be the withdrawn confirmation wearing a different hat.
mark(onboarding, 1);

// 2 — the control, unchanged. Open, showing the five statuses this record has
//     always been able to flip between since Q-12 removed the transition table.
const season = must($('[data-testid="section-season"]'), "this page has no season section");
const status = must(
  season.querySelector('[data-testid="record-row"][data-label="Status"]'),
  "the season section has no status row",
);
const field = must(
  status.querySelector('[data-testid="editable-field"]'),
  "the status row is not editable",
);
field.click();
await settle(6);
mark(must($$(".MuiMenuItem-root"), "the status control opened no menu")[1].parentElement, 2);

await settle();
