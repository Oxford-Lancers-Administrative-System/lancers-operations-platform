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
    const el = $$("p").find((p) => /event types|items/i.test(p.textContent ?? "") && p.textContent.trim().length < 30);
    if (el) el.textContent = subtitle;
  }
  if (intro !== undefined) {
    const el = $$("p").find((p) => /when the club messages people about each kind of event/i.test(p.textContent ?? ""));
    if (el) el.textContent = intro;
  }
  if (note !== undefined) {
    const el = $(".MuiAlert-message");
    if (el) el.textContent = note;
  }
};

/**
 * Add one new configuration section to the page, leaving every shipped row
 * exactly as it is.
 *
 * The first version of W11-01 repurposed real event rows into onboarding rows
 * and marked one of them. That page was an invention, and it implied this
 * mission was changing how practices are messaged. It is not touching events at
 * all — so the proposal adds, and changes nothing.
 */
const addSection = ({ label, fields, button }) => {
  const rows = scheduleRows();
  const template = rows[0].cloneNode(true);
  rows[0].before(template);
  configureRow(template, { label, fields, button });
  return template;
};
