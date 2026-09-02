// W6-03 — The activity log: every ask and every answer, individually.
//
// Owner direction, 2026-09-02: the first draft gave one summary line per
// section and "that is just not useful… I want to see the individual items that
// come underneath, when it was asked versus when it was received."
//
// So this is the record's own `StatusHistory` markup — the shipped pattern for
// a dated log, already on this page — with its entries replaced. Nothing here
// is a component the record does not already use.
selectRosterNav();

const section = historySection();
setSectionTitle(section, "Activity · every ask and every answer");

const built = replaceHistory(section, [
  ["Contact & academic details", "Asked — the welcome", "12 Aug 2026, 09:00 · WhatsApp, delivered"],
  ["Contact & academic details", "Asked — follow-up 1", "19 Aug 2026, 09:00 · WhatsApp, delivered"],
  ["Contact & academic details", "Answered", "20 Aug 2026, 18:42 · Merrick Thornbury · 6 of 10 fields"],
  ["Contact & academic details", "Asked — follow-up 2", "26 Aug 2026, 09:00 · WhatsApp, delivered"],
  ["Contact & academic details", "Asked — nudge", "1 Sep 2026, 11:04 · Caspian Hallowfield, by hand"],
  ["Code of Conduct", "Asked — the welcome", "12 Aug 2026, 09:00 · WhatsApp, delivered"],
  ["Code of Conduct", "Agreed", "2 Sep 2026, 19:03 · Merrick Thornbury · version 1"],
  ["BUCS Play", "Asked — follow-up 3", "29 Aug 2026, 09:00 · WhatsApp, delivered"],
  ["BUCS Play", "Claimed", "2 Sep 2026, 19:05 · Merrick Thornbury · not yet confirmed"],
  ["Hudl access", "Invitation sent", "28 Aug 2026, 14:20 · Zenas Yaxlington"],
  ["Hudl access", "Asked — follow-up 1", "1 Sep 2026, 09:00 · WhatsApp, delivered"],
]);

// 1 — one entry per event, asked and answered alike, in the pattern this page
//     already uses for status changes.
mark(built[0], 1);
// 2 — an answer, against the asks above it. Four asks and one partial answer is
//     the shape of a real chase, and it is not visible in a summary count.
mark(built[2], 2);
// 3 — the section that has been asked repeatedly and answered by the player but
//     never confirmed by the club. That gap is the one the queue cannot see.
mark(built[8], 3);
// 4 — and the item whose first half is the club's own: an invitation the club
//     sent, before any ask of the player at all.
mark(built[9], 4);

await settle();
