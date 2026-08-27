/*
 * W5-01 — the roster as a working board, evaluated into the live page.
 *
 * Brian, 2026-08-27: "this needs to look like a spreadsheet… a giant board
 * where I can add things here… I'm expecting to scroll side to side", and then:
 * "I want to have the columns grouped together so that they're kind of
 * color-coded… person details, onboarding details, season details."
 *
 * So the header carries a banded group row above the column names, and every
 * cell in a group carries the same tint. Colour never carries the meaning on
 * its own: the band is labelled.
 *
 * Two kinds of cell. A **season** cell edits where it sits. A **person** cell
 * shows the value and opens the person record instead, because changing one is
 * an override and W2 owns what that costs.
 *
 * Date of birth and emergency contact are absent and always will be — Task 08
 * §6 keeps them off every list. Raw contact values likewise; the grid carries
 * indicators.
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

  /* Three groups, in the order Brian named them. Each is a band over its
     columns and a tint on their cells. */
  const GROUPS = [
    { name: "", tint: "transparent", band: "transparent", ink: "inherit", cols: ["Player"] },
    {
      name: "Person",
      tint: "rgba(69,90,100,0.05)",
      band: "#455a64",
      ink: "#fff",
      cols: ["College", "Matric", "Grad", "Degree", "Contactable", "Missing"],
    },
    {
      name: "Onboarding",
      tint: "rgba(237,108,2,0.05)",
      band: "#a8560a",
      ink: "#fff",
      cols: ["Onboarding"],
    },
    {
      name: "Season",
      tint: "rgba(11,61,145,0.05)",
      band: "#0b3d91",
      ink: "#fff",
      cols: [
        "Status", "Entry", "Positions", "Blue #", "White #",
        "Coach group", "Formalwear", "Blues", "Eligibility", "Availability",
      ],
    },
  ];
  const FLAT = GROUPS.flatMap((g) => g.cols.map((c) => ({ col: c, group: g })));
  const PERSON_EDITS_ELSEWHERE = new Set(["College", "Matric", "Grad", "Degree"]);
  const READ_ONLY = new Set(["Player", "Contactable", "Missing", "Onboarding"]);

  /* What this screen shows as already filtered. Coach group is the point of the
     example: it lives far to the right and is scrolled off, so without the chip
     bar the operator would have no way to see it was set. */
  const ACTIVE_COLUMN_FILTERS = { "Coach group": "Offense", Availability: "Green" };

  const table = document.querySelector('table[aria-label="Roster"]');
  if (!table) return;

  const head = table.tHead.rows[0];
  const protoTh = head.cells[1];

  /* The band row, above the names. */
  const bandRow = document.createElement("tr");
  GROUPS.forEach((g) => {
    const th = protoTh.cloneNode(false);
    th.setAttribute("colspan", String(g.cols.length));
    th.style.cssText =
      `background:${g.band};color:${g.ink};text-align:left;white-space:nowrap;` +
      "font-size:11px;letter-spacing:0.08em;text-transform:uppercase;padding:6px 12px;border:0";
    th.textContent = g.name;
    bandRow.appendChild(th);
  });
  table.tHead.insertBefore(bandRow, head);

  head.innerHTML = "";
  FLAT.forEach(({ col, group }) => {
    const c = protoTh.cloneNode(true);
    c.style.whiteSpace = "nowrap";
    c.style.background = group.tint;
    /* Every column filters from its own header. The control costs no extra
       space, which is the only way this scales to eighteen columns — and it is
       why the chip bar below the header is not optional: a filter set on a
       column that is scrolled off would otherwise be invisible. */
    const active = ACTIVE_COLUMN_FILTERS[col];
    c.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px">' +
      `<span>${col}</span>` +
      (col === "Player"
        ? ""
        : `<span style="font-size:11px;line-height:1;color:${active ? "#0b3d91" : "rgba(0,0,0,0.32)"}">&#9660;</span>`) +
      "</div>" +
      (PERSON_EDITS_ELSEWHERE.has(col)
        ? '<div style="font-weight:400;text-transform:none;letter-spacing:0;font-size:10px;color:rgba(0,0,0,0.6)">edit on the record</div>'
        : "");
    head.appendChild(c);
  });

  const editable = (html) =>
    `<span style="display:inline-block;min-width:34px;border-bottom:1px dashed rgba(0,0,0,0.3);padding-bottom:1px">${html}</span>`;

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

    const VALUES = {
      Player: name,
      College: college ?? NR,
      Matric: NR, Grad: NR, Degree: NR,
      Contactable: contact.length ? contact.join(" ") : NR,
      Missing: missing ? warn(String(missing)) : NR,
      Onboarding: onboarding,
      Status: chip(LADDER[status] ?? status),
      Entry: entry,
      Positions: NR, "Blue #": NR, "White #": NR, "Coach group": NR,
      Formalwear: NR, Blues: NR, Eligibility: NR, Availability: NR,
    };

    const proto = row.cells[1];
    const cls = proto.getAttribute("class") || "";
    row.innerHTML = "";
    FLAT.forEach(({ col, group }, i) => {
      const td = proto.cloneNode(false);
      td.setAttribute("class", cls);
      td.style.whiteSpace = "nowrap";
      td.style.background = group.tint;
      if (i === 0) {
        td.style.position = "sticky";
        td.style.left = "0";
        td.style.background = "#fff";
        td.style.zIndex = "1";
      }
      const v = VALUES[col];
      td.innerHTML = READ_ONLY.has(col) || PERSON_EDITS_ELSEWHERE.has(col) ? v : editable(v);
      row.appendChild(td);
    });
  });

  table.style.minWidth = "2100px";
  const container = table.closest(".MuiTableContainer-root");
  if (container) container.style.overflowX = "auto";
  [bandRow.cells[0], head.cells[0]].forEach((c) => {
    if (!c) return;
    c.style.position = "sticky";
    c.style.left = "0";
    c.style.zIndex = "2";
  });
  if (head.cells[0]) head.cells[0].style.background = "#fafafa";
  if (bandRow.cells[0]) bandRow.cells[0].style.background = "#fff";

  /* One season cell open. Positions, never a person column. */
  const positionsIndex = FLAT.findIndex((f) => f.col === "Positions");
  const target = table.tBodies[0].rows[1]?.cells[positionsIndex];
  if (target) {
    target.innerHTML =
      '<span style="display:inline-flex;align-items:center;gap:6px;border:2px solid #0b3d91;border-radius:6px;padding:2px 8px;background:#fff">' +
      '<span>O · ST</span><span style="color:rgba(0,0,0,0.54)">&#9662;</span></span>';
  }

  const sub = document.querySelector('[data-testid="season-label"]');
  if (sub) sub.textContent = sub.textContent.replace(/\d+ memberships/, "42 players · 18 columns");

  /* Entry leaves the pinned set — Brian, 2026-08-27: "entry status: yes, entry:
     no." It still filters, from its own column header like the other fifteen.
     The pinned set is Status, Availability and Missing onboarding data. */
  (() => {
    const form = document.querySelector('[data-testid="roster-filters"]');
    if (!form) return;
    const entry = Array.from(form.querySelectorAll(".MuiFormControl-root")).find((f) =>
      /^Entry/.test(f.textContent.trim()),
    );
    if (entry) entry.style.display = "none";
    /* The search field takes the space the pinned controls give back. */
    const search = Array.from(form.querySelectorAll(".MuiFormControl-root")).find((f) =>
      /^Search/.test(f.textContent.trim()),
    );
    if (search) {
      search.style.flexGrow = "1";
      search.style.minWidth = "0";
    }
  })();

  const filterRow = (() => {
    const form = document.querySelector('[data-testid="roster-filters"]');
    if (!form) return null;
    return Array.from(form.querySelectorAll(".MuiFormControl-root")).find((f) =>
      /^Entry/.test(f.textContent.trim()),
    );
  })();
  if (filterRow && filterRow.parentNode) {
    const box = window.getComputedStyle(filterRow);
    [
      { label: "Availability", width: 150 },
      { label: "Missing onboarding data", width: 210 },
    ].forEach(({ label, width }) => {
      const el = document.createElement("div");
      el.style.cssText = [
        "position:relative", "min-width:" + width + "px", "height:" + box.height,
        "display:flex", "align-items:center", "justify-content:space-between",
        "gap:8px", "padding:0 14px", "border:1px solid rgba(0,0,0,0.23)",
        "border-radius:8px", "background:#fff", "font-size:1rem",
      ].join(";");
      el.innerHTML =
        '<span style="position:absolute;top:-9px;left:9px;background:#fff;padding:0 6px;font-size:0.75rem;line-height:1;color:rgba(0,0,0,0.6)">' +
        label + '</span><span>All</span><span style="color:rgba(0,0,0,0.54)">&#9662;</span>';
      filterRow.parentNode.appendChild(el);
    });
  }
  /* The active-filter bar. Everything currently narrowing the board, whichever
     control set it, each one removable. This is what makes header filtering
     safe on a board wider than the screen. */
  /*
   * One filter, two controls. Brian, 2026-08-27: "if I change availability, I
   * can change it on the column itself if I wanted to, but if I change it on the
   * column, it changes in the hard-coded filter as well."
   *
   * So a pinned control and its column header are two views of the same filter,
   * and the chip does not record which one set it — because once it is set, that
   * stops mattering. Availability below is set from its column and is showing in
   * the pinned control at the top of the page.
   */
  const CHIPS = [
    { label: "Status", value: "Active" },
    { label: "Availability", value: "Green" },
    { label: "Coach group", value: "Offense" },
  ];
  const filtersForm = document.querySelector('[data-testid="roster-filters"]');
  if (filtersForm && CHIPS.length) {
    const bar = document.createElement("div");
    bar.style.cssText =
      "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:16px";
    bar.innerHTML =
      '<span style="font-size:0.8125rem;color:rgba(0,0,0,0.6)">Filtered by</span>' +
      CHIPS.map(
        (c) =>
          '<span style="display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 6px 0 10px;' +
          'border-radius:16px;background:rgba(11,61,145,0.08);color:#0b3d91;font-size:0.8125rem;white-space:nowrap">' +
          `<span><strong>${c.label}:</strong> ${c.value}</span>` +
          '<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;' +
          'border-radius:50%;background:rgba(11,61,145,0.18);font-size:11px">&#215;</span></span>',
      ).join("") +
      '<button style="border:0;background:none;color:#0b3d91;font-size:0.8125rem;font-weight:600;' +
      'cursor:pointer;padding:4px 6px">Clear all</button>';
    filtersForm.appendChild(bar);
  }

  const search = document.querySelector('[data-testid="roster-filters"] label');
  if (search && /Search/.test(search.textContent)) search.textContent = "Search name or alias";
})();
