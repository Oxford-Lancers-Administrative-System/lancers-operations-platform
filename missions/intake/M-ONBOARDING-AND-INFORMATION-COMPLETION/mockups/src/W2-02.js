// W2-02 — The duplicate check, driven for real.
//
// Nothing here is this mission's to change: the candidate step is shipped, it
// never writes, and an empty list is still the operator's call. It is
// photographed because W2 has to show that adding one player runs the same
// duplicate question the import does, rather than a second one.
selectRosterNav();

must(
  $$("h1, h2").find((h) => /add player/i.test(h.textContent)),
  "this is not the add-player page",
);
const setField = (labelText, value) => {
  const field = must(
    $$(".MuiTextField-root").find((f) =>
      new RegExp(labelText, "i").test(f.querySelector("label")?.textContent ?? ""),
    ),
    `there is no ${labelText} field`,
  );
  const input = must(field.querySelector("input"), `the ${labelText} field has no input`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return input;
};

// A name the seed already holds, so the shipped check returns a real candidate
// out of the database rather than a drawn one.
setField("first name", "Jorvik");
setField("last name", "Kirkbride");
setField("phone|mobile", "07700 900312");

const check = must(
  $$("button").find((b) => /check|match|continue/i.test(b.textContent)),
  "the intake form has no check-for-matches button",
);
check.click();

for (let i = 0; i < 120; i += 1) {
  await new Promise((r) => setTimeout(r, 100));
  if ($('[data-testid="candidate"]') || $('[data-testid="candidate-count"]')) break;
}
must($('[data-testid="candidate-count"]'), "the candidate step never rendered");

mark($('[data-testid="candidate-count"]'), 1);
// Distinct targets. Marking the card and then the membership chip inside it
// stacked two chips at the same corner, so 2 was hidden underneath 3.
const first = must($('[data-testid="candidate"]'), "no candidate card rendered");
mark(first, 2);
const chip = $('[data-testid="candidate-has-membership"]');
if (chip) mark(chip, 3);

await settle();
