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
  // W4's shared helpers — the player's own signed-link page.
  //
  // Every W4 screen is shot on `/a/[token]`, the answer link (LAN-172): the
  // nearest implemented player-facing, no-login, signed-link form on `main`.
  // W4's own surface does not exist, so the current side photographs that page
  // as it ships and the proposed side photographs the same page transformed.
  // Both sides are photographs of one running route; neither is a drawing.
  //
  // These helpers reuse the shipped controls rather than authoring markup. The
  // asks are the page's own TextFields relabelled; the checklist strip is the
  // page's own <dl> of Facts; the shell, banner, card, privacy line and submit
  // button are untouched except for their words.
  // ---------------------------------------------------------------------------

  /** Assert we are on the answer link's Yes page before touching anything. */
  const answerShell = () => {
    const h1 = must($("h1"), "the page has no h1");
    if (!/you're attending/i.test(h1.textContent)) {
      throw new Error(
        `Proposal could not apply: this is not the answer link's Yes page (h1 read "${h1.textContent}").`,
      );
    }
    const form = must(
      $$("form").find((f) => f.querySelector(".MuiTextField-root")),
      "the answer page has no form carrying its question fields",
    );
    return {
      chip: must($(".MuiChip-root"), "the answer page has no chip"),
      h1,
      lead: must(h1.nextElementSibling, "the answer page has no lead line under its h1"),
      dl: must($("dl"), "the answer page has no fact list"),
      privacy: must(
        $$("p").find((p) => /secure page records only your response/i.test(p.textContent)),
        "the answer page has lost its privacy line",
      ),
      form,
      stack: must(form.querySelector(".MuiStack-root"), "the answer form has no question stack"),
      submit: must(
        form.querySelector("button[type=submit]"),
        "the answer form has no submit button",
      ),
    };
  };

  const setChip = (chip, text) => {
    const label = must(chip.querySelector(".MuiChip-label"), "the chip has no label");
    label.textContent = text;
    return chip;
  };

  const setLead = (lead, text) => {
    lead.textContent = text;
    return lead;
  };

  const setPrivacy = (node, text) => {
    node.textContent = text;
    return node;
  };

  /**
   * The minimal checklist strip — R4-P, "a minimal checklist at the top, then
   * the form". It is the page's own <dl>, whose Facts are already a two-column
   * grid of label over value, rebuilt from a clone of one shipped Fact.
   */
  const setFacts = (dl, pairs) => {
    const tpl = must(dl.firstElementChild, "the fact list is empty").cloneNode(true);
    dl.textContent = "";
    for (const [label, value, tone] of pairs) {
      const cell = tpl.cloneNode(true);
      const dt = must(cell.querySelector("dt"), "a fact lost its label");
      const dd = must(cell.querySelector("dd"), "a fact lost its value");
      dt.textContent = label;
      dd.textContent = value;
      if (tone) dd.style.color = tone;
      dl.append(cell);
    }
    return dl;
  };

  const OUTSTANDING = "#b26a00";
  const DONE = "#2e7d32";

  /** The app's own primary colour, read off the shipped chip rather than guessed. */
  const primaryColour = (chip) => getComputedStyle(chip).backgroundColor || "#1976d2";

  const helperText = (text) => {
    const p = document.createElement("p");
    p.className = "MuiFormHelperText-root";
    p.style.cssText = "margin:3px 14px 0;font-size:12px;color:rgba(0,0,0,.6)";
    p.textContent = text;
    return p;
  };

  /**
   * Turn one cloned question field into one of the form's asks.
   *
   * The shipped question fields are selects, so the value box is a div already
   * carrying the outlined input's own padding, font and metrics. Reusing that
   * div as the value display — rather than authoring an <input> — is why these
   * fields cannot drift from what MUI actually renders here. The dropdown arrow
   * and the select's hidden native input go; nothing else about the control does.
   *
   * MUI shrinks an outlined label when the control holds a value, and the notch
   * in the border opens to make room for it. Neither state's emotion class is on
   * this page (no field here is filled), so both are applied as the inline
   * transform and notch width MUI itself uses.
   */
  const asField = (
    tpl,
    { label, value = "", help = null, required = false, restricted = false },
  ) => {
    const field = tpl.cloneNode(true);
    const text = required ? `${label} *` : label;

    const labelEl = must(field.querySelector(".MuiInputLabel-root"), "a field has no label");
    labelEl.textContent = text;
    labelEl.removeAttribute("id");
    if (required) {
      labelEl.textContent = label;
      const star = document.createElement("span");
      star.textContent = " *";
      star.style.color = "#d32f2f";
      labelEl.append(star);
    }

    const legendSpan = field.querySelector("fieldset legend span");
    if (legendSpan) legendSpan.textContent = text;
    const legend = field.querySelector("fieldset legend");

    const root = must(field.querySelector(".MuiInputBase-root"), "a field has no input root");
    root.classList.remove("MuiSelect-root");
    field.querySelector(".MuiSelect-icon")?.remove();
    field.querySelector(".MuiSelect-nativeInput")?.remove();

    const box = must(field.querySelector(".MuiSelect-select"), "a field has no value box");
    box.textContent = value;
    box.removeAttribute("role");
    box.removeAttribute("aria-expanded");
    box.removeAttribute("aria-haspopup");
    box.removeAttribute("aria-labelledby");
    box.removeAttribute("id");
    box.removeAttribute("tabindex");
    box.style.color = value ? "rgba(0,0,0,0.87)" : "transparent";

    // MUI shrinks an outlined label into the border notch only when the control
    // holds a value; an empty field shows its label inside the box. Neither
    // state's emotion class exists on this page, and the shipped question fields
    // arrive in whichever state that player's own answers left them in — filled
    // on one subject's page, blank on another's. Setting BOTH states explicitly
    // is what stops the same empty field rendering two different ways across two
    // screens, which is exactly what the first shoot of W4-01 and W4-02 did.
    if (value) {
      labelEl.setAttribute("data-shrink", "true");
      labelEl.style.cssText =
        "transform:translate(14px,-9px) scale(0.75);transform-origin:top left;" +
        "background:#fff;padding:0 5px;max-width:calc(133% - 32px);pointer-events:none";
      if (legend) legend.style.maxWidth = "100%";
      if (legendSpan) legendSpan.style.visibility = "visible";
    } else {
      labelEl.setAttribute("data-shrink", "false");
      labelEl.style.cssText =
        "transform:translate(14px,16px) scale(1);transform-origin:top left;" +
        "background:none;padding:0;max-width:calc(100% - 24px);pointer-events:none";
      if (legend) legend.style.maxWidth = "0.01px";
      if (legendSpan) legendSpan.style.visibility = "hidden";
    }

    if (restricted) root.style.borderRadius = "4px";
    if (help) field.append(helperText(help));
    return field;
  };

  /**
   * Consent — the tick, and step one. The answer page carries no checkbox to
   * clone, so this is MUI's own checked checkbox: its icon path, at its size, in
   * the primary colour read off this page's own chip.
   */
  const TICK_CHECKED =
    "M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z";
  const TICK_BLANK =
    "M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm0 16H5V5h14v14z";

  const consentTick = (chip, { label, note, checked = false }) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:flex-start;gap:9px;margin:0 0 4px";
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("aria-hidden", "true");
    const fill = checked ? primaryColour(chip) : "rgba(0,0,0,0.6)";
    svg.style.cssText = `width:24px;height:24px;flex:0 0 24px;fill:${fill};margin-top:-1px`;
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", checked ? TICK_CHECKED : TICK_BLANK);
    svg.append(path);
    const words = document.createElement("div");
    const main = document.createElement("p");
    main.style.cssText = "margin:0;font-size:15px;color:rgba(0,0,0,0.87)";
    main.textContent = label;
    words.append(main);
    if (note) {
      const sub = document.createElement("p");
      sub.style.cssText = "margin:3px 0 0;font-size:12px;color:rgba(0,0,0,.6)";
      sub.textContent = note;
      words.append(sub);
    }
    row.append(svg, words);
    return row;
  };

  /** One section heading inside the form, cloned from the shipped questions heading. */
  const sectionHeading = (tpl, text) => {
    const h = tpl.cloneNode(true);
    h.textContent = text;
    h.style.marginTop = "8px";
    return h;
  };

  /**
   * Rebuild the form's stack as the onboarding form: a heading, then whatever
   * rows the screen asks for. Returns a lookup of the marked anchors by key.
   */
  const buildForm = (shell, rows) => {
    const fieldTpl = must(
      shell.stack.querySelector(".MuiTextField-root"),
      "the answer form has no field to clone",
    ).cloneNode(true);
    const headingTpl = must(
      shell.stack.querySelector("h2"),
      "the answer form has no heading to clone",
    ).cloneNode(true);
    shell.stack.textContent = "";
    const anchors = {};
    for (const row of rows) {
      let node;
      if (row.kind === "heading") node = sectionHeading(headingTpl, row.text);
      else if (row.kind === "pane") node = documentPane(row.paragraphs, { heading: row.heading });
      else if (row.kind === "steps") node = stepList(row.steps);
      else if (row.kind === "outstanding") node = outstandingBySection(row.groups);
      else if (row.kind === "consent") node = consentTick(shell.chip, row);
      else if (row.kind === "note") {
        node = document.createElement("p");
        node.style.cssText = "margin:0;font-size:13px;color:rgba(0,0,0,.6)";
        node.textContent = row.text;
      } else node = asField(fieldTpl, row);
      shell.stack.append(node);
      if (row.key) anchors[row.key] = node;
    }
    return anchors;
  };

  const setSubmit = (button, label) => {
    button.textContent = label;
    return button;
  };

  /**
   * Everything the event page says that an onboarding page must not.
   *
   * The attendance count and the "one other invitation" alert are the answer
   * link's own content, and leaving either behind would put another player's
   * business — and a second event's — on a page about one person's own record.
   * Both are removed rather than reworded: this page has nothing to say in
   * their place.
   */
  const dropEventLeftovers = () => {
    const attending = $$("p").find((p) =>
      /other (people|person) (are|is) already attending/i.test(p.textContent),
    );
    attending?.remove();
    for (const alert of $$(".MuiAlert-root")) alert.remove();
  };

  /**
   * The "Plans changed?" line under the form — the page's own secondary slot.
   * Matched on the leaf that actually holds the words, because the shipped line
   * is a Typography inside its own small form and a `p`-only search missed it.
   */
  const setSecondary = (text) => {
    const node = $$("*").find(
      (el) => el.children.length === 0 && /plans changed/i.test(el.textContent ?? ""),
    );
    if (!node)
      throw new Error("Proposal could not apply: the page has no secondary line under its form.");
    if (text === null) {
      (node.closest("form") ?? node).remove();
      return null;
    }
    node.textContent = text;
    return node;
  };

  // ---------------------------------------------------------------------------
  // Owner direction, 2026-09-01. The Code of Conduct, the photo release and the
  // BUCS Play instructions each become their own page in the sequence behind the
  // one link, rather than a tick on the details form:
  //
  //   "the code of conduct needs to be its own page where we have the code of
  //    conduct on the page. We scroll to the bottom, and it says, 'Click I agree
  //    to the code of conduct'... You go to the next page."
  //
  // These two helpers are what those pages are made of. Neither invents a
  // component: the pane is a bordered scrolling box of paragraphs and the steps
  // are an ordered list.
  // ---------------------------------------------------------------------------

  /**
   * A document the player reads before agreeing to it. Scrolled to its end in the
   * shot, because the end is where the mechanic lives — the agreement control is
   * only reachable there, and a screen showing the top would not show the thing
   * being reviewed.
   */
  const documentPane = (paragraphs, { heading = null } = {}) => {
    // Two elements, and the reason is mark(): it sets `overflow: visible` on
    // whatever it outlines, so marking the scroller itself unclipped the document
    // and spilled it over the agreement control and the button beneath. The
    // wrapper is what gets marked; the scroller inside it keeps its own overflow.
    const wrapper = document.createElement("div");
    const pane = document.createElement("div");
    wrapper.append(pane);
    pane.dataset.intakePane = "document";
    pane.style.cssText =
      "border:1px solid rgba(0,0,0,0.23);border-radius:4px;padding:16px 18px;" +
      "max-height:340px;overflow:auto;background:#fff";
    if (heading) {
      const h = document.createElement("p");
      h.style.cssText = "margin:0 0 10px;font-size:15px;font-weight:700";
      h.textContent = heading;
      pane.append(h);
    }
    for (const text of paragraphs) {
      const p = document.createElement("p");
      p.style.cssText = "margin:0 0 11px;font-size:13.5px;line-height:1.65;color:rgba(0,0,0,0.8)";
      p.textContent = text;
      pane.append(p);
    }
    return wrapper;
  };

  /** Scroll every document pane to its end, so the shot shows the agreement point. */
  const scrollPanesToEnd = () => {
    for (const pane of $$('[data-intake-pane="document"]')) pane.scrollTop = pane.scrollHeight;
  };

  /** The numbered steps a player follows off-system, before confirming they did. */
  const stepList = (steps) => {
    const ol = document.createElement("ol");
    // The app's own reset strips list markers, and a set of steps without its
    // numbers is not a set of steps. Both are restored explicitly.
    ol.style.cssText = "margin:0;padding-left:24px;list-style:decimal outside";
    for (const step of steps) {
      const li = document.createElement("li");
      li.style.cssText =
        "display:list-item;list-style:decimal outside;margin:0 0 9px;" +
        "font-size:14px;line-height:1.6;color:rgba(0,0,0,0.82)";
      li.textContent = step;
      ol.append(li);
    }
    return ol;
  };

  /** A pane or list dropped straight into the form's stack, via buildForm. */
  const BLOCK_KINDS = new Set(["pane", "steps"]);

  /**
   * What is still outstanding, by section, each item a link back to the step that
   * collects it. Owner direction, 2026-09-02: the finishing page's single
   * sentence "is very hard to tell. It should honestly be a set of options…
   * it should list below in dots, like a list… if they click on that link, it
   * brings them back to the form that has that information, so they can fill it
   * out there if they want to."
   */
  const outstandingBySection = (groups) => {
    const wrap = document.createElement("div");
    for (const group of groups) {
      const h = document.createElement("p");
      h.style.cssText =
        "margin:14px 0 6px;font-size:12px;font-weight:700;letter-spacing:0.04em;" +
        "text-transform:uppercase;color:rgba(0,0,0,0.55)";
      h.textContent = group.section;
      wrap.append(h);
      const ul = document.createElement("ul");
      ul.style.cssText = "margin:0;padding-left:22px;list-style:disc outside";
      for (const item of group.items) {
        const li = document.createElement("li");
        li.style.cssText =
          "display:list-item;list-style:disc outside;margin:0 0 6px;font-size:14px;line-height:1.6";
        const a = document.createElement("a");
        a.href = item.href ?? "#";
        a.textContent = item.label;
        a.style.cssText = "color:#1565c0;text-decoration:underline";
        li.append(a);
        if (item.note) {
          const tail = document.createElement("span");
          tail.style.cssText = "color:rgba(0,0,0,0.6)";
          tail.textContent = ` — ${item.note}`;
          li.append(tail);
        }
        ul.append(li);
      }
      wrap.append(ul);
    }
    return wrap;
  };

  // W4-01 — Step 1: your details.
  //
  // Owner direction, 2026-09-01: the form is split. The Code of Conduct, the
  // photo release and the BUCS Play instructions each get their own page, so this
  // page is now only the details — and the emergency contact is broken out into
  // the fields the database actually stores rather than one line of text.
  //
  // Merrick Thornbury arrived in this season's import. His record really does
  // hold his name, mobile, personal email and a full emergency contact, and
  // really is missing college, matriculation year, expected graduation, degree
  // field and date of birth.
  const s = answerShell();

  setChip(s.chip, "ONBOARDING · 2026–27");
  s.h1.textContent = "Welcome to the team, 2026–27";
  setLead(s.lead, "Step 1 of 5 · Your details");

  dropEventLeftovers();

  mark(
    setFacts(s.dl, [
      ["Your details", "5 still needed", OUTSTANDING],
      ["Code of Conduct", "Step 2", OUTSTANDING],
      ["Photo release", "Step 3", OUTSTANDING],
      ["BUCS Play", "Step 4", OUTSTANDING],
      ["Hudl", "Step 5", OUTSTANDING],
    ]),
    1,
  );

  setPrivacy(
    s.privacy,
    "This secure page shows only your own record. Nobody else's details are ever shown here, and the club's privacy policy applies to everything you give.",
  );

  const a = buildForm(s, [
    { kind: "heading", text: "First — may the club message you this season?" },
    {
      kind: "consent",
      key: "consent",
      checked: false,
      label: "Yes, Oxford Lancers may message me about the club this season.",
      note: "Asked again every season. If you want the club to stop, ask and an operator will switch it off — this form has no way to untick it.",
    },

    {
      kind: "note",
      key: "required",
      text: "Everything marked * is required to finish onboarding. The recruit sign-up form asks for three things and lets the rest go; this one does not — it is the form the club runs a season on.",
    },
    { kind: "heading", text: "Who you are" },
    { key: "given", label: "First name", value: "Merrick", required: true },
    { label: "Last name", value: "Thornbury", required: true },
    {
      label: "Mobile phone",
      value: "07700 900218",
      required: true,
      help: "We will read this back to you before saving it.",
    },
    {
      label: "Personal email",
      value: "merrick.thornbury@farrowgate.ox.ac.example",
      required: true,
    },

    { kind: "heading", text: "Where you study" },
    { key: "gap", label: "College", required: true },
    { label: "Matriculation year", required: true },
    { label: "Expected graduation", required: true },
    { label: "Degree field", required: true },

    { kind: "heading", text: "Kept private" },
    {
      key: "dob",
      label: "Date of birth",
      required: true,
      help: "Never appears on any list, board or queue. Only whether you are under 18 is derived from it.",
    },

    { kind: "heading", text: "Emergency contact" },
    { key: "emergency", label: "Emergency contact first name", value: "Lucian", required: true },
    { label: "Emergency contact last name", value: "Thornbury" },
    {
      key: "relationship",
      label: "Relationship to you",
      value: "Partner",
      help: "The fifth column person_emergency_contacts already stores. Drop it and the table keeps it blank.",
    },
    { label: "Emergency contact phone", value: "07700 900138", required: true },
    { label: "Emergency contact email", value: "lucian.38@mail.example" },
  ]);

  // 1 — the strip now doubles as the map of the sequence: five steps, one link.
  // 2 — consent, and it is still step one of step one.
  mark(a.consent, 2);
  // 3 — what the club already holds arrives filled in; the ask is to confirm it.
  mark(a.given, 3);
  // 4 — and what it does not hold is blank.
  mark(a.gap, 4);
  // 5 — the one restricted fact.
  mark(a.dob, 5);
  // 6 — the emergency contact, as five fields rather than one line.
  mark(a.emergency, 6);
  // 7 — and the required set itself: the player tier, not the recruit tier.
  mark(a.required, 7);

  setSubmit(s.submit, "Save and continue");
  setSecondary("You can leave and come back to this link. What you have entered is kept.");

  await settle();
})();
