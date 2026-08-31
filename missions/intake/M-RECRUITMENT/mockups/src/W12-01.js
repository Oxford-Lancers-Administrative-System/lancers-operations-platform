// W12-01 — Recruits as a category at the top of the sheet.
//
// Brian, 2026-08-31: "I don't know why we're reinventing fucking UI. That's
// perfectly good. For a recruitment event, the recruits just need to go on top
// as their own category."
//
// So nothing here is authored. The sheet already groups — Attending, Everyone
// else, Walk-ups — with a toggle, a label, a detail line, a count chip and a
// list of rows. This clones that group wholesale, renames it, fills it with
// cloned real rows, and moves it to the front. Every control, state button,
// chip and spacing below is the application's own markup.
const groups = $("[data-testid='attendance-groups']");
const attending = $("[data-testid='attendance-group-attending']");
const template = attending ?? $("[data-testid^='attendance-group-']");

if (template && groups) {
  const recruits = template.cloneNode(true);
  recruits.setAttribute("data-testid", "attendance-group-recruits");

  // The group's own heading, detail and count — same nodes, new words.
  const heading = recruits.querySelector("h2");
  if (heading) heading.textContent = "Recruits";
  const detail = heading?.parentElement?.querySelector(".MuiTypography-body2");
  if (detail) detail.textContent = "Invited through recruitment · not members";
  const count = recruits.querySelector("[data-testid^='attendance-group-count-']");
  if (count) {
    count.setAttribute("data-testid", "attendance-group-count-recruits");
    const label = count.querySelector(".MuiChip-label") ?? count;
    label.textContent = "4";
  }

  // The rows: the sheet's own row markup, cloned, with only the name changed.
  // A recruit's funnel status never appears on a sheet a coach can open, so
  // there is nothing else on a recruit row that a player row does not have.
  const list = recruits.querySelector("ul");
  const rowTemplate = list?.querySelector("[data-testid='attendance-row']");
  if (list && rowTemplate) {
    const names = [
      "Rosalind Penhaligon",
      "Tobias Wrenfield",
      "Marguerite Ashdown",
      "Clementine Varrow",
    ];
    list.textContent = "";
    for (const name of names) {
      const row = rowTemplate.cloneNode(true);
      row.setAttribute("data-participant", `recruit-${name.split(" ")[0].toLowerCase()}`);
      row.setAttribute("data-presence", "none");
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
