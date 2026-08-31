// W12-02 — The same sheet, opened by a coach. What is absent is the point.
setHeading("Freshers' Fair — stand", "30 April 2026 · opened by Zenas Yaxlington, Head Coach");
appendCard(
  "What the coach sees",
  [
    makeRow("Rosalind Penhaligon", "Present  ·  Not present  ·  Not recorded"),
    makeRow("Tobias Wrenfield", "Present  ·  Not present  ·  Not recorded"),
    makeRow("Marguerite Ashdown", "Present  ·  Not present  ·  Not recorded"),
  ],
  "Names, and the one-touch attendance states. That is the whole payload.",
);
const absent = drawnPanel("What is absent — not hidden, absent");
absent.style.border = "1px solid rgba(178,106,0,0.55)";
absent.style.background = "#fdf6ec";
absent.append(
  makeRow("Recruitment status", "Not in the page, not in the payload"),
  makeRow("Contact values", "Not in the page, not in the payload"),
  makeRow("Notes and signals", "Not in the page, not in the payload"),
  makeRow("The recruit board", "Not reachable at all from this surface"),
);
absent.append(
  note(
    "A coach reading “declined” beside somebody standing in front of them is both a privacy leak and a bad afternoon. Absent rather than hidden is the LAN-75 contract: the data never reaches the browser, so there is nothing to reveal by inspecting the page.",
  ),
);
const anchor = cardTemplate();
(anchor?.parentElement ?? document.body).append(absent);
