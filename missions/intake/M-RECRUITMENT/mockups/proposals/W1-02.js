(async () => {
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

// ---------------------------------------------------------------------------
// A proposal that cannot apply must FAIL THE SHOOT, never produce a
// confident-looking screen.
//
// The 2026-08-31 defect: `rebuildCard`, `setPersonRows` and `replaceSummaryStrip`
// returned quietly when their target was not shaped the way they assumed.
// `rebuildCard` renamed the card's header and stamped "PROPOSED" on it BEFORE
// attempting the row replacement, so a failed replacement left a recruitment
// heading over the player record's own content — and the screen looked
// deliberate. Every screen built that way was shown as evidence.
//
// So these throw, exactly as `npm run intake -- edit` refuses a zero-match edit.
// A red shoot is cheap; a plausible lie in an approval packet is not.
// ---------------------------------------------------------------------------
const must = (value, what) => {
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
    throw new Error(`Proposal could not apply: ${what}. The screen was not photographed.`);
  }
  return value;
};

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

// ---------------------------------------------------------------------------
// Photograph a settled page, never a transition.
//
// The shoot screenshots immediately after the proposal returns. MUI animates
// background-color, so a nav item that has just been deselected is still ~82%
// opaque at t=0 and only reaches transparent a few hundred milliseconds later.
// The first rebuilt W1 shots caught exactly that: Roster measured
// `rgba(66,66,66,0.824)` in the photograph and `rgba(0,0,0,0)` a second later,
// so the screen showed two selected destinations and the DOM showed one.
//
// Killing transitions is better than sleeping: it is deterministic, and it
// removes a whole class of half-painted evidence rather than one instance.
// ---------------------------------------------------------------------------
injectStyle("*,*::before,*::after{transition:none !important;animation:none !important}");

/** Let style and layout settle before the screenshot. Proposals end with this. */
const settle = async (frames = 3) => {
  for (let i = 0; i < frames; i += 1) {
    await new Promise((r) => requestAnimationFrame(() => r()));
  }
  await new Promise((r) => setTimeout(r, 120));
};

// ---------------------------------------------------------------------------
// Where recruitment lives in the shell — Brian, 2026-08-31.
//
//   "It's a new page on the sidebar underneath Roster, and it's under /operate.
//    That's it. There's no factual thing: roster, recruitment, events, and
//    whatever. Don't change anything else. I'm just telling you where the
//    fucking order goes."
//
// So Recruitment is a TOP-LEVEL destination, second in the list, and NOT an
// entry in the Administration group. `destinations.ts` renders that list from
// `DESTINATIONS`; this clones the Roster item, renames it, and inserts it
// directly after Roster.
//
// The previous helper put a "Recruits" item in Administration and tried to move
// the selected treatment with an injected stylesheet. It failed silently and
// every W1 shot went out with BOTH Roster and Recruits looking selected. This
// one asserts what it found, moves the selection through the same three
// channels the component uses — the `Mui-selected` class, `aria-current`, and
// the 700-weight primary — and then verifies exactly one item is selected.
// ---------------------------------------------------------------------------
const RECRUITMENT_HREF = "/operate/recruitment";

const selectRecruitmentNav = (label = "Recruitment", href = RECRUITMENT_HREF) => {
  const links = $$('nav a, [role="navigation"] a');
  must(links, "the operator navigation has no links");
  const roster = must(
    links.find((a) => a.textContent.trim().startsWith("Roster")),
    "the operator navigation has no Roster destination to sit under",
  );

  const item = roster.cloneNode(true);
  const text = item.querySelector(".MuiListItemText-primary") ?? item;
  text.textContent = label;
  item.setAttribute("href", href);
  item.dataset.intakeNav = "recruitment";
  roster.after(item);

  // Deselect everything, then select this one. Class, aria and weight together:
  // the shipped component sets all three, so moving only the background leaves
  // a bold "Roster" that still reads as the current page.
  const deselect = (a) => {
    a.classList.remove("Mui-selected");
    a.removeAttribute("aria-current");
    const primary = a.querySelector(".MuiListItemText-primary");
    if (primary) primary.style.fontWeight = "500";
  };
  for (const a of $$('nav a, [role="navigation"] a')) deselect(a);
  item.classList.add("Mui-selected");
  item.setAttribute("aria-current", "page");
  const primary = item.querySelector(".MuiListItemText-primary");
  if (primary) primary.style.fontWeight = "700";

  // React owns this subtree and re-renders revert attribute edits; a stylesheet
  // is not part of its diff. Belt and braces, keyed on the marker set above.
  injectStyle(
    `nav a:not([data-intake-nav="recruitment"]){background-color:transparent !important}` +
      `nav a[data-intake-nav="recruitment"]{background-color:rgb(66,66,66) !important}`,
  );

  // Prove it, rather than trust it. This is the check the last session skipped.
  const selected = $$('nav a, [role="navigation"] a').filter((a) =>
    a.classList.contains("Mui-selected"),
  );
  if (selected.length !== 1 || selected[0] !== item) {
    throw new Error(
      `Navigation selection is wrong: ${selected.length} item(s) selected (${selected
        .map((a) => a.textContent.trim())
        .join(", ")}). Exactly one, Recruitment, must be.`,
    );
  }
  return item;
};

// The board is its own page under /operate, so the frame must say so.
const setRecruitmentRoute = () => {
  history.replaceState(null, "", RECRUITMENT_HREF);
};

// ---------------------------------------------------------------------------
// The phone rendering, which is half of every board screen and was wrong.
//
// The board is a <table> at md and up and a list of Cards below it
// (`roster-board.tsx:679`, `PlayerCard` at :1117). BOTH are always in the DOM —
// MUI's `display: { xs: "block", md: "none" }` hides one with CSS rather than
// unmounting it — so a proposal that rewrites only the table leaves the phone
// side showing the shipped roster underneath a recruitment heading. That is
// exactly what shipped on 2026-08-31: "Recruits · 6 recruits" over 42 players
// with Onboarding and "N missing" chips.
//
// Because both renderings are always present, one script fixes both, and this
// throws if the card list is missing rather than letting the phone shot lie.
// ---------------------------------------------------------------------------
const setRecruitCards = (recruits) => {
  const cards = $$('[data-testid="roster-card"]');
  must(cards, 'the phone rendering has no [data-testid="roster-card"] to replace');
  const host = must(cards[0].parentElement, "the phone card list has no parent");
  const template = cards[0];

  const built = recruits.map(({ name, status, detail }) => {
    const card = template.cloneNode(true);
    const title = must(
      card.querySelector(".MuiTypography-subtitle1"),
      "a roster card has no name line",
    );
    title.textContent = name;

    // The chip row: one ladder rung, and the source/first-contact line. The
    // membership chips this card shipped with describe a membership a recruit
    // does not hold, so they are replaced rather than hidden.
    const chipRow = must(
      card.querySelector(".MuiStack-root .MuiStack-root") ??
        card.querySelector(".MuiChip-root")?.parentElement,
      "a roster card has no chip row",
    );
    const chipTemplate = must(
      card.querySelector(".MuiChip-root"),
      "a roster card has no chip to clone",
    ).cloneNode(true);
    chipRow.replaceChildren(asRung(chipTemplate, status));

    const line = document.createElement("p");
    line.textContent = detail;
    line.style.cssText = "margin:6px 0 0;font-size:13px;color:rgba(0,0,0,0.6)";
    chipRow.parentElement.append(line);
    return card;
  });

  for (const card of cards) card.remove();
  for (const card of built) host.append(card);
  return built;
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

// ---------------------------------------------------------------------------
// Record-page helpers. The player record at /operate/roster/[membershipId] is
// built from banded cards whose rows carry data-testid="record-row" and a
// data-label. Cloning those rows is how a proposed card comes out identical to
// a shipped one instead of merely similar.
// ---------------------------------------------------------------------------

const recordCards = () =>
  $$(".MuiPaper-root").filter((c) => c.offsetHeight > 60 && c.innerText.trim());

const recordCard = (label) =>
  recordCards().find((c) =>
    c.innerText.split("\n")[0].trim().toUpperCase().startsWith(label.toUpperCase()),
  );

const rowTpl = () => $('[data-testid="record-row"]');

const recordRow = (label, value, opts = {}) => {
  const tpl = rowTpl();
  if (!tpl) return makeRow(label, value, opts);
  const row = tpl.cloneNode(true);
  row.setAttribute("data-label", label);
  const boxes = [...row.children];
  const l = boxes[0]?.querySelector("p") ?? boxes[0];
  if (l) l.textContent = label;
  const vBox = boxes[1];
  if (vBox) {
    const v = vBox.querySelector("p") ?? vBox;
    if (opts.chip) {
      const src = $(".MuiChip-root");
      v.replaceChildren();
      if (src) {
        const c = src.cloneNode(true);
        asRung(c, opts.chip);
        v.append(c);
      } else v.textContent = opts.chip;
    } else {
      // Drop any nested extra markup and leave one line of text.
      v.replaceChildren(document.createTextNode(value));
      if (opts.muted) {
        v.style.color = "rgba(0,0,0,0.38)";
        v.style.fontStyle = "italic";
      }
    }
  }
  return row;
};

// Retitle a banded card, recolour its header, and replace everything in it.
// Anything that is not a row - an onboarding alert, a filter strip - belongs to
// the card being replaced and goes with it.
const rebuildCard = (card, title, rows, opts = {}) => {
  must(card, `rebuildCard("${title}") was given no card`);

  // The rows go in FIRST. Renaming a header before the replacement is what
  // produced a recruitment heading over a player's attendance table on
  // 2026-08-31; if this throws, the card is still honestly the card it was.
  const existing = [...card.querySelectorAll('[data-testid="record-row"]')];
  must(existing, `card "${title}" holds no [data-testid="record-row"] to replace`);
  const host = must(existing[0].parentElement, `card "${title}" rows have no parent`);
  for (const child of [...host.children]) child.remove();
  for (const r of rows) host.append(r);

  const head = must(
    card.querySelector(".MuiTypography-overline") ?? card.firstElementChild,
    `card "${title}" has no header to retitle`,
  );
  const walker = document.createTreeWalker(head, NodeFilter.SHOW_TEXT);
  const first = walker.nextNode();
  if (first) first.nodeValue = title;
  else head.textContent = title;
  if (opts.colour) {
    const bar = head.closest("div");
    if (bar) bar.style.backgroundColor = opts.colour;
  }

  // Strip anything left over from the card this one replaces.
  for (const alert of card.querySelectorAll(".MuiAlert-root, .MuiChip-root")) {
    if (!rows.some((r) => r.contains(alert))) alert.remove();
  }
  if (opts.proposed) {
    const flag = document.createElement("div");
    flag.textContent = "PROPOSED — this mission";
    flag.style.cssText =
      "font-size:10px;font-weight:700;letter-spacing:.09em;color:#00695c;padding:10px 16px 0";
    const bar = head.closest("div");
    if (bar && bar.nextSibling) card.insertBefore(flag, bar.nextSibling);
    else card.insertBefore(flag, card.firstChild);
  }
  return card;
};

// The strip under the heading describes a membership. A recruit has none.
const replaceSummaryStrip = (items) => {
  const h1 = must($("h1"), "replaceSummaryStrip found no <h1>");
  const sub = must(h1.parentElement?.parentElement, "replaceSummaryStrip found no heading block");
  const strip = must(
    [...sub.children].find(
      (c) => c !== h1.parentElement && c.innerText && c.innerText.split("\n").length >= 4,
    ),
    "replaceSummaryStrip found no membership summary strip",
  );
  strip.replaceChildren();
  strip.style.cssText = "display:flex;gap:38px;flex-wrap:wrap;margin:10px 0 18px";
  for (const [value, label] of items) {
    const cell = document.createElement("div");
    const v = document.createElement("div");
    v.style.cssText = "font-size:19px;font-weight:700;line-height:1.2";
    if (value.chip) {
      const src = $(".MuiChip-root");
      if (src) {
        const c = src.cloneNode(true);
        asRung(c, value.chip);
        v.append(c);
      } else v.textContent = value.chip;
    } else v.textContent = value;
    const l = document.createElement("div");
    l.textContent = label;
    l.style.cssText = "font-size:12px;color:rgba(0,0,0,0.55);margin-top:3px";
    cell.append(v, l);
    strip.append(cell);
  }
};

// Overwrite the PERSON card's rows so the page is about the recruit it names.
const setPersonRows = (rows) => {
  const card = must(recordCard("PERSON"), "setPersonRows found no PERSON card");
  const existing = [...card.querySelectorAll('[data-testid="record-row"]')];
  must(existing, 'the PERSON card holds no [data-testid="record-row"] to replace');
  const host = must(existing[0].parentElement, "the PERSON card rows have no parent");
  for (const r of existing) r.remove();
  for (const r of rows) host.append(r);
};

const removeCard = (label) => recordCard(label)?.remove();

// The line under the heading describes a membership. Replace it wholesale.
const setSubtitle = (text) => {
  const h1 = $("h1");
  const holder = h1?.parentElement?.parentElement ?? document.body;
  for (const p of holder.querySelectorAll("p, .MuiTypography-body2")) {
    if (/membership|Returning|Active|Season 20/i.test(p.textContent) && p.textContent.length < 90) {
      p.textContent = text;
      return p;
    }
  }
  return null;
};

// One row of a template listing: what it is called, what it says, and whether
// Meta has approved it. Every business-initiated WhatsApp message is one of
// these; free text is not a production shape.
const templateRow = (name, body, state) => {
  const row = document.createElement("div");
  row.style.cssText =
    "border:1px solid rgba(0,0,0,0.12);border-radius:8px;padding:14px 16px;margin-bottom:12px;background:#fff";
  const top = document.createElement("div");
  top.style.cssText = "display:flex;justify-content:space-between;gap:16px;align-items:baseline";
  const n = document.createElement("code");
  n.textContent = name;
  n.style.cssText = "font-size:12.5px;font-weight:700;color:#0b3d91";
  const st = document.createElement("span");
  st.textContent = state;
  const approved = /approved/i.test(state);
  st.style.cssText = `font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${approved ? "#1b5e20" : "#b26a00"};background:${approved ? "#e8f5e9" : "#fdf6ec"};border-radius:4px;padding:3px 8px;white-space:nowrap`;
  top.append(n, st);
  const b = document.createElement("div");
  b.textContent = body;
  b.style.cssText = "font-size:13.5px;line-height:1.55;margin-top:9px;color:rgba(0,0,0,0.82)";
  row.append(top, b);
  return row;
};

// ---------------------------------------------------------------------------
// Pointing, not narrating — Brian, 2026-08-31.
//
// "I don't care if it has extra, as long as it stays bounded and I can scroll.
//  That's fine, but if there is something relevant, it needs to be pointed out.
//  I don't want that through narration."
//
// So a proposal never explains itself inside the application frame. It draws a
// numbered outline around each region it changed, and the prose for that number
// lives in the screen head, outside the frame, in build-pages.mjs. The number on
// the outline and the number on the delta are the same number.
//
// The outline is deliberately not a component: 2px of accent, a small numbered
// chip, and nothing else. It cannot be mistaken for product because no surface
// in this application has one.
const MARK_ACCENT = "#c2185b";

/**
 * Outline one element as delta `n` of this screen. Returns the element so a
 * proposal reads `mark(rebuildCard(...), 2)`.
 */
const mark = (node, n) => {
  if (!node) return node;
  const host = node.nodeType === 1 ? node : null;
  if (!host) return node;
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.style.outline = `2px solid ${MARK_ACCENT}`;
  host.style.outlineOffset = "2px";
  const chip = document.createElement("div");
  chip.textContent = String(n);
  chip.dataset.intakeMark = String(n);
  chip.style.cssText =
    `position:absolute;top:-11px;left:-11px;z-index:9;width:22px;height:22px;border-radius:50%;` +
    `background:${MARK_ACCENT};color:#fff;font:700 12px/22px system-ui,sans-serif;text-align:center;` +
    `box-shadow:0 1px 3px rgba(0,0,0,0.35)`;
  host.append(chip);
  return node;
};

/**
 * Insert a node as high in the page's own content as it honestly belongs, so a
 * marker is not buried four thousand pixels down a full-page shot. `anchor` is
 * the application element the proposal is speaking about; the node lands
 * immediately before it.
 */
const placeBefore = (anchor, node) => {
  const target = anchor ?? cardTemplate();
  target?.parentElement?.insertBefore(node, target);
  return node;
};

/**
 * A region built out of the page's own card treatment, carrying no prose of its
 * own. Use for content the proposal adds; explain it in the screen head.
 */
const proposedRegion = (title) => drawnPanel(title);

// ---------------------------------------------------------------------------
// The recruit board's data, in one place so W1-01 and W1-02 cannot disagree.
//
// Rosalind Penhaligon (identified) and Tobias Wrenfield (engaged) are the two
// recruits actually seeded at main@e669331 and carry their real seeded facts.
// Four more are invented in the same synthetic universe so a board can be
// judged as a board.
//
// FIELDS — Brian, 2026-08-31. The board carries the recruit's own stored
// fields and the person facts it may read, and nothing else:
//
//   Person (Mission 5's, read-only here): College, Matric, Contactable.
//   Recruitment (`recruitment_prospects`): Status, Source, First contact,
//     Asked, Notes.
//
// "On WhatsApp" is gone. It is not a recruit field — it is seasonal channel
// presence on the person record, empty at the baseline — and Brian struck the
// abstract signal column with it: "let's just make events events".
// "Last touch" is gone for the same reason.
// ---------------------------------------------------------------------------
const RECRUITMENT_EVENTS = [
  { name: "Freshers' Fair", date: "30 Apr" },
  { name: "Taster 1", date: "3 May" },
  { name: "Taster 2", date: "10 May" },
];

// `presence` is the club's own attendance vocabulary — Present, Late, Excused,
// Absent — or null for "nothing recorded". `rsvp` is "yes" | "no" | null, and
// is ALWAYS rendered with its prefix. attendance/presentation.ts:52:
// "Delivered never means responded. Attending is intent; Present is observed
// attendance." A bare tick in a coloured box is what that rule forbids.
const RECRUITS = [
  {
    name: "Rosalind Penhaligon",
    college: "Dunsfold",
    matric: "2026",
    contactable: ["Mobile"],
    status: "identified",
    source: "QR · Freshers' Fair",
    firstContact: "28 Apr",
    asked: "Not sent",
    notes: "Came to the stand with a friend from Dunsfold.",
    events: [
      { rsvp: null, presence: "absent" },
      { rsvp: null, presence: null },
      { rsvp: null, presence: null },
    ],
  },
  {
    name: "Tobias Wrenfield",
    college: "Marlbrook",
    matric: "2025",
    contactable: ["Mobile", "Email"],
    status: "engaged",
    source: "Walk-up · Taster 1",
    firstContact: "3 May",
    asked: "Answered 5 May",
    notes: "Played at school. Asked about kit.",
    events: [
      { rsvp: "yes", presence: "present" },
      { rsvp: null, presence: "present" },
      { rsvp: "yes", presence: null },
    ],
  },
  {
    name: "Marguerite Ashdown",
    college: "Kestrelhall",
    matric: "2026",
    contactable: ["Mobile", "Email"],
    status: "committed",
    source: "Operator · sourced",
    firstContact: "22 Apr",
    asked: "Answered 25 Apr",
    notes: "Said she is in. Wants to play safety.",
    events: [
      { rsvp: "yes", presence: "present" },
      { rsvp: "yes", presence: "late" },
      { rsvp: "yes", presence: null },
    ],
  },
  {
    name: "Peregrine Oakhollow",
    college: null,
    matric: null,
    contactable: ["Mobile"],
    status: "identified",
    source: "QR · Taster 2",
    firstContact: "10 May",
    asked: "Sent 11 May",
    notes: "",
    events: [
      { rsvp: null, presence: null },
      { rsvp: null, presence: null },
      { rsvp: null, presence: "present" },
    ],
  },
  {
    name: "Clementine Varrow",
    college: "Harewell",
    matric: "2026",
    contactable: ["Email"],
    status: "disengaged",
    source: "Walk-up · Freshers' Fair",
    firstContact: "30 Apr",
    asked: "Not answered",
    notes: "Came once, has not answered since.",
    events: [
      { rsvp: "yes", presence: "absent" },
      { rsvp: "no", presence: null },
      { rsvp: null, presence: null },
    ],
  },
  {
    name: "Ambrose Kittiwake",
    college: null,
    matric: null,
    contactable: ["Mobile"],
    status: "declined",
    source: "Walk-up · Taster 1",
    firstContact: "3 May",
    asked: "Not sent",
    notes: "Said rugby clashes. Happy to be asked again next year.",
    events: [
      { rsvp: "no", presence: "absent" },
      { rsvp: null, presence: "present" },
      { rsvp: null, presence: null },
    ],
  },
];

// The four attendance states and their MUI colours, copied from
// attendance/presentation.ts. The word is the primary channel and the colour is
// the second — slice-ux §7 requires state to be legible "without relying on
// color alone", which is the other thing the dot grid got wrong.
// The two values each event column pair shows, in the club's own words and in
// the shipped shape: PLAIN TEXT in two columns, exactly as the person record's
// per-event table renders them (`[membershipId]/attendance-section.tsx:280`,
// `RSVP_LABEL` and `ATTENDANCE_LABEL`). Not chips — nowhere in this application
// is a presence value rendered as a filled pill, and the earlier revision of
// this file invented one and called it reuse.
const RSVP_LABEL = { yes: "Yes", no: "No" };
const ATTENDANCE_LABEL = {
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
};
const NOT_RECORDED = "Not recorded";

// ---------------------------------------------------------------------------
// The recruit board itself, built once and shared by W1-01 and W1-02 so the two
// screens cannot drift apart. W1-02 is this board scrolled to the Events band.
// ---------------------------------------------------------------------------
const buildRecruitBoard = () => {
  const table = must(document.querySelector("table"), "the board has no table");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  const [bandRow, colRow] = thead.querySelectorAll("tr");
  const bandCells = [...bandRow.querySelectorAll("th")];
  const bodyRowTemplate = must(tbody.querySelector("tr"), "the board has no body row to clone");

  const spacerBand = bandCells[0];
  const personBand = bandCells[1];
  const seasonBand = bandCells[3];
  const colCells = [...colRow.querySelectorAll("th")];
  const pinnedCol = colCells[0];
  const filterCol = colCells[1];

  const bodyCells = [...bodyRowTemplate.querySelectorAll("td")];
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
    th.querySelector('[role="button"]').childNodes[0].nodeValue = label;
    const filter = th.querySelector("button");
    if (filter) filter.setAttribute("aria-label", `Filter ${label}`);
    const cap = th.querySelector(".MuiTypography-caption");
    if (cap) cap.textContent = caption;
    return th;
  };

  const textCell = (text, dim) => {
    const td = plainCell.cloneNode(true);
    const p = td.querySelector("p");
    p.textContent = text;
    p.style.color = dim ? "rgba(0,0,0,0.38)" : "";
    p.style.fontStyle = dim ? "italic" : "";
    return td;
  };

  // A person fact: a link out to the person record, exactly as the roster board
  // does it, or "Not recorded" in grey. Mission 5 owns correcting these.
  const recordCell = (text) => {
    const td = linkCell.cloneNode(true);
    if (text === null) {
      td.replaceChildren();
      const p = plainCell.querySelector("p").cloneNode(true);
      p.textContent = "Not recorded";
      p.style.color = "rgba(0,0,0,0.38)";
      td.append(p);
      return td;
    }
    td.querySelector("a").textContent = text;
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

  const statusChip = (value) => {
    const td = statusCell.cloneNode(true);
    asRung(td.querySelector(".MuiChip-root"), value);
    return td;
  };

  // ---- The proposed header -------------------------------------------------
  // Person 3 · Recruitment 5 · Events 3. The pinned Recruit column sits outside
  // the bands, in the spacer, as the roster board's pinned column does.
  bandRow.replaceChildren(
    spacerBand.cloneNode(true),
    band(personBand, "Person", 3),
    band(seasonBand, "Recruitment", 5, "#00695c"),
    // Brian, 2026-08-31: "a heading for what the event was, RSVP, what the RSVP
    // status was, attendance right after that. I want to see them side by side."
    // So each event is its own band spanning its two columns, which is the
    // shipped two-row banded header used as it already works — no third header
    // row, no new structure.
    ...RECRUITMENT_EVENTS.map((e) => band(seasonBand, `${e.name} · ${e.date}`, 2)),
  );

  const pinned = pinnedCol.cloneNode(true);
  pinned.querySelector('[role="button"]').childNodes[0].nodeValue = "Recruit";
  colRow.replaceChildren(
    pinned,
    column("College", "edit on the record"),
    column("Matric", "edit on the record"),
    column("Contactable", "indicators only"),
    column("Status", "edit here"),
    column("Source", "edit here"),
    column("First contact", "edit here"),
    column("Asked", "set by the form"),
    column("Notes", "edit here"),
    ...RECRUITMENT_EVENTS.flatMap(() => [column("RSVP", ""), column("Attendance", "")]),
  );

  // ---- One event cell, in the club's own words ------------------------------
  // Two lines: what was observed, then what was said. Never one without the
  // other, and never the observation implied by the intent.
  // Two cells per event, side by side: what they said, then what was observed.
  //
  // Invitation is deliberately absent. Brian, 2026-08-31: "I don't care if they
  // were invited or not. I want to see if they intended, because they can
  // always be added as a walk-up… If they show up, we can tag them." So a
  // walk-up needs no special rendering here — it reads as RSVP `Not recorded`
  // with an attendance of `Present`, which is exactly what happened.
  const valueCell = (text, recorded) => {
    const td = plainCell.cloneNode(true);
    const p = td.querySelector("p");
    p.textContent = text;
    p.style.color = recorded ? "" : "rgba(0,0,0,0.38)";
    p.style.fontStyle = recorded ? "" : "italic";
    return td;
  };

  const eventCells = ({ rsvp, presence }) => [
    valueCell(rsvp === null ? NOT_RECORDED : RSVP_LABEL[rsvp], rsvp !== null),
    valueCell(presence === null ? NOT_RECORDED : ATTENDANCE_LABEL[presence], presence !== null),
  ];

  tbody.replaceChildren(
    ...RECRUITS.map((r) => {
      const tr = bodyRowTemplate.cloneNode(false);
      const name = pinnedCell.cloneNode(true);
      name.querySelector("a").textContent = r.name;
      tr.append(
        name,
        recordCell(r.college),
        recordCell(r.matric),
        chipsCell(r.contactable),
        statusChip(r.status),
        textCell(r.source),
        textCell(r.firstContact),
        textCell(r.asked, r.asked === "Not sent"),
        textCell(r.notes || "—", !r.notes),
        ...r.events.flatMap(eventCells),
      );
      return tr;
    }),
  );

  // ---- The phone rendering, from the same data ------------------------------
  setRecruitCards(
    RECRUITS.map((r) => ({
      name: r.name,
      status: r.status,
      detail: `${r.source} · first contact ${r.firstContact}`,
    })),
  );

  setHeading("Recruitment", "Season 2026-27 · 6 recruits · 3 recruitment events");
  relabelButton("add player", "ADD RECRUIT");

  // The roster's filters describe memberships. A recruit holds none.
  const FILTERS = { Availability: "Source", "Missing onboarding data": "Ask outstanding" };
  for (const node of $$("label, .MuiInputLabel-root, .MuiSelect-select")) {
    const t = node.textContent.trim();
    if (FILTERS[t]) node.textContent = FILTERS[t];
  }

  selectRecruitmentNav();
  setRecruitmentRoute();
};

// ---------------------------------------------------------------------------
// The recruit's record, built on the shipped player record's own cards.
//
// Brian, 2026-08-31: "The pages underneath should be very similar to the roster
// in the way that it's done, except it's the recruit player page, not the roster
// player page… We shouldn't invent UI elements here. We should see what the
// roster is, and we should see the player and all the stuff there."
//
// `/operate/roster/[membershipId]` ships six banded cards, and every one of them
// has a recruit equivalent of the same shape:
//
//   PERSON              slate   #455a64  rows   -> PERSON, unchanged in kind
//   ONBOARDING          amber   #b26a00  rows   -> RECRUITMENT, teal #00695c
//   SEASON · 2026-27    blue    #0b3d91  rows   -> THE RECRUIT-STAGE ASK
//   ATTENDANCE          violet  #4527a0  TABLE  -> RECRUITMENT EVENTS, as-is
//   THEIR OTHER SEASONS slate   #455a64         -> NOTES
//   STATUS HISTORY      slate   #455a64         -> STATUS HISTORY
//
// The ATTENDANCE card matters most: it is already a table of
// Event · Date · Mandatory · RSVP · Attendance · Event status, which is the
// treatment Brian approved for the board on the same day. Reusing it whole is
// the strongest available answer to "where else are we using this element?".
// ---------------------------------------------------------------------------
const RECORD_BANDS = {
  person: "#455a64",
  recruitment: "#00695c",
  ask: "#0b3d91",
  events: "#4527a0",
};

/** The banded card whose header begins with `label`. Throws rather than guesses. */
const bandedCard = (label) =>
  must(
    [...document.querySelectorAll(".MuiPaper-root")].find(
      (c) =>
        c.offsetHeight > 60 &&
        c.innerText.split("\n")[0].trim().toUpperCase().startsWith(label.toUpperCase()),
    ),
    `the record has no ${label} card`,
  );

/**
 * Rebuild the shipped ATTENDANCE table as the recruit's events.
 *
 * `rebuildCard` cannot touch this one — it has no `record-row` children and
 * would throw, which is the guard working. The table is kept, its Mandatory
 * column dropped (a recruit has no mandatory events), and its rows replaced.
 * The mandatory-attendance percentage strip and the four filters go with it:
 * both describe a season's obligations, and a recruit holds none.
 */
const setRecruitmentEvents = (events, title = "Recruitment events") => {
  const card = bandedCard("ATTENDANCE");
  const table = must(card.querySelector("table"), "the ATTENDANCE card has no table");
  const heads = [...table.querySelectorAll("thead th")];
  const bodyRows = [...table.querySelectorAll("tbody tr")];
  must(bodyRows, "the ATTENDANCE table has no row to clone");

  const drop = heads.findIndex((h) => /Mandatory/i.test(h.innerText));
  const template = bodyRows[0].cloneNode(true);
  const host = bodyRows[0].parentElement;

  // The card's own banded header, kept and retitled. It is a sibling of the tint
  // box, so it must be held aside before the sibling sweep below or the card
  // loses its heading and its violet entirely.
  const heading = must(card.querySelector("h2"), "the ATTENDANCE card has no heading");
  heading.textContent = title.toUpperCase();
  const headBar = must(heading.parentElement, "the ATTENDANCE heading has no bar");

  // Everything in the card that is not the table describes a season's
  // obligations: the "7 of 7 mandatory · 100% · 12 attendants not recorded"
  // strip, the "Mandatory attendance" caption and the applied-filter row.
  //
  // Two earlier attempts removed nothing, because the strip and the table are on
  // DIFFERENT branches: the card holds one tint Box, and inside it the strip is
  // `Box > Stack > p` while the table is `Box > Box > TableContainer > table`.
  // Walking `card.children` or the table's immediate parent both missed it, and
  // a recruit's page went on claiming a mandatory-attendance percentage.
  //
  // So walk UP from the table to the card, clearing siblings at every level.
  // Whatever the intermediate nesting is, only the table's own branch survives.
  let node = table;
  while (node.parentElement && node.parentElement !== card) {
    const parent = node.parentElement;
    for (const sibling of [...parent.children]) {
      if (sibling !== node) sibling.remove();
    }
    node = parent;
  }
  for (const child of [...card.children]) {
    if (!child.contains(table) && child !== headBar) child.remove();
  }

  // The header row keeps a live filter caption ("Event status / Occurred") and a
  // filled filter button from the state that was just removed. Clear both, or
  // the card advertises a filter that no longer exists.
  for (const caption of table.querySelectorAll("thead .MuiTypography-caption")) caption.remove();
  for (const button of table.querySelectorAll("thead button")) button.remove();

  if (drop >= 0) heads[drop].remove();

  const built = events.map((event) => {
    const tr = template.cloneNode(true);
    if (drop >= 0) [...tr.children][drop]?.remove();
    const cells = [...tr.children];
    const values = [event.name, event.date, event.rsvp, event.attendance, event.status];
    cells.forEach((td, i) => {
      const value = values[i];
      if (value === undefined) return;
      const target = td.querySelector("p, span, div") ?? td;
      const recorded = value !== NOT_RECORDED;
      target.replaceChildren(document.createTextNode(value));
      // Set BOTH states explicitly. The row is cloned from whichever row the
      // application happened to render first, and if that one was "not recorded"
      // it carries the disabled colour and italic as an emotion CLASS. Clearing
      // the inline style to "" then leaves a real value looking unrecorded,
      // which is what W2-02 shipped on the first attempt: "Yes" and "Present"
      // both rendered in the grey italic that means "we do not know".
      target.style.color = recorded ? "rgba(0,0,0,0.87)" : "rgba(0,0,0,0.38)";
      target.style.fontStyle = recorded ? "normal" : "italic";
    });
    return tr;
  });
  host.replaceChildren(...built);
  return card;
};

/** Retitle a banded card and recolour its header, without touching its rows. */
const recolourCard = (label, title, colour) => {
  const card = bandedCard(label);
  const h = must(card.querySelector("h2"), `the ${label} card has no heading`);
  h.textContent = title.toUpperCase();
  const bar = must(h.parentElement, `the ${label} heading has no bar`);
  bar.style.backgroundColor = colour;
  return card;
};

// W1-02 — The same board, scrolled to the Events band.
//
// Boundary item 36, Brian 2026-08-28: "almost copy how normal event attendance
// works, except for recruitment… I want to see them as one line." So the event
// columns are appended at the right end in date order and the pinned Recruit
// column stays put while they scroll, exactly as the roster board's eighteen
// columns do.
//
// This screen exists to show that scroll and the event cells at full size. It
// is the identical board to W1-01 — same builder, same data — so the two can
// never disagree.
buildRecruitBoard();

// Scroll the board's own container, not the window: the pinned first column is
// sticky inside it, and scrolling the page would prove nothing.
//
// Asking for the Events band's own left edge clamps to the container's maximum
// here, because the table is only a little wider than the viewport: the board's
// right end IS this position. So the Notes column stays half in frame, which is
// what a scrolled board actually looks like and not a defect to hide.
const scroller = must(
  document.querySelector(".MuiTableContainer-root"),
  "the board has no scrolling container",
);
// The event names now live in the BAND row — each event is its own band over
// its RSVP and Attendance columns — so the scroll target is found there.
const firstEvent = must(
  [...document.querySelectorAll("thead tr:first-child th")].find((th) =>
    /Freshers' Fair/.test(th.textContent),
  ),
  "the board has no first event band to scroll to",
);
// Measure against the SCROLLER, not the offset parent. `offsetLeft` is relative
// to the table, which left the first event's RSVP column hidden behind the
// sticky Recruit column.
const pinnedWidth = document.querySelector("thead tr:last-child th").getBoundingClientRect().width;
scroller.scrollLeft +=
  firstEvent.getBoundingClientRect().left - scroller.getBoundingClientRect().left - pinnedWidth;

if (scroller.scrollLeft === 0 && scroller.scrollWidth > scroller.clientWidth) {
  throw new Error("The board did not scroll; the Events band would not be in frame.");
}

await settle();

})()
