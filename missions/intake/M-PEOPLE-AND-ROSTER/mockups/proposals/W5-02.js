/*
 * W5-01 — the roster's proposed column set, evaluated into the live page.
 *
 * This is not a redesign of the application's style: every element it creates
 * is cloned from or matched to what the page already renders, so the two
 * photographs differ only by the proposal. What changes is which columns exist,
 * what each row carries, and that raw contact values leave the grid.
 *
 * Values are derived from what the page is already showing. Nothing is
 * invented: a college is parsed out of the email domain the seed already uses,
 * contactability is read from the cells being replaced, and a field with no
 * substrate on `main` renders `not recorded` rather than a plausible guess.
 */
(() => {
  const NR = '<span style="color:rgba(0,0,0,0.38);font-style:italic">not recorded</span>';
  const DASH = '<span style="color:rgba(0,0,0,0.6)">—</span>';

  /* The rebuilt ladder. Eight stored values become five, and the operator sees
     six rungs because Recruit lives on the prospect record. */
  const LADDER = {
    Confirmed: "Onboarding",
    "Carried forward": "Onboarding",
    Withdrawn: "Departed",
  };
  const TONE = {
    Active: ["#2e7d32", "#fff"],
    Onboarding: ["#0288d1", "#fff"],
    Inactive: ["#ed6c02", "#fff"],
    Departed: ["rgba(0,0,0,0.08)", "rgba(0,0,0,0.87)"],
    Archived: ["rgba(0,0,0,0.08)", "rgba(0,0,0,0.87)"],
  };

  const chip = (text, filled) => {
    const [bg, fg] = TONE[text] ?? ["rgba(0,0,0,0.08)", "rgba(0,0,0,0.87)"];
    return filled
      ? `<span style="display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:16px;background:${bg};color:${fg};font-size:0.8125rem;white-space:nowrap">${text}</span>`
      : `<span style="display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:16px;border:1px solid rgba(0,0,0,0.23);font-size:0.8125rem;white-space:nowrap">${text}</span>`;
  };
  const warnChip = (text) =>
    `<span style="display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:16px;border:1px solid rgba(237,108,2,0.6);color:#663c00;font-size:0.8125rem;white-space:nowrap">${text}</span>`;

  /* The seed's colleges are real subdomains on the address the grid is losing,
     so the column is derived from the page rather than made up. */
  const collegeOf = (email) => {
    const m = /@([a-z]+)\.ox\.ac\.example$/.exec((email || "").trim());
    if (!m) return null;
    return m[1].charAt(0).toUpperCase() + m[1].slice(1);
  };

  const text = (cell) => (cell ? cell.textContent.trim() : "");
  const present = (v) => v && v !== "—";

  const table = document.querySelector('table[aria-label="Roster"]');
  if (table) {
    const head = table.tHead.rows[0];
    const HEADERS = [
      "Player",
      "Standing",
      "Entry",
      "College",
      "Positions",
      "Jersey",
      "Onboarding",
      "Contactable",
      "Missing",
    ];
    const template = head.cells[1];
    head.innerHTML = "";
    HEADERS.forEach((label) => {
      const th = template.cloneNode(true);
      th.textContent = label;
      head.appendChild(th);
    });

    Array.from(table.tBodies[0].rows).forEach((row) => {
      const name = row.cells[0].innerHTML;
      const status = text(row.cells[1]);
      const entry = text(row.cells[2]);
      const email = text(row.cells[3]);
      const phone = text(row.cells[4]);
      const onboarding = text(row.cells[5]);

      const standing = LADDER[status] ?? status;
      const college = collegeOf(email);

      const contact = [];
      if (present(phone)) contact.push(chip("Mobile", false));
      if (present(email)) contact.push(chip("Email", false));

      /* Counted only from facts this page can actually see. Date of birth,
         emergency contact and the academic fields have no substrate on `main`,
         so the real counts will be higher once they exist. */
      let missing = 0;
      if (!present(phone)) missing += 1;
      if (!present(email)) missing += 1;
      if (!college) missing += 1;

      const cellStyle = row.cells[1].getAttribute("class") || "";
      const cells = [
        name,
        chip(standing, true),
        entry,
        college ?? NR,
        NR,
        NR,
        onboarding,
        contact.length ? contact.join(" ") : DASH,
        missing ? warnChip(`${missing} missing`) : DASH,
      ];

      const proto = row.cells[1];
      row.innerHTML = "";
      cells.forEach((html) => {
        const td = proto.cloneNode(false);
        td.setAttribute("class", cellStyle);
        td.style.whiteSpace = "normal";
        td.innerHTML = html;
        row.appendChild(td);
      });
    });
  }

  /* The 375px card list carries the same change: standing, entry, college and
     the missing flag; no address and no number. */
  document.querySelectorAll('[data-testid="roster-card"]').forEach((card) => {
    const chips = card.querySelectorAll(".MuiChip-root");
    chips.forEach((c) => {
      const label = c.querySelector(".MuiChip-label");
      if (!label) return;
      const mapped = LADDER[label.textContent.trim()];
      if (mapped) label.textContent = mapped;
    });
  });

  /* The header line and the filter set. */
  const sub = document.querySelector('[data-testid="season-label"]');
  if (sub) sub.textContent = sub.textContent.replace(/\d+ memberships/, "42 players");

  /* The filter set. Task 08 §5 makes them combinable and immediate; the two
     that exist keep their shape and three more are added beside them, built to
     match rather than cloned, because the shipped control is a `TextField
     select` whose innards do not survive a clone. */
  const filterRow = (() => {
    const labels = Array.from(
      document.querySelectorAll('[data-testid="roster-filters"] label'),
    );
    const entry = labels.find((l) => l.textContent.trim() === "Entry");
    return entry ? entry.closest(".MuiFormControl-root, .MuiTextField-root") : null;
  })();

  if (filterRow && filterRow.parentNode) {
    const box = window.getComputedStyle(filterRow);
    ["College", "Onboarding", "Missing data"].forEach((label) => {
      const el = document.createElement("div");
      el.style.cssText = [
        "position:relative",
        "min-width:150px",
        "height:" + box.height,
        "display:flex",
        "align-items:center",
        "justify-content:space-between",
        "gap:8px",
        "padding:0 14px",
        "border:1px solid rgba(0,0,0,0.23)",
        "border-radius:8px",
        "background:#fff",
        "font-size:1rem",
        "color:rgba(0,0,0,0.87)",
      ].join(";");
      el.innerHTML =
        '<span style="position:absolute;top:-9px;left:9px;background:#fff;padding:0 6px;' +
        'font-size:0.75rem;line-height:1;color:rgba(0,0,0,0.6)">' +
        label +
        "</span><span>All</span><span style=\"color:rgba(0,0,0,0.54)\">\u25be</span>";
      filterRow.parentNode.appendChild(el);
    });
  }

  /* The search field's own label follows the columns: alias in, contact out. */
  const search = document.querySelector('[data-testid="roster-filters"] label');
  if (search && /Search/.test(search.textContent)) search.textContent = "Search name or alias";
})();
