// W5-01 — The follow-up form: everything the club holds, editable.
//
// Owner direction, 2026-09-02: "somebody gets a follow-up form. It should just
// be all the details they have in there. If they want to change it there,
// that's fine, right? That's their prerogative. Otherwise, we can have other
// means to be able to change it in the club."
//
// So this is one screen and it is deliberately plain. The previous draft put
// paragraph-long explanations inside the page — Brian, same session: "too much
// UI narration... too narrative in design." Everything that needs saying about
// this screen is said in the numbered notes beside it, outside the frame.
//
// The only thing on the page that is not an ordinary form field is the small
// line under each value saying where it came from. That is not commentary: it
// is `readFieldProvenanceIn`, already on `main`, and it is what makes changing
// a club-recorded value different from changing your own.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "Your details";
setLead(s.lead, "Merrick Thornbury · change anything that has changed");

dropEventLeftovers();

mark(
  setFacts(s.dl, [
    ["Outstanding", "Nothing", DONE],
    ["Last changed", "2 September, by you", DONE],
    ["This link", "Yours until the season ends", DONE],
    ["Previous values", "Kept", DONE],
  ]),
  1,
);

setPrivacy(
  s.privacy,
  "This secure page shows only your own record. Changing something never deletes what was there before.",
);

const a = buildForm(s, [
  { kind: "heading", text: "Who you are" },
  { label: "First name", value: "Merrick", required: true, source: "You, 2 September" },
  { label: "Last name", value: "Thornbury", required: true, source: "You, 2 September" },
  {
    key: "mine",
    label: "Mobile phone",
    value: "07700 900218",
    required: true,
    source: "You, 2 September",
    help: "A new number is read back to you before it is saved.",
  },
  {
    label: "Personal email",
    value: "merrick.thornbury@farrowgate.ox.ac.example",
    required: true,
    source: "You, 2 September",
  },

  { kind: "heading", text: "Where you study" },
  {
    key: "theirs",
    label: "College",
    value: "Farrowgate",
    required: true,
    source: "The club, 28 August · a change here is checked by a person",
  },
  {
    label: "Matriculation year",
    value: "2024",
    required: true,
    source: "The club, 28 August · a change here is checked by a person",
  },
  { label: "Expected graduation", value: "2027", required: true, source: "You, 2 September" },
  {
    label: "Degree field",
    value: "Engineering Science",
    required: true,
    source: "You, 2 September",
  },

  { kind: "heading", text: "Kept private" },
  {
    key: "dob",
    label: "Date of birth",
    value: "14 March 2005",
    required: true,
    source: "You, 2 September",
    help: "Never appears on any list, board or queue.",
  },

  { kind: "heading", text: "Emergency contact" },
  {
    label: "Emergency contact first name",
    value: "Lucian",
    required: true,
    source: "You, 2 September",
  },
  {
    label: "Emergency contact last name",
    value: "Thornbury",
    required: true,
    source: "You, 2 September",
  },
  { label: "Relationship to you", value: "Partner", source: "You, 2 September" },
  {
    label: "Emergency contact phone",
    value: "07700 900138",
    required: true,
    source: "You, 2 September",
  },
  {
    label: "Emergency contact email",
    value: "lucian.38@mail.example",
    required: true,
    source: "You, 2 September",
  },
]);

// 1 — nothing is outstanding. This is not a chase, and the strip says so.
// 2 — a value they gave. Changing it changes it; that is their prerogative.
mark(a.mine, 2);
// 3 — a value an operator recorded. One clause on the source line, and nothing
//     else on the page, marks it: a change here is checked by a person before
//     it replaces theirs. W7 is where that happens.
mark(a.theirs, 3);
// 4 — required still means required, and there is no way to decline it.
mark(a.dob, 4);

setSubmit(s.submit, "Save changes");
setSecondary("Anything the club needs to change itself, it changes its own way.");

await settle();
