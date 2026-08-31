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

  // W8-02 — The empty queue. A queue nobody can see is a queue nobody works, so
  // the count is on the board; this is what it looks like at zero.
  setHeading("Captures waiting for a decision", "Nothing waiting");
  const empty = drawnPanel("Nothing is waiting");
  empty.style.textAlign = "center";
  empty.style.padding = "40px 28px";
  const body = document.createElement("div");
  body.style.cssText =
    "font-size:14px;color:rgba(0,0,0,0.7);line-height:1.9;max-width:52ch;margin:0 auto";
  body.innerHTML =
    "Every capture so far matched cleanly or was clearly somebody new.<br>" +
    "Captures land here only when the duplicate check cannot decide safely on its own.";
  empty.append(body);
  empty.append(
    note(
      "Nothing expires and nothing is auto-resolved. A forgotten queue is visible on the board as a count rather than silently draining itself.",
    ),
  );
  const anchor = cardTemplate();
  (anchor?.parentElement ?? document.body).append(empty);
})();
