// W6-02 — Resolving one item, using the control the record already has.
//
// The row's status is an editable field; clicking it opens a Select carrying
// the resolutions. This proposal clicks that real control rather than drawing
// one, so the menu on screen is MUI's own — and adds the single option R2-R
// requires and the shipped list does not have.
selectRosterNav();

const section = onboardingSection();
setSectionTitle(section, "Onboarding · resolving one item");

const subs = itemRow(section, "Subscription paid");
const options = await openRowControl(subs);

// 1 — the resolutions the record ships: complete, waived, not applicable.
mark(options[0].parentElement, 1);

// 2 — and the one it does not. Reopen is the only way back from a terminal
//     state, and it is never automatic: not on a timer, and not at a season
//     boundary on its own.
mark(addMenuOption(options, "Reopen"), 2);

await settle();
