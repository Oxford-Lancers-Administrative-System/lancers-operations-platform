// W6-01 — The checklist, with who said it and when.
//
// The record's Onboarding section already renders a row per item, the Required
// chip, the status as plain underlined text, and a small note under it. What it
// cannot say is **who** — `provenanceNote` renders "Completed <day>" and stops —
// and it has no `claimed`, because the enum has no such value.
//
// Everything below uses the note slot the row already has and the status text
// the row already renders. No chip, no colour, no element the record does not
// use elsewhere.
selectRosterNav();

const section = onboardingSection();
setSectionTitle(section, "Onboarding · 3 of 7 resolved");

// 1 — a trust-class item, completed on the player's own word.
const bucs = itemRow(section, "BUCS Play registration");
setRowStatus(bucs, "Complete");
mark(setRowNote(bucs, "Merrick Thornbury, 2 September · player-claimed, trust class"), 1);

// 2 — a verify-class item: said by the player, confirmed by nobody. `claimed`
//     is the state the shipped enum does not have.
const hudl = itemRow(section, "Hudl access");
setRowStatus(hudl, "Claimed");
mark(setRowNote(hudl, "Merrick Thornbury, 2 September · awaiting the compliance owner"), 2);

// 3 — who, not just when.
const kit = itemRow(section, "Kit sorted");
setRowStatus(kit, "Complete");
mark(setRowNote(kit, "Zenas Yaxlington, 30 August"), 3);

// 4 — history, not just current state.
const subs = itemRow(section, "Subscription paid");
setRowStatus(subs, "Pending");
mark(
  setRowNote(
    subs,
    "Reopened by Caspian Hallowfield, 1 September · waived 20 August · 3 earlier changes",
  ),
  4,
);

setOutstandingAlert(
  section,
  "2 required items are still outstanding: Subscription invoiced, Comms groups joined.",
);

await settle();
