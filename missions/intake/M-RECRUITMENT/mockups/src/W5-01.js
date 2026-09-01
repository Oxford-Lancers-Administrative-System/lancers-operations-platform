// W5-01 — The attendance sheet, and the way in.
//
// Unchanged from what ships. Brian, 2026-08-31: "This flow should be identical
// to the way the roster works right now." So the control is the shipped
// ADD WALK-UP, not a relabelled one — an earlier draft renamed it ADD A WALK-ON
// and that was an invention.
//
// The only thing this screen says is where the flow starts.
mark(
  must(
    $$("a, button").find((b) => /add walk-up/i.test(b.textContent)),
    "the attendance sheet has no ADD WALK-UP control",
  ),
  1,
);

await settle();
