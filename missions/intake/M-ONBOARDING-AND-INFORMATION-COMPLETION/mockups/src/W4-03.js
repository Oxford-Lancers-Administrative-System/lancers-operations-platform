// W4-03 — Step 3: the Code of Conduct, on its own page.
//
// Owner direction, 2026-09-01: "the code of conduct needs to be its own page
// where we have the code of conduct on the page. We scroll to the bottom, and
// it says, 'Click I agree to the code of conduct'... You go to the next page."
//
// The pane is scrolled to its end in this shot on purpose: the end is where
// the mechanic lives, and a screen showing the top would not show the thing
// being reviewed.
//
// **The words are placeholder and are marked as such.** The real text is
// Clint's through Task 07, and there is nowhere on `main` to put it — see the
// specification's "What has no substrate".
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "The Code of Conduct";
setLead(s.lead, "Step 3 of 5 · Read it, then agree");

dropEventLeftovers();

mark(
  setFacts(s.dl, [
    ["Your details", "Saved", DONE],
    ["Messaging consent", "Given just now", DONE],
    ["Code of Conduct", "Reading now", OUTSTANDING],
    ["Version", "Not yet versioned", OUTSTANDING],
  ]),
  1,
);

setPrivacy(
  s.privacy,
  "Your agreement is recorded against the exact version shown here, with the date. It is yours, and only the four-role group can see it.",
);

const a = buildForm(s, [
  {
    kind: "pane",
    key: "pane",
    heading: "Oxford Lancers Code of Conduct — PLACEHOLDER TEXT",
    paragraphs: [
      "PLACEHOLDER. The real Code of Conduct is Clint's, through Task 07, and has not been written into this system. Everything in this pane exists to show the shape of the page and the length a real document runs to.",
      "1. Placeholder clause. Members represent the club at training, at fixtures and while travelling. This sentence stands in for the club's own words and carries no policy of its own.",
      "2. Placeholder clause. Placeholder text about conduct toward teammates, opposition and officials, standing in for a paragraph the club will write.",
      "3. Placeholder clause. Placeholder text about equipment, facilities and the club's obligations to the venues it uses.",
      "4. Placeholder clause. Placeholder text about alcohol, initiations and the club's position on both.",
      "5. Placeholder clause. Placeholder text about social media and representing the club in public.",
      "6. Placeholder clause. Placeholder text about what happens when a member does not keep to this code, and who decides.",
      "7. Placeholder clause. Placeholder text about how this document is reviewed, and how often.",
      "End of the placeholder document. In the real page, agreeing is only possible from here — the control below sits past the last line, so it cannot be reached without scrolling through the whole thing.",
    ],
  },
  {
    kind: "consent",
    key: "agree",
    checked: false,
    label: "I have read and I agree to the Code of Conduct.",
    note: "Recorded against this version, dated, and stored as yours.",
  },
]);

// 2 — the document itself, on the page, scrolled to its end.
mark(a.pane, 2);
// 3 — and the agreement, reachable only from the bottom of it.
mark(a.agree, 3);

setSubmit(s.submit, "I agree — continue");
setSecondary("You can reopen this page later to see which version you agreed to, and when.");

scrollPanesToEnd();
await settle();
