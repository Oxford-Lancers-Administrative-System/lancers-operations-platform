// ---------------------------------------------------------------------------
// Helpers for the missing-data queue — `/operate/people/missing`, which ships.
//
// W8 adds columns and an action to a real MUI Table. Everything below clones
// the table's own cells so type, padding and borders cannot drift.
// ---------------------------------------------------------------------------

const queueTable = () =>
  must($('[data-testid="missing-card"] table') ?? $("table"), "this page has no queue table");

const queueRows = () => must($$('[data-testid="missing-row"]'), "the queue has no rows");

const headerCells = (table) => must($$("thead th", table), "the queue table has no header cells");

/** Add a column: one header, and one cell per row, cloned from the table's own. */
const addColumn = (table, label, valueFor, { before = null } = {}) => {
  const heads = headerCells(table);
  const headTpl = heads[1].cloneNode(true);
  const link = headTpl.querySelector("a, button, span[role='button']");
  const headText = link ?? headTpl;
  headText.textContent = label;
  if (link) link.removeAttribute("href");
  const anchorIndex = before === null ? heads.length - 1 : before;
  heads[anchorIndex].before(headTpl);

  const built = [];
  queueRows().forEach((row, index) => {
    const cells = $$("td", row);
    const cellTpl = cells[2].cloneNode(true);
    cellTpl.textContent = "";
    const value = valueFor(row, index);
    if (typeof value === "string") {
      const p = document.createElement("p");
      p.className = "MuiTypography-root MuiTypography-body2";
      p.style.cssText = "margin:0;font-size:13px";
      p.textContent = value;
      cellTpl.append(p);
    } else if (value) {
      cellTpl.append(value);
    }
    cells[anchorIndex].before(cellTpl);
    built.push(cellTpl);
  });
  return built;
};

/** The queue's own row name, so a proposal can talk about a real person. */
const rowName = (row) => ($$("td", row)[0]?.textContent ?? "").trim();

/** Clone the table's own outlined Button — used for the per-row action. */
const rowButton = (row, label) => {
  const tpl = must(
    row.querySelector("td:last-child .MuiButton-root"),
    "a row has no action button",
  );
  const button = tpl.cloneNode(true);
  button.textContent = label;
  button.removeAttribute("href");
  return button;
};

/** A selection checkbox in the app's own idiom — the roster board ships these. */
const selectBox = (checked) => {
  const wrap = document.createElement("span");
  wrap.style.cssText = "display:inline-flex;align-items:center;justify-content:center";
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = `width:20px;height:20px;fill:${checked ? "#1565c0" : "rgba(0,0,0,0.6)"}`;
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute(
    "d",
    checked
      ? "M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
      : "M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm0 16H5V5h14v14z",
  );
  svg.append(path);
  wrap.append(svg);
  return wrap;
};

/** Retitle the page heading. */
const setQueueHeading = (text) => {
  const h1 = must($("h1"), "the queue page has no heading");
  h1.textContent = text;
  return h1;
};
