// W11-01 — How recruits are separated from everybody else on an event.
//
// Brian, 2026-08-31: "none of the machinery to explain how we separate out
// recruitment recruits from non-recruits."
//
// The first draft answered that with an invented table asserting "6 recruits".
// It should not have: the machinery already ships. `audience-builder.tsx`
// offers a Capacity filter whose Recruits option appears on a Recruitment event
// and nowhere else — D46, in the running code at the baseline. So this screen
// points at the shipped control instead of drawing a replacement for it.

// The order below is the order the marks appear down the page.
//
// 2. The shipped Capacity filter, set to Recruits. This is the separation, and
//    it exists today: D46 puts the Recruits option on a Recruitment event only.
const selects = $$(
  "[data-testid='audience-builder'] .MuiSelect-select, [data-testid='audience-builder'] [role='combobox']",
);
const capacity = selects.find((s) => /all|players|coaches|committee|recruits/i.test(s.textContent));
if (capacity) {
  capacity.textContent = "Recruits (6)";
  mark(capacity.closest(".MuiFormControl-root, .MuiTextField-root") ?? capacity, 2);
}

// 3. The candidate list, filtered to the recruits — the shipped list, with the
//    shipped row treatment.
const candidates = $("[data-testid='candidate-list']");
if (candidates) mark(candidates, 3);

// 1. What each audience is chased with. This is the part that does not exist:
//    one event carries two ladders, and today the player ladder reaches recruits.
const anchor = $("[data-testid='audience-builder']") ?? cardTemplate();
const ladders = proposedRegion("What each audience receives");
ladders.append(
  makeRow(
    "18 players",
    "Invitation now · reminder at 48h · escalation to the President 24h before",
  ),
  makeRow("6 recruits", "Invitation now · one polite follow-up at 48h · then nothing, ever"),
  makeRow("4 coaches", "Invitation now · reminder at 48h"),
);
placeBefore(anchor, ladders);
mark(ladders, 1);

// 4. The approval summary, which omits recruits from its count today —
//    `countByCapacity` filters them out, so an operator approves an event
//    without being told how many recruits it reaches.
const review = $("[data-testid='review-selection']");
if (review) mark(review, 4);
