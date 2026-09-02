// ---------------------------------------------------------------------------
// Helpers for the person record — `/operate/people/[personId]`, which ships.
//
// W7 adds no component. The record already renders a `Fact` row per person
// fact, a bordered `By` caption naming who supplied each value, and a history
// section filterable by field and by actor. Everything below finds those and
// extends them.
// ---------------------------------------------------------------------------

/** A section of the person record, found by its own heading text. */
const personSection = (title) =>
  must(
    $$(".MuiPaper-root, section, div").find((node) =>
      $$("h2, h3, p, span", node).some(
        (h) => (h.textContent ?? "").trim().toLowerCase() === title.toLowerCase(),
      ),
    ),
    `the person record has no "${title}" section`,
  );

/** One fact row, by its label. The label is the first cell of the Stack. */
const factRow = (label) =>
  must(
    $$("div").find((row) => {
      const first = row.children?.[0];
      return (
        row.children.length === 2 &&
        first &&
        (first.textContent ?? "").trim().toLowerCase() === label.toLowerCase()
      );
    }),
    `the person record has no ${label} row`,
  );

/** The value side of a fact row. */
const factValue = (row) => must(row.children[1], "a fact row has no value side");

/**
 * The record's own attribution badge, cloned. `By` renders a bordered caption
 * naming who supplied a value; W7 needs two of them on one row, so it clones
 * the shipped one rather than drawing a second style of badge.
 */
const byBadge = (text) => {
  // Clone a badge that is certainly one. The first attempt matched on computed
  // border style across every span on the page and picked something that was
  // not a badge at all, so the player's attribution rendered as bare grey text
  // jammed against the value. "intake form" is a real `By` badge on this
  // record's own contact rows.
  const tpl =
    $$("span").find((n) => (n.textContent ?? "").trim() === "intake form") ??
    $$("span").find(
      (n) =>
        n.children.length === 0 &&
        n.className.includes("MuiTypography-caption") &&
        parseFloat(getComputedStyle(n).borderTopWidth) > 0,
    );
  must(tpl, "the person record renders no attribution badge to clone");
  const badge = tpl.cloneNode(true);
  badge.textContent = text;
  badge.style.marginLeft = "8px";
  badge.style.whiteSpace = "nowrap";
  return badge;
};

/** Give a fact's value its attribution, replacing whatever badge it had. */
const setFactBadge = (row, text) => {
  const body = factValue(row);
  for (const n of $$("span", body)) {
    if (n.children.length === 0 && n.className.includes("MuiTypography-caption")) n.remove();
  }
  const badge = byBadge(text);
  const first = $$("*", body).find(
    (n) => n.children.length === 0 && (n.textContent ?? "").trim() && !n.className.includes("caption"),
  );
  (first ?? body).after?.(badge) ?? body.append(badge);
  if (first && first.parentElement) first.after(badge);
  return badge;
};

/** Replace a fact's value, keeping the record's own type and spacing. */
const setFactValue = (row, text) => {
  const body = factValue(row);
  const node = $$("*", body).find((n) => n.children.length === 0 && (n.textContent ?? "").trim());
  if (node) {
    node.textContent = text;
    node.style.fontStyle = "normal";
    node.style.color = "rgba(0,0,0,0.87)";
    return node;
  }
  body.textContent = text;
  return body;
};

/** A second line under a fact's value — the contested answer, in the same type. */
const addFactLine = (row, text, badge) => {
  const body = factValue(row);
  const line = document.createElement("div");
  line.style.cssText = "margin-top:4px";
  const value = document.createElement("span");
  value.className = "MuiTypography-root MuiTypography-body1";
  value.textContent = text;
  line.append(value);
  if (badge) line.append(badge);
  body.append(line);
  return line;
};
