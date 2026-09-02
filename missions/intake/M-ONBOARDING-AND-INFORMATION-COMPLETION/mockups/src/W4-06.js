// W4-06 — Step 5: Hudl, on its own page.
//
// Owner direction, 2026-09-02: "the instructions for Huddle should also be on
// its own separate page. Not tagged on for what, however it's done here."
// It rode on the BUCS Play page in the previous draft; it does not now.
//
// Hudl is the one item on the whole checklist whose first half is the club's
// job. An operator sends the invitation; the player accepts it. Hudl's own
// roster reads `Pending Invite` in between, which is exactly the state this
// page has to be honest about — a player who has had no invitation cannot do
// anything here, and the page must not imply they are the hold-up.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "Get into Hudl";
setLead(s.lead, "Step 5 of 5 · Accept your invitation");

dropEventLeftovers();

mark(
  setFacts(s.dl, [
    ["BUCS Play", "Claimed just now", DONE],
    ["Hudl invitation", "Sent by the club, 28 Aug", DONE],
    ["Your acceptance", "Not yet confirmed", OUTSTANDING],
    ["Instructions", "Owed — not written", OUTSTANDING],
  ]),
  1,
);

setPrivacy(
  s.privacy,
  "Hudl is run by Hudl, not by the club. The club records only that it invited you, and whether you say you are in.",
);

const a = buildForm(s, [
  {
    kind: "note",
    key: "twoparts",
    text: "This one has two halves and the club owns the first. An operator sends your invitation; you accept it. The club has sent yours — if it never arrived, say so below rather than working around it.",
  },
  {
    kind: "steps",
    key: "steps",
    steps: [
      "PLACEHOLDER STEP. Look for an invitation email from Hudl, sent to the address the club holds for you.",
      "PLACEHOLDER STEP. Follow the link in it and set up your Hudl account.",
      "PLACEHOLDER STEP. Confirm you can see the Oxford Lancers team once you are in.",
    ],
  },
  {
    kind: "note",
    key: "owed",
    text: 'PLACEHOLDER. The email-invite method is assumed — Brian, 2026-09-01: "doesn\'t really matter for my purposes". The real instruction copy is owed by this mission and nobody has written it.',
  },
  { kind: "heading", text: "Are you in?" },
  {
    kind: "consent",
    key: "claim",
    checked: false,
    label: "Yes — I have accepted the invitation and I can see the team.",
    note: "Records claimed, not complete, like BUCS Play.",
  },
  {
    kind: "consent",
    key: "noinvite",
    checked: false,
    label: "No invitation has reached me.",
    note: "This puts the item back on the club, not on you. Nothing about it is counted against you until an invitation has actually gone out.",
  },
]);

// 2 — the half the club owns, said plainly at the top.
mark(a.twoparts, 2);
// 3 — the steps, now that this is a page of its own.
mark(a.steps, 3);
// 4 — the copy still owed.
mark(a.owed, 4);
// 5 — and the answer that hands the item back to the club rather than leaving
//     the player looking like the hold-up.
mark(a.noinvite, 5);

setSubmit(s.submit, "Finish");
setSecondary("If you have not got in yet, finish anyway. The club will ask you again.");

await settle();
