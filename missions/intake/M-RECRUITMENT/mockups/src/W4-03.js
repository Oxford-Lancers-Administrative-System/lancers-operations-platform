// W4-03 — How the ask gets to her. Brian, 2026-08-31: "No explanation on how we
// got here. Is this automated? Does this get sent out? I don't know because it
// doesn't say anywhere."
//
// It is automated, it is a template, and it carries her own signed link. The
// panel lands above the page's first card now rather than three thousand pixels
// below it, and the words that used to sit inside the frame are in the head.
setHeading("Recruitment cycle", "Season 2026-27 · when each template fires");

const anchor = cardTemplate();

// 1. Step 4 of the cycle: the template that carries the form.
const host = proposedRegion("Step 4 — the recruit-stage ask");
host.append(
  templateRow(
    "recruit_details_ask",
    "Hi {{1}} — when you have a minute, this tells us what to put on for you: {{2}}",
    "Not yet submitted",
  ),
);
placeBefore(anchor, host);
mark(host, 1);

// 2. What fires it, what the link is, and what happens if she says nothing.
const rows = proposedRegion("What this step does");
rows.append(
  makeRow("Fires", "One day after the welcome, automatically — nobody presses send"),
  makeRow("{{2}} is", "Her own signed link — minted for her, linked to her person"),
  makeRow("If she does not answer", "One reminder, three days later, once"),
  makeRow("Then", "Nothing, until an operator chooses to ask again"),
  makeRow("An operator can", "Send it now, or resend it, from her record"),
);
placeBefore(anchor, rows);
mark(rows, 2);
