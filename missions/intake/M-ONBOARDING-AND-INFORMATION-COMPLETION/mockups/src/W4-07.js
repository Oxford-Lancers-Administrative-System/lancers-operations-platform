// W4-07 — Done: what was saved, and what is still outstanding, by section.
//
// Owner direction, 2026-09-02: the previous draft said what was left in one
// sentence. "That line is very hard to tell. It should honestly be a set of
// options... It should list at the very top, like the bullet list on personal
// information, and it should list below in dots, like a list... if they click
// on that link, it brings them back to the form that has that information, so
// they can fill it out there if they want to."
//
// So: grouped by section, one bullet per outstanding thing, and every bullet is
// a link back to the step that collects it.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "That is all saved";
setLead(s.lead, "Merrick Thornbury · 2 September 2026");

dropEventLeftovers();

mark(
  setFacts(s.dl, [
    ["Messaging consent", "Given just now", DONE],
    ["Your details", "2 still needed", OUTSTANDING],
    ["Code of Conduct", "Agreed just now", DONE],
    ["Photo release", "Agreed just now", DONE],
    ["BUCS Play", "Not yet confirmed", OUTSTANDING],
    ["Hudl", "Claimed just now", DONE],
  ]),
  1,
);

setPrivacy(
  s.privacy,
  "This secure page shows only your own record. Nobody else's details are ever shown here, and the club's privacy policy applies to everything you give.",
);

const a = buildForm(s, [
  { kind: "heading", text: "Still outstanding" },
  {
    kind: "outstanding",
    key: "list",
    groups: [
      {
        section: "Your details",
        items: [
          { label: "Degree field", href: "#step-1", note: "step 1" },
          { label: "Emergency contact email", href: "#step-1", note: "step 1, optional" },
        ],
      },
      {
        section: "BUCS Play",
        items: [
          {
            label: "Confirm you have registered",
            href: "#step-4",
            note: "step 4",
          },
        ],
      },
    ],
  },
  {
    kind: "note",
    key: "same",
    text: "Every one of these is on the link you are already holding. The club will ask you for them here — it will not send you a second link.",
  },
  { kind: "heading", text: "What the club now has" },
  {
    kind: "note",
    text: "Your consent, your contact details, your college and course, your date of birth and your emergency contact — along with the Code of Conduct and the photo release, each recorded against the version you saw and dated today.",
  },
  { kind: "heading", text: "If something here is wrong" },
  {
    kind: "note",
    text: "Open this link again at any time and change it. If you correct something the club has confirmed from elsewhere, it is not overwritten silently — somebody looks at it first.",
  },
]);

// 2 — what is left, by section, in dots, each one a link back to the step that
//     collects it. Replaces a sentence nobody could act on.
mark(a.list, 2);
// 3 — and the rule underneath it: the same link, always. No second ask is ever
//     created alongside this one.
mark(a.same, 3);

setSubmit(s.submit, "Close");
setSecondary("Nothing on your checklist ever blocks you from training, playing or travelling.");

await settle();
