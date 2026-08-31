// W5-03 — A possible duplicate, before anything is written. main mints a person
// here with no interactive check at all — Task 09 amendment 4's recorded drift.
fill("givenName", "Marguerite");
fill("familyName", "Ashdown");
fill("phone", "07700 900461");
const box = proposedBlock("amber");
blockTitle(box, "We may already have her");
blockText(box, "Marguerite Ashdown · Kestrelhall · mobile ending 461 · recruit since 22 April");
const choices = document.createElement("div");
choices.style.cssText = "display:flex;gap:10px;margin-top:12px;flex-wrap:wrap";
for (const [t, primary] of [
  ["THIS IS HER", true],
  ["SOMEBODY NEW", false],
]) {
  const b = document.createElement("span");
  b.textContent = t;
  b.style.cssText = primary
    ? "background:#b26a00;color:#fff;font-size:13px;font-weight:700;padding:9px 16px;border-radius:6px"
    : "border:1px solid rgba(0,0,0,0.3);font-size:13px;font-weight:700;padding:9px 16px;border-radius:6px;color:rgba(0,0,0,0.7)";
  choices.append(b);
}
box.append(choices);
afterField("phone", box) ?? document.querySelector("form")?.append(box);
