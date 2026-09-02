// W6-02 — Resolving one item: four resolutions, and no reason demanded.
//
// The shipped control offers complete, waived and not applicable. R2-R adds
// reopen, and takes the mandatory reason away — and the database currently
// refuses that second half:
//
//   constraint onboarding_items_waiver_is_justified check (
//     status <> 'waived'
//     or (waived_by_person_id is not null and btrim(coalesce(waived_reason,'')) <> ''))
//
// A live constraint contradicting an approved owner decision. Naming it on the
// screen is the point of this one.
selectRosterNav();

const section = onboardingSection();
setSectionTitle(section, "Onboarding · resolving one item");

const subs = itemRow(section, "Subscription paid");
setRowStatus(subs, "Waived", ITEM_OPEN);
chipRow(subs, [
  chipLike(section, "Complete", ITEM_DONE),
  chipLike(section, "Waive", ITEM_OPEN),
  chipLike(section, "Not applicable", ITEM_OPEN),
  chipLike(section, "Reopen", ITEM_CLAIMED),
]);

// 1 — the four resolutions. Three ship; reopen is new, and it is the only way
//     back from a terminal state — never automatic, never a new season alone.
mark(subs, 1);

// 2 — the author is recorded and the reason is not demanded. The shipped
//     constraint has to be unwound by a forward-only migration for this row to
//     be legal at all.
mark(
  setRowNote(
    subs,
    "Waived by Caspian Hallowfield, 2 September · no reason given, and none asked for",
    ITEM_OPEN,
  ),
  2,
);

// 3 — four-role only. The surrounding record edits at the general-operator
//     floor; resolving an onboarding item does not.
const kit = itemRow(section, "Kit sorted");
mark(setRowNote(kit, "Resolvable by the four-role group only", "rgba(0,0,0,.6)"), 3);

// 4 — and the rule this screen must never contradict: none of these buttons
//     gates anything, for anybody, anywhere.
const photo = itemRow(section, "Squad photo");
mark(setRowNote(photo, "Outstanding · does not stop training, selection or travel", ITEM_OPEN), 4);

setOutstandingAlert(
  section,
  "4 required items are still outstanding: Subscription invoiced, Kit sorted, BUCS Play registration, Comms groups joined.",
);

await settle();
