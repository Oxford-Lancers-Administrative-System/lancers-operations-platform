// W10-01 — The recruitment cycle, as a group on the messaging schedule.
//
// Rebuilt twice on 2026-08-31. Brian on the second attempt: "I don't know what
// page I'm looking at. I don't know how I get here... this seems to have an
// invented UI... Everything seems totally invented from new, not using any of
// the relevant UX/UI."
//
// He was right, and the error was mine at the root. The first version PREPENDED
// drawn panels to this page; the second CLEARED the page and drew panels in its
// place. Both were inventing, and the second was worse, because it threw away
// the very pattern it should have copied.
//
// WHERE THIS LIVES, which is the question he asked three ways:
//
//   Administration → Messaging schedule → /operate/admin/messaging
//
// It is not a new page and it needs no new navigation. That page is already the
// club's answer to "when does the club message people": it carries a rule panel
// and one `schedule-row` per event type, each with its timings, an on/off toggle
// and a SAVE. The recruitment cycle is the same question for a different
// trigger — capture instead of an event — so it is another group of the SAME
// rows on the SAME page, cloned from the shipped component rather than drawn.
//
// Note the page already has a `Recruitment` row: that is the event TYPE, and it
// governs invitations to a recruitment event. This group is different — it is
// what fires when somebody is captured, and it is added beside it, not over it.
setHeading("Messaging schedule");
pageSubtitle("7 event types · and the recruitment cycle");

const rows = $$('[data-testid="schedule-row"]');
must(rows, "the messaging schedule has no schedule-row to clone");
const template = rows[0];
const host = must(template.parentElement, "the schedule rows have no parent");

// The heading for the new group, in the page's own rule-panel treatment.
const rule = must(
  document.querySelector('[data-testid="schedule-rule"]'),
  "the messaging schedule has no rule panel to clone",
);
const cycleRule = rule.cloneNode(true);
const ruleLeaves = [...cycleRule.querySelectorAll("*")].filter(
  (n) => n.children.length === 0 && n.textContent.trim(),
);
const ruleText = [
  "The recruitment cycle. What the club sends after somebody is captured, and when.",
  "Days are counted from capture. A recruit who has declined receives none of it.",
];
ruleLeaves.forEach((leaf, i) => {
  if (i < ruleText.length) leaf.textContent = ruleText[i];
  else leaf.remove();
});

// One row per step, from the shipped row: same fields, same toggle, same SAVE.
const step = ({ name, first, firstUnit, second, secondUnit, on, save }) => {
  const row = template.cloneNode(true);
  const label = must(
    row.querySelector('[data-testid="schedule-row-label"]') ??
      [...row.querySelectorAll("*")].find((n) => n.children.length === 0 && n.textContent.trim()),
    "the cloned row has no label",
  );
  label.textContent = name;

  // The shipped row carries six timing fields. A cycle step needs two, so the
  // rest go — same component, fewer controls, nothing added.
  const fields = [...row.querySelectorAll(".MuiFormControl-root, .MuiTextField-root")];
  fields.forEach((field, i) => {
    if (i > 1) {
      field.remove();
      return;
    }
    const spec = i === 0 ? first : second;
    const unit = i === 0 ? firstUnit : secondUnit;
    const lab = field.querySelector("label, .MuiInputLabel-root");
    if (lab) lab.textContent = spec.label;
    const input = field.querySelector("input");
    if (input) input.value = spec.value;
    const suffix = [...field.querySelectorAll("p, span")].find((n) =>
      /^(days|h)$/.test(n.textContent.trim()),
    );
    if (suffix) suffix.textContent = unit;
  });

  // Any helper text under the removed fields goes with them.
  for (const help of [...row.querySelectorAll(".MuiFormHelperText-root, p")]) {
    if (
      /WhatsApp messages sent|Email reminders sent|Hours after the RSVP|gap between messages/i.test(
        help.textContent,
      )
    ) {
      help.remove();
    }
  }

  const button = [...row.querySelectorAll("a, button")].find((b) =>
    b.className.includes("MuiButton-contained"),
  );
  if (button) button.textContent = save;

  // NOT AN ON/OFF SWITCH. W10's spec says an operator must be able to turn a
  // step off, and the shipped row has no such control — `schedule-row-toggle` is
  // the "Show an example" disclosure, not a switch. Rather than draw a toggle
  // this product does not have, the gap is recorded in the specification and
  // every step here is shown running.
  return row;
};

const STEPS = [
  {
    name: "Welcome",
    first: { label: "Fires", value: "0" },
    firstUnit: "days",
    second: { label: "Doors", value: "Walk-up and operator add" },
    secondUnit: "",
    on: true,
    save: "SAVE WELCOME",
  },
  {
    name: "Personal details questionnaire",
    first: { label: "After capture", value: "1" },
    firstUnit: "days",
    second: { label: "Reminder after", value: "3" },
    secondUnit: "days",
    on: true,
    save: "SAVE PERSONAL DETAILS",
  },
  {
    name: "Recruitment questionnaire",
    first: { label: "After capture", value: "3" },
    firstUnit: "days",
    second: { label: "Reminder after", value: "3" },
    secondUnit: "days",
    on: true,
    save: "SAVE RECRUITMENT QUESTIONNAIRE",
  },
];

const built = STEPS.map(step);
host.insertBefore(cycleRule, template);
for (const row of built) host.insertBefore(row, template);

mark(cycleRule, 1);
mark(built[0], 2);

await settle();
