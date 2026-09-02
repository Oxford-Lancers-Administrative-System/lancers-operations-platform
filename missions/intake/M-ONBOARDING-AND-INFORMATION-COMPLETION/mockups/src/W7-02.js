// W7-02 — After it is settled: flag, correction and confirmation, each
// attributable.
//
// The frozen inventory's own wording for this workflow is "resolves it, leaving
// flag, correction and confirmation each attributable". The person record
// already has the surface for that: a history section, expandable, filterable
// by field and by actor, with every entry naming who.
//
// So this screen changes the history's entries and nothing else.
const rows = $$('[data-testid="history-row"], li, div').filter(
  (n) => /college/i.test(n.textContent ?? "") && n.children.length > 0,
);
must(rows, "the person record shows no history to extend");

const college = factRow("College");

// 1 — the fact, settled. One value stands; the other is retained, never deleted.
setFactValue(college, "Brasenose");
setFactBadge(college, "Confirmed by Caspian Hallowfield, 2 Sep");
mark(college, 1);
mark(addFactLine(college, "Was Farrowgate", byBadge("Kept, superseded 2 Sep")), 2);

await settle();
