// Scratch generator for docs/ux/review/design-mockup-2026-09/index.html — LAN-225.
import fs from "node:fs";
import path from "node:path";
import prettier from "prettier";
const W = process.cwd();
const DIR = path.join(W, "docs/ux/review/design-mockup-2026-09");
// Two sources for the current side. `audit` is LAN-224's own capture run on
// `main` at 4a3efa9; `mine` is this ticket's player-surfaces run on `main` at
// 73577d6, taken from a separate checkout because this branch's theme would
// otherwise photograph itself. Both are photographs of `main`; the frame says
// which.
const CURRENT_DIRS = {
  audit: "../design-audit-2026-09/screens",
  mine: "screens-current",
};
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"));
const measured = manifest.captures.find((c) => c.viewport === "desktop" && c.measured)?.measured;
const measuredPhone = manifest.captures.find((c) => c.viewport === "phone" && c.measured)?.measured;

const SCREENS = [
  {
    id: "S0",
    title: "Shell — sidebar, phone drawer, page header",
    route: "/design-preview/roster",
    disposition: "Modified",
    current: {
      desktop: "operate--operator-home--desktop.png",
      phone: "operate--operator-home--phone.png",
    },
    proposed: { desktop: "S1-roster--desktop.png", phone: "S0-drawer--phone.png" },
    proposedNote: { phone: "drawer open, viewport only" },
    deltas: [
      "B1 — the sidebar and drawer are Oxford Blue; the active item is a Sky Blue tint with Oxford Blue text; secondary lines are Sky Blue.",
      'The crest (placeholder until the Figma export), the club\'s name and the section caption replace "LANCERS / Operations".',
      'B2 (owner → LAN-225) — the "Lancers Operations / Signed in as …" block above every page is gone; the page\'s own header is its first heading.',
      "B3 (owner → LAN-225) — Sign out lives in the account block at the foot of the sidebar and drawer.",
      "S0-d — the phone top bar gains the crest and the name because B2 removes the heading LAN-195's choice 1 relied on. Revert to the bare hamburger if preferred.",
    ],
  },
  {
    id: "S1",
    title: "Roster board",
    route: "/design-preview/roster",
    disposition: "Modified",
    current: {
      desktop: "operate-roster--populated--desktop.png",
      phone: "operate-roster--populated--phone.png",
    },
    proposed: { desktop: "S1-roster--desktop.png", phone: "S1-roster--phone.png" },
    deltas: [
      "Tokens only. The real board component, unchanged in behaviour (Brian, 3 Sep 2026).",
      "Bands: NOT shown here. The proposal is Person Oxford Blue, Onboarding Old Gold, Season Royal Blue (brief \u00a71.5, and BAND_COLOURS in src/components/section.tsx), but the board reads its band hexes from src/app/operate/roster/board-columns.ts \u2014 a live file this branch deliberately leaves on main so it can be merged without repainting the real roster. The bands above are today's. Every other band on the review page (S2, S3) is the kit's and is the proposal.",
      "Chips and buttons read the semantic set; every button is sentence case (E1, G1, G2).",
      "The shell around it is S0.",
    ],
  },
  {
    id: "S2",
    title: "Player record",
    route: "/design-preview/player",
    disposition: "Modified",
    current: {
      desktop: "operate-roster-id--active-complete--desktop.png",
      phone: "operate-roster-id--active-complete--phone.png",
    },
    proposed: { desktop: "S2-player--desktop.png", phone: "S2-player--phone.png" },
    deltas: [
      'PageHeader: one display title, the season line, the status chip beside it, "Back to roster" above, "Open the person record" top right (A5, C1).',
      "The headline row is one MetricRow (C5).",
      "Sections on the brief's bands; the purple attendance band is gone (A1, §1.5).",
      "One Fact shape, inline, with provenance only when known (E5).",
      "Attendance as a table on the neutral band with StatusChips from the one vocabulary; RowCards on a phone (A4, E4).",
      "In-place editing is drawn as values, not wired (preview limitation, not a proposal).",
    ],
  },
  {
    id: "S3",
    title: "Event record (approved)",
    route: "/design-preview/event",
    disposition: "Modified",
    current: {
      desktop: "operate-events-id--approved-upcoming--desktop.png",
      phone: "operate-events-id--approved-upcoming--phone.png",
    },
    proposed: { desktop: "S3-event--desktop.png", phone: "S3-event--phone.png" },
    deltas: [
      "Edit event and Share link move to the PageHeader; the foot is an ActionBar, sticky on a phone (E10).",
      "Invited · Said yes · Showed as Metrics (E3).",
      "Register panel, details, audience, history and questions as plain Sections with one Fact shape (C6).",
      "Participation table: StatusChips on one vocabulary for answer, attendance and delivery; SortableHeader; RowCards on a phone (A4, E4, E13).",
      "Cancel event is outlined error, never filled orange (A10).",
    ],
  },
  {
    id: "S4",
    title: "Create event",
    route: "/design-preview/event-new",
    disposition: "Modified",
    current: {
      desktop: "operate-events-new--empty-form--desktop.png",
      phone: "operate-events-new--empty-form--phone.png",
    },
    proposed: { desktop: "S4-event-new--desktop.png", phone: "S4-event-new--phone.png" },
    extras: [{ file: "S4-actionbar--phone.png", note: "sticky foot, viewport only" }],
    deltas: [
      "The two standing info alerts become the subtitle and a helper line; their words are unchanged (E2).",
      "Field, SelectField, DateField, TimeField, ChoiceField at one size, full width (E9, A11).",
      "Two plain Sections for the fields; the questions as a list with one button.",
      "ActionBar: Save draft, Save and choose audience, Cancel (A8).",
    ],
  },
  {
    id: "S5",
    title: "RSVP invitation",
    route: "/design-preview/rsvp",
    disposition: "Modified",
    current: { desktop: "C5-rsvp--desktop.png", phone: "C5-rsvp--phone.png" },
    currentFrom: "mine",
    currentNote:
      "The audit could not reach a valid /rsvp/[token] and captured only its not-found page. This pair closes that gap: the current side is the live invitation on main at 73577d6, reached with a token minted for the capture and recorded nowhere.",
    proposed: { desktop: "S5-rsvp--desktop.png", phone: "S5-rsvp--phone.png" },
    deltas: [
      "PublicShell: full-bleed Oxford Blue masthead with the crest and the club's name; one <main> landmark (A9, F8, G3).",
      "The event type as an overline; the name as the display title; the date emphasised (LAN-172's Yes emphasis stays).",
      "Facts in a FactGrid; I'm attending contained, I'm not attending outlined, 48px.",
    ],
  },
  {
    id: "S5b",
    title: "RSVP — unusable link",
    route: "/design-preview/rsvp-unusable",
    disposition: "Modified",
    current: {
      desktop: "rsvp-token--not-found--desktop.png",
      phone: "rsvp-token--not-found--phone.png",
    },
    proposed: { desktop: "S5-rsvp-unusable--desktop.png", phone: "S5-rsvp-unusable--phone.png" },
    deltas: [
      "PublicShell masthead; words unchanged; the contact button stays absent (address still deferred).",
    ],
  },
  {
    id: "S6",
    title: "Monday report",
    route: "/design-preview/report",
    disposition: "Modified",
    current: {
      desktop: "operate-report--populated--desktop.png",
      phone: "operate-report--populated--phone.png",
    },
    proposed: { desktop: "S6-report--desktop.png", phone: "S6-report--phone.png" },
    deltas: [
      "E9 (taken) — the native date input is the DateField picker.",
      "Sections at the h3 size with span beside them; tables in TableFrame at the 1200 measure (C4).",
      "Next week as RowCards with a StatusChip; recruitment and availability as StatusChips.",
      "The week in numbers as Metrics (E3).",
      "Order and content unchanged (Brian, 15 Aug 2026).",
    ],
  },
  {
    id: "S7",
    title: "Login",
    route: "/design-preview/login",
    disposition: "Modified",
    current: { desktop: "login--default--desktop.png", phone: "login--default--phone.png" },
    proposed: { desktop: "S7-login--desktop.png", phone: "S7-login--phone.png" },
    deltas: [
      "PublicShell with the crest (A9, F8).",
      "H1 (taken) — the info alert explaining that authentication does not grant access is cut.",
      "Sentence-case buttons (E1).",
    ],
  },
  {
    id: "S8",
    title: "Operators",
    route: "/design-preview/operators",
    disposition: "Modified",
    current: {
      desktop: "operate-admin-operators--populated--desktop.png",
      phone: "operate-admin-operators--populated--phone.png",
    },
    proposed: { desktop: "S8-operators--desktop.png", phone: "S8-operators--phone.png" },
    deltas: [
      "PageHeader with the guide link in the subtitle slot; Invite operator top right (B5, B6 placement only).",
      "Account status as StatusChip on one vocabulary; RowCards on a phone (E4).",
      "A6 (taken, in part) — recorded instants read 4 Sep 2026; calendar dates still go through formatClubDay and read Sept until the implementation mission moves that formatter.",
      "H8 (the operator in two groups) is untouched — Brian's.",
    ],
  },
  {
    id: "S8b",
    title: "Operator record",
    route: "/design-preview/operator",
    disposition: "Modified",
    current: {
      desktop: "operate-admin-operators-id--active-coach--desktop.png",
      phone: "operate-admin-operators-id--active-coach--phone.png",
    },
    proposed: { desktop: "S8-operator--desktop.png", phone: "S8-operator--phone.png" },
    deltas: [
      'PageHeader: eyebrow, display title with the state chip, "Back to operators" above (A5, G6).',
      "Two plain Sections; one Fact shape; the audit history as a ruled list (A1).",
      "Deactivate operator access is outlined error (A10); actions drawn, not wired; an outcome would land in the page's OutcomeSlot (E11).",
    ],
  },
  {
    id: "S9",
    title: "Player home — the player's own invitations",
    route: "/design-preview/player-home",
    disposition: "Modified",
    current: { desktop: "C9-player-home--desktop.png", phone: "C9-player-home--phone.png" },
    currentFrom: "mine",
    currentNote:
      "Both sides are Alaric Brindlewood, the active player with the most invitations still needing an answer (fourteen). The current side is main at 73577d6, reached with a token minted for the capture.",
    proposed: { desktop: "S9-player-home--desktop.png", phone: "S9-player-home--phone.png" },
    deltas: [
      'P1 — the plain-text LANCERS OPERATIONS line becomes the Oxford Blue masthead with the crest and the club\'s name; PublicShell at layout="stack", because this page is several sections and not one panel.',
      "P4 — ten hand-written pixel sizes become the §2 scale; the heading is a real h1 and the focused event's name is the h2 record tier.",
      "P8 — the affirmative button is Oxford Blue, not MUI green. Emphasis still points at Yes (LAN-172).",
      "P11 — the four hand-built chips become StatusChips on the one vocabulary; the event type is a category, not a status, so it reads as words.",
      'P13 — "See what else is coming up" is Section collapsible, still closed on arrival, exactly as it is today.',
      "Rows are RowCards carrying their own actions, beside the content at desktop and under it at 375px.",
      "P21 (product, not taken) — the lists are still unbounded. 3,000px desktop and 4,156px phone against today's 3,269px and 4,106px: no better and no worse, because bounding it is Brian's.",
    ],
  },
  {
    id: "S10",
    title: "The questionnaire — step 1, your details",
    route: "/design-preview/player-details",
    disposition: "Modified",
    current: { desktop: "C10-details--desktop.png", phone: "C10-details--phone.png" },
    currentFrom: "mine",
    currentNote:
      "LAN-224's route inventory has no row for this route at all — it landed with LAN-216, after the brief chose its screens. This is its first capture.",
    proposed: {
      desktop: "S10-player-details--desktop.png",
      phone: "S10-player-details--phone.png",
    },
    extras: [{ file: "S10-actionbar--phone.png", note: "sticky foot, viewport only" }],
    deltas: [
      "P1 — the masthead, with the season as its caption.",
      "P18 — the five-column <dl> of 11px labels becomes StepTrail: numbered, one chip per step, the current step on the Sky Blue ground. A grid, not a wrapping row, so no step is ever left alone on a second line (Brian, 5 Sep 2026); one column and one compact line per step at 375px.",
      "Fourteen fields at one size and full width; the date of birth on the DateField picker (audit E9, already taken).",
      "The four groups are plain Sections; the foot is an ActionBar, sticky on a phone, carrying the enabling sentence (rule 4).",
      "Every label, lead line and helper sentence is the real page's own presentation.ts, unchanged.",
    ],
  },
  {
    id: "S10b",
    title: "The questionnaire — step 2, the document",
    route: "/design-preview/player-agreement",
    disposition: "Modified",
    current: { desktop: "C10b-agreement--desktop.png", phone: "C10b-agreement--phone.png" },
    currentFrom: "mine",
    proposed: {
      desktop: "S10b-player-agreement--desktop.png",
      phone: "S10b-player-agreement--phone.png",
    },
    deltas: [
      "The second half of the sequence is a different shape from the first — a document, one tick box, one button — so judging the form alone would leave it unjudged.",
      "P6 — the placeholder banner is a Notice, not 12px warning-coloured text. The wording is unchanged and the real document is still owed under LAN-213.",
      "P9 — the tick box is the kit's CheckField, not this route's own client module.",
      "P14 (visual half) — the already-agreed line's raw ISO date goes through the shared formatter. Its version id (P15) is product and is left alone.",
    ],
  },
  {
    id: "S11",
    title: "Answer landing — the other half of the invite pair",
    route: "/design-preview/answer",
    disposition: "Modified",
    current: { desktop: "C11-answer--desktop.png", phone: "C11-answer--phone.png" },
    currentFrom: "mine",
    currentNote:
      "S5 is the invitation the player is sent; this is where the Yes button in that message lands them. Same player, same event, both sides.",
    proposed: { desktop: "S11-answer--desktop.png", phone: "S11-answer--phone.png" },
    deltas: [
      "P1 — the masthead; P7 — sentence-case buttons; P8 — the confirm is Oxford Blue, not green.",
      "The heading is the answer (the real page's own words); the event is its subtitle; the facts are one FactGrid with one Fact shape.",
      'One foot: ActionBar with the confirm and "Plans changed?" as its secondary, in place of a button, then a link, then a second form.',
      "Not wired, and deliberately: the real page's one form both records the answer and saves the questions, and a preview must not.",
    ],
  },
  {
    id: "K",
    title: "The kit",
    route: "/design-preview/kit",
    disposition: "New",
    proposed: { desktop: "K-kit--desktop.png", phone: "K-kit--phone.png" },
    deltas: [
      "Every component once. New surface, nothing to compare — review scaffolding, never product.",
    ],
  },
];

