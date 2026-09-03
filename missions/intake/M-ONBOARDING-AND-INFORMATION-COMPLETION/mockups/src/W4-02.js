// W4-02 — Step 1 for a flipped recruit, and the one visible difference.
//
// Rosalind Penhaligon is the seed's own prospect, flipped to `joined` with a
// membership at `onboarding` and a consent row granted at the door on 14
// August — the same person W3 photographed.
//
// **Consent is absent from this page.** `season_messaging_consents` is unique
// per person per season and hers already says `granted`, so there is nothing to
// ask. That absence is this screen's whole point. Her emergency contact is
// blank in all five fields, because recruitment never asks for one.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "Welcome to the team, 2026–27";
setLead(s.lead, "Step 1 of 5 · Your details");

dropEventLeftovers();

mark(
  setFacts(s.dl, [
    ["Your details", "4 still needed", OUTSTANDING],
    ["Messaging consent", "Given 14 Aug, at the door", DONE],
    ["Code of Conduct", "Step 2", OUTSTANDING],
    ["Photo release", "Step 3", OUTSTANDING],
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

  {
    kind: "note",
    key: "required",
    text: "Everything marked * is required to finish onboarding, the emergency contact included. Rosalind gave three of these at the recruit door, where they were all the club asked for. Onboarding asks for the rest, and this is the flow that asks.",
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
  { label: "Personal email", value: "rosalind.penhaligon@brasenose.ox.ac.example", required: true },

  { kind: "heading", text: "Where you study" },
  { label: "College", value: "Brasenose", required: true },
  { label: "Matriculation year", value: "2024", required: true },
  { key: "gap", label: "Expected graduation", required: true },
  { label: "Degree field", required: true },

  { kind: "heading", text: "Kept private" },
  {
    label: "Date of birth",
    required: true,
    help: "Never appears on any list, board or queue. Only whether you are under 18 is derived from it.",
  },

  { kind: "heading", text: "Emergency contact" },
  { key: "emergency", label: "Emergency contact first name", required: true },
  { label: "Emergency contact last name", required: true },
  {
    label: "Relationship to you",
    help: "The only optional field here. Brian has now listed the emergency contact twice without it — say the word and it goes.",
  },
  { label: "Emergency contact phone", required: true },
  { label: "Emergency contact email", required: true },
]);

// 2 — where W4-01 opens with the consent tick, this page opens with a sentence
//     saying why it is not asking. No tick, and no way to reach one.
mark(a.noconsent, 2);
// 3 — what the recruit door and questionnaire A already collected.
mark(a.carried, 3);
// 4 — and the facts recruitment never asks anybody for.
mark(a.gap, 4);
// 5 — including the whole emergency contact, blank in all five fields.
mark(a.emergency, 5);
// 6 — and what changed: these are required now. The recruit door asked for
//     three things; onboarding asks for ten, and this is where the two flows
//     part company.
mark(a.required, 6);

setSubmit(s.submit, "Save and continue");
setSecondary("You can leave and come back to this link. What you have entered is kept.");

await settle();
