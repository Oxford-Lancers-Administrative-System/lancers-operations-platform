// W6-02 — Refused: he is already on the team. A player is not a recruit.
setHeading("Add a recruit");
fill("givenName", "Alaric");
fill("familyName", "Brindlewood");
fill("phone", "07700 900753");
const box = proposedBlock("amber");
blockTitle(box, "Alaric Brindlewood is already on the team");
blockText(
  box,
  "2026-27 membership · active. He is a player, not a recruit, and nothing was created.",
);
const link = document.createElement("div");
link.textContent = "Open his roster record →";
link.style.cssText = "font-size:13px;font-weight:700;color:#b26a00;margin-top:10px";
box.append(link);
afterField("phone", box) ?? document.querySelector("form")?.append(box);
const submit = $$("button").find(
  (b) => /add|save|create/i.test(b.textContent) && b.offsetHeight > 20,
);
if (submit) {
  submit.style.opacity = "0.45";
  submit.style.pointerEvents = "none";
}
