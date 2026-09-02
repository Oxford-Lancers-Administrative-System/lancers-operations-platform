// W4-01 — Step 1: your details.
//
// Owner direction, 2026-09-01: the form is split. The Code of Conduct, the
// photo release and the BUCS Play instructions each get their own page, so this
// page is now only the details — and the emergency contact is broken out into
// the fields the database actually stores rather than one line of text.
//
// Merrick Thornbury arrived in this season's import. His record really does
// hold his name, mobile, personal email and a full emergency contact, and
// really is missing college, matriculation year, expected graduation, degree
// field and date of birth.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "Welcome to the team, 2026–27";
setLead(s.lead, "Step 1 of 5 · Your details");

dropEventLeftovers();

mark(
  setFacts(s.dl, [
    ["Your details", "5 still needed", OUTSTANDING],
    ["Code of Conduct", "Step 3", OUTSTANDING],
    ["Photo release", "Step 4", OUTSTANDING],
    ["BUCS Play & Hudl", "Step 5", OUTSTANDING],
  ]),
  1,
);

setPrivacy(
  s.privacy,
  "This secure page shows only your own record. Nobody else's details are ever shown here, and the club's privacy policy applies to everything you give.",
);

const a = buildForm(s, [
  { kind: "heading", text: "First — may the club message you this season?" },
  {
    kind: "consent",
    key: "consent",
    checked: false,
    label: "Yes, Oxford Lancers may message me about the club this season.",
    note: "Asked again every season. If you want the club to stop, ask and an operator will switch it off — this form has no way to untick it.",
  },

  { kind: "heading", text: "Who you are" },
  { key: "given", label: "First name", value: "Merrick", required: true },
  { label: "Last name", value: "Thornbury", required: true },
  {
    label: "Mobile phone",
    value: "07700 900218",
    required: true,
    help: "We will read this back to you before saving it.",
  },
  { label: "Personal email", value: "merrick.thornbury@farrowgate.ox.ac.example" },

  { kind: "heading", text: "Where you study" },
  { key: "gap", label: "College" },
  { label: "Matriculation year" },
  { label: "Expected graduation" },
  { label: "Degree field" },

  { kind: "heading", text: "Kept private" },
  {
    key: "dob",
    label: "Date of birth",
    help: "Never appears on any list, board or queue. Only whether you are under 18 is derived from it.",
  },

  { kind: "heading", text: "Emergency contact" },
  { key: "emergency", label: "Emergency contact first name", value: "Lucian" },
  { label: "Emergency contact last name", value: "Thornbury" },
  {
    key: "relationship",
    label: "Relationship to you",
    value: "Partner",
    help: "The fifth column person_emergency_contacts already stores. Drop it and the table keeps it blank.",
  },
  { label: "Emergency contact phone", value: "07700 900138" },
  { label: "Emergency contact email", value: "lucian.38@mail.example" },
]);

// 1 — the strip now doubles as the map of the sequence: five steps, one link.
// 2 — consent, and it is still step one of step one.
mark(a.consent, 2);
// 3 — what the club already holds arrives filled in; the ask is to confirm it.
mark(a.given, 3);
// 4 — and what it does not hold is blank.
mark(a.gap, 4);
// 5 — the one restricted fact.
mark(a.dob, 5);
// 6 — the emergency contact, as five fields rather than one line.
mark(a.emergency, 6);

setSubmit(s.submit, "Save and continue");
setSecondary("Nothing here is required to continue. Anything you leave blank simply stays outstanding.");

await settle();
