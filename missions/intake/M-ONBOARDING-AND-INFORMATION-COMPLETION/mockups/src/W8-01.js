// W8-01 — The queue, with what it cannot say today.
//
// Mission 5 shipped this table knowing nothing acted on it yet: Name, Status,
// To the club, Missing, and a Correct button. It can tell an operator who is
// behind. It cannot tell them whether anybody has asked.
//
// T11-visibility is two columns, and they turn a list of gaps into a list a
// person can work.
const table = queueTable();
setQueueHeading("Missing data · 6 people, sorted by how far behind");

const last = [
  "Follow-up 2 · 26 Aug",
  "The welcome · 12 Aug",
  "Nudge by Caspian · 1 Sep",
  "Follow-up 3 · 29 Aug",
  "The welcome · 12 Aug",
  "Follow-up 1 · 19 Aug",
];
const next = [
  "2 Sep",
  "Chase exhausted",
  "9 Sep",
  "Unmessageable · no consent",
  "16 Sep",
  "Delivery failed · needs a person",
];

// 1 — when they were last contacted, and what kind it was. A welcome sent three
//     weeks ago and a nudge sent yesterday are not the same situation.
const lastCells = addColumn(table, "Last contact", (row, i) => last[i % last.length]);
mark(lastCells[0], 1);

// 2 — and when the machine will write next, or that it will not. Three of these
//     say it will not, and each of those is a person a human has to handle.
const nextCells = addColumn(table, "Next", (row, i) => next[i % next.length]);
mark(nextCells[1], 2);

// 3 — the queue can only correct today. This is the action it is missing.
queueRows().forEach((row) => {
  const cell = $$("td", row).at(-1);
  cell.append(rowButton(row, "Nudge"));
});
mark($$("td", queueRows()[0]).at(-1), 3);

await settle();
