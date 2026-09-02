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
  // Helpers for the club's existing per-type configuration page —
  // `/operate/admin/messaging`, which ships.
  //
  // It is a row per type, expandable to that type's settings, with a plain-English
  // preview of what the rule means. W11 and W12 both need exactly that shape, so
  // both are shot on it rather than on a drawing.
  // ---------------------------------------------------------------------------

  const scheduleRows = () =>
    must($$('[data-testid="schedule-row"]'), "this page has no configuration rows");

  const rowLabel = (row) =>
    must(
      row.querySelector('[data-testid="schedule-row-label"]') ?? row.children[0],
      "a configuration row has no label",
    );

  const rowPreview = (row) => row.querySelector('[data-testid="schedule-row-preview"]') ?? null;

  /** Retitle one configuration row and rewrite the sentence under it. */
  const setRow = (row, label, preview) => {
    const name = rowLabel(row);
    const leaf = $$("*", name).find((n) => n.children.length === 0 && n.textContent.trim()) ?? name;
    leaf.textContent = label;
    if (preview !== undefined) {
      const p = rowPreview(row);
      if (p) {
        const target = $$("*", p).find((n) => n.children.length === 0 && n.textContent.trim()) ?? p;
        target.textContent = preview;
      }
    }
    return row;
  };

  /** Drop the rows a screen does not need, keeping the first n. */
  const keepRows = (n) => {
    const rows = scheduleRows();
    for (const row of rows.slice(n)) row.remove();
    return scheduleRows();
  };

  const setAdminHeading = (text) => {
    const h1 = must($("h1"), "the admin page has no heading");
    h1.textContent = text;
    return h1;
  };

  /**
   * Expand one configuration row by pressing its own toggle.
   *
   * The preview lives inside a `Collapse` with `unmountOnExit mountOnEnter`, so
   * it is not in the DOM at all until a human opens it — `must()` refused the
   * first shoot of W11-01 for exactly that reason. Pressing the shipped button is
   * both the honest way to reach it and the only way.
   */
  const expandRow = async (row) => {
    const toggle = must(
      row.querySelector('[data-testid="schedule-row-toggle"]'),
      "a configuration row has no expand toggle",
    );
    if (toggle.getAttribute("aria-expanded") !== "true") {
      toggle.click();
      await settle(6);
    }
    return must(
      row.querySelector('[data-testid="schedule-row-preview"]'),
      "the row did not open its preview",
    );
  };

  /**
   * Turn one messaging-schedule row into one checklist-item row.
   *
   * Renaming only the heading left every row carrying the schedule's own fields —
   * "RSVP by", "First inv.", "President" — and a "Save practice" button under a
   * row called Subscription invoiced. A screen that argues with itself is worse
   * than a drawn one, so this rewrites the fields, their helper text and the
   * button, and removes the ones a checklist item has no use for.
   */
  const configureRow = (row, { label, fields, button }) => {
    setRow(row, label);
    const controls = $$(".MuiTextField-root", row);
    must(controls, "a configuration row has no fields");

    // The schedule's own helper sentences all go; each kept field gets its own.
    for (const p of $$("p", row)) {
      if (/days|messages|hours|gap|President|invitation/i.test(p.textContent ?? "")) p.remove();
    }

    controls.forEach((control, index) => {
      const spec = fields[index];
      if (!spec) {
        control.remove();
        return;
      }
      const [name, value, help] = spec;
      const labelEl = control.querySelector(".MuiInputLabel-root, label");
      if (labelEl) labelEl.textContent = name;
      const legend = control.querySelector("fieldset legend span");
      if (legend) legend.textContent = name;
      control.querySelector(".MuiInputAdornment-root")?.remove();
      const input = control.querySelector("input");
      if (input) {
        // These ship as number inputs — "days", "messages", "hours". A browser
        // silently rejects "Operator" in one of those, which is why the first
        // rebuild rendered every field blank.
        input.type = "text";
        input.value = value;
        input.setAttribute("value", value);
      }
      if (help) {
        const note = document.createElement("p");
        note.className = "MuiTypography-root MuiFormHelperText-root";
        note.style.cssText = "margin:3px 14px 0;font-size:12px;color:rgba(0,0,0,.6)";
        note.textContent = help;
        control.after(note);
      }
    });

    const save = row.querySelector("button[type='submit'], .MuiButton-root");
    if (save && button) save.textContent = button;
    return row;
  };

  /**
   * The page's own subtitle, intro and standing note.
   *
   * All three are about events. Left alone they describe a different screen from
   * the one underneath them — which is how the first rebuild of this workflow
   * ended up with a checklist row under the sentence "when an unanswered
   * invitation reaches the President".
   */
  const setAdminIntro = ({ subtitle, intro, note }) => {
    if (subtitle !== undefined) {
      const el = $$("p").find(
        (p) => /event types|items/i.test(p.textContent ?? "") && p.textContent.trim().length < 30,
      );
      if (el) el.textContent = subtitle;
    }
    if (intro !== undefined) {
      const el = $$("p").find((p) =>
        /when the club messages people about each kind of event/i.test(p.textContent ?? ""),
      );
      if (el) el.textContent = intro;
    }
    if (note !== undefined) {
      const el = $(".MuiAlert-message");
      if (el) el.textContent = note;
    }
  };

  // W11-01 — Onboarding's chase, on the club's messaging schedule.
  //
  // The onboarding checklist is one packet — the approved item-and-ask inventory
  // — and it goes out as one thing. Nobody configures which items are on it and
  // nobody is assigned one. The only thing left to set is the chase.
  //
  // Brian, 2026-09-02: "It should just define how many times we are going to
  // chase them, how often we are going to chase them, and how long before the
  // chase exhausts. That's it."
  setAdminHeading("Messaging schedule · 2026-27");
  setAdminIntro({
    subtitle: "2 chases",
    intro:
      "How many times the club chases somebody about the onboarding checklist, how often, and how long before it gives up and tells a person.",
    note: "The cap counts messages that actually arrived, so a failure consumes nothing. There are no quiet hours. An arriving submission clears whatever follow-ups were pending; a partial one resets the timer but never the cap.",
  });

  const rows = keepRows(2);

  configureRow(rows[0], {
    label: "Onboarding checklist",
    fields: [
      [
        "Chase this many times",
        "4",
        "Counted only when a message actually arrives. A failure consumes nothing.",
      ],
      ["Every", "7 days", "The gap between one chase and the next."],
      ["Give up after", "35 days", "Then it stops for good and a person takes over."],
      ["Tell", "President", "The office an exhausted chase escalates to. Never a named person."],
    ],
    button: "Save onboarding checklist",
  });

  configureRow(rows[1], {
    label: "Recruit ladder",
    fields: [
      ["Chase this many times", "3", "Mission 6's, and unchanged by this mission."],
      ["Every", "5 days", "The gap between one chase and the next."],
    ],
    button: "Save recruit ladder",
  });

  // 1 — how many times. The cap, and it counts what arrived: LAN-93's delivery
  //     callbacks are what make "exhausted" a fact rather than a guess.
  mark($$(".MuiTextField-root", rows[0])[0], 1);
  // 2 — how often, and how long before it gives up. Three numbers, and that is
  //     the whole of the configuration.
  mark($$(".MuiTextField-root", rows[0])[2], 2);
  // 3 — the escalation office. W9 depends on this and nothing else sets it, and
  //     it is an office rather than a person because presidents change.
  mark($$(".MuiTextField-root", rows[0])[3], 3);
  // 4 — beside the recruit ladder, which is Mission 6's and which this mission
  //     does not touch.
  mark(rowLabel(rows[1]), 4);

  await settle();
})();
