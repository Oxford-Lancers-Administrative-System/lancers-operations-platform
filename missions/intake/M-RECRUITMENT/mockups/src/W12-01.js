// W12-01 — Recruits at the top. The sheet derives its roster from memberships,
// so invited recruits do not appear on it at all today.
const groups = $$("h2, h3, .MuiTypography-h6").filter((h) =>
  /attending|everyone else/i.test(h.textContent),
);
const box = proposedBlock("teal");
blockTitle(box, "Recruits · invited to this event");
const list = document.createElement("div");
list.style.cssText = "margin-top:8px";
for (const n of [
  "Rosalind Penhaligon",
  "Tobias Wrenfield",
  "Marguerite Ashdown",
  "Clementine Varrow",
]) {
  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.08)";
  const name = document.createElement("div");
  name.textContent = n;
  name.style.cssText = "font-size:14px;font-weight:600";
  const states = document.createElement("div");
  states.style.cssText = "display:flex;gap:6px";
  for (const s of ["Present", "Late", "Excused", "Absent"]) {
    const b = document.createElement("span");
    b.textContent = s;
    b.style.cssText =
      "font-size:11.5px;font-weight:700;border:1px solid rgba(0,0,0,0.25);border-radius:5px;padding:5px 10px;color:rgba(0,0,0,0.7)";
    states.append(b);
  }
  row.append(name, states);
  list.append(row);
}
box.append(list);
blockText(box, "Names only. A recruit's funnel status never appears on a sheet a coach can open.");
const anchor = groups[0]?.closest(".MuiPaper-root, section, div") ?? cardTemplate();
anchor?.parentElement?.insertBefore(box, anchor);
