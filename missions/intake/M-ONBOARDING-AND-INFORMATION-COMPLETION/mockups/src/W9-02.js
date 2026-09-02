// W9-02 — What the human did, on the record.
//
// Step three of this workflow is deliberately outside the system: somebody
// rings the player, or catches them at training. The club does not need
// software to have a conversation. What it does need is to remember that the
// conversation happened, and what came of it.
//
// So this is the record's own history markup — the same one W6 uses for the
// activity log — carrying the escalation, the human's own contact, and the
// outcome.
selectRosterNav();

const section = historySection();
setSectionTitle(section, "Activity · every ask and every answer");

const built = replaceHistory(section, [
  ["Contact & academic details", "Asked — follow-up 4", "23 Aug 2026, 09:00 · WhatsApp, delivered"],
  ["Contact & academic details", "Asked — follow-up 5", "30 Aug 2026, 09:00 · WhatsApp, delivered"],
  ["Chase", "Exhausted — stopped, and escalated", "30 Aug 2026, 09:05 · 5 delivered, none answered · President notified"],
  ["Chase", "Contacted by hand", "1 Sep 2026, 18:30 · Caspian Hallowfield · spoke to him after training"],
  ["Contact & academic details", "Answered", "1 Sep 2026, 21:14 · Merrick Thornbury · 4 of 4 remaining fields"],
]);

// 1 — the last message the machine was allowed to send, and that it arrived.
mark(built[1], 1);
// 2 — the chase stopping itself, and the escalation going out. The count is on
//     the record even though it was never in the message.
mark(built[2], 2);
// 3 — the part that happened in a car park. A human, a date, and what they did.
mark(built[3], 3);
// 4 — and what came of it, which is the only reason any of this exists.
mark(built[4], 4);

await settle();
