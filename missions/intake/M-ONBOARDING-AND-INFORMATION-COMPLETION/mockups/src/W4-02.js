// W4-02 — The same page for a flipped recruit, and the one visible difference.
//
// Rosalind Penhaligon is the seed's own prospect, flipped to `joined` with a
// season membership at `onboarding`, her checklist generated and a
// `season_messaging_consents` row granted at the door on 14 August — the same
// person W3 photographed. Her record holds what the recruit door and
// questionnaire A collected; the four facts recruitment never asks for are
// blank, because nothing ever asked her for them.
//
// **Consent is absent from this page.** `season_messaging_consents` is unique
// per person per season and hers already says `granted`, so there is nothing
// to ask. That absence is this screen's whole point.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "Welcome to the team, 2026–27";
setLead(s.lead, "Rosalind Penhaligon · you told us most of this already");

dropEventLeftovers();

// 1 — consent is already granted, and the strip says when and where.
mark(
  setFacts(s.dl, [
    ["Your details", "4 still needed", OUTSTANDING],
    ["Messaging consent", "Given 14 Aug, at the door", DONE],
    ["Code of Conduct", "Not yet signed", OUTSTANDING],
    ["Photo release", "Not yet signed", OUTSTANDING],
  ]),
  1,
);

setPrivacy(
  s.privacy,
  "This secure page shows only your own record. Nobody else's details are ever shown here, and the club's privacy policy applies to everything you give.",
);

const a = buildForm(s, [
  {
    kind: "note",
    key: "noconsent",
    text: "You agreed at the taster session on 14 August that the club may message you. That agreement runs for the whole 2026–27 season, so this page does not ask you again — you will be asked once more next season.",
  },

  { kind: "heading", text: "Who you are" },
  { key: "carried", label: "First name", value: "Rosalind", required: true },
  { label: "Last name", value: "Penhaligon", required: true },
  {
    label: "Mobile phone",
    value: "07700 900312",
    required: true,
    help: "We will read this back to you before saving it.",
  },
  { label: "Personal email", value: "rosalind.penhaligon@brasenose.ox.ac.example" },

  { kind: "heading", text: "Where you study" },
  { label: "College", value: "Brasenose" },
  { label: "Matriculation year", value: "2024" },
  { key: "gap", label: "Expected graduation" },
  { label: "Degree field" },

  { kind: "heading", text: "Kept private" },
  {
    label: "Date of birth",
    help: "Never appears on any list, board or queue. Only whether you are under 18 is derived from it.",
  },
  { label: "Emergency contact" },

  { kind: "heading", text: "Read, then agree" },
  {
    kind: "consent",
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
    label: "I have registered on BUCS Play with my Oxford email and selected Oxford Lancers.",
    note: "The instructions that belong above this line are owed by this mission and nobody has written them yet.",
  },
  {
    kind: "consent",
    label: "I have accepted the Hudl invitation and I can see the team.",
    note: "Same: the instruction copy is owed and unwritten.",
  },
]);

// 2 — where W4-01 opens with the consent tick, this page opens with a sentence
//     saying why it is not asking. No tick, and no way to reach one.
mark(a.noconsent, 2);
// 3 — what the recruit door and questionnaire A already collected.
mark(a.carried, 3);
// 4 — and the four facts recruitment never asks anybody for.
mark(a.gap, 4);

setSubmit(s.submit, "Save my details");
setSecondary("Nothing here is required to save. Anything you leave blank simply stays outstanding.");

await settle();
