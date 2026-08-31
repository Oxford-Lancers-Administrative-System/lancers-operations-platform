// W14-02 — Where she lands: the roster, with what the flip actually did.
const box = proposedBlock("green");
blockTitle(box, "Marguerite Ashdown joined 2026-27");
const rows = document.createElement("div");
rows.style.cssText =
  "display:grid;grid-template-columns:auto 1fr;gap:7px 18px;margin-top:8px;font-size:13.5px";
for (const [k, v] of [
  ["Season membership", "Created · 2026-27 · onboarding"],
  ["On the roster", "Yes — she is on this board now"],
  ["Onboarding", "Open · 0 of 12 items"],
  ["Active", "No. On the team is not active."],
  ["Flipped by", "Caspian Hallowfield, Secretary, today · audited"],
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