/**
 * What each preview route mirrors on `main`, spelled out rather than derived.
 * The derivation this replaced was a chain of `String.replace` calls whose
 * order decided the answer: it printed `/operate/events/[id]s/new` for the
 * create-event screen, and `/operate/roster/[membershipId]-home` for the
 * player's own page, because `/operate/event` matches inside
 * `/operate/events/new` and `/operate/player` inside `/operate/player-home`.
 * A frame that names the wrong route is worse than one that names none.
 */
const MIRRORS = {
  "/design-preview/roster": "/operate/roster",
  "/design-preview/player": "/operate/roster/[membershipId]",
  "/design-preview/event": "/operate/events/[id]",
  "/design-preview/event-new": "/operate/events/new",
  "/design-preview/rsvp": "/rsvp/[token]",
  "/design-preview/rsvp-unusable": "/rsvp/[token]",
  "/design-preview/report": "/operate/report",
  "/design-preview/login": "/login",
  "/design-preview/operators": "/operate/admin/operators",
  "/design-preview/operator": "/operate/admin/operators/[operatorId]",
  "/design-preview/player-home": "/me/[token]",
  "/design-preview/player-details": "/me/[token]/details",
  "/design-preview/player-agreement": "/me/[token]/details?step=code_of_conduct",
  "/design-preview/answer": "/a/[token]",
  "/design-preview/kit": null,
};

