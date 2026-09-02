// W11-01 — Onboarding's chase, in the grammar the messaging page already uses.
//
// The page's own shape is a lead time, a cadence and a count per row. This uses
// exactly that: how long after joining the first chase goes, how many times it
// asks, and how far apart. Owner direction, 2026-09-02.
//
// What is deliberately absent: any "give up after" value, because it is
// count × interval and setting it twice invites the two to disagree; and any
// escalation field, because what happens after the chase runs out is W9's, not
// a number on this page.
setAdminHeading("Messaging schedule · 2026-27");
setAdminIntro({
  subtitle: "Onboarding",
  intro:
    "How long after somebody joins the club first chases them about their onboarding checklist, how many times it asks, and how far apart.",
  note:
    "The count is only spent when a message actually arrives, so a failure costs nothing. There are no quiet hours. An arriving submission clears whatever was pending; a partial one resets the timer but never the count.",
});

const rows = keepRows(2);

configureRow(rows[0], {
  label: "Onboarding checklist",
  fields: [
    ["First chase after", "2 hours", "From joining. Long enough that the welcome lands first."],
    ["Ask this many times", "5", "Counted only when a message actually arrives."],
    ["Every", "3 days", "The gap between one chase and the next."],
  ],
  button: "Save onboarding checklist",
});

configureRow(rows[1], {
  label: "Practice",
  fields: [
    ["First invitation", "5 days", "Before the event starts."],
    ["WhatsApp", "2", "Messages sent, including the invitation."],
    ["Cadence", "24 hours", "The gap between one reminder and the next."],
  ],
  button: "Save practice",
});

// 1 — how long after joining. The one value this page did not have and needs:
//     a delay, so the chase never overtakes the welcome that carries the link.
mark($$(".MuiTextField-root", rows[0])[0], 1);

// 2 — how many times, and how far apart. Two numbers, and the chase is over
//     when the count runs out. There is no third number to disagree with them.
mark($$(".MuiTextField-root", rows[0])[1], 2);
mark($$(".MuiTextField-root", rows[0])[2], 3);

// 4 — and the grammar it borrows: a lead time, a count, a cadence, which is how
//     every other row on this page already reads.
mark(rowLabel(rows[1]), 4);

await settle();
