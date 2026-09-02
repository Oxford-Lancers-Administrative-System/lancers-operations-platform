// W4-04 — Step 4: the photo release, on its own page.
//
// Same shape as the Code of Conduct, deliberately. Brian, 2026-09-01: "Photo
// release should also be there and should also be a signed document, I think.
// I don't know. Do we have a way to handle signed documents right now in the
// thing? I don't think so."
//
// He is right: there is none. No object storage bucket is configured anywhere,
// no table holds a document or a blob, and the only file input in the whole
// application is the event CSV import, which parses in memory and stores
// nothing. So this screen proposes the mechanism that needs no new
// infrastructure — the exact version, the dated agreement, the person — and
// the specification records e-signature as the open owner decision.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "The photo release";
setLead(s.lead, "Step 4 of 5 · Read it, then sign");

dropEventLeftovers();

mark(
  setFacts(s.dl, [
    ["Code of Conduct", "Agreed just now", DONE],
    ["Photo release", "Reading now", OUTSTANDING],
    ["Asked", "Every season", OUTSTANDING],
    ["Signature", "Agreement, not e-signature", OUTSTANDING],
  ]),
  1,
);

setPrivacy(
  s.privacy,
  "Your agreement is recorded against the exact version shown here, with the date. No photograph is ever stored in this system.",
);

const a = buildForm(s, [
  {
    kind: "pane",
    key: "pane",
    heading: "Oxford Lancers photo release — PLACEHOLDER TEXT",
    paragraphs: [
      "PLACEHOLDER. The real photo release is Clint's, through Task 07. This pane shows the shape of the page and the length a real release runs to, and carries no policy of its own.",
      "1. Placeholder clause. Placeholder text about what the club photographs, and where those photographs are used.",
      "2. Placeholder clause. Placeholder text about the squad photograph specifically, and about match and training photography.",
      "3. Placeholder clause. Placeholder text about social media, the club website and university publications.",
      "4. Placeholder clause. Placeholder text about how to withdraw this permission, and what happens to material already published.",
      "5. Placeholder clause. Placeholder text about how long this permission lasts. It is asked again every season, of everybody.",
      "End of the placeholder document. Agreeing is only possible from here.",
    ],
  },
  {
    kind: "consent",
    key: "agree",
    checked: false,
    label: "I have read the photo release and I agree to it for the 2026–27 season.",
    note: "Recorded against this version, dated, and stored as yours. This is a dated agreement, not a drawn or cryptographic signature — see the open decision.",
  },
  {
    kind: "note",
    key: "open",
    text: "OPEN DECISION, for Brian. A true signature — drawn, or a signed PDF — needs object storage and a signature control, and the application has neither today. Recording the version, the moment and the person needs nothing new. The specification recommends the second and treats e-signature as additive.",
  },
]);

// 2 — the document, on the page, scrolled to its end.
mark(a.pane, 2);
// 3 — the agreement, in the same place and shape as the Code of Conduct's.
mark(a.agree, 3);
// 4 — and the thing this workflow cannot settle on its own.
mark(a.open, 4);

setSubmit(s.submit, "I agree — continue");
setSecondary("You can reopen this page later to see which version you agreed to, and when.");

scrollPanesToEnd();
await settle();
