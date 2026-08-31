// W10-02 — QR administration. Brian, 2026-08-31: "There's literally nothing here
// about the QR code. You just screenshotted it."
//
// It was in W10-01, appended below three thousand pixels of messaging schedule.
// It is its own screen now, because minting and revoking a code that is printed
// on a poster is its own job with its own consequences.
setHeading(
  "Recruitment QR codes",
  "Season 2026-27 · what is live, what it points at, what it took",
);

const anchor = cardTemplate();

// 1. The live codes: what each is called, where it points, when it was minted,
//    and how many people came through it. The count is what makes revoking one
//    a decision rather than a shrug.
const live = proposedRegion("Live codes");
live.append(
  makeRow(
    "Freshers' Fair stand",
    "→ /join?c=ff26 · minted 22 Apr by Caspian Hallowfield · 41 submissions",
  ),
  makeRow(
    "Taster poster, Michaelmas",
    "→ /join?c=tm26 · minted 2 May by Caspian Hallowfield · 7 submissions",
  ),
);
placeBefore(anchor, live);
mark(live, 1);

// 2. Minting one. A name, and nothing else to decide — every code points at the
//    same page and carries the same group link; the name is how an operator
//    later knows which poster took which submissions.
const mint = proposedRegion("Mint a code");
mint.append(field("Name this code", "Hilary handout, 2026-27"));
mint.append(primaryButton("Mint"));
placeBefore(anchor, mint);
mark(mint, 2);

// 3. A revoked code, and what it took before it was turned off. Posters stay up
//    after a code is revoked, so the scan has to land somewhere honest: the
//    uniform invalid page, never a message that says the club has gone away.
const revoked = proposedRegion("Revoked");
revoked.append(
  makeRow(
    "Old handout, Hilary 2025-26",
    "Revoked 14 Apr by Caspian Hallowfield · 23 submissions before, 0 since",
  ),
  makeRow(
    "A scan after revocation",
    "The uniform invalid page — no information leakage, per Task 09 §2.1",
  ),
);
placeBefore(anchor, revoked);
mark(revoked, 3);
