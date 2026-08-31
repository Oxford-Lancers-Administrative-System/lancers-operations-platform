// W10-03 — The templates behind the cycle. Moved here from W3 when Brian folded
// that workflow on 2026-08-31, and rebuilt with the rest of W10.
//
// Every business-initiated WhatsApp message is a Meta-approved template —
// `src/lib/delivery/config.ts:168`, "template is the only production shape".
// Only `event_invitation` exists today, so the lead time on the rest is a real
// gate on this mission, not a detail. It is stated here rather than buried in a
// decision log.
selectRecruitmentNav();
setHeading("Recruitment messages");
pageSubtitle("Season 2026-27 · the approved WhatsApp templates, and what each one says");
const host = clearPageBody();

const panel = (title) => {
  const box = proposedRegion(title);
  box.style.marginBottom = "18px";
  host.append(box);
  return box;
};

const list = panel("The templates this cycle needs");
list.append(
  templateRow(
    "recruit_welcome",
    "Hi {{1}}, this is Oxford Lancers. Great to meet you today. Join our group here so you hear about the next session: {{2}}",
    "Not submitted",
  ),
  templateRow(
    "recruit_details_ask",
    "Hi {{1}}, so we can reach you properly — two minutes to check your details: {{2}}",
    "Not submitted",
  ),
  templateRow(
    "recruit_details_reminder",
    "Hi {{1}}, still got a couple of minutes? {{2}} No rush, and we will not ask again.",
    "Not submitted",
  ),
  templateRow(
    "recruit_interest_ask",
    "Hi {{1}}, a few questions about how you came to football so the coaches know where to start: {{2}}",
    "Not submitted",
  ),
  templateRow("event_invitation", "The one the club already sends for any event.", "Approved"),
);
mark(list, 1);

const gate = panel("Why this is a gate and not a detail");
gate.append(
  makeRow("Approved today", "One: event_invitation"),
  makeRow("Needed by this cycle", "Four more, none submitted"),
  makeRow("Meta review", "Days to weeks, and outside the club's control"),
  makeRow("Until they clear", "the cycle can be built and cannot run"),
);
mark(gate, 2);

await settle();
