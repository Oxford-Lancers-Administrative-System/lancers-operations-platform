// W5-03 — Saved: the walk-up is in the Walk-ups section.
//
// Brian, 2026-08-31: "I should see the walk-ons, and they should have their own
// section that's there. That's important when the walk-on gets added. I don't
// like the extra text. I think a smaller text box that says 'Walkup added' is
// perfectly fine, as long as it disappears if multiple walkups get added."
//
// Both halves of that are about things that already exist.
//
// The section is shipped: `attendance-groups.tsx` renders a **Walk-ups** group,
// open by default, drawn only when it holds somebody — and its own comment says
// why it opens, "closing the only confirmation that the walk-up was recorded".
// It reads 0 here because the seeded event has no walk-ups, so this screen puts
// Marguerite in it by CLONING the sheet's own group and row markup.
//
// The long green line is shipped too — "Walk-on recorded. They are in
// recruitment as somebody to follow up, and were not put on the roster." That is
// the extra text. It shrinks to "Walk-up added", because the section below it is
// now the thing that says what happened.

// ---- 1. The section, cloned from the sheet's own group --------------------
const groups = must(
  document.querySelector('[data-testid="attendance-groups"]'),
  "the sheet has no attendance-groups container",
);
const attending = must(
  document.querySelector('[data-testid="attendance-group-attending"]'),
  "the sheet has no Attending group to clone",
);
const walkUps = attending.cloneNode(true);
walkUps.setAttribute("data-testid", "attendance-group-walk_ups");

const heading = must(
  walkUps.querySelector('[data-testid^="attendance-group-toggle-"]'),
  "the cloned group has no toggle",
);
heading.setAttribute("data-testid", "attendance-group-toggle-walk_ups");
// LEAF nodes only. Matching on `textContent` alone hit the wrapper whose text
// contains both lines, so setting it wiped the group's name and left only the
// detail — the section rendered as "Written down on the day" with no "Walk-ups".
for (const node of heading.querySelectorAll("*")) {
  if (node.children.length > 0) continue;
  const text = node.textContent.trim();
  if (text === "Attending") node.textContent = "Walk-ups";
  else if (/Said yes to this event/i.test(text)) node.textContent = "Written down on the day";
}
const count = walkUps.querySelector('[data-testid^="attendance-group-count-"]');
if (count) {
  count.setAttribute("data-testid", "attendance-group-count-walk_ups");
  count.textContent = "1";
}

// One row, hers, from the sheet's own row markup.
const rows = [...walkUps.querySelectorAll('[data-testid="attendance-row"]')];
must(rows, "the cloned group has no attendance row");
const row = rows[0];
for (const extra of rows.slice(1)) extra.remove();
const name = must(row.querySelector(".MuiTypography-body1"), "the row has no name line");
name.textContent = "Marguerite Ashdown";
const rsvpLine = row.querySelector(".MuiTypography-body2");
if (rsvpLine) rsvpLine.textContent = "Walk-up · never invited";
groups.append(walkUps);
mark(walkUps, 1);

// ---- 2. The count in the strip -------------------------------------------
const walkUpCount = must(
  document.querySelector('[data-testid="count-walk-ups"]'),
  "the sheet has no Walk-ups count",
);
const figure = must(
  walkUpCount.querySelector(".MuiTypography-h6, .MuiTypography-root"),
  "the Walk-ups count has no figure",
);
figure.textContent = "1";

// ---- 3. The shipped line, shortened --------------------------------------
const recorded = must(
  [...document.querySelectorAll(".MuiAlert-root")].find((a) =>
    /walk-on recorded/i.test(a.innerText),
  ),
  "the sheet is not showing its walk-on confirmation",
);
const message = must(
  recorded.querySelector(".MuiAlert-message") ?? recorded,
  "the confirmation has no message",
);
message.textContent = "Walk-up added";
recorded.style.padding = "2px 12px";
recorded.style.fontSize = "13px";
mark(recorded, 2);

await settle();
