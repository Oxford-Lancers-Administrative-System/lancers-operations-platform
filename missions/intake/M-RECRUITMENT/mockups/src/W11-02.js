// W11-02 — Inviting both audiences.
//
// Brian, 2026-08-31, twice:
//
//   "That callout at the top of W11-02 is bullshit. If it's not in the current
//    event flow, we shouldn't be adding new shit to it. The event page should be
//    acting identically. This is a simple change."
//
//   "Capacity? Since when is there fucking capacity at events? No, what I need
//    is a button to be able to do all active players, and I need all active
//    recruits, so I can invite both of them."
//
// So this screen adds nothing to the page. The invented "what each audience
// receives" table is gone — that rule belongs in W10, where the two ladders are
// actually configured — and the Capacity filter is left alone.
//
// The change is one word: the recruits group button reads ALL ACTIVE RECRUITS,
// beside ALL ACTIVE PLAYERS. Both already exist. You add both groups and then
// pick individuals out of the list, exactly as the event flow already works.
const groups = $$("a, button").filter((b) =>
  /^(EVERYONE ACTIVE|ALL ACTIVE|RECRUITS)/i.test(b.textContent.trim()),
);
must(groups, "the audience builder has no group buttons");

const recruits = groups.find((b) => /^RECRUITS/i.test(b.textContent.trim()));
const players = groups.find((b) => /ALL ACTIVE PLAYERS/i.test(b.textContent));
must(players, "the audience builder has no ALL ACTIVE PLAYERS group");
must(recruits, "the audience builder has no recruits group");

recruits.textContent = recruits.textContent.replace(/^RECRUITS/i, "ALL ACTIVE RECRUITS");

mark(players, 1);
mark(recruits, 2);

await settle();
