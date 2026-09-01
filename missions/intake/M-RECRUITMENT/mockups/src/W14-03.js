// W14-03 — The flip refused: they are already on the team.
//
// Rebuilt 2026-08-31. The drawn panel with its footnote about Task 09 D7 is
// gone; a refusal is not a place for an essay. It is the same jump-out as
// W14-01 — the operator pressed the same control and the product answered in
// one sentence and one fact — so nothing new is introduced to say no.
//
// This is a constraint refusing, not a duplicate check. Invariant I2 — one
// membership per person per season — is the only guard at the flip, because the
// person has existed for weeks by the time anyone presses this.
buildRecruitBoard();

const { head } = confirmDialog({
  title: "Marguerite Ashdown is already on the team",
  body: "They hold a 2026-27 membership, so there is nothing to flip.",
  rows: [
    ["They hold", "2026-27 · onboarding · created 9 May"],
    ["The rule", "One membership per person per season — invariant I2"],
    ["Written", "Nothing"],
    ["Instead", "Open their roster record"],
  ],
  confirm: "OPEN THEIR RECORD",
  cancel: "CLOSE",
});

mark(head, 1);

await settle();
