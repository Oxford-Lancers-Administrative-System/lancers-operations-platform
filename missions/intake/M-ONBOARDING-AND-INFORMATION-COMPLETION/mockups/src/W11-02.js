// W11-02 — Where this actually lives, and why that is a decision.
//
// `messaging_schedules` is keyed by `event_type` — one row each for practice,
// strength and conditioning, chalk, game, social. Mission 6 added the recruit
// ladder to it as two columns, and both are null on all five rows, because
// recruitment's cadence has nothing to do with practices or games.
//
// Onboarding fits that grain even less. This screen photographs the table as it
// actually is, so the shape question is visible rather than described.
setAdminHeading("Messaging schedule · what the table is actually keyed by");
setAdminIntro({
  subtitle: "5 event types",
  intro:
    "Every row in messaging_schedules is an event type. The recruit ladder was added to it as two columns, and they are null on all five rows.",
  note:
    "Recruitment's cadence is not a property of a practice, and onboarding's is not either. Four more columns here would be null five times over.",
});

const rows = keepRows(5);
const events = [
  ["Practice", "recruit_invitation_lead_days · null", "recruit_follow_up_cadence_hours · null"],
  ["Strength and conditioning", "recruit_invitation_lead_days · null", "recruit_follow_up_cadence_hours · null"],
  ["Chalk", "recruit_invitation_lead_days · null", "recruit_follow_up_cadence_hours · null"],
  ["Game", "recruit_invitation_lead_days · null", "recruit_follow_up_cadence_hours · null"],
  ["Social", "recruit_invitation_lead_days · null", "recruit_follow_up_cadence_hours · null"],
];

rows.forEach((row, i) => {
  configureRow(row, {
    label: events[i][0],
    fields: [
      ["Recruit lead days", "—", events[i][1]],
      ["Recruit cadence", "—", events[i][2]],
    ],
    button: `Save ${events[i][0].toLowerCase()}`,
  });
});

// 1 — the grain. Every row here is an event type, and the club's recruitment
//     cadence is not a property of a practice.
mark(rowLabel(rows[0]), 1);
// 2 — the two columns Mission 6 added, null on all five rows, because there is
//     no event they belong to.
mark($$(".MuiTextField-root", rows[0])[0], 2);
// 3 — and the same emptiness repeated on every row. Adding four more columns
//     for onboarding would repeat it four more times.
mark($$(".MuiTextField-root", rows[4])[1], 3);

await settle();
