// W11-01 — The season's checklist, configured.
//
// `onboarding_item_types` exists and is seeded, never configured: nothing under
// src/app reads or writes it, so there is no page for this at all. This is shot
// on `/operate/admin/messaging` — the club's existing per-type configuration
// page, a row per type expandable to a worked example — with the fields
// rewritten to what a checklist item actually carries.
//
// The first attempt renamed only the headings and left every row carrying "RSVP
// by", "First inv." and a "Save practice" button. That screen argued with
// itself on every line.
setAdminHeading("Onboarding checklist · 2026-27");

// The page's own subtitle and standing note are about events. Left alone they
// would describe a different screen entirely.
const subtitle = $$("p").find((p) => /event types/i.test(p.textContent ?? ""));
if (subtitle) subtitle.textContent = "6 items";
const intro = $$("p").find((p) => /when the club messages people about each kind of event/i.test(p.textContent ?? ""));
if (intro)
  intro.textContent =
    "Which items this season's checklist generates for everybody who arrives, what each is called, who may resolve it, and whose it is to chase.";
const alertBody = $(".MuiAlert-message");
if (alertBody)
  alertBody.textContent =
    "Every arrival gets this checklist in full. Turning an item on mid-season adds it to everybody as pending; turning one off stops it generating for new arrivals and changes nobody who already has it.";

const rows = keepRows(6);

const items = [
  {
    label: "Subscription invoiced",
    fields: [
      ["Applies", "Yes", "Whether it generates for everybody this season."],
      ["Verification", "Operator", "Who may resolve it: trust, verify, derived or operator."],
      ["Owner", "Treasurer", "The named person this item is theirs to chase."],
    ],
    button: "Save subscription invoiced",
  },
  {
    label: "Kit sorted",
    fields: [
      ["Applies", "Yes", "Whether it generates for everybody this season."],
      ["Verification", "Operator", "Ticked by whoever handed the kit over."],
      ["Owner", "Kit Manager", "The named person this item is theirs to chase."],
    ],
    button: "Save kit sorted",
  },
  {
    label: "BUCS Play",
    fields: [
      ["Applies", "Yes", "Re-registered every year, so it generates every season."],
      ["Verification", "Verify", "The player claims it; a named human confirms it against the BUCS roster."],
      ["Owner", "Compliance owner", "The named person this item is theirs to chase."],
    ],
    button: "Save BUCS Play",
  },
  {
    label: "Code of Conduct",
    fields: [
      ["Applies", "Yes", "Whether it generates for everybody this season."],
      ["Verification", "Trust", "Completes on the player's own word, carrying player-claimed provenance."],
      ["Owner", "Secretary", "The named person this item is theirs to chase."],
    ],
    button: "Save Code of Conduct",
  },
  {
    label: "Contact & academic details",
    fields: [
      ["Applies", "Yes", "Whether it generates for everybody this season."],
      ["Verification", "Derived", "Completes itself when every required field on the record is present."],
      ["Owner", "Four-role", "The named person this item is theirs to chase."],
    ],
    button: "Save contact & academic details",
  },
  {
    label: "Formalwear",
    fields: [
      ["Applies", "Yes", "Asked of everybody every season — the returner carve-out is removed."],
      ["Verification", "Operator", "Ticked by whoever took the order."],
      ["Owner", "General Manager", "The named person this item is theirs to chase."],
    ],
    button: "Save formalwear",
  },
];

rows.forEach((row, i) => {
  if (items[i]) configureRow(row, items[i]);
});

// 1 — whether the item generates at all this season. An empty configuration
//     reads as "this season has no onboarding items configured", never as
//     "everybody is complete".
mark($$(".MuiTextField-root", rows[0])[0], 1);

// 2 — the verification class, as configuration rather than code (R2-V2). Trust
//     completes on the player's word; verify shows `claimed` until a named
//     human confirms; derived completes itself.
mark($$(".MuiTextField-root", rows[2])[1], 2);

// 3 — and the owner, per item (R2). Not a role check buried in code.
mark($$(".MuiTextField-root", rows[1])[2], 3);

// 4 — formalwear, asked every season now its returner carve-out is removed.
mark(rowLabel(rows[5]), 4);

await settle();
