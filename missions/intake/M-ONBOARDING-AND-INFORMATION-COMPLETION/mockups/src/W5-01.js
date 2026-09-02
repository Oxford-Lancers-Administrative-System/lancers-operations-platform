// W5-01 — The record, opened later and unprompted.
//
// Nobody asked Merrick to come here. His number changed. This is the club's
// entire answer to self-service, because there are no player logins: the same
// link he already holds, every fact about him editable, and — the part that
// makes it safe — **who supplied each value, on the value.**
//
// The provenance under each field is not new substrate. `person-record.ts`
// already derives it from `audit_events` for the seven `people` columns, a
// choice Brian made in the LAN-184 walkthrough rather than adding source
// columns; `contact_points.source` and
// `person_emergency_contacts.recorded_by_person_id` cover the rest.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "Your details";
setLead(s.lead, "Merrick Thornbury · change anything that is wrong");

dropEventLeftovers();

mark(
  setFacts(s.dl, [
    ["Everything the club asks for", "Complete", DONE],
    ["Last changed", "By you, 2 September", DONE],
    ["This link", "Yours for the season", DONE],
    ["Nothing is outstanding", "You came here yourself", DONE],
  ]),
  1,
);

setPrivacy(
  s.privacy,
  "This secure page shows only your own record. Changing something here never removes what the club had — the old value is kept, dated, and attributed.",
);

const a = buildForm(s, [
  {
    kind: "note",
    key: "why",
    text: "Nothing here needs your attention. You can change any of it whenever you like, and you do not need to tell anybody first.",
  },

  { kind: "heading", text: "Who you are" },
  { label: "First name", value: "Merrick", required: true, source: "You gave this, 2 September" },
  { label: "Last name", value: "Thornbury", required: true, source: "You gave this, 2 September" },
  {
    key: "mine",
    label: "Mobile phone",
    value: "07700 900218",
    required: true,
    source: "You gave this, 2 September",
    help: "We will read a new number back to you before saving it.",
  },
  {
    label: "Personal email",
    value: "merrick.thornbury@farrowgate.ox.ac.example",
    required: true,
    source: "You gave this, 2 September",
  },

  { kind: "heading", text: "Where you study" },
  {
    key: "theirs",
    label: "College",
    value: "Farrowgate",
    required: true,
    source: "The club recorded this, 28 August",
  },
  {
    label: "Matriculation year",
    value: "2024",
    required: true,
    source: "The club recorded this, 28 August",
  },
  { label: "Expected graduation", value: "2027", required: true, source: "You gave this, 2 September" },
  { label: "Degree field", value: "Engineering Science", required: true, source: "You gave this, 2 September" },

  { kind: "heading", text: "Kept private" },
  {
    key: "unattributed",
    label: "Date of birth",
    value: "14 March 2005",
    required: true,
    source: "No record of who supplied this",
    help: "Never appears on any list, board or queue. Only whether you are under 18 is derived from it.",
  },
]);

// 2 — why they are here, said plainly: nobody sent them.
mark(a.why, 2);
// 3 — a value they supplied themselves. Changing it just changes it.
mark(a.mine, 3);
// 4 — a value the club supplied. Changing this one goes to a human, and W5-02
//     is what they are told before they submit.
mark(a.theirs, 4);
// 5 — and a value nobody attributable ever asserted: seeded or imported.
//     readFieldProvenanceIn returns null here. The open decision is that the
//     player wins on this row.
mark(a.unattributed, 5);

setSubmit(s.submit, "Save changes");
setSecondary("The club never loses what it had. Every previous value is kept, dated and attributed.");

await settle();
