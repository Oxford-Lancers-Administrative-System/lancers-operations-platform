// W5-04 — Refused: no mobile. The knowingly-accepted limitation, on the form
// where it actually bites, rather than in a decision log.
fill("givenName", "Peregrine");
fill("familyName", "Oakhollow");
const phone = document.querySelector('input[name="phone"]');
const wrap = phone?.closest(".MuiTextField-root, .MuiFormControl-root");
if (wrap) wrap.style.outline = "2px solid #b26a00";
const box = proposedBlock("amber");
blockTitle(box, "Without a mobile we cannot capture him");
blockText(
  box,
  "Nothing is saved — no person, no recruit, and no attendance row. Ask for a number, or let him go.",
);
afterField("phone", box) ?? document.querySelector("form")?.append(box);
const submit = $$("button").find((b) => /add walk-on/i.test(b.textContent));
if (submit) {
  submit.style.opacity = "0.45";
  submit.style.pointerEvents = "none";
}
