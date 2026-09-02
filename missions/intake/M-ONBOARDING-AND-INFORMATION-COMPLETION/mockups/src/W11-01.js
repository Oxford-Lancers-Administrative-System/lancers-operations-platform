// W11-01 — Onboarding's chase, on the club's messaging schedule.
//
// The onboarding checklist is one packet — the approved item-and-ask inventory
// — and it goes out as one thing. Nobody configures which items are on it and
// nobody is assigned one. The only thing left to set is the chase.
//
// Brian, 2026-09-02: "It should just define how many times we are going to
// chase them, how often we are going to chase them, and how long before the
// chase exhausts. That's it."
setAdminHeading("Messaging schedule · 2026-27");
setAdminIntro({
  subtitle: "2 chases",
  intro:
    "How many times the club chases somebody about the onboarding checklist, how often, and how long before it gives up and tells a person.",
  note:
    "The cap counts messages that actually arrived, so a failure consumes nothing. There are no quiet hours. An arriving submission clears whatever follow-ups were pending; a partial one resets the timer but never the cap.",
});

const rows = keepRows(2);

configureRow(rows[0], {
  label: "Onboarding checklist",
  fields: [
    ["Chase this many times", "4", "Counted only when a message actually arrives. A failure consumes nothing."],
    ["Every", "7 days", "The gap between one chase and the next."],
    ["Give up after", "35 days", "Then it stops for good and a person takes over."],
    ["Tell", "President", "The office an exhausted chase escalates to. Never a named person."],
  ],
  button: "Save onboarding checklist",
});

configureRow(rows[1], {
  label: "Recruit ladder",
  fields: [
    ["Chase this many times", "3", "Mission 6's, and unchanged by this mission."],
    ["Every", "5 days", "The gap between one chase and the next."],
  ],
  button: "Save recruit ladder",
});

// 1 — how many times. The cap, and it counts what arrived: LAN-93's delivery
//     callbacks are what make "exhausted" a fact rather than a guess.
mark($$(".MuiTextField-root", rows[0])[0], 1);
// 2 — how often, and how long before it gives up. Three numbers, and that is
//     the whole of the configuration.
mark($$(".MuiTextField-root", rows[0])[2], 2);
// 3 — the escalation office. W9 depends on this and nothing else sets it, and
//     it is an office rather than a person because presidents change.
mark($$(".MuiTextField-root", rows[0])[3], 3);
// 4 — beside the recruit ladder, which is Mission 6's and which this mission
//     does not touch.
mark(rowLabel(rows[1]), 4);

await settle();
