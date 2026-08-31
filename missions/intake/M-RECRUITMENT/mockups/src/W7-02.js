// W7-02 — Two states of the public page: we already have you, and this code is
// no longer live.
const card = drawnSurface({
  title: "You are already on our list",
  subtitle: "Good to see you again, Rosalind — we will be in touch about the next session.",
  chrome: "oxfordlancers.example/join",
});
card.append(
  note(
    "Brian, 2026-08-31: they should see if they are already in the list. Nothing is created and nothing is sent. This is the common case at a second event and must not read as an error.",
  ),
);
const safety = drawnPanel("What it does not do");
safety.style.marginTop = "18px";
safety.append(
  makeRow("It confirms", "Only what the submitter themselves just typed"),
  makeRow("It never says", "Whether anybody else is on the list"),
  makeRow("Why", "A public page that answers “do you have X?” is a membership oracle"),
);
const revoked = drawnPanel("And when the code has been retired");
revoked.style.marginTop = "18px";
revoked.append(
  makeRow("They see", "“This link is no longer valid.”"),
  makeRow("Operators see", "Old handout, Hilary 2025-26 · revoked 14 Apr · 0 submissions since"),
);
revoked.append(
  note(
    "Posters stay up for months after a code is retired. Revoking is safe, and the count says how much a code still in the wild is doing.",
  ),
);
const wrap = document.querySelector("div");
wrap.append(safety, revoked);
