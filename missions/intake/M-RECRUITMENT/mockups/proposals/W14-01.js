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
const bandedCard = (label) => {
  const cards = [...document.querySelectorAll(".MuiPaper-root")].filter(
    (c) => c.offsetHeight > 60 && c.innerText.trim(),
  );
  const found = cards.find((c) =>
    c.innerText.split("\n")[0].trim().toUpperCase().startsWith(label.toUpperCase()),
  );
  // Say what IS there. A bare "no X card" sends the next reader probing the DOM
  // by hand, which has already cost this mission several turns.
  return must(
    found,
    `the record has no ${label} card. Headings present: ` +
      cards.map((c) => JSON.stringify(c.innerText.split("\n")[0].trim().slice(0, 30))).join(", "),
  );
};

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
  // The card renders TWICE: `attendance-desktop` holds the table and
  // `attendance-phone` holds a list of `attendance-card`s, and they are
  // siblings. Sweeping siblings from the table upward deleted the phone list,
  // so at 375px this card was an empty coloured bar. Hold it aside and rebuild
  // it from the same events, exactly as the board does.
  const phoneList = document.querySelector('[data-testid="attendance-phone"]');
  const phoneTemplate = phoneList
    ?.querySelector('[data-testid="attendance-card"]')
    ?.cloneNode(true);

  let node = table;
  while (node.parentElement && node.parentElement !== card) {
    const parent = node.parentElement;
    for (const sibling of [...parent.children]) {
      if (sibling !== node && sibling !== phoneList) sibling.remove();
    }
    node = parent;
  }
  if (phoneList && phoneTemplate) {
    phoneList.replaceChildren(
      ...events.map((event) => {
        const item = phoneTemplate.cloneNode(true);
        const lines = [...item.querySelectorAll(".MuiTypography-root")];
        const values = [
          event.name,
          `${event.date} · ${event.status}`,
          `RSVP ${event.rsvp}`,
          `Attendance ${event.attendance}`,
        ];
        lines.forEach((line, i) => {
          if (i < values.length) line.replaceChildren(document.createTextNode(values[i]));
          else line.remove();
        });
        return item;
      }),
    );
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

// ---------------------------------------------------------------------------
// Editing a recruit's status, using the control the application already has.
//
// Brian, 2026-08-31: "The recruitment status UI is bullshit. That is not the UI
// we use anywhere else. It needs to use consistent UI elements with everything.
// That is bad UI. We should use the statuses from elsewhere."
//
// He is right, and it was the thing he had told me not to do one message
// earlier. The first attempt drew a bordered popover with coloured dots and a
// tick — no such control exists in this product.
//
// The shipped one is `MembershipStatusControl`
// (`roster/membership-actions.tsx`): a MUI `TextField select`, size small,
// labelled "Status", rendered with `data-testid="membership-status-control"`.
// Its own comment says why it is a plain select — "We can flip to whatever
// status we want to go in. There is no transition table any more". That is
// exactly the recruit ladder's situation.
//
// So this CLONES the live control off the record page and swaps its options for
// the ladder. It throws if the control is not there, rather than drawing one.
// ---------------------------------------------------------------------------
const cloneStatusControl = (value, options) => {
  // WHAT IS ACTUALLY SHIPPED, and it is worth stating plainly:
  // `MembershipStatusControl` exists in `roster/membership-actions.tsx` and is
  // exported, but it is **never rendered anywhere in the application**. Nothing
  // imports it. So there is no mounted status-editing control to photograph, and
  // the first attempt at this screen drew a bordered popover with coloured dots
  // instead - inventing exactly what Brian had said not to invent.
  //
  // What IS mounted on this page is the attendance card's filter selects: real
  // MUI selects, rendered by this application, in its own styling. This clones
  // one of those. It must run BEFORE `setRecruitmentEvents`, which deletes them
  // with the rest of the card's season machinery.
  //
  // The control the code defines is the same component - a MUI select over every
  // value, its own comment explaining why it is a plain select: "We can flip to
  // whatever status we want to go in. There is no transition table any more."
  // That is the recruit ladder's situation exactly.
  const live = must(
    document.querySelector(".MuiSelect-select"),
    "this page renders no MUI select to clone; call cloneStatusControl before setRecruitmentEvents",
  );
  const control = must(
    live.closest(".MuiFormControl-root") ?? live.parentElement,
    "the cloned select has no form control around it",
  );
  const field = control.cloneNode(true);

  const shown = must(
    field.querySelector(".MuiSelect-select"),
    "the cloned status control has nothing that displays its value",
  );
  shown.replaceChildren(document.createTextNode(value));

  field.style.minWidth = "200px";
  field.dataset.intakeStatusOptions = options.join(", ");
  return field;
};

// ---------------------------------------------------------------------------
// Actions on the recruit's record — Brian, 2026-08-31.
//
//   "There should be buttons there to do that… it should be on the [recruit]
//    member page itself. I should be able to click on it and say, 'Oh, I want to
//    send out this,' and I should be able to ask for personal details about them
//    if I see them. I should be able to ask them for the recruitment questions."
//
// W2 lists six required actions and the first build of these screens afforded
// one. These put the rest on the page using the affordance the record ALREADY
// ships: the banded card header carries an action node, which is how PERSON
// renders "Open the person record →". Nothing new is drawn — the shipped link is
// cloned, so the type, colour and weight cannot drift.
// ---------------------------------------------------------------------------
const cardAction = (card, text) => {
  const shipped = must(
    document.querySelector(".MuiPaper-root h2")?.parentElement?.querySelector("a, button") ??
      [...document.querySelectorAll(".MuiPaper-root")]
        .map((c) => c.querySelector("h2")?.parentElement?.querySelector("a, button"))
        .find(Boolean),
    "no card header action to clone; the record should ship at least one",
  );
  const bar = must(
    card.querySelector("h2")?.parentElement,
    "the card has no header bar to put an action on",
  );
  const action = shipped.cloneNode(true);
  action.textContent = text;
  action.removeAttribute("href");
  bar.append(action);
  return action;
};

/**
 * "What we have sent", and what is due next.
 *
 * Brian, 2026-08-31: "When somebody gets recruited on board, we need to be able
 * to tell when those things get sent out to them." W10 defines what due next
 * means; this is where one recruit's answer is read.
 *
 * The card is cloned from a shipped banded card so it is the same object as
 * every other section on the page.
 */
const addSentCard = (sent, dueNext, after) => {
  const template = must(bandedCard("NOTES"), "no card to clone for the sent card");
  const card = template.cloneNode(true);
  const heading = must(card.querySelector("h2"), "the cloned card has no heading");
  heading.textContent = "WHAT WE HAVE SENT";
  const bar = must(heading.parentElement, "the cloned card has no header bar");
  bar.style.backgroundColor = RECORD_BANDS.person;
  for (const extra of [...bar.children]) if (extra !== heading) extra.remove();
  for (const child of [...card.children]) if (child !== bar) child.remove();

  const body = document.createElement("div");
  body.style.cssText = "padding:14px 16px";
  for (const [what, when] of sent) {
    const line = document.createElement("div");
    line.style.cssText = "font-size:14px;color:rgba(0,0,0,0.87);margin-top:10px";
    line.textContent = what;
    const meta = document.createElement("div");
    meta.style.cssText = "margin-top:3px;font-size:12px;color:rgba(0,0,0,0.55)";
    meta.textContent = when;
    body.append(line, meta);
  }
  if (dueNext) {
    const due = document.createElement("div");
    due.style.cssText =
      "margin-top:14px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.10);" +
      "font-size:14px;color:rgba(0,0,0,0.87)";
    due.textContent = dueNext[0];
    const dueMeta = document.createElement("div");
    dueMeta.style.cssText = "margin-top:3px;font-size:12px;color:rgba(0,0,0,0.55)";
    dueMeta.textContent = dueNext[1];
    body.append(due, dueMeta);
  }
  card.append(body);
  after.after(card);
  return card;
};

// ---------------------------------------------------------------------------
// One button, top right, and the dialog it opens — Brian, 2026-08-31.
//
// The previous build put four text links in card headers. He struck all of
// them: "The UI elements for asking this are not very good. They're hidden…
// Everything we've changed on the person, you've done too much." And the flip is
// not a button here at all: "It is something that happens on a status change,
// not a button."
//
// So: one contained button in the top right, cloned from the application's own.
// ---------------------------------------------------------------------------
const pageButton = (text) => {
  const shipped = must(
    [...document.querySelectorAll("a, button")].find((b) =>
      b.className.includes("MuiButton-contained"),
    ),
    "the page renders no contained button to clone",
  );
  const button = shipped.cloneNode(true);
  button.textContent = text;
  button.removeAttribute("href");

  // Wrap the heading block and the button in a row of their OWN, rather than
  // turning the heading's container into a flex row: that container holds the
  // name and the line under it, so flexing it put them side by side and pushed
  // the button off the right edge at 375px. It wraps, so on a phone the button
  // drops to its own line at full width.
  const h1 = must($("h1"), "the record has no heading to sit beside");
  const head = must(h1.parentElement, "the heading has no block");

  // Reuse the row if one is already here: there are TWO questionnaires and
  // therefore two buttons, and each must sit in the same row rather than
  // building a second one under the first.
  let row = document.querySelector('[data-intake-actions="1"]');
  if (!row) {
    row = document.createElement("div");
    row.dataset.intakeActions = "1";
    row.style.cssText =
      "display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px";
    head.parentElement.insertBefore(row, head);
    row.append(head);
    head.style.flex = "1 1 240px";
    head.style.minWidth = "0";
    const actions = document.createElement("div");
    actions.dataset.intakeActionGroup = "1";
    actions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
    row.append(actions);
  }
  button.style.flex = "0 0 auto";
  must(row.querySelector('[data-intake-action-group="1"]'), "the action row lost its group").append(
    button,
  );
  return button;
};

/**
 * The embedded send list at the foot of a card.
 *
 * Brian: "At the bottom of the personal details thing, we should have some sort
 * of list that says 'Questionnaire sent', and it should be embedded. It should
 * just be a list of what dates they were sent on. That should be for the bottom
 * for the recruitment questionnaire as well as the personal records."
 *
 * It is deliberately small and quiet: it is a record, not a control. The point
 * is knowing when the club last bothered this person.
 */
const sentDates = (card, label, dates) => {
  const strip = document.createElement("div");
  strip.style.cssText =
    "padding:10px 16px 12px;border-top:1px solid rgba(0,0,0,0.10);" +
    "font-size:12.5px;color:rgba(0,0,0,0.55)";
  const name = document.createElement("span");
  name.textContent = `${label}: `;
  name.style.fontWeight = "600";
  strip.append(name);
  const value = document.createElement("span");
  value.textContent = dates.length ? dates.join(" · ") : "not sent";
  if (!dates.length) value.style.fontStyle = "italic";
  strip.append(value);
  card.append(strip);
  return strip;
};

/**
 * The dialog the button opens.
 *
 * The application ships four MUI dialogs — the calendar subscribe, the template
 * editor, delete-draft and record-answer — so a popup is a shipped pattern, but
 * none of them is reachable from this route, so there is nothing to open and
 * photograph. The surface and the buttons are therefore CLONED from this page's
 * own Paper and Button; only the overlay is assembled.
 *
 * Every message the club sends is a Meta-approved template
 * (`src/lib/delivery/config.ts:168` — "`template` is the only production
 * shape"), so this dialog chooses a template and fires it. There is no composer
 * and there is nothing to type.
 */
const openDialog = ({ title, question, sent, note }) => {
  const paperTpl = must(
    document.querySelector(".MuiPaper-root"),
    "the page has no Paper to build the dialog surface from",
  );
  const scrim = document.createElement("div");
  scrim.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1300;" +
    "display:flex;align-items:flex-start;justify-content:center;padding-top:96px";

  const surface = paperTpl.cloneNode(false);
  surface.style.cssText =
    "width:480px;max-width:92vw;background:#fff;border-radius:8px;" +
    "box-shadow:0 11px 15px -7px rgba(0,0,0,.2),0 24px 38px 3px rgba(0,0,0,.14);overflow:hidden";

  const head = document.createElement("div");
  head.style.cssText = "padding:20px 24px 4px;font-size:20px;font-weight:700";
  head.textContent = title;

  const body = document.createElement("div");
  body.style.cssText = "padding:4px 24px 12px;font-size:14.5px;color:rgba(0,0,0,0.7)";
  body.textContent = question;
  surface.append(head, body);

  // The whole point of the dialog: when this questionnaire last went out, so
  // nobody bothers the same person twice. Brian: "here are the last times we've
  // sent them a questionnaire, because we don't want to bug them that many
  // times."
  const history = document.createElement("div");
  history.style.cssText =
    "margin:0 24px 4px;border:1px solid rgba(0,0,0,0.16);border-radius:8px;padding:12px 14px";
  const label = document.createElement("div");
  label.style.cssText =
    "font-size:12px;font-weight:700;letter-spacing:.05em;color:rgba(0,0,0,0.55)";
  label.textContent = "ALREADY SENT";
  const value = document.createElement("div");
  value.style.cssText = "margin-top:6px;font-size:14px;color:rgba(0,0,0,0.87)";
  value.textContent = sent.length ? sent.join(" · ") : "Never sent to this recruit";
  if (!sent.length) value.style.fontStyle = "italic";
  history.append(label, value);
  if (note) {
    const warn = document.createElement("div");
    warn.style.cssText = "margin-top:8px;font-size:12.5px;font-weight:600;color:#8a5100";
    warn.textContent = note;
    history.append(warn);
  }
  surface.append(history);

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;padding:14px 20px 18px";
  const contained = must(
    [...document.querySelectorAll("a, button")].find((b) =>
      b.className.includes("MuiButton-contained"),
    ),
    "no contained button to clone for the dialog",
  );
  const cancel = contained.cloneNode(true);
  cancel.className = cancel.className.replace("MuiButton-contained", "MuiButton-text");
  cancel.style.cssText = "background:transparent;color:#0b3d91;box-shadow:none";
  cancel.textContent = "CANCEL";
  cancel.removeAttribute("href");
  const send = contained.cloneNode(true);
  send.textContent = "SEND";
  send.removeAttribute("href");
  actions.append(cancel, send);
  surface.append(actions);

  scrim.append(surface);
  document.body.append(scrim);
  return scrim;
};

// ---------------------------------------------------------------------------
// Tobias Wrenfield's record, built once so W2-02 and W2-03 cannot drift apart.
//
// W2-03's first build rebuilt only PERSON and RECRUITMENT and left the rest of
// the shipped player record underneath the dialog: a Season card of membership
// rows, fifty-three attendance rows, and membership status history a recruit
// cannot have. That is the same failure this mission has hit repeatedly - a
// proposal changing the content it is thinking about and leaving the page it is
// standing on alone.
// ---------------------------------------------------------------------------
const buildRecruitRecord = () => {
  selectRecruitmentNav();

  setHeading("Tobias Wrenfield");
  setSubtitle("Recruitment · 2026-27 · opened from the recruit board");

  replaceSummaryStrip([
    [{ chip: "engaged" }, "Recruitment status"],
    ["3 May 2026", "First contact"],
    ["2", "Events attended"],
  ]);

  removeCardAction(bandedCard("PERSON"));
  setPersonRows([
    recordRow("Name", "Tobias Wrenfield"),
    recordRow("Aliases", "Toby"),
    recordRow("Mobile phone", "07700 900412"),
    recordRow("Personal email", "t.wrenfield@example.ac.uk"),
    recordRow("College", "Marlbrook"),
    recordRow("Matriculation year", "2025"),
    recordRow("Expected graduation", "2028"),
    recordRow("Degree field", "Engineering Science"),
  ]);

  // ---- RECRUITMENT, with one field open for editing -------------------------
  const recruitmentCardRef = rebuildCard(
    bandedCard("ONBOARDING"),
    "Recruitment",
    [
      recordRow("Status", null, { chip: "engaged" }),
      recordRow("Came in through", "Walk-up · Taster 1"),
      recordRow("First contact", "3 May 2026"),
      recordRow("Committed on", "Not recorded", { muted: true }),
    ],
    { colour: RECORD_BANDS.recruitment },
  );

  // The editing state, using the application's OWN status control rather than a
  // drawing of one. Brian struck the first attempt: "That is not the UI we use
  // anywhere else… We should use the statuses from elsewhere."
  const recruitmentCard = bandedCard("RECRUITMENT");
  const statusRow = must(
    [...recruitmentCard.querySelectorAll('[data-testid="record-row"]')].find((r) =>
      /^Status/.test(r.innerText.trim()),
    ),
    "the RECRUITMENT card has no Status row to open for editing",
  );
  const valueBox = must(statusRow.children[1], "the Status row has no value cell");
  valueBox.replaceChildren(
    cloneStatusControl("engaged", [
      "identified",
      "engaged",
      "committed",
      "declined",
      "disengaged",
      "void",
    ]),
  );

  // ---- THE RECRUIT-STAGE ASK, answered --------------------------------------
  const questionnaireCardRef = rebuildCard(
    bandedCard("SEASON"),
    "Recruitment questionnaire",
    [
      recordRow("Questionnaire sent", "4 May 2026 · reminder 6 May 2026"),
      recordRow("Answered", "7 May 2026"),
      recordRow("Played American football before?", "No"),
      recordRow("Watched American football before?", "Yes"),
      recordRow("Position interest", "Wide receiver, or wherever you need"),
      recordRow("Gear owned", "None"),
      recordRow("How they heard of us", "A friend on my staircase plays"),
      recordRow("Anything else", "Played rugby at school. Asked about kit costs."),
    ],
    { colour: RECORD_BANDS.ask },
  );

  // ---- RECRUITMENT EVENTS, with content -------------------------------------
  const eventsCardRef = setRecruitmentEvents([
    {
      name: "Freshers' Fair",
      date: "30 Apr 2026",
      rsvp: "Yes",
      attendance: "Present",
      status: "Occurred",
    },
    {
      name: "Taster 1",
      date: "3 May 2026",
      rsvp: NOT_RECORDED,
      attendance: "Present",
      status: "Occurred",
    },
    {
      name: "Taster 2",
      date: "10 May 2026",
      rsvp: "Yes",
      attendance: NOT_RECORDED,
      status: "Upcoming",
    },
  ]);

  // ---- NOTES ----------------------------------------------------------------
  recolourCard("THEIR OTHER SEASONS", "Notes", RECORD_BANDS.person);
  const notesCard = bandedCard("NOTES");
  for (const child of [...notesCard.children].slice(1)) child.remove();
  const notesBody = document.createElement("div");
  notesBody.style.cssText = "padding:14px 16px";
  for (const [text, by] of [
    [
      "Played at school. Asked about kit — told him the club has spares.",
      "Caspian Hallowfield · 3 May 2026",
    ],
    ["Turned up to Taster 1 without an RSVP. Keen.", "Caspian Hallowfield · 3 May 2026"],
  ]) {
    const body = document.createElement("div");
    body.style.cssText = "font-size:14px;line-height:1.6;color:rgba(0,0,0,0.87);margin-top:10px";
    body.textContent = text;
    const meta = document.createElement("div");
    meta.style.cssText = "margin-top:4px;font-size:12px;color:rgba(0,0,0,0.55)";
    meta.textContent = by;
    notesBody.append(body, meta);
  }
  const addNote = document.createElement("div");
  addNote.style.cssText =
    "margin-top:14px;border:1px dashed rgba(0,0,0,0.28);border-radius:6px;padding:11px 13px;" +
    "font-size:14px;color:rgba(0,0,0,0.38)";
  addNote.textContent = "Add a note…";
  notesBody.append(addNote);
  notesCard.append(notesBody);

  // ---- STATUS HISTORY -------------------------------------------------------
  recolourCard("STATUS HISTORY", "Status history", RECORD_BANDS.person);
  const historyCard = bandedCard("STATUS HISTORY");
  for (const child of [...historyCard.children].slice(1)) child.remove();
  const historyBody = document.createElement("div");
  historyBody.style.cssText = "padding:14px 16px";
  for (const [what, when] of [
    [
      "identified → engaged · answered the questionnaire",
      "7 May 2026, 19:40 · Caspian Hallowfield",
    ],
    ["Invitation sent · Taster 2", "8 May 2026, 09:00 · delivered"],
    ["Questionnaire reminder sent · how you came to football", "6 May 2026, 09:00 · delivered"],
    ["Questionnaire sent · how you came to football", "4 May 2026, 09:00 · delivered"],
    ["Welcome sent · WhatsApp template", "3 May 2026, 18:07 · delivered"],
    ["Added as identified · walk-up at Taster 1", "3 May 2026, 18:05 · Caspian Hallowfield"],
  ]) {
    const line = document.createElement("div");
    line.style.cssText = "font-size:14px;color:rgba(0,0,0,0.87);margin-top:10px";
    line.textContent = what;
    const meta = document.createElement("div");
    meta.style.cssText = "margin-top:3px;font-size:12px;color:rgba(0,0,0,0.55)";
    meta.textContent = when;
    historyBody.append(line, meta);
  }
  historyCard.append(historyBody);

  // ---- One button, top right -----------------------------------------------

  // ---- The send record, embedded at the foot of each card -------------------
  sentDates(bandedCard("PERSON"), "Personal details questionnaire sent", []);
  sentDates(questionnaireCardRef, "Recruitment questionnaire sent", [
    "4 May 2026",
    "reminder 6 May 2026",
  ]);

  relabelButton("back to roster", "BACK TO RECRUITMENT");
  window.history.replaceState(null, "", "/operate/recruitment/tobias-wrenfield");
};

/**
 * Strip a banded card's header action.
 *
 * Brian, 2026-08-31: "Open the personal record, as the arrow should not be on
 * this one for W2." The shipped player record carries it; the recruit's page
 * does not.
 */
const removeCardAction = (card) => {
  const bar = must(card.querySelector("h2")?.parentElement, "the card has no header bar");
  for (const node of [...bar.children]) {
    if (node.tagName === "A" || node.tagName === "BUTTON") node.remove();
  }
  return card;
};

// ---------------------------------------------------------------------------
// The recruit's questionnaire, built from the application's OWN form controls.
//
// `/a/[token]` exists on main but nothing renders it: `rsvp_access_tokens` and
// `person_access_tokens` are both empty in the seed, so there is no link to
// follow and the page cannot be photographed. The screens are therefore drawn —
// but the CONTROLS are not. They are cloned off a live page, so the field
// height, label behaviour, border and type scale are the shipped ones.
//
// Which control goes with which question is not a choice either. The shipped
// `QuestionField` (`src/app/a/[token]/question-field.tsx`) has exactly three
// branches, and this mission's questions map straight onto them:
//
//   boolean -> a select of Yes / No          ("played before", "watched before")
//   choice  -> a select of the question's own options
//   text    -> a fill-in, maxLength 500      ("anything else")
//
// Brian, 2026-08-31: "If there are drop-downs, there should be drop-downs in the
// right questions. If there is a fill-in form or whatever, they should do that."
// ---------------------------------------------------------------------------
let FORM_TEMPLATES = null;

/** Capture real controls BEFORE the page is cleared to draw on. */
const captureFormControls = () => {
  const select = must(
    document.querySelector(".MuiSelect-select")?.closest(".MuiFormControl-root"),
    "this page renders no MUI select to clone",
  );
  const text = must(
    [...document.querySelectorAll(".MuiTextField-root, .MuiFormControl-root")].find(
      (f) => f.querySelector("input") && !f.querySelector(".MuiSelect-select"),
    ),
    "this page renders no MUI text field to clone",
  );
  FORM_TEMPLATES = { select: select.cloneNode(true), text: text.cloneNode(true) };
  return FORM_TEMPLATES;
};

const questionField = ({ prompt, kind, options = [], value = "" }) => {
  must(FORM_TEMPLATES, "call captureFormControls() before the page is cleared");
  const wrap = document.createElement("div");
  wrap.style.cssText = "margin:0 0 20px";

  const isSelect = kind === "boolean" || kind === "choice";
  const field = (isSelect ? FORM_TEMPLATES.select : FORM_TEMPLATES.text).cloneNode(true);
  field.style.width = "100%";

  // A MUI field with a value FLOATS its label above the border and notches the
  // outline for it. Stripping the shrink classes and then writing a value laid
  // "Rosalind" straight on top of "Preferred name". So: shrink when there is a
  // value, sit in the field when there is not.
  const label = field.querySelector("label, .MuiInputLabel-root");
  const legend = field.querySelector("legend");
  if (label) label.textContent = prompt;
  if (value) {
    label?.classList.add("MuiInputLabel-shrink", "MuiFormLabel-filled");
    if (label) {
      // The class alone does not move a CLONED label: MUI's shrink transform is
      // emotion state, not a plain rule, so the class landed and the label stayed
      // put — writing "Rosalind" straight across "Preferred name". This is the
      // outlined variant's own shrink transform, set explicitly.
      label.style.transform = "translate(14px, -9px) scale(0.75)";
      label.style.transformOrigin = "top left";
      label.style.backgroundColor = "#fff";
      label.style.padding = "0 5px";
    }
    if (legend) {
      legend.textContent = prompt;
      legend.style.maxWidth = "100%";
    }
  } else {
    label?.classList.remove("MuiInputLabel-shrink", "MuiFormLabel-filled");
    if (legend) {
      legend.textContent = "";
      legend.style.maxWidth = "0.01px";
    }
  }

  if (isSelect) {
    const shown = must(field.querySelector(".MuiSelect-select"), "cloned select shows nothing");
    shown.replaceChildren(document.createTextNode(value || ""));
    if (!value) shown.style.color = "rgba(0,0,0,0.38)";
    // The options this question offers, listed under it so a reviewer can see
    // what the dropdown holds without opening it.
    const choices = document.createElement("div");
    choices.style.cssText = "margin-top:6px;font-size:12px;color:rgba(0,0,0,0.55);line-height:1.6";
    choices.textContent =
      (kind === "boolean" ? ["Yes", "No"] : options).join(" · ") + " · (no answer)";
    wrap.append(field, choices);
  } else {
    const input = field.querySelector("input");
    if (input) {
      input.setAttribute("placeholder", "");
      input.value = value;
    }
    wrap.append(field);
  }
  return wrap;
};

/** The heading a recruit sees, with their own name, near the top. */
const recruitFormHead = (card, { name, title, blurb }) => {
  const who = document.createElement("div");
  who.style.cssText =
    "font-size:12px;font-weight:700;letter-spacing:.07em;color:#0b3d91;margin-bottom:6px";
  who.textContent = name.toUpperCase();
  card.insertBefore(who, card.firstChild);
  const h = card.querySelector("div:nth-child(2)");
  if (h) h.textContent = title;
  if (blurb) {
    const p = document.createElement("p");
    p.textContent = blurb;
    p.style.cssText = "margin:0 0 20px;font-size:14px;color:rgba(0,0,0,0.65);line-height:1.6";
    const sub = card.querySelector("p");
    if (sub) sub.replaceWith(p);
    else card.append(p);
  }
  return card;
};

// W14-01 — The flip confirmation. Drawn: no confirmation of this kind exists
// in the application.
const card = drawnSurface({
  title: "Add Marguerite Ashdown to 2026-27?",
  subtitle: "You are about to put her on the team.",
  chrome: "Interrupts the status change on the recruit board",
  width: 620,
});
const what = drawnPanel("This will");
what.append(
  makeRow("Create", "A season membership for 2026-27"),
  makeRow("Put her on", "The roster, as joined"),
  makeRow("Open", "Onboarding — 12 items"),
  makeRow("Not do", "Make her active. That stays a separate later step."),
);
card.append(what);
const buttons = document.createElement("div");
buttons.style.cssText = "display:flex;gap:12px;align-items:center;margin-top:6px";
const cancel = document.createElement("div");
cancel.textContent = "CANCEL";
cancel.style.cssText =
  "font-size:14px;font-weight:600;letter-spacing:.03em;color:rgba(0,0,0,0.6);padding:11px 18px";
buttons.append(primaryButton("YES, SHE IS IN"), cancel);
card.append(
  buttons,
  note(
    "Brian, 2026-08-31: when it flips to Join there should be a pop-up. Joined means officially added to a season. Cancelling writes nothing. Only the President, Vice President, Secretary or General Manager ever sees this — Task 09 D5.",
  ),
);

})()
