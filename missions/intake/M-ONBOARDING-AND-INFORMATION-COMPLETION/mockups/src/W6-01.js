// W6-01 — The checklist, with who said it and when.
//
// The record ships and is good. Its Onboarding section already carries a row
// per item, the Required chip, and the outstanding alert. What it cannot say is
// **who** — `provenanceNote` renders "Completed <day>" and nothing else — and it
// has no `claimed`, because the enum has no such value.
//
// This screen marks exactly that, on the shipped rows, and adds no card.
selectRosterNav();

const section = onboardingSection();
setSectionTitle(section, "Onboarding · 3 of 7 resolved");

// 1 — a trust-class item, completed on the player's own word. R2-V: it
//     completes without a human, and carries player-claimed provenance.
const bucs = itemRow(section, "BUCS Play registration");
setRowStatus(bucs, "Complete", ITEM_DONE);
mark(setRowNote(bucs, "Merrick said so, 2 September · player-claimed, no confirmation needed", ITEM_DONE), 1);

// 2 — a verify-class item. The player has said it; nobody has confirmed it.
//     `claimed` is the state the shipped enum does not have.
const hudl = itemRow(section, "Hudl access");
setRowStatus(hudl, "Claimed", ITEM_CLAIMED);
mark(
  setRowNote(hudl, "Merrick said so, 2 September · awaiting the compliance owner", ITEM_CLAIMED),
  2,
);

// 3 — an operator item, and the whole point of the screen: who, not just when.
const kit = itemRow(section, "Kit sorted");
setRowStatus(kit, "Complete", ITEM_DONE);
mark(setRowNote(kit, "Zenas Yaxlington, 30 August · handed over at training", ITEM_DONE), 3);

// 4 — history, not just current state. The record can say an item is complete;
//     it cannot say it was complete, reopened, and completed again.
const subs = itemRow(section, "Subscription paid");
setRowStatus(subs, "Outstanding", ITEM_OPEN);
mark(
  setRowNote(
    subs,
    "Reopened by Caspian Hallowfield, 1 September · was waived 20 August · 3 earlier changes",
    ITEM_OPEN,
  ),
  4,
);

// 5 — derived, display-only, and never flipping membership on its own (R3-C).
const invoiced = itemRow(section, "Subscription invoiced");
setRowStatus(invoiced, "Outstanding", ITEM_OPEN);
mark(setRowNote(invoiced, "Not sent yet · nothing here blocks anything, ever", ITEM_OPEN), 5);

// The shipped alert names the required items still outstanding. Left alone it
// would contradict every row above it, which is the whole failure this mission
// keeps writing down.
setOutstandingAlert(
  section,
  "2 required items are still outstanding: Subscription invoiced, Comms groups joined.",
);

await settle();
