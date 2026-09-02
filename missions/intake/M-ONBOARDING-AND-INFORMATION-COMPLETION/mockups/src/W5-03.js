// W5-03 — Declining to give a value, per fact.
//
// `T11-refused`: the chase for that fact stops and stops counting, the fact
// stays visible on the record, and reopening is a human act — the machine never
// revives it.
//
// This screen is also where W4's approved required set meets its own edge. W4
// blocks step 1 until ten fields are filled. If refusal only exists here, a
// player who will not give a date of birth is trapped at step 1 forever and can
// never reach the pages behind it. The proposed amendment — refusal available
// wherever a fact is asked — is marked below.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "Your details";
setLead(s.lead, "Merrick Thornbury · you can decline any of these");

dropEventLeftovers();

mark(
  setFacts(s.dl, [
    ["Declined", "1 — date of birth", OUTSTANDING],
    ["Chased from now on", "No", DONE],
    ["Counted as outstanding", "No", DONE],
    ["Reopened by", "A person, never the system", OUTSTANDING],
  ]),
  1,
);

setPrivacy(
  s.privacy,
  "A reason you give here is seen only by the club's four senior officers, and never appears in any report.",
);

const a = buildForm(s, [
  { kind: "heading", text: "Kept private" },
  {
    key: "field",
    label: "Date of birth",
    required: true,
    source: "Declined by you, 2 September",
  },
  {
    kind: "consent",
    key: "decline",
    checked: true,
    label: "I would rather not give this.",
    note: "The club stops asking. The field stays on your record as declined, and only a person can ask for it again — no reminder will.",
  },
  {
    key: "reason",
    label: "Why, if you want to say (optional)",
    value: "I would rather not have my date of birth on a club system.",
  },
  {
    kind: "notice",
    key: "consequence",
    tone: "#b26a00",
    text: "One thing this does have a consequence for: the club works out whether a member is under 18 from this date, and without it that check cannot run. Nothing else about your membership changes.",
  },
  {
    kind: "note",
    key: "amend",
    text: "PROPOSED AMENDMENT TO W4, which is already approved. W4 requires ten fields and blocks step 1 until they are filled. Unless declining is available there too, a player who will not give this is stuck at step 1 forever. Recommended: required means answer it or decline it, explicitly.",
  },
]);

// 2 — the fact itself, carrying its own refusal as its provenance.
mark(a.field, 2);
// 3 — the decline, and what it buys: the chase stops.
mark(a.decline, 3);
// 4 — the reason, optional and restricted to the four-role group.
mark(a.reason, 4);
// 5 — the one real consequence, said rather than hidden.
mark(a.consequence, 5);
// 6 — and the amendment this screen forces on an approved workflow.
mark(a.amend, 6);

setSubmit(s.submit, "Save changes");
setSecondary("Declining a fact never affects whether you train, play or travel.");

await settle();
