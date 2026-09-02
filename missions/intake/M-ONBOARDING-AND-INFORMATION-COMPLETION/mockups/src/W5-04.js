// W5-04 — The targeted ask: one fact, and nothing else.
//
// `M6`: the disputed-value targeted request — a signed-link ask for exactly one
// fact. The approved inventory fixes when it is allowed: "One fact, not the
// whole form. Only when nothing else is open." So it can never compete with the
// compiled ask; if anything else is outstanding, the compiled ask wins and this
// is not sent.
//
// The whole design point is restraint. A club that doubts one number and
// responds by reopening the entire form has told the player their record is in
// question, which is both untrue and a good way to get no answer at all.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "One quick check";
setLead(s.lead, "Merrick Thornbury · we only need this one thing");

dropEventLeftovers();

mark(
  setFacts(s.dl, [
    ["What we are asking", "One fact", OUTSTANDING],
    ["Everything else", "Not asked", DONE],
    ["Sent because", "Nothing else was open", DONE],
    ["Takes", "About ten seconds", DONE],
  ]),
  1,
);

setPrivacy(
  s.privacy,
  "This secure page shows only the one thing we asked about. Nothing else on your record is shown or changed here.",
);

const a = buildForm(s, [
  {
    kind: "note",
    key: "why",
    text: "A message to this number did not get through last week. Before the club changes anything, it is worth checking we have it right.",
  },
  {
    key: "one",
    label: "Mobile phone",
    value: "07700 900218",
    required: true,
    source: "What the club currently holds",
    help: "We will read it back to you before saving.",
  },
  {
    kind: "consent",
    key: "confirm",
    checked: false,
    label: "That is right — nothing to change.",
    note: "Confirming is an answer. It closes this ask and records that you checked.",
  },
  {
    kind: "note",
    key: "nothing",
    text: "There is deliberately no way from this page into the rest of your details. If you want to change something else, the club's most recent message carries your own page.",
  },
]);

// 2 — why they got this, in one sentence. A targeted ask with no reason on it
//     reads like a phishing message.
mark(a.why, 2);
// 3 — the one fact. Nothing else is on the page at all.
mark(a.one, 3);
// 4 — confirming is an answer, not a no-op. Otherwise a correct value can never
//     close the ask and the chase runs forever against a fact that was fine.
mark(a.confirm, 4);
// 5 — and the restraint, stated: no route from here into the rest of the form.
mark(a.nothing, 5);

setSubmit(s.submit, "Send this back");
setSecondary("This is the only thing the club is waiting on from you.");

await settle();
