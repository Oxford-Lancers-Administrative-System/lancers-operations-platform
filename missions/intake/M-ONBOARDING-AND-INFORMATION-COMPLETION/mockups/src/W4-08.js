// W4-08 — Already complete: the link opened with nothing left to give.
//
// The shipped answer link already has this state and its own words for it. This
// reuses that shape rather than inventing a second way to say the same thing:
// the heading states the fact, one line says what to do if something changes,
// and there is no form and no sequence to re-enter.
const s = answerShell();

setChip(s.chip, "ONBOARDING · 2026–27");
s.h1.textContent = "There is nothing left to fill in";
setLead(s.lead, "Rosalind Penhaligon · everything you can give us, we have");

dropEventLeftovers();

mark(
  setFacts(s.dl, [
    ["Messaging consent", "Given 14 Aug", DONE],
    ["Your details", "Complete", DONE],
    ["Code of Conduct", "Agreed 1 Sep", DONE],
    ["Photo release", "Agreed 1 Sep", DONE],
    ["BUCS Play", "Confirmed 1 Sep", DONE],
    ["Hudl", "Confirmed 1 Sep", DONE],
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
    key: "rest",
    text: "Subscriptions, kit, the squad photo and the messaging groups are the club's to tick off, not yours. You will not be asked about them here.",
  },
  {
    kind: "note",
    text: "If something on your record has changed, open this link again and correct it. It stays yours for the whole season, and it is the only link the club will ever send you.",
  },
]);

// 2 — the club still has items outstanding against this person. None of them
//     is the player's, so none of them appears on the player's page.
mark(a.rest, 2);

setSubmit(s.submit, "Close");
setSecondary("Nothing on your checklist ever blocks you from training, playing or travelling.");

await settle();
