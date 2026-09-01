// W4-01 — The form, as an imported returner opens it.
//
// Merrick Thornbury arrived in this season's import. His record really does
// hold his name, mobile, personal email and an emergency contact, and really
// is missing college, matriculation year, expected graduation, degree field
// and date of birth — so the mix of confirm-this and fill-this on the screen
// is his actual record, not a story about one.
//
// Consent is step one and unticked: this is the moment it is asked.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "Welcome to the team, 2026–27";
setLead(s.lead, "Merrick Thornbury · confirm what we have and fill in what we don't");

// 1 — R4-P's minimal checklist: what this page can move, and nothing else.
// The operator-owned items (subs, kit, squad photo, comms groups) are the
// club's to tick on the roster board and are deliberately absent here.
mark(
  setFacts(s.dl, [
    ["Your details", "5 still needed", OUTSTANDING],
    ["Code of Conduct", "Not yet signed", OUTSTANDING],
    ["Photo release", "Not yet signed", OUTSTANDING],
    ["BUCS Play & Hudl", "Not yet confirmed", OUTSTANDING],
  ]),
  1,
);

dropEventLeftovers();

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
  {
    label: "Emergency contact",
    value: "Lucian Thornbury · Partner · 07700 900138",
  },

  { kind: "heading", text: "Read, then agree" },
  {
    kind: "consent",
    key: "conduct",
    label: "I have read and understood the Code of Conduct.",
    note: "Placeholder wording in a real versioned slot. The words are Mission 8's.",
  },
  {
    kind: "consent",
    label: "I have read the photo release and I sign it for this season.",
    note: "Placeholder wording in a real versioned slot. Asked again every season.",
  },

  { kind: "heading", text: "Two things to go and do" },
  {
    kind: "consent",
    key: "owed",
    label: "I have registered on BUCS Play with my Oxford email and selected Oxford Lancers.",
    note: "The instructions that belong above this line are owed by this mission and nobody has written them yet.",
  },
  {
    kind: "consent",
    label: "I have accepted the Hudl invitation and I can see the team.",
    note: "Same: the instruction copy is owed and unwritten.",
  },
]);

// 2 — consent, and step one. The form IS the consent board.
mark(a.consent, 2);
// 3 — what the club already holds arrives filled in; the ask is to confirm it.
mark(a.given, 3);
// 4 — and what it does not hold is blank, and is exactly what the chase asks for.
mark(a.gap, 4);
// 5 — the one restricted fact.
mark(a.dob, 5);
// 6 — the two asks whose instruction copy this mission owes and has not written.
mark(a.owed, 6);

setSubmit(s.submit, "Save my details");
setSecondary("Nothing here is required to save. Anything you leave blank simply stays outstanding.");

await settle();
