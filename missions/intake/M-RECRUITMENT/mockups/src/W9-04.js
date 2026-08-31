// W9-04 — Refused. The never-harsh rule is a guarantee, so it is enforced here
// rather than left to the operator's judgement.
const card = drawnSurface({
  title: "You cannot send Ambrose anything",
  subtitle: "He declined on 2 May.",
  chrome: "Opened from his record",
  width: 620,
});
const why = drawnPanel(null);
why.style.cssText += ";border:none;box-shadow:none;padding:0";
why.append(
  makeRow("His status", "declined — recorded 2 May by Caspian Hallowfield"),
  makeRow("What that stops", "Every template, including this one"),
  makeRow("What would change it", "Only Ambrose. If he gets in touch, an operator moves him back"),
);
card.append(
  why,
  note(
    "A recorded refusal never coexists with continued messaging. This refuses rather than sending and failing — and it is the same rule that stops a well-meant nudge reaching somebody who asked to be left alone.",
  ),
);
