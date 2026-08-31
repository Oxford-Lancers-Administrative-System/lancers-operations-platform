// W9-01 — Where you hit the button. The entry point is the recruit, not a
// queue: her own record carries the action, and so does her row on the board.
setHeading("Rosalind Penhaligon");
dedupeHeaderChip("Recruit");

// The action, in the page's own header, beside the actions that already exist.
const header = $("h1")?.parentElement?.parentElement ?? document.body;
const existing = $$("a, button").find((b) => /correct this record/i.test(b.textContent));
if (existing) {
  const btn = existing.cloneNode(true);
  btn.textContent = "MESSAGE HER";
  btn.style.background = "#00695c";
  btn.style.color = "#fff";
  btn.style.border = "none";
  existing.parentElement.insertBefore(btn, existing);
}

appendCard(
  "Where they are in recruitment",
  [
    makeRow("Status", "", { chip: "identified" }),
    makeRow("Came in through", "QR · Freshers' Fair stand"),
    makeRow("First contact", "28 April 2026"),
  ],
  "",
);
appendCard(
  "What we have said",
  [
    makeRow("Welcome + group invite", "28 Apr · delivered"),
    makeRow("Event invitation", "29 Apr · delivered · no reply"),
  ],
  "Nothing since 29 April. This is what makes an operator want the button — and the button is here, on her, not in a queue somewhere else.",
);
