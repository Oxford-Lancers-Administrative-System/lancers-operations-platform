// W11-01 — Onboarding's chase, added to the page that already sets how the club
// messages people.
//
// The app already has this structure: a section per thing the club messages
// about, each with a lead time, a count and a cadence. Onboarding needs the same
// treatment. So this proposal ADDS one section and changes nothing else — every
// shipped row below it is untouched, unmarked, and none of this mission's
// business.
//
// The previous draft repurposed real event rows into onboarding rows and marked
// one of them, which implied this mission was changing how practices are
// messaged. It is not touching events at all.
setAdminHeading("Messaging schedule · 2026-27");

const onboarding = addSection({
  label: "Onboarding checklist",
  fields: [
    ["First chase after", "2 hours", "From joining. Long enough that the welcome carrying the link lands first."],
    ["Ask this many times", "5", "Counted only when a message actually arrives."],
    ["Every", "3 days", "The gap between one chase and the next. When the count runs out the chase is exhausted."],
  ],
  button: "Save onboarding checklist",
});

// 1 — the whole of this mission's change to this page: one new section, for the
//     one packet onboarding sends.
mark(onboarding, 1);

// 2 — how long after joining. The one value the page has no equivalent of: a
//     delay measured from a person joining rather than from an event starting.
mark($$(".MuiTextField-root", onboarding)[0], 2);

// 3 — how many times, and how far apart. There is no third number: the chase is
//     over when the count runs out.
mark($$(".MuiTextField-root", onboarding)[1], 3);
mark($$(".MuiTextField-root", onboarding)[2], 4);

await settle();
