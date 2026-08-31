// W13-02 — Bringing somebody back. disengaged is explicitly recoverable, and
// people resurface in Hilary.
const box = proposedBlock("green");
blockTitle(box, "Clementine Varrow is back");
const rows = document.createElement("div");
rows.style.cssText =
  "display:grid;grid-template-columns:auto 1fr;gap:7px 18px;margin-top:8px;font-size:13.5px";
for (const [k, v] of [
  ["Was", "disengaged \u2014 recorded 12 May"],
  ["Now", "engaged"],
  ["Because", "She messaged the group in Hilary and asked about training"],
  ["Her record", "Untouched \u2014 no new person, no second recruit row"],
  ["Her signals", "Both events, both invitations, what she answered"],
  ["Her notes", "All of them, with their original authors and dates"],
]) {
  const a = document.createElement("div");
  a.textContent = k;
  a.style.cssText = "font-weight:700;white-space:nowrap";
  const b = document.createElement("div");
  b.textContent = v;
  rows.append(a, b);
}
box.append(rows);
const h1 = $("h1");
(h1?.parentElement?.parentElement ?? document.body).insertBefore(
  box,
  h1?.parentElement?.nextSibling ?? null,
);
