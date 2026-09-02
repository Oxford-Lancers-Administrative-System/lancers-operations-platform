// W8-02 — Several people, one action, and one ask each.
//
// T11-batch-nudge: operators nudge several people at once from the queue, each
// receiving only their own compiled ask. That is not a group message and cannot
// become one — a link is scoped to one person by construction, and
// person_access_tokens permits exactly one live credential per person per
// season.
const table = queueTable();
setQueueHeading("Missing data · 3 selected");

const rows = queueRows();
addColumn(table, "", (row, i) => selectBox(i < 3), { before: 0 });

const last = ["Follow-up 2 · 26 Aug", "The welcome · 12 Aug", "Nudge by Caspian · 1 Sep"];
const next = ["2 Sep", "Chase exhausted", "9 Sep"];
addColumn(table, "Last contact", (row, i) => last[i % last.length]);
const nextCells = addColumn(table, "Next", (row, i) => next[i % next.length]);

rows.forEach((row) => {
  const cell = $$("td", row).at(-1);
  cell.append(rowButton(row, "Nudge"));
});

// 1 — selection, which the queue does not have today.
mark($$("td", rows[0])[0], 1);

// 2 — one action across the three. Each of them gets their own compiled ask,
//     on their own link, carrying only what is outstanding for them.
const heading = $("h1");
const action = rowButton(rows[0], "Nudge 3 people");
action.style.marginLeft = "16px";
heading.after(action);
mark(action, 2);

// 3 — the second person's automated chase has already run out. An operator
//     nudge is outside the cap and is not stopped by that — the queue says so
//     rather than refusing, because that is exactly who a human should be
//     looking at.
mark(nextCells[1], 3);

await settle();
