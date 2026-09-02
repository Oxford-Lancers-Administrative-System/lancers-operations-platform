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
    const existing = $$("span, p", body).find((n) => n.className.includes("MuiTypography-caption"));
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
      $$("*", body).filter(
        (n) => n.children.length === 0 && ITEM_STATUS_WORDS.test(n.textContent ?? ""),
      )[0],
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

  // W6-01 — The checklist, with who said it and when.
  //
  // The record ships and is good. Its Onboarding section already carries a row
  // per item, the Required chip, and the outstanding alert. What it cannot say is
  // **who** — `provenanceNote` renders "Completed <day>" and nothing else — and it
  // has no `claimed`, because the enum has no such value.
  //
  // This screen marks exactly that, on the shipped rows, and adds no card.
  selectRosterNav();

  const section = onboardingSection();
  setSectionTitle(section, "Onboarding · 3 of 7 resolved");

  // 1 — a trust-class item, completed on the player's own word. R2-V: it
  //     completes without a human, and carries player-claimed provenance.
  const bucs = itemRow(section, "BUCS Play registration");
  setRowStatus(bucs, "Complete", ITEM_DONE);
  mark(
    setRowNote(
      bucs,
      "Merrick said so, 2 September · player-claimed, no confirmation needed",
      ITEM_DONE,
    ),
    1,
  );

  // 2 — a verify-class item. The player has said it; nobody has confirmed it.
  //     `claimed` is the state the shipped enum does not have.
  const hudl = itemRow(section, "Hudl access");
  setRowStatus(hudl, "Claimed", ITEM_CLAIMED);
  mark(
    setRowNote(hudl, "Merrick said so, 2 September · awaiting the compliance owner", ITEM_CLAIMED),
    2,
  );

  // 3 — an operator item, and the whole point of the screen: who, not just when.
  const kit = itemRow(section, "Kit sorted");
  setRowStatus(kit, "Complete", ITEM_DONE);
  mark(setRowNote(kit, "Zenas Yaxlington, 30 August · handed over at training", ITEM_DONE), 3);

  // 4 — history, not just current state. The record can say an item is complete;
  //     it cannot say it was complete, reopened, and completed again.
  const subs = itemRow(section, "Subscription paid");
  setRowStatus(subs, "Outstanding", ITEM_OPEN);
  mark(
    setRowNote(
      subs,
      "Reopened by Caspian Hallowfield, 1 September · was waived 20 August · 3 earlier changes",
      ITEM_OPEN,
    ),
    4,
  );

  // 5 — derived, display-only, and never flipping membership on its own (R3-C).
  const invoiced = itemRow(section, "Subscription invoiced");
  setRowStatus(invoiced, "Outstanding", ITEM_OPEN);
  mark(setRowNote(invoiced, "Not sent yet · nothing here blocks anything, ever", ITEM_OPEN), 5);

  // The shipped alert names the required items still outstanding. Left alone it
  // would contradict every row above it, which is the whole failure this mission
  // keeps writing down.
  setOutstandingAlert(
    section,
    "2 required items are still outstanding: Subscription invoiced, Comms groups joined.",
  );

  await settle();
})();
