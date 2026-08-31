// W8-01 — The duplicate check, on the recruitment surface.
//
// Brian, 2026-08-31: "This is happening inside of the people page. I don't want
// this to happen inside people. This is on the recruit page... I'm not going to
// the people page to do this."
//
// He is right. The check is not one page: it is a step that belongs to whichever
// door is being used, and it renders inside that door. This screen is the check
// as it runs when an operator is adding a RECRUIT, so it wears recruitment's
// shell — the proposed route is /operate/recruitment/new. The photograph is of
// /operate/people/new because that is the surface on main that implements the
// check; the shell it is dressed in is the proposal.
//
// The second thing he asked for is the identity of each candidate: "I want to
// see what their status is. Are they a part of the current season? Are they
// already a player on the season? Are they another recruit? Who are they,
// because it could have the same name."
selectRecruitmentNav();
setHeading("Add a recruit");
relabelButton("← People", "← Recruitment");

fill("givenName", "Alaric");
fill("familyName", "Brindlewood");
fill("mobile", "07700 900753");

await openControl("check for duplicates", 1400);

// ---- Who each candidate actually is ---------------------------------------
// The shipped rows carry a name, a contact line and the fields that matched.
// None of that says whether this person is on the team, on the recruit board, or
// long gone — which is the whole question when two people share a surname.
//
// The vocabulary is not invented: membership status and season come from
// MEMBERSHIP_STATUS_LABELS, and the recruit rung from the ladder this mission
// already approved on the board.
const IDENTITY = {
  "Alaric Brindlewood": {
    text: "Player · Active · this season",
    fg: "#1b5e20",
    bg: "#e8f5e9",
    border: "#a5d6a7",
  },
  "Garrick Brindlewood": {
    text: "Past member · last played 2024-25",
    fg: "#455a64",
    bg: "#eceff1",
    border: "#b0bec5",
  },
};

// Find each candidate by its NAME, which is a leaf, rather than by inferring
// which container is a "row". The first attempt guessed at row containers and
// inserted the badges somewhere invisible, and because it found *something* the
// guard did not fire — a reminder that `must` only proves a thing was found, not
// that it was the right thing.
let placed = 0;
for (const [name, badge] of Object.entries(IDENTITY)) {
  const nameNode = [...document.querySelectorAll("*")].find(
    (n) => n.children.length === 0 && n.textContent.trim() === name,
  );
  if (!nameNode) continue;
  const contact = [...(nameNode.parentElement?.children ?? [])].find((n) =>
    /07700/.test(n.textContent),
  );
  const line = document.createElement("div");
  line.textContent = badge.text;
  line.style.cssText =
    `display:inline-block;margin-top:6px;font-size:12px;font-weight:700;padding:3px 10px;` +
    `border-radius:11px;color:${badge.fg};background:${badge.bg};border:1px solid ${badge.border}`;
  (contact ?? nameNode).after(line);
  placed += 1;
}
if (placed !== Object.keys(IDENTITY).length) {
  throw new Error(
    `Only ${placed} of ${Object.keys(IDENTITY).length} candidates got an identity badge.`,
  );
}

// Mark the card that HOLDS the heading, not the first ancestor whose text
// happens to contain it — that was the page.
const heading = must(
  [...document.querySelectorAll("*")].find(
    (n) => n.children.length === 0 && /^Already in the club$/i.test(n.textContent.trim()),
  ),
  "the form did not render an Already in the club result",
);
mark(must(heading.closest(".MuiPaper-root"), "the result has no card"), 1);

await settle();