const esc = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const frame = (kind, file, width, label, note, currentFrom = "audit") => {
  const dir = kind === "current" ? CURRENT_DIRS[currentFrom] : "screens";
  const src = `${dir}/${file}`;
  const exists = fs.existsSync(path.join(DIR, dir, file));
  return `<figure class="frame ${kind} ${width === 375 ? "phone" : "desktop"}">
  <figcaption class="band">${kind === "current" ? "CURRENT — on <code>main</code> today" : "PROPOSED"} · ${width}${note ? ` · ${esc(note)}` : ""}</figcaption>
  <div class="chrome"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="url">${esc(label)}</span></div>
  <div class="shot">${exists ? `<img src="${src}" alt="${esc(kind)} ${esc(label)} at ${width}" loading="lazy">` : `<p class="missing">Not captured</p>`}</div>
</figure>`;
};
const noCompare = (width) =>
  `<figure class="frame current ${width === 375 ? "phone" : "desktop"} none"><figcaption class="band">CURRENT — on <code>main</code> today · ${width}</figcaption><div class="shot"><p class="missing">New surface, nothing to compare</p></div></figure>`;

const sections = SCREENS.map((s) => {
  const currentUrl = s.id === "S0" ? "/operate" : (MIRRORS[s.route] ?? s.route);
  const rows = ["desktop", "phone"]
    .map((vp) => {
      const width = vp === "desktop" ? 1440 : 375;
      const cur = s.current
        ? frame(
            "current",
            s.current[vp],
            width,
            currentUrl,
            s.currentNote ? "see note" : undefined,
            s.currentFrom,
          )
        : noCompare(width);
      const pro = frame("proposed", s.proposed[vp], width, s.route, s.proposedNote?.[vp]);
      return `<div class="pair ${vp}">${cur}${pro}</div>`;
    })
    .join("\n");
  // The whole-page phone shots deliberately unstick the `ActionBar`, because a
  // stitched full-page capture paints a sticky foot once per tile and drops it
  // into the middle of the form. These are the viewport-sized shots that show
  // it doing its job.
  const extras = (s.extras ?? [])
    .map((e) => `<div class="pair phone">${frame("proposed", e.file, 375, s.route, e.note)}</div>`)
    .join("\n");
  return `<section class="screen" id="${s.id}">
  <div class="tab">${s.id}</div>
  <header class="head">
    <h2>${esc(s.title)} <span class="disp ${s.disposition.toLowerCase()}">${s.disposition}</span></h2>
    <p class="route"><code>${esc(s.route)}</code>${s.current ? ` mirrors <code>${esc(currentUrl)}</code>` : ""}</p>
    ${s.currentNote ? `<p class="note">${esc(s.currentNote)}</p>` : ""}
    <ul class="deltas">${s.deltas.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
  </header>
  ${rows}
  ${extras}
</section>`;
}).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LAN-225 — Design mockup review</title>
<style>
/* Token provenance: src/theme.ts on chore/lan-225-design-mockup (CLUB, SEMANTIC). The frames below are photographs of the running application; nothing here is a redesign of the redesign. */
:root{--oxford:#002147;--royal:#1D42A6;--sky:#B9D6F2;--charcoal:#211D1C;--muted:#5A5754;--ground:#F6F5F2;--gold:#C09723;--old-gold:#8D7149;--rule:rgba(33,29,28,.12)}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--charcoal);background:var(--ground)}
header.page{background:var(--oxford);color:#fff;padding:24px 32px}header.page h1{margin:0 0 6px;font-size:24px}header.page p{margin:0;color:var(--sky)}
main{max-width:1560px;margin:0 auto;padding:24px 32px}
.legend{background:#fff;border:1px solid var(--rule);border-radius:8px;padding:16px 20px;margin-bottom:24px}.legend dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:8px 0 0}.legend dt{font-weight:600}
.band{font:600 11px/16px system-ui;letter-spacing:.08em;text-transform:uppercase;padding:6px 10px;color:#fff}
.frame.current .band{background:var(--muted)}.frame.proposed .band{background:var(--oxford)}
.screen{position:relative;background:#fff;border:1px solid var(--rule);border-radius:8px;padding:20px 24px;margin:0 0 32px}
.tab{position:absolute;top:-1px;right:24px;background:var(--gold);color:var(--charcoal);font-weight:700;padding:4px 12px;border-radius:0 0 8px 8px}
.head h2{margin:0 0 4px;font-size:20px}.disp{font:600 11px/16px system-ui;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:12px;border:1px solid;vertical-align:middle;margin-left:8px}
.disp.modified{color:var(--royal);border-color:var(--royal)}.disp.new{color:var(--old-gold);border-color:var(--old-gold);border-style:dashed}
.route{margin:0;color:var(--muted);font-size:13px}.note{margin:8px 0 0;padding:8px 12px;background:#FBF1DC;border-radius:6px;font-size:13px}
.deltas{margin:10px 0 16px;padding-left:20px;font-size:14px}.deltas li{margin:2px 0}
.pair{display:grid;gap:16px;margin-bottom:16px}.pair.desktop{grid-template-columns:1fr 1fr}.pair.phone{grid-template-columns:repeat(2,minmax(0,400px))}
.frame{margin:0;border:1px solid var(--rule);border-radius:8px;overflow:hidden;background:#fff}
.chrome{display:flex;align-items:center;gap:6px;padding:6px 10px;background:#ECEAE6;border-bottom:1px solid var(--rule)}.dot{width:9px;height:9px;border-radius:50%;background:#c9c6c1}.url{margin-left:8px;font:12px/1 ui-monospace,monospace;color:var(--muted)}
.shot{max-height:960px;overflow:auto;background:#fff}.shot img{display:block;width:100%;height:auto}
.frame.phone .shot{max-height:820px}.missing{padding:40px 16px;text-align:center;color:var(--muted);font-style:italic;margin:0}
code{font:12px ui-monospace,monospace;background:#ECEAE6;padding:1px 4px;border-radius:4px}
@media (max-width:1100px){.pair.desktop,.pair.phone{grid-template-columns:1fr}}
</style>
</head>
<body>
<header class="page"><h1>LAN-225 — Design mockup review</h1><p>Proposed captures from <code>chore/lan-225-design-mockup</code> at <code>${esc(manifest.headSha ?? "")}</code>, ${esc(manifest.at ?? "")}, measured ${measured ? `${measured.width}×${measured.height}` : "—"} and ${measuredPhone ? `${measuredPhone.width}×${measuredPhone.height}` : "—"} through the real login on the local seed. Current captures from the LAN-224 audit on <code>main</code> at <code>4a3efa9</code>, and — for the player surfaces (S5, S9, S10, S10b, S11) — from this ticket&rsquo;s own run on <code>main</code> at <code>73577d6</code>, served from a separate checkout so that this branch&rsquo;s theme never photographs itself. <code>main</code> has since taken LAN-228 and LAN-218 (now <code>30b483d</code>), which this branch has merged; neither touches any of the five routes photographed at <code>73577d6</code>.</p></header>
<main>
<div class="legend">
<strong>How to read a screen.</strong> Both sides are photographs of the running application. The grey band is what is on <code>main</code> today; the Oxford Blue band is the proposal on this branch. Each head says the disposition — <em>Modified</em> where a surface exists on <code>main</code>, <em>New</em> where it does not — and names the deltas to look for, so nothing has to be diffed by eye.
<dl>
<dt>Seed clock</dt><dd>The seed slides onto the day it is run, so a date on the current side and the same date on the proposed side may differ by the days between the two captures. Names and scenarios are the same synthetic dataset.</dd>
<dt>Product deltas</dt><dd>H1, A6, E9 (brief §4.6) and B2, B3 (register, owner → LAN-225) ride as their own listed lines. Everything else is presentation.</dd>
<dt>Crest</dt><dd>A labelled placeholder. Brian's Figma export replaces <code>public/brand/crest.svg</code> in place.</dd>
<dt>Not wired</dt><dd>Buttons and fields are drawn to be judged; the roster board (S1) is the real component.</dd>
</dl>
</div>
${sections}
</main>
</body>
</html>
`;
const out = path.join(DIR, "index.html");
// Formatted here rather than by hand afterwards: `npm run verify` starts with
// `format:check`, and a generator whose output fails it turns every
// regeneration into a second "format the generated page" commit.
const formatted = await prettier.format(html, {
  ...(await prettier.resolveConfig(out)),
  filepath: out,
});
fs.writeFileSync(out, formatted);
console.log("wrote", out);
