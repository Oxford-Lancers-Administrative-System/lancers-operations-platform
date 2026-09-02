// ---------------------------------------------------------------------------
// Helpers for the operator's player record — `/operate/roster/[membershipId]`,
// which ships. W6 deepens the Onboarding section already there; it draws no new
// surface, so these find shipped elements and extend them rather than authoring
// cards.
//
// Everything below hangs off the test ids the record already exports —
// `section-onboarding`, `record-row`, `data-label` — rather than off position
// or font size. The first draft of these helpers guessed at the heading by
// measuring text, and `must()` refused all three screens rather than
// photographing a page it had not actually changed.
// ---------------------------------------------------------------------------

const onboardingSection = () =>
  must(
    $('[data-testid="section-onboarding"]'),
    "this page has no onboarding section — it is not a player record",
  );

const setSectionTitle = (section, text) => {
  const h = must(section.querySelector("h2"), "the section has no heading");
  h.textContent = text;
  return h;
};

/** One item's row, by the label the record itself stamps on it. */
const itemRow = (section, label) =>
  must(
    section.querySelector(`[data-testid="record-row"][data-label="${label}"]`),
    `the checklist has no ${label} row`,
  );

/** The value side of a row — the second Box, where the note and chips live. */
const rowBody = (row) =>
  must(row.children[1] ?? row.children[0], "a record row has no value side");

/**
 * Set or add the small note under a row's value. The shipped `provenanceNote`
 * says "Completed <day>" and never who; every W6 screen is about that gap.
 */
const setRowNote = (row, text, tone = "rgba(0,0,0,.6)") => {
  const body = rowBody(row);
  const existing = $$("span, p", body).find((n) =>
    n.className.includes("MuiTypography-caption"),
  );
  if (existing) {
    existing.textContent = text;
    existing.style.color = tone;
    return existing;
  }
  const note = document.createElement("span");
  note.className = "MuiTypography-root MuiTypography-caption";
  note.style.cssText = `display:block;margin-top:2px;font-size:12px;line-height:1.5;color:${tone}`;
  note.textContent = text;
  body.append(note);
  return note;
};

/** A shipped chip, cloned, so state pills cannot drift from what MUI renders. */
const chipLike = (section, text, colour) => {
  const tpl = must(section.querySelector(".MuiChip-root"), "the section has no chip to clone");
  const chip = tpl.cloneNode(true);
  const label = chip.querySelector(".MuiChip-label") ?? chip;
  label.textContent = text;
  if (colour) {
    chip.style.borderColor = colour;
    chip.style.color = colour;
  }
  return chip;
};

/** Put chips on a row's value side, above its note. */
const chipRow = (row, chips) => {
  const body = rowBody(row);
  const holder = document.createElement("div");
  holder.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin:0 0 3px";
  for (const chip of chips) holder.append(chip);
  body.prepend(holder);
  return holder;
};

/** Replace the section's rows wholesale — used only where the content is not a checklist. */
const replaceRows = (section, entries) => {
  const rows = $$('[data-testid="record-row"]', section);
  must(rows, "the section has no rows to rebuild from");
  const template = rows[0];
  const anchor = template.parentElement;
  for (const row of rows.slice(1)) row.remove();
  const built = [];
  entries.forEach(([label, note, tone], index) => {
    const row = index === 0 ? template : template.cloneNode(true);
    row.setAttribute("data-label", label);
    const heading = must(row.children[0], "a row lost its label side");
    const text = heading.querySelector("p, span") ?? heading;
    text.textContent = label;
    const body = rowBody(row);
    for (const chip of $$(".MuiChip-root", body)) chip.remove();
    setRowNote(row, note, tone);
    row.dataset.intakeRebuilt = "1";
    if (index > 0) anchor.append(row);
    built.push(row);
  });
  return built;
};

const ITEM_DONE = "#2e7d32";
const ITEM_OPEN = "#b26a00";
const ITEM_CLAIMED = "#0288d1";

const ITEM_STATUS_WORDS =
  /^\s*(Pending|Invited|Complete|Completed|Waived|Not applicable|Claimed|Outstanding)\s*$/i;

/**
 * Replace the status the row already renders, rather than adding a second one
 * beside it. The first shoot of W6-01 put a "Complete" chip next to the shipped
 * word "Pending" on the same row, so every marked row contradicted itself —
 * exactly the failure the mission's own notes warn about.
 */
const setRowStatus = (row, text, tone) => {
  const body = rowBody(row);
  const node = must(
    $$("*", body).filter((n) => n.children.length === 0 && ITEM_STATUS_WORDS.test(n.textContent ?? ""))[0],
    `the ${row.getAttribute("data-label")} row renders no status to replace`,
  );
  node.textContent = text;
  if (tone) {
    node.style.color = tone;
    node.style.fontWeight = "600";
  }
  return node;
};

/** The shipped outstanding alert. It must never contradict the rows above it. */
const setOutstandingAlert = (section, text) => {
  const alert = must(
    section.querySelector(".MuiAlert-root"),
    "the onboarding section has no outstanding alert",
  );
  const body = alert.querySelector(".MuiAlert-message") ?? alert;
  body.textContent = text;
  return alert;
};

/** Drop the item status from a row entirely — a log row has no status to show. */
const clearRowStatus = (row) => {
  const body = rowBody(row);
  for (const n of $$("*", body)) {
    if (n.children.length === 0 && ITEM_STATUS_WORDS.test(n.textContent ?? "")) n.remove();
  }
  return row;
};

/** Remove the outstanding alert, for a section that is no longer a checklist. */
const dropOutstandingAlert = (section) => {
  section.querySelector(".MuiAlert-root")?.remove();
};
