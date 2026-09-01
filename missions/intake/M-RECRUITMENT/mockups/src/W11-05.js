// W11-05 — What this event will send, before it is approved.
//
// Brian, 2026-08-31, on the prose table that was here first: "It's supposed to
// be a show and a page on what the page is supposed to fucking look like... it
// just lists out a bunch of shit."
//
// So this is a screen, not a table, and it is a photograph on both sides.
//
// WHERE THIS LIVES:
//
//   Events → one draft recruitment event → CHOOSE AUDIENCE AND APPROVE →
//   the review step → /operate/events/[id]?step=review
//
// The messaging plan disclosure is the last thing on that step, directly above
// APPROVE EVENT, and `messaging-plan.tsx` says why in its own words: "the event
// page's own account of what a plan looks like, in the club's language rather
// than in job records: which rung happens when, on which channel, and for
// whom." It is the surface an approver is already reading when they decide. It
// is also where the two-ladders defect is visible rather than described — the
// current side of this screen plans one ladder over 37 people, two of whom are
// recruits, and escalates all 37 to the President.
//
// The change is to that panel and nothing else: the same component, the same
// rows, grouped by who each rung is for.
const rows = must($$('[data-testid="plan-row"]'), "the event review has no messaging plan rows");
const list = must($('[data-testid="plan-rows"]'), "the messaging plan has no row list");

// The escalation is the row carrying the President chip — found by its chip
// rather than by position, so a schedule with a different number of reminders
// still finds it.
const escalation = must(
  rows.find((row) => /^President$/.test(row.querySelector(".MuiChip-label")?.textContent.trim())),
  "the messaging plan has no escalation row to keep with the players",
);

const chipOf = (row) => must(row.querySelector(".MuiChip-label"), "a plan row has no chip");
const noteOf = (row) => {
  const paragraphs = [...row.querySelectorAll(".MuiTypography-body2")];
  return must(paragraphs[1], "a plan row has no note under its title");
};
const titleOf = (row) => must(row.querySelector(".MuiTypography-body2"), "a plan row has no title");

// A group label in the page's own idiom. The review step already labels its
// sections this way — AUDIENCE, DISTRIBUTION, WHAT THEY WILL BE ASKED — so the
// label is cloned from one of those rather than drawn.
const overline = must(
  $(".MuiTypography-overline"),
  "the event page has no overline label to clone",
);
const groupLabel = (text) => {
  const node = overline.cloneNode(true);
  node.textContent = text;
  node.style.cssText = "display:block;margin:14px 0 2px";
  const li = document.createElement("li");
  li.style.cssText = "list-style:none";
  li.append(node);
  return li;
};

// ---- The players' ladder — unchanged, and now named -----------------------
// 35 rather than 37: the two recruits are counted with the recruits below. The
// wording is the component's own (`describeRungs`), with its number corrected.
const invitation = rows[0];
chipOf(invitation).textContent = "35 people";
noteOf(invitation).textContent = "Automated 1:1 message to all 35 people.";

list.insertBefore(groupLabel("Players · 35"), invitation);

// ---- The recruits' ladder — an invitation and one follow-up ---------------
// Cloned from the players' own rows, so these are the same rungs on the same
// component. There is no escalation row, because a recruit is never escalated
// to the President — not an escalation set to a discouraging number, but the
// row absent.
const firstReminder = must(
  rows.find((row) => /^Unanswered$/.test(chipOf(row).textContent.trim())),
  "the messaging plan has no first reminder to clone",
);

const recruitInvitation = invitation.cloneNode(true);
chipOf(recruitInvitation).textContent = "2 people";
noteOf(recruitInvitation).textContent = "Automated 1:1 message to both recruits.";

const recruitFollowUp = firstReminder.cloneNode(true);
titleOf(recruitFollowUp).textContent = "WhatsApp message 2";
chipOf(recruitFollowUp).textContent = "Unanswered";
noteOf(recruitFollowUp).textContent = "Only to recruits who have not answered. Nothing follows it.";
// Two days after the invitation, which is what W10's Recruits group is set to.
must(
  recruitFollowUp.querySelector(".MuiTypography-caption"),
  "the cloned follow-up has no timestamp",
).textContent = "Mon 21 Sep · 17:00";
recruitFollowUp.style.borderBottom = "none";

const recruitsLabel = groupLabel("Recruits · 2");
escalation.after(recruitFollowUp);
escalation.after(recruitInvitation);
escalation.after(recruitsLabel);

// The headline counts steps, so it has to count these too.
const headline = must(
  [...document.querySelectorAll("*")].find(
    (n) => n.children.length === 0 && /^Messaging plan · \d+ steps?$/.test(n.textContent.trim()),
  ),
  "the messaging plan has no step-count headline",
);
headline.textContent = "Messaging plan · 6 steps";

mark(headline, 1);
mark(recruitsLabel, 2);

await settle();
