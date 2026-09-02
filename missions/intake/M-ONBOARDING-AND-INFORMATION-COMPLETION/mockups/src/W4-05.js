// W4-05 — Step 4: BUCS Play, as a set of steps on its own page.
//
// Owner direction, 2026-09-01: "Bucs play should be a set of steps. Again,
// that's its own page as well." Hudl left this page on 2026-09-02: "the
// instructions for Huddle should also be on its own separate page."
//
// **The steps are placeholder and are marked as such.** Stewart described this
// ask on 2026-08-11 — "giving Jamie Carter the App Store download link for the
// app. He downloads it. He fills it out with some instructions in the text
// message that say do this this this" — and Task 10 deferred that copy to Task
// 11, which is this mission. Nobody has written it.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "Register on BUCS Play";
setLead(s.lead, "Step 4 of 5 · Do these, then tell us");

dropEventLeftovers();

mark(
  setFacts(s.dl, [
    ["Photo release", "Agreed just now", DONE],
    ["BUCS Play", "Not yet confirmed", OUTSTANDING],
    ["Confirmed by", "You, then the club", OUTSTANDING],
    ["Instructions", "Owed — not written", OUTSTANDING],
  ]),
  1,
);

setPrivacy(
  s.privacy,
  "BUCS Play is run by British Universities and Colleges Sport, not by the club. Nothing you do there is visible here — the club records only whether you say you have done it.",
);

const a = buildForm(s, [
  {
    kind: "steps",
    key: "steps",
    steps: [
      "PLACEHOLDER STEP. Download the BUCS Play app. The real copy names the store and carries the link.",
      "PLACEHOLDER STEP. Register with your Oxford email address, not a personal one.",
      "PLACEHOLDER STEP. Search for Oxford Lancers and select the club.",
      "PLACEHOLDER STEP. Complete whatever BUCS asks you for. This has to be done again every year.",
    ],
  },
  {
    kind: "note",
    key: "owed",
    text: "PLACEHOLDER. These four steps stand in for instruction copy this mission owes and nobody has written. They block no build and no walk; they block a real send.",
  },
  { kind: "heading", text: "Have you done it?" },
  {
    kind: "consent",
    key: "claim",
    checked: false,
    label: "Yes — I have registered on BUCS Play and selected Oxford Lancers.",
    note: "This records claimed, not complete. The compliance owner confirms it against the BUCS roster, and W6 is where that happens.",
  },
]);

// 2 — the steps, which is what makes this a page rather than a tick.
mark(a.steps, 2);
// 3 — and the copy that does not exist yet.
mark(a.owed, 3);
// 4 — the player's own answer records `claimed`, never `complete`.
mark(a.claim, 4);

setSubmit(s.submit, "Continue");
setSecondary("If you have not done it yet, continue anyway. The club will ask you again.");

await settle();
