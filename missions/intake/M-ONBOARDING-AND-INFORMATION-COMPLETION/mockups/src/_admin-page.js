// ---------------------------------------------------------------------------
// Helpers for the club's messaging schedule — `/operate/admin/messaging`.
//
// As of main@0a04be7 that page has three sections: Recruitment (built, with its
// cycle steps), Event messaging (built, a row per event type), and
// **Onboarding — "Not built yet."**
//
// That last section is this workflow's whole job. These helpers fill it and
// touch nothing else: the recruitment and event sections are other missions'
// work and are neither altered nor marked.
// ---------------------------------------------------------------------------

const onboardingSectionOnPage = () =>
  must(
    $('[data-testid="onboarding-section"]'),
    "this page has no onboarding section — is it on the current main?",
  );

const cycleStepRow = () =>
  must($('[data-testid="cycle-step-row"]'), "the page has no cycle-step row to clone");

/**
 * Fill the Onboarding section by cloning a recruitment cycle row — the page's
 * own idiom for "a thing the club chases, and its timings" — and relabelling
 * its fields. Nothing above the section is touched.
 */
const fillOnboardingSection = ({ label, fields, button }) => {
  const section = onboardingSectionOnPage();

  // "Not built yet." goes; everything else in the section stays.
  const note = $$("p", section).find((p) => /not built yet/i.test(p.textContent ?? ""));
  note?.remove();

  const row = cycleStepRow().cloneNode(true);
  section.append(row);

  const rowLabel = row.querySelector('[data-testid="cycle-step-row-label"]');
  if (rowLabel) rowLabel.textContent = label;

  // The recruitment row carries two timings; onboarding needs three. Clone the
  // last field group until there are enough — the first shoot silently rendered
  // only two, because `controls[2]` did not exist and mark() returns quietly on
  // a missing node.
  let groups = $$("[data-field]", row);
  must(groups, "the cloned row has no field groups");
  while (groups.length < fields.length) {
    const extra = groups[groups.length - 1].cloneNode(true);
    groups[groups.length - 1].after(extra);
    groups = $$("[data-field]", row);
  }

  const controls = $$(".MuiTextField-root", row);
  must(controls, "the cloned row has no fields");
  controls.forEach((control, index) => {
    const spec = fields[index];
    if (!spec) {
      control.closest("[data-field]")?.remove() ?? control.remove();
      return;
    }
    const [name, value, unit] = spec;
    const labelEl = control.querySelector(".MuiInputLabel-root, label");
    if (labelEl) labelEl.textContent = name;
    const legend = control.querySelector("fieldset legend span");
    if (legend) legend.textContent = name;
    const input = control.querySelector("input");
    if (input) {
      input.type = "text";
      input.value = value;
      input.setAttribute("value", value);
    }
    const adornment = control.querySelector(".MuiInputAdornment-root");
    if (adornment) {
      const leaf = $$("*", adornment).find((n) => n.children.length === 0) ?? adornment;
      leaf.textContent = unit ?? "";
    }
  });

  const save = row.querySelector("button[type='submit'], .MuiButton-root");
  if (save && button) save.textContent = button;

  return { section, row, controls: $$(".MuiTextField-root", row) };
};

/** Add one explanatory line under the section heading, in the page's own type. */
const setSectionNote = (section, text) => {
  const heading = must(section.querySelector("h2"), "the section has no heading");
  const note = document.createElement("p");
  note.className = "MuiTypography-root MuiTypography-body2";
  note.style.cssText = "margin:0;color:rgba(0,0,0,0.6);font-size:14px";
  note.textContent = text;
  heading.parentElement.after(note);
  return note;
};
