// W11-02 — Choosing the audience, and what each one receives.
//
// Renumbered on 2026-08-31: this is the second step, after the event's Type.
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
  // The seeded counts, not invented ones. The page's own group chips say
  // ALL ACTIVE PLAYERS (32), ALL ACTIVE COACHES (3) and RECRUITS (2); a panel
  // above them claiming 18, 4 and 6 is the screen contradicting the screen.
  capacity.textContent = "Recruits (2)";
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
    "32 players",
    "Invitation now · reminder at 48h · escalation to the President 24h before",
  ),
  makeRow("2 recruits", "Invitation now · one further template at 48h · then nothing, ever"),
  makeRow("3 coaches", "Invitation now · reminder at 48h"),
);
placeBefore(anchor, ladders);
mark(ladders, 1);

// 4. The approval summary, which omits recruits from its count today —
//    `countByCapacity` filters them out, so an operator approves an event
//    without being told how many recruits it reaches.
const review = $("[data-testid='review-selection']");
if (review) mark(review, 4);

// The Capacity filter says "Recruits (2)" — so the list under it must BE the
// recruits. Setting a shipped select's label without filtering left the chip
// reading Recruits over all forty people, which is the screen asserting
// something the screen disproves two inches lower.
//
// React owns the real filter and a scripted value set does not re-run it, so the
// rows that the filter would remove are removed here.
const recruitRows = $$('[data-testid="audience-candidate"], li, tr').filter((n) =>
  /Player · |Coach · |Committee · |Recruit · /.test(n.innerText ?? ""),
);
must(recruitRows, "the audience builder rendered no candidate rows");
let kept = 0;
for (const row of recruitRows) {
  if (/Recruit · /.test(row.innerText)) {
    kept += 1;
    continue;
  }
  row.remove();
}
if (kept === 0) throw new Error("Filtering to recruits removed every row.");

await settle();
