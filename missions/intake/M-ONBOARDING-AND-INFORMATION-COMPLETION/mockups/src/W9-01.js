// W9-01 — Where the link lands.
//
// The escalation itself carries a count and a link and no names, because it
// travels over a channel the club does not control the endpoint of — an
// officer's personal phone, possibly shared, possibly outliving their term.
//
// This is what the link opens: the same queue W8 works, scoped to the people
// whose chase has run out. Names appear here because here is behind a login.
const table = queueTable();
setQueueHeading("Missing data · 3 chases have run out");

const last = [
  "Follow-up 5 · 30 Aug · delivered",
  "Follow-up 5 · 28 Aug · delivered",
  "Follow-up 5 · 27 Aug · delivered",
];
const next = ["Stopped · nothing further", "Stopped · nothing further", "Stopped · nothing further"];

addColumn(table, "Last contact", (row, i) => last[i % last.length]);
const nextCells = addColumn(table, "Next", (row, i) => next[i % next.length]);

queueRows().forEach((row) => {
  $$("td", row).at(-1).append(rowButton(row, "Nudge"));
});

// 1 — the count the message carried was 3. This is the 3.
mark($("h1"), 1);
// 2 — five delivered messages, none answered. The cap counts what arrived, so
//     this is a person who received them and did not reply — not one the club
//     failed to reach, which is a different state and a different screen.
mark(nextCells[0], 2);
// 3 — and the one control that restarts it. Only a human, and outside the cap.
mark($$("td", queueRows()[0]).at(-1), 3);

await settle();
