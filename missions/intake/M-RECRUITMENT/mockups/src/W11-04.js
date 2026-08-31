// W11-04 — Declining, and the reason the shipped page demands.
//
// The step behind "I'm not attending", photographed rather than drawn. It asks
// for a reason and will not save without one: `REASON_LABEL` is "Reason", the
// field is `required`, `submitNotAttending` checks the string again, and the
// database constrains it a third time.
//
// For a player that is the domain's rule. For a RECRUIT it contradicts Brian
// directly — "They don't need to give a reason. They do not give any reason." A
// recruit is not a member and owes the club nothing, which is the whole
// never-harsh position.
//
// So this screen exists to put the conflict in front of him rather than to
// resolve it: either recruits skip this step, or the page learns who it is
// talking to. Both change shipped behaviour and neither is drawn here.
const reason = must(
  document
    .querySelector('input[name="reason"], textarea[name="reason"]')
    ?.closest(".MuiFormControl-root, .MuiTextField-root"),
  "the declining step has no reason field",
);
mark(reason, 1);

await settle();
