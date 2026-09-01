// W12-02 — The same sheet opened by a coach.
//
// What is absent is the point, and absence cannot be drawn as a card listing
// what is absent — that is narration. So this screen is the real coach view:
// the recruits group is present because a coach records attendance for it, and
// every recruitment affordance an operator has is simply not in the page. The
// screen head names what to look for; the outlines point at where to look.
setHeading("Attendance · Freshers' Fair — stand", "Opened by Zenas Yaxlington, Head Coach");

// 1. The recruits group is here — a coach marks recruits present like anyone
//    else. Built the same way as W12-01, from the sheet's own markup.
const groups = $("[data-testid='attendance-groups']");
const template = $("[data-testid='attendance-group-attending']");
if (template && groups) {
  const recruits = template.cloneNode(true);
  recruits.setAttribute("data-testid", "attendance-group-recruits");
  const heading = recruits.querySelector("h2");
  if (heading) heading.textContent = "Recruits";
  const detail = heading?.parentElement?.querySelector(".MuiTypography-body2");
  if (detail) detail.textContent = "Invited through recruitment · not members";
  const count = recruits.querySelector("[data-testid^='attendance-group-count-']");
  if (count) (count.querySelector(".MuiChip-label") ?? count).textContent = "4";
  const list = recruits.querySelector("ul");
  const rowTemplate = list?.querySelector("[data-testid='attendance-row']");
  if (list && rowTemplate) {
    list.textContent = "";
    for (const name of ["Rosalind Penhaligon", "Tobias Wrenfield"]) {
      const row = rowTemplate.cloneNode(true);
      const displayName = row.querySelector(".MuiTypography-body1");
      if (displayName) displayName.textContent = name;
      const rsvp = row.querySelector(".MuiTypography-body2");
      if (rsvp) rsvp.textContent = "Invited · no answer yet";
      for (const chip of row.querySelectorAll(
        "[data-testid='walk-up-chip'], [data-testid='mismatch-chip']",
      )) {
        chip.remove();
      }
      list.append(row);
    }
  }
  groups.insertBefore(recruits, groups.firstChild);
  mark(recruits, 1);
}

// 2. A recruit row carries a name and an RSVP line and nothing else. No status,
//    no source, no notes, no link to the board — absent from the page and from
//    the payload, which is the LAN-75 contract. Outlining the row is the way to
//    show that; a list of what is missing would be narration.
const firstRow = $("[data-testid='attendance-group-recruits'] [data-testid='attendance-row']");
if (firstRow) mark(firstRow, 2);

// 3. The navigation a coach receives. Recruits is not in it.
const nav = $("nav");
if (nav) mark(nav, 3);
