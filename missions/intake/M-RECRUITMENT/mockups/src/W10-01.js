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

const { recruitHead, recruitmentRow } = buildMessagingSchedule();

mark(recruitHead, 1);
mark(recruitmentRow, 2);

await settle();
