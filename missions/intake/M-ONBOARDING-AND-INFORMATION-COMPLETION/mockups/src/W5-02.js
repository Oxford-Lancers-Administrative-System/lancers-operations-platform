// W5-02 — Changing something the club confirmed, and being told so first.
//
// Boundary item 14: a player's answer never silently overwrites an
// operator-confirmed, externally verified or derived value; it raises
// `disputed — awaiting verification`.
//
// The load-bearing word is **silently**. A correction that quietly becomes a
// dispute is a correction the player believes they made — so the page says
// which of the two is about to happen *before* the submit, not after it.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "Your details";
setLead(s.lead, "Merrick Thornbury · one of these needs a person to look");

dropEventLeftovers();

mark(
  setFacts(s.dl, [
    ["Changes ready to save", "2", OUTSTANDING],
    ["Saved straight away", "1 — your mobile", DONE],
    ["Needs a person", "1 — your college", OUTSTANDING],
    ["What the club loses", "Nothing", DONE],
  ]),
  1,
);

setPrivacy(
  s.privacy,
  "Changing something here never removes what the club had. Both values are kept until somebody has looked.",
);

const a = buildForm(s, [
  { kind: "heading", text: "Who you are" },
  {
    key: "mine",
    label: "Mobile phone",
    value: "07700 900941",
    required: true,
    source: "You gave the previous number, 2 September",
  },
  {
    kind: "notice",
    key: "straight",
    tone: "#2e7d32",
    text: "This one saves as soon as you press the button. You gave the club this number in the first place, so changing it is you correcting yourself — nobody needs to check it. We will read the new number back to you.",
  },

  { kind: "heading", text: "Where you study" },
  {
    key: "theirs",
    label: "College",
    value: "Brasenose",
    required: true,
    source: "The club recorded Farrowgate, 28 August",
  },
  {
    kind: "notice",
    key: "dispute",
    tone: "#b26a00",
    text: "Somebody at the club recorded Farrowgate. You are telling us Brasenose. We will not quietly replace theirs with yours — both are kept, and a club officer decides which is right. Until then the club's own lists still say Farrowgate. You do not need to do anything else.",
  },
  {
    kind: "note",
    key: "nowho",
    text: "You are never told which officer recorded a value — only that the club did.",
  },
]);

// 2 — a value they own. It saves, and the page says so.
mark(a.mine, 2);
mark(a.straight, 3);
// 4 — a value the club owns. Their answer is kept, the club's still stands,
//     and W7 is where somebody chooses. Said before the submit, not after.
mark(a.theirs, 4);
mark(a.dispute, 5);
// 6 — and what the page will not tell them.
mark(a.nowho, 6);

setSubmit(s.submit, "Save changes");
setSecondary("Nothing you change here can affect whether you train, play or travel.");

await settle();
