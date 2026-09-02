// W11-01 — Filling the Onboarding section the page already has.
//
// The messaging schedule at main@0a04be7 has three sections: Recruitment,
// Event messaging, and **Onboarding — "Not built yet."** That third section is
// this workflow, and it is already sitting on the page waiting for it.
//
// So this proposal fills that section and touches nothing above it. Recruitment
// and Event messaging are other missions' work; they are not altered, and they
// are not marked.
const { section, row, controls } = fillOnboardingSection({
  label: "Onboarding checklist",
  fields: [
    ["First chase after joining", "2", "h"],
    ["Ask this many times", "5", ""],
    ["Every", "3", "days"],
  ],
  button: "Save onboarding",
});

setSectionNote(
  section,
  "One packet, chased on one link. When the count runs out the chase is exhausted and a person takes over.",
);

// 1 — the section that already exists, and today reads "Not built yet." Moved
//     to sit directly below Recruitment and above Event messaging: the two
//     person-lifecycle chases together, then the events.
mark(section, 1);

// 2 — how long after joining the first chase goes, so it never overtakes the
//     welcome that carries the link.
mark(controls[0], 2);

// 3 — how many times it asks. Counted only when a message actually arrives.
mark(controls[1], 3);

// 4 — and how far apart. There is no fourth value: the chase is over when the
//     count runs out.
mark(controls[2], 4);

await settle();
