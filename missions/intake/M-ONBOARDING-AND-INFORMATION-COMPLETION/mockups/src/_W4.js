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
    throw new Error(`Proposal could not apply: this is not the answer link's Yes page (h1 read "${h1.textContent}").`);
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
    submit: must(form.querySelector("button[type=submit]"), "the answer form has no submit button"),
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
const asField = (tpl, { label, value = "", help = null, required = false, restricted = false }) => {
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
  const attending = $$("p").find((p) => /other (people|person) (are|is) already attending/i.test(p.textContent));
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
  if (!node) throw new Error("Proposal could not apply: the page has no secondary line under its form.");
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
