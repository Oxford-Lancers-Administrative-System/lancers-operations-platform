// W11-06 — The timings a recruitment event runs on.
//
// Brian, 2026-08-31: "W11-06 needs to exist to show what the messaging
// machinery looks like... The page that tells all the timing for the events,
// like WhatsApp messages or whatever, that's the page I need to see as well."
//
// Administration → Messaging schedule → /operate/admin/messaging. The same page
// W10 administers, shown here because it is what decides when a recruitment
// event's invitations go out and how each audience is chased — the question an
// operator running an event actually has. Nothing is proposed here that is not
// proposed in W10: one build, `buildMessagingSchedule`, so the two screens
// cannot drift apart.
//
// What this screen points at is the Recruitment event row, and only that row.
// Its body carries two named groups: Regular players keeps the shipped
// six-field chase that ends with the President, and Recruits is an invitation
// and one follow-up with no President field at all. W11-05 is where an approver
// checks that against one particular event; this is where it is set for every
// recruitment event.
const { playersLabel, recruitsLabel } = buildMessagingSchedule();

mark(playersLabel, 1);
mark(recruitsLabel, 2);

await settle();
