(() => {
  // Shared mockup prelude — M-RECRUITMENT.
  //
  // Every proposal in this mission is evaluated into the running application at
  // main@e669331, so both sides of a screen are photographs of the same page
  // differing only by the change. These helpers exist so each screen expresses
  // only its own idea: they CLONE elements the application already rendered
  // rather than authoring markup, which is why the banding, chips, type scale
  // and spacing cannot drift from what shipped.
  //
  // Generated file. Edit mockups/src/<screen>.js and rerun build-proposals.mjs.
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const setHeading = (title, subtitle) => {
    const h1 = $("h1");
    if (h1) h1.textContent = title;
    if (!subtitle) return;
    for (const p of $$(".MuiTypography-body2")) {
      if (/players|columns|recruits|people|Season 20/i.test(p.textContent)) {
        p.textContent = subtitle;
        return;
      }
    }
  };

  const relabelButton = (from, to) => {
    for (const b of $$("a, button")) {
      if (new RegExp(`^\\s*${from}\\s*$`, "i").test(b.textContent)) {
        b.textContent = to;
        return b;
      }
    }
    return null;
  };

  // Inject a stylesheet. React owns the navigation and re-renders it after a
  // mutation, reverting class and attribute changes; a stylesheet is not part of
  // its diff, so rules survive where attribute edits do not.
  const injectStyle = (css) => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    return style;
  };

  // Add a Recruits item to the Administration list and move the selected
  // treatment onto it.
  const selectRecruitsNav = (label = "Recruits", href = "/operate/recruits") => {
    const links = $$("nav a");
    const people = links.find((a) => a.textContent.trim() === "People");
    const current = links.find((a) => a.classList.contains("Mui-selected"));
    if (!people) return null;

    const item = people.cloneNode(true);
    const text = item.querySelector(".MuiListItemText-primary") ?? item;
    text.textContent = label;
    item.setAttribute("href", href);
    item.setAttribute(
      "class",
      current ? current.getAttribute("class") : people.getAttribute("class"),
    );
    people.after(item);

    if (current) {
      const currentHref = current.getAttribute("href");
      injectStyle(
        `nav a[href="${currentHref}"]{background-color:transparent !important}` +
          `nav a[href="${href}"]{background-color:rgb(66,66,66) !important}`,
      );
    }
    return item;
  };

  // The recruit ladder's colours, used by every screen that shows a status.
  const LADDER = {
    identified: "#78909c",
    engaged: "#00695c",
    committed: "#2e7d32",
    joined: "#0b3d91",
    declined: "#8d6e63",
    disengaged: "#b26a00",
    void: "#546e7a",
  };

  // Paint a cloned MUI chip as a ladder rung.
  const asRung = (chip, value) => {
    chip.className = chip.className.replace(/MuiChip-color\w+/, "MuiChip-colorDefault");
    chip.style.backgroundColor = LADDER[value] ?? "#78909c";
    chip.style.color = "#fff";
    chip.style.fontWeight = "600";
    const label = chip.querySelector(".MuiChip-label") ?? chip;
    label.textContent = value;
    label.style.color = "#fff";
    return chip;
  };

  // A muted "not recorded" paragraph in the application's own grey.
  const muted = (node, text) => {
    node.textContent = text;
    node.style.color = "rgba(0,0,0,0.38)";
    node.style.fontStyle = "italic";
    return node;
  };

  // A card in the application's own shape. The page's Papers include alerts and
  // wrappers, so pick one that actually looks like a content card: light
  // background, real height, and a heading inside it.
  const cardTemplate = () => {
    const papers = $$(".MuiPaper-root").filter((el) => {
      const bg = getComputedStyle(el).backgroundColor;
      const light = /^rgba?\((2[0-9]{2}|25[0-5]), ?(2[0-9]{2}), ?(2[0-9]{2})/.test(bg);
      return el.offsetHeight > 90 && light && el.querySelector("p, h1, h2, h3, h4, h5, h6");
    });
    return papers[0] ?? null;
  };

  const drawnPanel = (title) => {
    const tpl = cardTemplate();
    const panel = document.createElement("div");
    if (tpl) {
      const s = getComputedStyle(tpl);
      panel.style.cssText = `background:${s.backgroundColor};border:${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor};border-radius:${s.borderRadius};box-shadow:${s.boxShadow};margin-bottom:${s.marginBottom || "16px"}`;
    } else {
      panel.style.cssText =
        "background:#fff;border:1px solid rgba(0,0,0,0.12);border-radius:8px;margin-bottom:16px";
    }
    panel.style.padding = "20px 24px";
    if (title) {
      const h = document.createElement("div");
      h.textContent = title;
      h.style.cssText = "font-size:15px;font-weight:700;margin:0 0 14px;letter-spacing:.01em";
      panel.append(h);
    }
    return panel;
  };

  // A label/value row in the record's own proportions. Built explicitly rather
  // than cloned: the page's rows are laid out by a flex rule that does not
  // survive being copied out of context.
  const makeRow = (label, value, opts = {}) => {
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:baseline;gap:16px;padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.08)";
    const l = document.createElement("div");
    l.textContent = label;
    l.style.cssText = "flex:0 0 210px;font-size:14px;color:rgba(0,0,0,0.75)";
    const v = document.createElement("div");
    v.style.cssText = "flex:1;font-size:14px;color:rgba(0,0,0,0.87)";
    if (opts.chip) {
      const src = $(".MuiChip-root");
      if (src) {
        const c = src.cloneNode(true);
        asRung(c, opts.chip);
        v.append(c);
      } else {
        v.textContent = opts.chip;
      }
    } else {
      v.textContent = value;
      if (opts.muted) {
        v.style.color = "rgba(0,0,0,0.38)";
        v.style.fontStyle = "italic";
      }
    }
    row.append(l, v);
    return row;
  };

  // Append a proposed card after the last real card on a record-style page.
  const appendCard = (title, rows, note) => {
    const panel = drawnPanel(title);
    panel.style.border = "1px solid rgba(0,105,92,0.45)";
    const flag = document.createElement("div");
    flag.textContent = "PROPOSED — this mission";
    flag.style.cssText =
      "font-size:10px;font-weight:700;letter-spacing:.09em;color:#00695c;margin-bottom:8px";
    panel.insertBefore(flag, panel.firstChild);
    for (const r of rows) panel.append(r);
    if (rows.length) rows[rows.length - 1].style.borderBottom = "none";
    if (note) {
      const n = document.createElement("p");
      n.textContent = note;
      n.style.cssText = "margin:12px 0 0;font-size:12.5px;color:rgba(0,0,0,0.55);font-style:italic";
      panel.append(n);
    }
    const anchor = cardTemplate();
    const host = anchor?.parentElement ?? document.body;
    host.append(panel);
    return panel;
  };

  // Remove a status chip duplicated in the page header, without touching chips
  // that carry a real value inside a card.
  const dedupeHeaderChip = (text) => {
    const firstCard = cardTemplate();
    const chips = $$(".MuiChip-root").filter(
      (c) =>
        c.textContent.trim() === text &&
        (!firstCard || !firstCard.contains(c)) &&
        (!firstCard || c.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
    chips.slice(1).forEach((c) => c.remove());
    return chips.length;
  };

  // A surface the application has no analogue for. The page is cleared and the
  // drawing rendered in its place, so the shot is the drawing and nothing else.
  // Screens built this way are labelled "New surface, nothing to compare" and
  // their acceptance grounding is code-only.
  const drawnSurface = ({ title, subtitle, chrome, width = 760 }) => {
    const font = getComputedStyle(document.body).fontFamily;
    document.body.replaceChildren();
    document.body.style.cssText = `margin:0;background:#eceff1;font-family:${font};color:rgba(0,0,0,0.87)`;
    const wrap = document.createElement("div");
    wrap.style.cssText = `max-width:${width}px;margin:0 auto;padding:28px 20px 48px`;
    const flag = document.createElement("div");
    flag.textContent = "DRAWN — no equivalent surface exists on main";
    flag.style.cssText =
      "font-size:10px;font-weight:700;letter-spacing:.09em;color:#b26a00;margin-bottom:14px";
    wrap.append(flag);
    if (chrome) {
      const bar = document.createElement("div");
      bar.textContent = chrome;
      bar.style.cssText =
        "font-size:12px;color:rgba(0,0,0,0.5);background:#fff;border:1px solid rgba(0,0,0,0.12);border-radius:6px;padding:7px 12px;margin-bottom:14px;font-family:ui-monospace,monospace";
      wrap.append(bar);
    }
    const card = document.createElement("div");
    card.style.cssText =
      "background:#fff;border:1px solid rgba(0,0,0,0.12);border-radius:10px;padding:26px 28px";
    const h = document.createElement("div");
    h.textContent = title;
    h.style.cssText = "font-size:22px;font-weight:700;margin:0 0 6px";
    card.append(h);
    if (subtitle) {
      const sub = document.createElement("p");
      sub.textContent = subtitle;
      sub.style.cssText = "margin:0 0 18px;font-size:14px;color:rgba(0,0,0,0.6)";
      card.append(sub);
    }
    wrap.append(card);
    document.body.append(wrap);
    return card;
  };

  const field = (label, placeholder, opts = {}) => {
    const box = document.createElement("div");
    box.style.cssText = "margin:0 0 16px";
    const l = document.createElement("div");
    l.textContent = label + (opts.required ? " *" : "");
    l.style.cssText = "font-size:13px;font-weight:600;margin-bottom:6px";
    const i = document.createElement("div");
    i.textContent = placeholder;
    i.style.cssText =
      "border:1px solid rgba(0,0,0,0.23);border-radius:6px;padding:11px 13px;font-size:14px;color:rgba(0,0,0,0.38)";
    box.append(l, i);
    if (opts.help) {
      const h = document.createElement("div");
      h.textContent = opts.help;
      h.style.cssText = "font-size:12px;color:rgba(0,0,0,0.5);margin-top:5px";
      box.append(h);
    }
    return box;
  };

  const primaryButton = (text) => {
    const b = document.createElement("div");
    b.textContent = text;
    b.style.cssText =
      "display:inline-block;background:#0b3d91;color:#fff;font-size:14px;font-weight:600;letter-spacing:.03em;padding:11px 22px;border-radius:6px;margin-top:6px";
    return b;
  };

  const note = (text) => {
    const n = document.createElement("p");
    n.textContent = text;
    n.style.cssText =
      "margin:18px 0 0;font-size:12.5px;color:rgba(0,0,0,0.55);font-style:italic;line-height:1.6";
    return n;
  };

  // A WhatsApp-style message ladder, for the messages this mission sends.
  const bubbles = (items) => {
    const list = document.createElement("div");
    list.style.cssText = "background:#e5ddd5;border-radius:8px;padding:16px";
    for (const [text, meta] of items) {
      const row = document.createElement("div");
      row.style.cssText = "margin-bottom:12px";
      const b = document.createElement("div");
      b.textContent = text;
      b.style.cssText =
        "background:#fff;border-radius:8px;padding:10px 13px;font-size:13.5px;line-height:1.5;max-width:88%;box-shadow:0 1px 1px rgba(0,0,0,0.12)";
      const m = document.createElement("div");
      m.textContent = meta;
      m.style.cssText = "font-size:11px;color:rgba(0,0,0,0.45);margin-top:4px";
      row.append(b, m);
      list.append(row);
    }
    return list;
  };

  // Open a control the application already has, and wait for what it reveals.
  // Proposals that need this return a promise; page.evaluate awaits it.
  const openControl = async (text, ms = 700) => {
    const el = $$("button, a").find((b) => new RegExp(text, "i").test(b.textContent));
    if (el) el.click();
    await new Promise((r) => setTimeout(r, ms));
    return el;
  };

  // Fill a real form field, so the shot shows a filled form rather than a
  // described one.
  const fill = (name, value) => {
    const input = document.querySelector(`input[name="${name}"], textarea[name="${name}"]`);
    if (!input) return null;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter ? setter.call(input, value) : (input.value = value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    // MUI floats the label on focus/value via React state, which a scripted value
    // set does not trigger. Add the class the component would have added.
    const label = input.closest(".MuiFormControl-root")?.querySelector(".MuiInputLabel-root");
    if (label) label.classList.add("MuiInputLabel-shrink", "MuiFormLabel-filled");
    const legend = input.closest(".MuiFormControl-root")?.querySelector("legend");
    if (legend) legend.style.maxWidth = "100%";
    return input;
  };

  // Insert a proposed block immediately after a real form field, so an addition
  // reads as part of the form rather than as a note about it.
  const afterField = (name, node) => {
    const input = document.querySelector(`input[name="${name}"]`);
    const row = input?.closest(".MuiFormControl-root, .MuiTextField-root") ?? input?.parentElement;
    row?.parentElement?.insertBefore(node, row.nextSibling);
    return node;
  };

  // A block that is visibly part of the proposal, in the application's own idiom.
  const proposedBlock = (tone = "teal") => {
    const colours = {
      teal: ["#00695c", "rgba(0,105,92,0.06)", "rgba(0,105,92,0.45)"],
      amber: ["#b26a00", "#fdf6ec", "rgba(178,106,0,0.55)"],
      green: ["#1b5e20", "#e8f5e9", "rgba(46,125,50,0.45)"],
    };
    const [fg, bg, border] = colours[tone] ?? colours.teal;
    const box = document.createElement("div");
    box.style.cssText = `background:${bg};border:1px solid ${border};border-radius:8px;padding:14px 16px;margin:14px 0`;
    box.dataset.fg = fg;
    return box;
  };

  const blockTitle = (box, text) => {
    const t = document.createElement("div");
    t.textContent = text;
    t.style.cssText = `font-size:13px;font-weight:700;color:${box.dataset.fg};margin-bottom:8px`;
    box.append(t);
    return box;
  };

  const blockText = (box, text) => {
    const t = document.createElement("div");
    t.textContent = text;
    t.style.cssText = "font-size:13.5px;line-height:1.55;color:rgba(0,0,0,0.8)";
    box.append(t);
    return box;
  };

  const checkboxRow = (label, checked = false) => {
    const row = document.createElement("label");
    row.style.cssText =
      "display:flex;gap:10px;align-items:flex-start;font-size:13.5px;margin-top:10px";
    const box = document.createElement("span");
    box.textContent = checked ? "\u2713" : "";
    box.style.cssText =
      "flex:0 0 18px;height:18px;border:2px solid rgba(0,0,0,0.45);border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;margin-top:1px";
    const t = document.createElement("span");
    t.textContent = label;
    row.append(box, t);
    return row;
  };

  // W1-02 — The recruit board, scrolled to the recruitment columns.
  //
  // The board is CLONED from the shipped roster board, element by element, so the
  // banding, sticky header, filter chips and type scale are identical by
  // construction. Rows are synthetic: only Rosalind Penhaligon (identified) and
  // Tobias Wrenfield (engaged) are seeded at main@e669331, and both render here
  // with their real seeded facts; four more are invented in the same synthetic
  // universe so the board can be judged as a board.
  const table = document.querySelector("table");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  const [bandRow, colRow] = thead.querySelectorAll("tr");
  const bandCells = [...bandRow.querySelectorAll("th")];
  const templateRow = tbody.querySelector("tr");

  // ---- Templates cloned from the shipped board -----------------------------
  const spacerBand = bandCells[0];
  const personBand = bandCells[1];
  const seasonBand = bandCells[3];
  const colCells = [...colRow.querySelectorAll("th")];
  const pinnedCol = colCells[0];
  const filterCol = colCells[1];

  const bodyCells = [...templateRow.querySelectorAll("td")];
  const pinnedCell = bodyCells[0];
  const linkCell = bodyCells[1];
  const chipCell = bodyCells[5];
  const plainCell = bodyCells[6];
  const statusCell = bodyCells[8];

  const band = (template, label, span, colour) => {
    const th = template.cloneNode(true);
    th.setAttribute("colspan", String(span));
    th.querySelector("span").textContent = label;
    if (colour) th.style.backgroundColor = colour;
    return th;
  };

  const column = (label, caption) => {
    const th = filterCol.cloneNode(true);
    const sort = th.querySelector('[role="button"]');
    sort.childNodes[0].nodeValue = label;
    const filter = th.querySelector("button");
    if (filter) filter.setAttribute("aria-label", `Filter ${label}`);
    const cap = th.querySelector(".MuiTypography-caption");
    if (cap) cap.textContent = caption;
    return th;
  };

  const textCell = (text, muted) => {
    const td = plainCell.cloneNode(true);
    const p = td.querySelector("p");
    p.textContent = text;
    p.style.color = muted ? "rgba(0,0,0,0.38)" : "";
    p.style.fontStyle = muted ? "italic" : "";
    return td;
  };

  const recordCell = (text) => {
    const td = linkCell.cloneNode(true);
    const a = td.querySelector("a");
    if (text === null) {
      td.replaceChildren();
      const p = plainCell.querySelector("p").cloneNode(true);
      p.textContent = "Not recorded";
      p.style.color = "rgba(0,0,0,0.38)";
      td.append(p);
      return td;
    }
    a.textContent = text;
    return td;
  };

  const chipsCell = (labels) => {
    const td = chipCell.cloneNode(true);
    const stack = td.querySelector(".MuiStack-root");
    const chip = stack.querySelector(".MuiChip-root").cloneNode(true);
    stack.replaceChildren();
    for (const l of labels) {
      const c = chip.cloneNode(true);
      c.querySelector(".MuiChip-label").textContent = l;
      stack.append(c);
    }
    return td;
  };

  // The status cell reuses the board's own filled chip, recoloured per rung.
  const statusChip = (value) => {
    const td = statusCell.cloneNode(true);
    asRung(td.querySelector(".MuiChip-root"), value);
    return td;
  };

  // One appended event column cell: invited · answered · attended.
  const eventCell = (invited, answered, attended) => {
    const td = chipCell.cloneNode(true);
    const stack = td.querySelector(".MuiStack-root");
    stack.replaceChildren();
    const glyph = (text, colour, title) => {
      const s = document.createElement("span");
      s.textContent = text;
      s.title = title;
      s.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;font-size:11px;font-weight:700;margin-right:3px;color:${colour === "none" ? "rgba(0,0,0,0.26)" : "#fff"};background:${colour === "none" ? "transparent" : colour};border:${colour === "none" ? "1px dashed rgba(0,0,0,0.18)" : "none"}`;
      return s;
    };
    stack.append(glyph(invited ? "I" : "·", invited ? "#78909c" : "none", "Invited"));
    stack.append(
      glyph(
        answered === "yes" ? "Y" : answered === "no" ? "N" : "·",
        answered === "yes" ? "#2e7d32" : answered === "no" ? "#8d6e63" : "none",
        "Answered",
      ),
    );
    stack.append(glyph(attended ? "A" : "·", attended ? "#0b3d91" : "none", "Attended"));
    return td;
  };

  // ---- The proposed header -------------------------------------------------
  bandRow.replaceChildren(
    spacerBand.cloneNode(true),
    band(personBand, "Person", 5),
    band(seasonBand, "Recruitment", 6, "#00695c"),
    band(seasonBand, "Events", 3),
  );

  const pinned = pinnedCol.cloneNode(true);
  pinned.querySelector('[role="button"]').childNodes[0].nodeValue = "Recruit";
  colRow.replaceChildren(
    pinned,
    column("College", "edit on the record"),
    column("Matric", "edit on the record"),
    column("Contactable", "indicators only"),
    column("On WhatsApp", "set by sign-on"),
    column("Status", "edit here"),
    column("Source", "edit here"),
    column("First contact", "edit here"),
    column("Asked", "set by the form"),
    column("Last touch", "derived"),
    column("Notes", "edit here"),
    column("Freshers' Fair 30 Apr", ""),
    column("Taster 1 · 30 Apr", ""),
    column("Taster 2 · 7 May", ""),
  );

  // ---- The proposed rows ---------------------------------------------------
  const RECRUITS = [
    [
      "Rosalind Penhaligon",
      "Dunsfold",
      "2026",
      ["Mobile"],
      "Not yet",
      "identified",
      "QR · Freshers' Fair",
      "28 Apr",
      "Not sent",
      "Welcome, 28 Apr",
      "Came to the stand with a friend from Dunsfold.",
      [true, "none", false],
      [false, "none", false],
      [false, "none", false],
    ],
    [
      "Tobias Wrenfield",
      "Marlbrook",
      "2025",
      ["Mobile", "Email"],
      "In the group",
      "engaged",
      "Walk-up · Taster 1",
      "30 Apr",
      "Answered 2 May",
      "Invitation, 6 May",
      "Played at school. Asked about kit.",
      [true, "yes", true],
      [true, "yes", true],
      [true, "none", false],
    ],
    [
      "Marguerite Ashdown",
      "Kestrelhall",
      "2026",
      ["Mobile", "Email"],
      "In the group",
      "committed",
      "Operator · sourced",
      "22 Apr",
      "Answered 25 Apr",
      "Follow-up, 9 May",
      "Said she is in. Wants to play safety.",
      [true, "yes", true],
      [true, "yes", true],
      [true, "yes", true],
    ],
    [
      "Peregrine Oakhollow",
      "Beaumont",
      "2024",
      ["Mobile"],
      "Not yet",
      "identified",
      "QR · Taster 2",
      "7 May",
      "Sent 8 May",
      "Ask, 8 May",
      "",
      [false, "none", false],
      [false, "none", false],
      [true, "none", true],
    ],
    [
      "Clementine Varrow",
      "Harewell",
      "2026",
      ["Email"],
      "Declined",
      "disengaged",
      "Walk-up · Freshers' Fair",
      "30 Apr",
      "Not answered",
      "Invitation, 6 May",
      "Came once, has not answered since.",
      [true, "none", false],
      [true, "no", false],
      [false, "none", false],
    ],
    [
      "Ambrose Kittiwake",
      null,
      null,
      ["Mobile"],
      "Not yet",
      "declined",
      "Walk-up · Taster 1",
      "30 Apr",
      "Not sent",
      "Welcome, 30 Apr",
      "Said rugby clashes. Happy to be asked again next year.",
      [true, "no", false],
      [false, "none", false],
      [false, "none", false],
    ],
  ];

  tbody.replaceChildren(
    ...RECRUITS.map((r) => {
      const tr = templateRow.cloneNode(false);
      const name = pinnedCell.cloneNode(true);
      name.querySelector("a").textContent = r[0];
      tr.append(
        name,
        recordCell(r[1]),
        recordCell(r[2]),
        chipsCell(r[3]),
        textCell(r[4], r[4] === "Not yet"),
        statusChip(r[5]),
        textCell(r[6]),
        textCell(r[7]),
        textCell(r[8], r[8] === "Not sent"),
        textCell(r[9]),
        textCell(r[10] || "—", !r[10]),
        eventCell(...r[11]),
        eventCell(...r[12]),
        eventCell(...r[13]),
      );
      return tr;
    }),
  );

  setHeading("Recruits", "Season 2026-27 \u00b7 6 recruits \u00b7 3 recruitment events");
  relabelButton("add player", "ADD RECRUIT");

  // The roster's filters describe memberships. A recruit holds none.
  const FILTERS = { Availability: "Source", "Missing onboarding data": "Ask outstanding" };
  for (const node of $$("label, .MuiInputLabel-root, .MuiSelect-select")) {
    const t = node.textContent.trim();
    if (FILTERS[t]) node.textContent = FILTERS[t];
  }

  selectRecruitsNav();

  // Scroll sideways to the Recruitment and Events bands, which is the whole point
  // of appending one column per recruitment event.
  const scroller = $("table")?.closest("div");
  if (scroller) scroller.scrollLeft = scroller.scrollWidth;
})();
