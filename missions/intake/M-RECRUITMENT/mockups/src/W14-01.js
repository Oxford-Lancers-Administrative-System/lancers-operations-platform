// W14-01 — The jump-out that interrupts the flip to joined.
//
// Rebuilt 2026-08-31. Brian, on the drawn panel this replaces: "Why is it that
// it has that big fucking tall green callout at the top like that?... It should
// be a page over the recruit page, like a jump-out that says there and just
// explains what happens to them when you click Enter and they join. That's
// good. It's fine."
//
// So it is a dialog over the board the operator is already standing on, not a
// card floating on grey, and the explanation of narration that used to sit
// inside the frame is gone — the frame shows the product, the prose is the
// screen head.
//
// This is the one place in W13 and W14 that gets an interruption. Brian, same
// day: "We don't need fucking callouts for this thing. The only time we need it
// is for Join." Declining, disengaging and coming back are one chip each.
buildRecruitBoard();

const { scrim, head } = confirmDialog({
  title: "Add Marguerite Ashdown to 2026-27?",
  body: "Joining is a membership, and it is the hand-off out of recruitment.",
  rows: [
    ["Creates", "A season membership for 2026-27"],
    ["Puts them on", "The roster, as joined"],
    ["Opens", "Onboarding — 12 items"],
    ["Does not", "Make them active. That stays a separate later step"],
    ["Recorded as", "Flipped by Caspian Hallowfield, Secretary · audited"],
  ],
  confirm: "ADD TO THE SEASON",
});

mark(head, 1);

await settle();
