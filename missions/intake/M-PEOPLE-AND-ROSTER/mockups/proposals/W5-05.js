/*
 * W5-01 — the roster as a working board, evaluated into the live page.
 *
 * Brian, 2026-08-27: "this needs to look like a spreadsheet… It should be a
 * giant board where I can add things here. They should be big columns, and I'm
 * expecting to scroll side to side… if that information is there, it needs to
 * be editable from here."
 *
 * So: every column the season carries, wide, scrolling inside its own
 * container, sortable, and editable in the cell. Nothing here is a redesign of
 * the application's style — the shell, the type scale and the chips are the
 * page's own, and the grid is the same MUI table with more columns.
 *
 * Two columns are deliberately absent and always will be: date of birth and
 * emergency contact never appear on any list (Task 08 §6). Raw contact values
 * are absent for the same reason; the grid carries indicators.
 *
 * Values are derived from what the page already shows. A column with no
 * substrate on `main` renders an empty editable cell rather than invented data.
 */
(() => {
  const NR = '<span style="color:rgba(0,0,0,0.26);font-style:italic">—</span>';
  const LADDER = { Confirmed: "Onboarding", "Carried forward": "Onboarding", Withdrawn: "Departed" };
  const TONE = {
    Active: ["#2e7d32", "#fff"],
    Onboarding: ["#0288d1", "#fff"],
    Inactive: ["#ed6c02", "#fff"],
    Departed: ["rgba(0,0,0,0.08)", "rgba(0,0,0,0.87)"],
    Archived: ["rgba(0,0,0,0.08)", "rgba(0,0,0,0.87)"],
  };
  const chip = (t) => {
    const [bg, fg] = TONE[t] ?? ["rgba(0,0,0,0.08)", "rgba(0,0,0,0.87)"];
    return `<span style="display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:16px;background:${bg};color:${fg};font-size:0.75rem;white-space:nowrap">${t}</span>`;
  };
  const outline = (t) =>
    `<span style="display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:16px;border:1px solid rgba(0,0,0,0.23);font-size:0.75rem;white-space:nowrap">${t}</span>`;
  const warn = (t) =>
    `<span style="display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:16px;border:1px solid rgba(237,108,2,0.6);color:#663c00;font-size:0.75rem;white-space:nowrap">${t}</span>`;

  const collegeOf = (email) => {
    const m = /@([a-z]+)\.ox\.ac\.example$/.exec((email || "").trim());
    return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : null;
  };
  const text = (c) => (c ? c.textContent.trim() : "");
  const has = (v) => v && v !== "—";

  /*
   * Two kinds of cell, which is the whole shape of this board.
   *
   * A **season** cell edits where it sits: the dashed underline is the
   * affordance, and there is no prior truth being overwritten.
   *
   * A **person** cell shows the value and does not edit it here. Brian,
   * 2026-08-27: "anything that needs to be edited there needs to be edited in
   * the people thing there because it is an override… The columns for the
   * people data should be more deliberate, where you can't just willy-nilly
   * change that, but you should show as much as you possibly can." So it
   * renders plainly and opens the person record, where W2's rules apply — a
   * reason when a value is replaced, contacts superseding, every edit audited.
   */
  const cell = (html) =>
    `<span style="display:inline-block;min-width:34px;border-bottom:1px dashed rgba(0,0,0,0.3);padding-bottom:1px">${html}</span>`;
  const personCell = (html) =>
    `<span style="display:inline-block;min-width:34px;color:rgba(0,0,0,0.87)">${html}</span>`;

  const table = document.querySelector('table[aria-label="Roster"]');
  if (!table) return;

  /* Column order runs identity → season → football → admin → flags, because
     that is the order an operator reads a person in. */
  const COLUMNS = [
    "Player", "Standing", "Entry",
    "College", "Matric", "Grad", "Degree",
    "Positions", "Blue #", "White #", "Coach group",
    "Onboarding", "Formalwear", "Blues", "Eligibility", "Availability",
    "Contactable", "Missing",
  ];

  const head = table.tHead.rows[0];
  const th = head.cells[1];
  head.innerHTML = "";
  COLUMNS.forEach((label) => {
    const c = th.cloneNode(true);
    c.textContent = label;
    c.style.whiteSpace = "nowrap";
    head.appendChild(c);
  });

  Array.from(table.tBodies[0].rows).forEach((row) => {
    const name = row.cells[0].innerHTML;
    const status = text(row.cells[1]);
    const entry = text(row.cells[2]);
    const email = text(row.cells[3]);
    const phone = text(row.cells[4]);
    const onboarding = text(row.cells[5]);
    const college = collegeOf(email);

    const contact = [];
    if (has(phone)) contact.push(outline("Mobile"));
    if (has(email)) contact.push(outline("Email"));

    let missing = 0;
    if (!has(phone)) missing += 1;
    if (!has(email)) missing += 1;
    if (!college) missing += 1;

    const cells = [
      name,
      cell(chip(LADDER[status] ?? status)),
      cell(entry),
      /* person facts — shown, not edited here */
      personCell(college ?? NR), personCell(NR), personCell(NR), personCell(NR),
      /* season facts — edited in the cell */
      cell(NR), cell(NR), cell(NR), cell(NR),
      onboarding,
      cell(NR), cell(NR), cell(NR), cell(NR),
      contact.length ? contact.join(" ") : NR,
      missing ? warn(`${missing}`) : NR,
    ];

    const proto = row.cells[1];
    const cls = row.cells[1].getAttribute("class") || "";
    row.innerHTML = "";
    cells.forEach((html, i) => {
      const td = proto.cloneNode(false);
      td.setAttribute("class", cls);
      td.style.whiteSpace = "nowrap";
      if (i === 0) td.style.position = "sticky", (td.style.left = "0"), (td.style.background = "#fff"), (td.style.zIndex = "1");
      td.innerHTML = html;
      row.appendChild(td);
    });
  });

  /* Wide, and scrolling inside its own container rather than the page. The
     player column stays put so a row stays identifiable at column sixteen. */
  table.style.minWidth = "1900px";
  const container = table.closest(".MuiTableContainer-root");
  if (container) container.style.overflowX = "auto";
  const firstHead = head.cells[0];
  if (firstHead) {
    firstHead.style.position = "sticky";
    firstHead.style.left = "0";
    firstHead.style.background = "#fafafa";
    firstHead.style.zIndex = "2";
  }

  /* One season cell open, to show what editing in place looks like. Positions,
     not College — a person fact is never edited from this grid. */
  const target = table.tBodies[0].rows[1]?.cells[7];
  if (target) {
    target.innerHTML =
      '<span style="display:inline-flex;align-items:center;gap:6px;border:2px solid #0b3d91;border-radius:6px;padding:2px 8px;background:#fff">' +
      '<span>O · ST</span><span style="color:rgba(0,0,0,0.54)">&#9662;</span></span>';
  }

  /* The header marks which columns belong to the person rather than the season,
     so the two kinds of cell are not a puzzle solved by clicking. */
  [3, 4, 5, 6].forEach((n) => {
    const c = head.cells[n];
    if (!c) return;
    c.innerHTML =
      '<div>' + c.textContent + '</div>' +
      '<div style="font-weight:400;text-transform:none;letter-spacing:0;font-size:10px;color:rgba(0,0,0,0.6)">person</div>';
  });

  const sub = document.querySelector('[data-testid="season-label"]');
  if (sub) sub.textContent = sub.textContent.replace(/\d+ memberships/, "42 players · 18 columns");

  /* MUI v9 does not render these labels as `label` elements, so the control is
     found by its own text rather than by a label lookup. */
  const filterRow = (() => {
    const form = document.querySelector('[data-testid="roster-filters"]');
    if (!form) return null;
    return Array.from(form.querySelectorAll(".MuiFormControl-root")).find((f) =>
      /^Entry/.test(f.textContent.trim()),
    );
  })();
  if (filterRow && filterRow.parentNode) {
    const box = window.getComputedStyle(filterRow);
    ["College", "Position", "Onboarding", "Missing"].forEach((label) => {
      const el = document.createElement("div");
      el.style.cssText = [
        "position:relative", "min-width:132px", "height:" + box.height,
        "display:flex", "align-items:center", "justify-content:space-between",
        "gap:8px", "padding:0 14px", "border:1px solid rgba(0,0,0,0.23)",
        "border-radius:8px", "background:#fff", "font-size:1rem",
      ].join(";");
      el.innerHTML =
        '<span style="position:absolute;top:-9px;left:9px;background:#fff;padding:0 6px;font-size:0.75rem;line-height:1;color:rgba(0,0,0,0.6)">' +
        label + '</span><span>All</span><span style="color:rgba(0,0,0,0.54)">\u25be</span>';
      filterRow.parentNode.appendChild(el);
    });
  }

  if (container) container.scrollLeft = 4000;

  const search = document.querySelector('[data-testid="roster-filters"] label');
  if (search && /Search/.test(search.textContent)) search.textContent = "Search name or alias";
  document.querySelectorAll('[data-testid="roster-filters"] input[name="q"]').forEach((i) => {
    i.setAttribute("placeholder", "Name or alias");
  });
})();
