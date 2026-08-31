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

// Section headings, in the page's own type — the h1 cloned and stepped down.
// Brian, 2026-08-31: "This page really needs to be split up into multiple
// sections. One section needs to be just event messages... then there's the
// recruitment heading... Onboarding should be a section." Onboarding is not
// built here; the structure is what makes room for it.
const sectionHeading = (text, note) => {
  const h = must($("h1"), "the page has no heading to clone").cloneNode(true);
  h.textContent = text;
  h.style.cssText = "font-size:19px;font-weight:700;margin:28px 0 4px";
  const wrap = document.createElement("div");
  wrap.append(h);
  if (note) {
    const p = document.createElement("p");
    p.textContent = note;
    p.style.cssText = "margin:0 0 14px;font-size:13.5px;color:rgba(0,0,0,0.6)";
    wrap.append(p);
  }
  return wrap;
};

const rows = $$('[data-testid="schedule-row"]');
must(rows, "the messaging schedule has no schedule-row to clone");
const template = rows[0];
const host = must(template.parentElement, "the schedule rows have no parent");

// No second info panel for recruitment. The section heading and its line already
// say what this group is, and repeating it in a blue box underneath is the
// narration Brian has struck all day. The page's own panel stays where it
// belongs — over the event types, whose chase rules it actually describes — so
// it is only located here, not cloned.
const rule = must(
  document.querySelector('[data-testid="schedule-rule"]'),
  "the messaging schedule has no rule panel",
);

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
  const wanted = second ? 2 : 1;
  fields.forEach((field, i) => {
    if (i >= wanted) {
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

  // The shipped row lays its six fields on a grid. Removing four leaves the
  // columns reserved and the row half empty, which is why Brian said "these seem
  // quite big". Collapse the grid to the fields that remain.
  const grid = fields[0]?.parentElement;
  if (grid) {
    grid.style.display = "flex";
    grid.style.gap = "16px";
    grid.style.flexWrap = "wrap";
    grid.style.gridTemplateColumns = "none";
    for (const field of [...grid.children]) field.style.flex = "0 1 240px";
  }

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

  // "Show an example" belongs to an event's chase, which has something worth
  // worked-examples. A step that fires once on a fixed delay does not.
  for (const link of [...row.querySelectorAll("a, button")]) {
    if (/show an example/i.test(link.textContent)) link.remove();
  }

  // Squeeze it. The shipped row is sized for six fields on three lines; these
  // carry one or two, and Brian on the first attempt: "The white spacing, good
  // fucking lord, is atrocious here... This should be squeezed down so it's much
  // more narrow." Put the fields and the SAVE on one line.
  row.style.padding = "12px 16px";
  if (grid) {
    grid.style.alignItems = "center";
    grid.style.margin = "0";
  }
  // The SAVE button is left exactly where the shipped row puts it, and five
  // attempts at pulling it onto the field line are reverted. None of them took —
  // the styling is emotion's, not the inline styles' — and each one made the row
  // worse than the component does on its own.
  //
  // It is also the right answer. These rows are now the same shape as the seven
  // event rows below them, and shorter, because they carry one or two fields
  // instead of six. Making them shorter still would make recruitment's rows
  // diverge from the page they sit on, which is the opposite of the point.

  // Anything left in the row that holds neither text nor a control is spacing
  // the removed fields used to fill. It goes, or the row stays tall for content
  // that is no longer there.
  for (const node of [...row.querySelectorAll("div, span")]) {
    if (
      node !== grid &&
      !node.contains(grid) &&
      !node.textContent.trim() &&
      !node.querySelector("input, button, a")
    ) {
      node.remove();
    }
  }
  if (grid) grid.style.flexWrap = "nowrap";
  row.style.paddingBottom = "12px";

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
    first: { label: "After capture", value: "0" },
    firstUnit: "hours",
    second: null,
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
  // The fourth step, and the one that was missing. Brian, 2026-08-31: "underneath
  // the recruit heading, there's a recruit events heading where I have a chase
  // specifically for them, and it's just literally one WhatsApp, maybe one
  // follow-up, right? No escalations, anything else like that."
  //
  // A recruit event invitation is NOT the event-messaging chase below. That one
  // escalates to the President; this one is an invitation and at most one more,
  // then silence — the two ladders, expressed where they are configured.
  {
    name: "Recruit event invitations",
    first: { label: "When approved", value: "0" },
    firstUnit: "hours",
    second: { label: "One follow-up after", value: "2" },
    secondUnit: "days",
    on: true,
    save: "SAVE RECRUIT EVENTS",
  },
];

const built = STEPS.map(step);

// Recruitment first, then the event types under their own heading. The page
// stops being one undifferentiated list and becomes three sections, of which
// two are built.
const recruitHead = sectionHeading(
  "Recruitment",
  "What the club sends after somebody is captured.",
);
host.insertBefore(recruitHead, template);

// The QR code is NOT here. Brian, 2026-08-31: "the QR code doesn't go here.
// That doesn't make any damn sense for the QR code to go on the messaging page.
// It should be on the recruit page." It lives on W1's board, behind a QR CODE
// button top right, and on its own page at W1-04. This page is the cycle.

for (const row of built) host.insertBefore(row, template);
host.insertBefore(
  sectionHeading("Event messaging", "What an event sends, and how it chases, by event type."),
  template,
);
host.insertBefore(rule, template);

mark(recruitHead, 1);
mark(built[0], 2);

await settle();
