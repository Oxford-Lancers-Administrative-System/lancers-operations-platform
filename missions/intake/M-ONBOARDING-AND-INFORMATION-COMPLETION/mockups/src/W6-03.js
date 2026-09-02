// W6-03 — The activity log, counted by section.
//
// OD7-log-by-section, Brian 2026-09-01: the record should answer "how often
// have we chased him about this?" rather than only "have we messaged him?".
// A flat list of sends cannot answer that, which is why this is counted per
// section rather than listed per message.
//
// LAN-105, the old Post-MVP home for a per-player activity log, is Canceled.
// This is its only home.
selectRosterNav();

const section = onboardingSection();
setSectionTitle(section, "Activity · asked and answered, by section, since 4 April 2026");

const rows = [
  ["Contact & academic details", "Asked 4 times · answered twice · last asked 1 September", ITEM_OPEN],
  ["Code of Conduct", "Asked twice · signed 2 September", ITEM_DONE],
  ["Photo release", "Asked twice · signed 2 September", ITEM_DONE],
  ["BUCS Play", "Asked 5 times · claimed 2 September · never confirmed", ITEM_CLAIMED],
  ["Hudl access", "Asked 3 times · invitation sent 28 August · no answer", ITEM_OPEN],
  ["Subscription", "Asked once · not due until Hilary", "rgba(0,0,0,.6)"],
];

const built = replaceRows(section, rows);

// A log row has no item status, and the checklist's outstanding alert has
// nothing to say about one either. Both go.
dropOutstandingAlert(section);
for (const row of built) clearRowStatus(row);

// 1 — counted, not listed. Four asks and two answers is a row an operator can
//     act on; forty message rows is not.
mark(must(built[0], "the log built no rows"), 1);

await settle();
