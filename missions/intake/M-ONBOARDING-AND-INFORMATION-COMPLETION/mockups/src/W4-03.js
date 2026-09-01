// W4-03 — Submitted: what was saved, and what is still outstanding.
//
// The ask moves `opened → submitted`. The page does not pretend the record is
// finished — Merrick left four of his five gaps blank, which `R3-G` expressly
// permits — so it says what it now holds and what the club will still ask for.
// The form is gone because there is nothing left on this visit to submit.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "Thank you — that is saved";
setLead(s.lead, "Merrick Thornbury · 1 September 2026");

dropEventLeftovers();

mark(
  setFacts(s.dl, [
    ["Messaging consent", "Given just now", DONE],
    ["Your details", "1 still needed", OUTSTANDING],
    ["Code of Conduct", "Signed just now", DONE],
    ["Photo release", "Signed just now", DONE],
    ["BUCS Play", "Not yet confirmed", OUTSTANDING],
    ["Hudl", "Confirmed just now", DONE],
  ]),
  1,
);

setPrivacy(
  s.privacy,
  "This secure page shows only your own record. Nobody else's details are ever shown here, and the club's privacy policy applies to everything you give.",
);

const a = buildForm(s, [
  { kind: "heading", text: "What the club now has" },
  {
    kind: "note",
    text: "Your consent, your contact details, your college and course, your date of birth and your emergency contact — along with the Code of Conduct and the photo release, both dated today and stored as yours.",
  },
  { kind: "heading", text: "What is still outstanding" },
  {
    kind: "note",
    key: "left",
    text: "Your degree field, and confirmation that you have registered on BUCS Play. The club will ask you for those on this same link — it will not send you a second one.",
  },
  { kind: "heading", text: "If something here is wrong" },
  {
    kind: "note",
    text: "Open this link again at any time and change it. If you correct something the club has confirmed from elsewhere, it is not overwritten silently — somebody looks at it first.",
  },
]);

// 2 — the same link, still open. Nothing about submitting closes it, and no
//     second ask is ever created alongside it.
mark(a.left, 2);

setSubmit(s.submit, "Close");
setSecondary("Nothing on your checklist ever blocks you from training, playing or travelling.");

await settle();
