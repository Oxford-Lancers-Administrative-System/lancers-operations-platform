// W8-03 — The three the machine will not write to again.
//
// "Next: never" is not one state. Each of these is a different reason and a
// different human job, and a queue that collapsed them into a blank cell would
// hide all three.
const table = queueTable();
setQueueHeading("Missing data · 3 people the machine has stopped writing to");

const next = [
  "Chase exhausted · 5 delivered, none answered",
  "Unmessageable · consent withdrawn 28 Aug",
  "Delivery failed · number unreachable 29 Aug",
];
const last = ["Follow-up 5 · 30 Aug", "The welcome · 12 Aug", "Follow-up 3 · 29 Aug"];

addColumn(table, "Last contact", (row, i) => last[i % last.length]);
const nextCells = addColumn(table, "Next", (row, i) => next[i % next.length]);

// 1 — exhausted. The chase stopped itself after the configured number of
//     messages that actually arrived, and W9 is what happens next.
mark(nextCells[0], 1);
// 2 — unmessageable. No basis to send, so nothing is sent — and the person is
//     not silently dropped from the list either.
mark(nextCells[1], 2);
// 3 — terminal delivery failure. No automated email is sent in its place, and
//     the cap is not burned by a message that never arrived.
mark(nextCells[2], 3);

await settle();
