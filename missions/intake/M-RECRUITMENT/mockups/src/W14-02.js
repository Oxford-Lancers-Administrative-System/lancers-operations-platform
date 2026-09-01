// W14-02 — Where the flip lands: the roster.
//
// Rebuilt 2026-08-31. The drawn green panel that used to sit at the top of this
// page is gone — Brian: "If somebody goes to Declined or something else, it
// doesn't need a callout. We don't need fucking callouts for this thing."
//
// The result speaks for itself: Marguerite Ashdown is on the roster, in her
// alphabetical place, with an onboarding status. Nothing narrates it. What the
// flip did to the record — who flipped it and when — is a status-history line
// on the record, which is where every other status change in this mission is
// already recorded, and not a banner on a board.
const table = must(document.querySelector("table"), "the roster has no table");
const tbody = must(table.querySelector("tbody"), "the roster table has no body");
const rows = must([...tbody.querySelectorAll("tr")], "the roster has no rows to clone");

// Where M sorts, so the row lands where a reader would look for it rather than
// at the top of a board that is plainly alphabetical.
const nameOf = (tr) => tr.querySelector("a")?.textContent.trim() ?? "";
const before = must(
  rows.find((tr) => nameOf(tr) > "Marguerite Ashdown"),
  "the roster has nobody sorting after Marguerite Ashdown",
);

const joined = before.cloneNode(true);
must(joined.querySelector("a"), "the cloned roster row has no name link").textContent =
  "Marguerite Ashdown";
tbody.insertBefore(joined, before);

// The phone rendering is a second copy of the same board, not a view of it, so
// the card list gets her too — the defect that shipped a recruitment heading
// over the roster's forty-two players twice in this mission.
const cards = must($$('[data-testid="roster-card"]'), "the phone rendering has no roster cards");
const cardBefore = must(
  cards.find(
    (c) =>
      (c.querySelector(".MuiTypography-subtitle1")?.textContent.trim() ?? "") >
      "Marguerite Ashdown",
  ),
  "the phone list has nobody sorting after Marguerite Ashdown",
);
const joinedCard = cardBefore.cloneNode(true);
must(
  joinedCard.querySelector(".MuiTypography-subtitle1"),
  "the cloned roster card has no name line",
).textContent = "Marguerite Ashdown";
cardBefore.parentElement.insertBefore(joinedCard, cardBefore);

mark(joined, 1);

await settle();
