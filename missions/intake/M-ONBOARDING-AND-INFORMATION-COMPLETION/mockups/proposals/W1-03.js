(async () => {
  // Shared mockup prelude — M-ONBOARDING-AND-INFORMATION-COMPLETION.
  //
  // Every proposal here is evaluated into the running application at
  // main@332bc6b, so both sides of a screen are photographs of the same page
  // differing only by the change. These helpers CLONE what the application
  // already rendered rather than authoring markup, so banding, chips, the type
  // scale and spacing cannot drift from what shipped.
  //
  // Ported from M-RECRUITMENT's prelude, keeping the two rules it was rewritten
  // to enforce: a proposal that cannot apply throws, and no screen is
  // photographed mid-transition.
  //
  // Generated file. Edit mockups/src/<screen>.js and rerun build-proposals.mjs.

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ---------------------------------------------------------------------------
  // A proposal that cannot apply must FAIL THE SHOOT, never produce a
  // confident-looking screen. M-RECRUITMENT, 2026-08-31: helpers that returned
  // quietly left a recruitment heading over a player record's own content, and
  // the screen looked deliberate. A red shoot is cheap; a plausible lie in an
  // approval packet is not.
  // ---------------------------------------------------------------------------
  const must = (value, what) => {
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
      throw new Error(`Proposal could not apply: ${what}. The screen was not photographed.`);
    }
    return value;
  };

  const injectStyle = (css) => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    return style;
  };

  // Photograph a settled page, never a transition. MUI animates background-color,
  // so a nav item just deselected is still ~82% opaque at t=0.
  injectStyle("*,*::before,*::after{transition:none !important;animation:none !important}");

  const settle = async (frames = 3) => {
    for (let i = 0; i < frames; i += 1) {
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
    await new Promise((r) => setTimeout(r, 150));
  };

  // ---------------------------------------------------------------------------
  // Point, don't narrate. Brian, 2026-08-31: "if there is something relevant, it
  // needs to be pointed out. I don't want that through narration." mark() draws a
  // numbered outline and nothing else; the prose for that number is delta n in
  // the screen head, outside the frame.
  // ---------------------------------------------------------------------------
  const MARK_ACCENT = "#c2185b";

  const mark = (node, n) => {
    if (!node || node.nodeType !== 1) return node;
    if (getComputedStyle(node).position === "static") node.style.position = "relative";
    // The confirmation Paper ships `overflow: hidden`, which clipped the chip to a
    // sliver on the first shoot — a marker you cannot read is a marker that is not
    // there. Lift the clip on the marked element only.
    if (getComputedStyle(node).overflow !== "visible") node.style.overflow = "visible";
    node.style.outline = `2px solid ${MARK_ACCENT}`;
    node.style.outlineOffset = "2px";
    const chip = document.createElement("div");
    chip.textContent = String(n);
    chip.dataset.intakeMark = String(n);
    chip.style.cssText =
      `position:absolute;top:-11px;left:-11px;z-index:9;width:22px;height:22px;border-radius:50%;` +
      `background:${MARK_ACCENT};color:#fff;font:700 12px/22px system-ui,sans-serif;text-align:center;` +
      `box-shadow:0 1px 3px rgba(0,0,0,0.35)`;
    node.append(chip);
    return node;
  };

  // ---------------------------------------------------------------------------
  // Navigation. Every screen in W1 happens under Roster, which already exists and
  // is already the right destination — this mission adds no navigation entry. So
  // unlike M-RECRUITMENT, which had to invent one, this asserts the shipped
  // selection rather than moving it.
  // ---------------------------------------------------------------------------
  const assertRosterNav = () => {
    const links = $$('nav a, [role="navigation"] a');
    must(links, "the operator navigation has no links");
    const selected = links.filter((a) => a.classList.contains("Mui-selected"));
    if (selected.length !== 1) {
      throw new Error(
        `Navigation selection is wrong: ${selected.length} item(s) selected (${selected
          .map((a) => a.textContent.trim())
          .join(", ")}). Exactly one must be.`,
      );
    }
    return selected[0];
  };

  /** Move the shipped selection onto Roster, and prove exactly one ends selected. */
  const selectRosterNav = () => {
    const links = $$('nav a, [role="navigation"] a');
    must(links, "the operator navigation has no links");
    const roster = must(
      links.find((a) => a.textContent.trim().startsWith("Roster")),
      "the operator navigation has no Roster destination",
    );
    for (const a of links) {
      a.classList.remove("Mui-selected");
      a.removeAttribute("aria-current");
      const primary = a.querySelector(".MuiListItemText-primary");
      if (primary) primary.style.fontWeight = "500";
    }
    roster.classList.add("Mui-selected");
    roster.setAttribute("aria-current", "page");
    roster.dataset.intakeNav = "roster";
    const primary = roster.querySelector(".MuiListItemText-primary");
    if (primary) primary.style.fontWeight = "700";
    injectStyle(
      `nav a:not([data-intake-nav="roster"]){background-color:transparent !important}` +
        `nav a[data-intake-nav="roster"]{background-color:rgb(66,66,66) !important}`,
    );
    return assertRosterNav();
  };

  // ---------------------------------------------------------------------------
  // Headings
  // ---------------------------------------------------------------------------
  const setHeading = (title) => {
    const h1 = must($("h1"), "the page has no h1 to retitle");
    h1.textContent = title;
    return h1;
  };

  const setSubheading = (text) => {
    const el = must(
      $('[data-testid="import-subheading"]') ??
        $$(".MuiTypography-body2").find((p) => p.textContent.trim().length > 0),
      "the page has no subheading to rewrite",
    );
    el.textContent = text;
    return el;
  };

  // ---------------------------------------------------------------------------
  // Driving the real import.
  //
  // This is the point of the whole file. `/operate/roster/import` does not exist
  // on `main`; `/operate/events/import` does, and Brian settled on 2026-09-01
  // that the roster import follows its shape. So the proposal uploads a real CSV
  // into the shipped file input, presses the application's own button, and waits
  // for the application to render its own confirmation table. What is then
  // rewritten is real markup the application produced — its chips, its columns,
  // its spacing — rather than a drawing of them.
  // ---------------------------------------------------------------------------
  const uploadCsvAndPropose = async (csvText, fileName = "squad-2026-27.csv") => {
    // `data-testid="import-file"` is on the input itself, and the shipped
    // component's own onChange calls `form.requestSubmit()`. So dispatching a
    // real change event is all it takes — the application proposes, not us.
    const input = must(
      $('input[data-testid="import-file"]'),
      "the import screen has no file input",
    );
    const file = new File([csvText], fileName, { type: "text/csv" });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    for (let i = 0; i < 120; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
      if ($('[data-testid="import-table"]')) return $('[data-testid="import-table"]');
      const err = $('[data-testid="import-error"]');
      if (err && err.textContent.trim())
        throw new Error(`The application refused the file: ${err.textContent.trim()}`);
    }
    throw new Error("The confirmation table never rendered; nothing was photographed.");
  };

  /**
   * Rewrite the confirmation into people.
   *
   * The outcome chip is the FIRST cell, not the last — read off the shipped
   * component rather than assumed. And BOTH renderings are always in the DOM,
   * `import-table` for desktop and `import-cards` for the phone, hidden by
   * `display:{xs,md}` rather than unmounted. M-RECRUITMENT shipped a phone screen
   * showing the wrong dataset for exactly that reason, so this rewrites both from
   * one array and throws if either is missing.
   *
   * A row is `{ outcome, name, detail, status, summary }`.
   */
  const rewriteConfirmation = (columns, rows) => {
    const box = must($('[data-testid="import-table"]'), "there is no confirmation table");
    const table = must(box.querySelector("table"), "the confirmation box holds no table");
    // The events table is 1460px wide because it carries eleven event columns.
    // A people import carries far fewer; leaving the floor would photograph a
    // table scrolled sideways for no reason.
    table.style.minWidth = "auto";
    const head = must(table.querySelector("thead tr"), "the table has no header row");
    const body = must(table.querySelector("tbody"), "the table has no body");
    const thTpl = must(head.querySelector("th"), "the header row has no cells").cloneNode(true);
    const rowTpl = must(body.querySelector("tr"), "the table has no rows").cloneNode(true);
    const tdTpl = must(rowTpl.querySelector("td"), "a row has no cells").cloneNode(true);
    const chipTpl = must(rowTpl.querySelector(".MuiChip-root"), "a row has no outcome chip");

    head.textContent = "";
    for (const label of ["Outcome", ...columns]) {
      const th = thTpl.cloneNode(true);
      th.textContent = label;
      th.removeAttribute("style");
      head.append(th);
    }

    const chipFor = (outcome) => {
      const chip = chipTpl.cloneNode(true);
      const label = chip.querySelector(".MuiChip-label") ?? chip;
      label.textContent = outcome;
      chip.className = chip.className.replace(/MuiChip-(color|filled|outlined)\w*/g, "").trim();
      chip.classList.add("MuiChip-root", "MuiChip-sizeSmall", "MuiChip-outlined");
      const tone = OUTCOME_TONE[outcome] ?? OUTCOME_TONE.Refused;
      chip.style.cssText = `border:1px solid ${tone};color:${tone};background:transparent`;
      return chip;
    };

    body.textContent = "";
    for (const row of rows) {
      const tr = rowTpl.cloneNode(false);
      const first = tdTpl.cloneNode(true);
      first.textContent = "";
      first.append(chipFor(row.outcome));
      tr.append(first);
      for (const value of row.cells) {
        const td = tdTpl.cloneNode(true);
        td.removeAttribute("style");
        td.textContent = value;
        tr.append(td);
      }
      body.append(tr);
    }

    const cards = must($('[data-testid="import-cards"]'), "there is no phone card list to rewrite");
    const cardTpl = must(
      cards.querySelector('[data-testid^="import-card-"]'),
      "the phone card list has no card to clone",
    ).cloneNode(true);
    const stack = must(
      cards.querySelector(".MuiStack-root") ?? cards.firstElementChild,
      "the phone card list has no container",
    );
    stack.textContent = "";
    for (const row of rows) {
      const card = cardTpl.cloneNode(true);
      card.removeAttribute("data-testid");
      const chip = must(card.querySelector(".MuiChip-root"), "a phone card has no outcome chip");
      chip.replaceWith(chipFor(row.outcome));
      const texts = $$("p, span", card).filter(
        (n) => n.children.length === 0 && !n.closest(".MuiChip-root"),
      );
      must(texts, "a phone card has no text nodes to rewrite");
      const lines = [row.status, row.name, row.detail, row.summary];
      texts.forEach((node, i) => {
        node.textContent = i < lines.length ? lines[i] : "";
      });
      stack.append(card);
    }
    return box;
  };

  /** The four outcome colours, taken from presentation.ts's outcomeColour. */
  const OUTCOME_TONE = {
    New: "#2e7d32",
    "Carried forward": "#0288d1",
    Unchanged: "rgba(0,0,0,0.6)",
    Refused: "#d32f2f",
  };

  /** Clone a shipped Paper card and put it below the confirmation. */
  const appendSection = (title, build) => {
    const anchor = must(
      $('[data-testid="import-table"]')?.closest(".MuiPaper-root") ?? $(".MuiPaper-root"),
      "there is no shipped card to clone for a new section",
    );
    const card = anchor.cloneNode(false);
    card.removeAttribute("data-testid");
    card.style.padding = "16px";
    card.style.marginTop = "16px";
    const h = document.createElement("h2");
    h.className = "MuiTypography-root MuiTypography-h6";
    h.style.cssText = "font-size:1.05rem;margin:0 0 10px";
    h.textContent = title;
    card.append(h);
    build(card);
    anchor.after(card);
    return card;
  };

  // ---------------------------------------------------------------------------
  // The two cards that must never contradict the table beside them.
  //
  // Both were got wrong on the first shoot and the rendered PNG showed it: the
  // totals strip still read "6 New · 0 Refused" above a table with two refusals,
  // and the card at the foot still explained what an import can never do to an
  // *event*. A screen that argues with itself is worse than a drawn one.
  // ---------------------------------------------------------------------------

  /** The plan totals — the Paper immediately above the confirmation table. */
  const rewriteTotals = (pairs) => {
    const box = must($('[data-testid="import-table"]'), "there is no confirmation table");
    const shell = must(box.closest(".MuiPaper-root"), "the confirmation has no card");
    const strip = must(
      shell.previousElementSibling,
      "there is no totals strip above the confirmation",
    );
    const stack = must(strip.querySelector(".MuiStack-root"), "the totals strip has no stack");
    const cellTpl = must(stack.firstElementChild, "the totals strip is empty").cloneNode(true);
    stack.textContent = "";
    for (const [value, label] of pairs) {
      const cell = cellTpl.cloneNode(true);
      const nodes = $$("p", cell);
      if (nodes.length < 2)
        throw new Error("Proposal could not apply: a totals cell lost its two lines.");
      nodes[0].textContent = String(value);
      nodes[1].textContent = label;
      stack.append(cell);
    }
    return strip;
  };

  /**
   * The "what an import can never do" card.
   *
   * Its list items each hold a <strong> plus a text node, so the usual
   * leaf-node filter skips them entirely — which is why the first attempt
   * silently changed nothing. This rewrites the <li>s themselves.
   */
  const rewriteBoundaries = (title, items) => {
    const card = must($('[data-testid="import-boundaries"]'), "there is no boundaries card");
    const overline = must(card.querySelector("p"), "the boundaries card has no heading");
    overline.textContent = title;
    const list = must(card.querySelector("ul"), "the boundaries card has no list");
    const tpl = must(list.querySelector("li"), "the boundaries list is empty").cloneNode(true);
    list.textContent = "";
    for (const [lead, rest] of items) {
      const li = tpl.cloneNode(true);
      li.textContent = "";
      const strong = document.createElement("strong");
      strong.textContent = lead;
      li.append(strong, document.createTextNode(` ${rest}`));
      list.append(li);
    }
    return card;
  };

  // W1-03 — The proposal, and the duplicates underneath it.
  //
  // The heart of the workflow, and the one place this departs from the events
  // import: two events with one name on one day are a refusal, two people with
  // one name are a question.
  //
  // The confirmation table below is not drawn. The proposal uploads a real CSV
  // into the shipped file input, the application's own onChange submits it, and
  // the application renders its own table — which is then rewritten into people.
  // Its chips, columns, spacing and type are the shipped ones.
  await uploadCsvAndPropose(
    [
      "id,name,type,date,start,end,online,venue,description,required_equipment,mandatory",
      ",Practice — michaelmas week 1,Practice,2026-10-14,20:00,22:00,no,Iffley Road Astro,Full contact.,Gumshield,yes",
      ",Chalk — michaelmas week 1,Chalk,2026-10-13,18:00,19:00,yes,Microsoft Teams,Install review.,,no",
      ",Practice — michaelmas week 2,Practice,2026-10-21,20:00,22:00,no,Iffley Road Astro,Full contact.,Gumshield,yes",
      ",S&C — michaelmas week 2,S&C,2026-10-19,07:00,08:00,no,Iffley Road Gym,Lower body.,,no",
      ",Chalk — michaelmas week 2,Chalk,2026-10-20,18:00,19:00,yes,Microsoft Teams,Install review.,,no",
      ",Practice — michaelmas week 3,Practice,2026-10-28,20:00,22:00,no,Iffley Road Astro,Full contact.,Gumshield,yes",
    ].join("\r\n") + "\r\n",
  );

  // After the upload, never before: the application re-renders on its own state
  // change, and a heading set first is overwritten by the time the shot is taken.
  // The first shoot photographed "Import — squad-2026-27.csv" for exactly that.
  selectRosterNav();
  setHeading("Import last season's squad");
  setSubheading("squad-2026-27.csv · 6 rows read · nothing is written until you confirm");

  rewriteConfirmation(
    ["Player", "Mobile", "Personal email", "College", "Year", "What happens"],
    [
      {
        outcome: "New",
        name: "Rosalind Penhaligon",
        detail: "07700 900312 · Brasenose",
        status: "onboarding",
        summary: "Added to the roster in onboarding",
        cells: [
          "Rosalind Penhaligon",
          "07700 900312",
          "rp@example.ac.uk",
          "Brasenose",
          "2024",
          "Added in onboarding · checklist generated · welcome queued",
        ],
      },
      {
        outcome: "Carried forward",
        name: "Tobias Wrenfield",
        detail: "07700 900184 · Keble",
        status: "onboarding",
        summary: "Already known — given a 2026-27 membership",
        cells: [
          "Tobias Wrenfield",
          "07700 900184",
          "—",
          "Keble",
          "2023",
          "Known to the club · new 2026-27 membership · his record is not overwritten",
        ],
      },
      {
        outcome: "Carried forward",
        name: "Isolde Marchetti",
        detail: "07700 900771 · Wadham",
        status: "onboarding",
        summary: "Already known — given a 2026-27 membership",
        cells: [
          "Isolde Marchetti",
          "07700 900771",
          "im@example.ac.uk",
          "Wadham",
          "2024",
          "Known to the club · new 2026-27 membership · welcome queued",
        ],
      },
      {
        outcome: "Unchanged",
        name: "Caspian Hallowfield",
        detail: "07700 900008 · Merton",
        status: "already on the roster",
        summary: "Already on this season's roster",
        cells: [
          "Caspian Hallowfield",
          "07700 900008",
          "ch@example.ac.uk",
          "Merton",
          "2022",
          "Already on the 2026-27 roster · no second checklist, no second welcome",
        ],
      },
      {
        outcome: "Refused",
        name: "Wrenfield",
        detail: "line 6 · no first name",
        status: "nothing written",
        summary: "first_name is empty",
        cells: [
          "Wrenfield",
          "07700 900184",
          "—",
          "—",
          "—",
          "Refused — first_name is empty. The other five rows still apply.",
        ],
      },
      {
        outcome: "Refused",
        name: "Beatrix Ashgrove",
        detail: "line 7 · possible duplicate unanswered",
        status: "nothing written",
        summary: "Answer the duplicate below",
        cells: [
          "Beatrix Ashgrove",
          "07700 900450",
          "ba@example.ac.uk",
          "St Anne's",
          "2025",
          "Refused until the possible duplicate below is answered",
        ],
      },
    ],
  );
  mark(must($('[data-testid="import-table"]'), "no table to mark"), 1);
  // The phone renders the same rows as cards, and the table is display:none there.
  // Marking only the table leaves the phone shot starting at 2.
  mark(must($('[data-testid="import-cards"]'), "no phone card list to mark"), 1);

  // The totals the application renders above the table. They must agree with it:
  // the first shoot photographed "6 New · 0 Refused" over a table showing two
  // refusals, because this rewrite targeted the wrong element and said nothing.
  mark(
    rewriteTotals([
      [1, "New"],
      [2, "Carried forward"],
      [1, "Unchanged"],
      [2, "Refused"],
    ]),
    2,
  );

  rewriteBoundaries("What this import can never do", [
    [
      "Delete anybody.",
      "A player on the roster and absent from the file is left exactly as they were.",
    ],
    [
      "Overwrite a confirmed fact.",
      "A difference between the file and the record becomes something the player confirms on their form.",
    ],
    ["Send anything.", "It queues the welcome. Nothing is ever sent by hand."],
    ["Create a season.", "It writes into the season the roster is already in."],
  ]);

  // The one thing the events import has no need of.
  const dup = appendSection("Possible duplicates — 1 to answer", (card) => {
    const intro = document.createElement("p");
    intro.style.cssText = "margin:0 0 12px;font-size:14px;color:rgba(0,0,0,.7)";
    intro.textContent =
      "One row matches somebody the club already holds. Answer it and confirm again — the rest of the import is not held up by it.";
    card.append(intro);

    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;border:1px solid rgba(0,0,0,.12);border-radius:4px;padding:14px";

    const incoming = document.createElement("div");
    incoming.style.cssText = "flex:1 1 240px;min-width:0";
    incoming.innerHTML =
      "<div style='font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:rgba(0,0,0,.6)'>In the file, line 7</div>" +
      "<div style='font-weight:600;margin-top:3px'>Beatrix Ashgrove</div>" +
      "<div style='font-size:13.5px;color:rgba(0,0,0,.7)'>07700 900450 · ba@example.ac.uk · St Anne's · 2025</div>";

    const candidate = document.createElement("div");
    candidate.style.cssText = "flex:1 1 240px;min-width:0";
    candidate.innerHTML =
      "<div style='font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:rgba(0,0,0,.6)'>Already on record</div>" +
      "<div style='font-weight:600;margin-top:3px'>Beatrix Ashgrove</div>" +
      "<div style='font-size:13.5px;color:rgba(0,0,0,.7)'>07700 900450 · alumna, last active 2024-25</div>" +
      "<div style='font-size:12.5px;color:#c2185b;margin-top:4px'>Matched on: first name, last name, mobile</div>";

    const answer = document.createElement("div");
    answer.style.cssText = "flex:0 0 auto;display:flex;gap:8px;align-items:center";
    for (const [text, variant] of [
      ["Same person", "contained"],
      ["Different person", "outlined"],
    ]) {
      const b = document.createElement("button");
      b.className = `MuiButton-root MuiButton-${variant} MuiButton-sizeSmall`;
      b.textContent = text;
      b.style.cssText =
        variant === "contained"
          ? "background:#0b3d91;color:#fff;border:0;border-radius:4px;padding:6px 14px;font:500 13px/1.75 inherit;text-transform:uppercase;letter-spacing:.02857em"
          : "background:transparent;color:#0b3d91;border:1px solid rgba(11,61,145,.5);border-radius:4px;padding:5px 13px;font:500 13px/1.75 inherit;text-transform:uppercase;letter-spacing:.02857em";
      answer.append(b);
    }

    row.append(incoming, candidate, answer);
    card.append(row);
  });
  mark(dup, 3);

  const apply = $('[data-testid="apply-import"]');
  if (apply) {
    apply.textContent = "Confirm — add 4 players";
    mark(apply, 4);
  }

  await settle();
})();
