// W13-02 — Bringing somebody back.
//
// Rebuilt 2026-08-31. Brian: "Same thing with W13-02. There's a whole callout at
// the top for Clementine's back or whatever. That's not the fucking line. I
// don't know why that's at the top of the page. It's so silly."
//
// The callout is gone and so is the roster underneath it — the earlier build
// pasted a drawn green panel over `/operate/roster` and left forty-two players
// showing. Coming back is the same one control going the other way.
//
// `disengaged` is explicitly recoverable and people resurface in Hilary. No new
// person, no second recruit row, no re-consent: the same record, re-entered.
buildRecruitBoard();

const { chip } = setRecruitStatus("Clementine Varrow", "engaged");

mark(chip, 1);

await settle();
