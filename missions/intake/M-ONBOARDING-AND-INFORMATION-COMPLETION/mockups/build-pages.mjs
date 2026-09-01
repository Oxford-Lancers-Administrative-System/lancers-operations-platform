// Generate one review page per workflow, in the format the People & Roster
// mission established and M-RECRUITMENT carried forward. The stylesheet and
// page shell are lifted from that mission's page so the reviews read
// identically; only the screen data and the header prose are this mission's.
//
// The rules the generic half enforces, and why they are not negotiable:
//   * a screen declared here but absent from shots.json throws;
//   * the frame's URL bar shows the route that was really photographed, and
//     where the proposed route does not exist the head says so in words;
//   * each delta is numbered, and the same number is an outline chip on the
//     region it describes inside the proposed shot — pointing, not narrating.
import { readFileSync, writeFileSync } from "node:fs";
import { format, resolveConfig } from "prettier";
import path from "node:path";

// Repo-relative, like every other path here. M-RECRUITMENT's copy walked three
// directories out of its own worktree, which only resolved because that
// worktree sat under `.claude/worktrees/`; this one does not.
const TEMPLATE = "missions/intake/M-PEOPLE-AND-ROSTER/mockups/W6-open-one-players-record.html";
const OUT = "missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/mockups";
const tpl = readFileSync(TEMPLATE, "utf8");

const esc = (s) => s.replace(/`/g, "\\`").replace(/\$/g, "\\$");

/** [id, title, blurb, deltas[], url, disposition] */
const P = (id, title, blurb, deltas, url, disposition = "modified") => ({
  id,
  title,
  blurb,
  deltas,
  url,
  disposition,
});

const WORKFLOWS = [
  {
    id: "W1",
    slug: "bring-last-seasons-squad-in",
    name: "Bring last season's squad in",
    grounding: "photograph",
    lede: `The club has the squad in a spreadsheet and no way to get it into the application. One
      operator turns that file into this season's roster in a single sitting, sees exactly who is
      about to be added before anything is written, and every one of them lands in onboarding with a
      checklist and a welcome on its way.`,
    legend: [
      "<strong>The analogue is <code>/operate/events/import</code></strong> — the club's only import, built by LAN-155. Brian settled on 2026-09-01 that this follows its shape rather than inventing one",
      "<strong>Three states of one screen</strong>: choose a file, read the proposal, confirm. The file is never stored, and abandoning writes nothing",
      "<strong>The one departure</strong> is the possible-duplicates section. Two events with one name on one day are a refusal; two people with one name are a question, always",
      "<strong>The confirmation is not drawn.</strong> Each proposal uploads a real CSV into the shipped file input, the application's own onChange submits it, and the application renders its own table — which is then rewritten into people. Its chips, columns and spacing are the shipped ones",
      "<strong>Five decisions are proposed, not taken</strong>: the file's columns, whether it may overwrite a person already held, what an unanswered duplicate does, whether confirming sends or queues, and the four-role narrowing",
    ],
    screens: [
      P(
        "W1-01",
        "The roster board grows one way in",
        `The entry point, and the only thing this mission adds to Mission 5's board. The Events page
         already carries a menu of exactly this shape — <code>create-menu.tsx</code>, added by
         LAN-155 so bulk import could sit beside the single-record path without displacing it.`,
        [
          "<strong>Add players</strong> replaces the single add control and opens a menu of two, anchored under itself",
          "<strong>Bulk import players</strong> is this workflow; <strong>Add one player</strong> is W2. Both doors end in the same checklist and the same welcome",
        ],
        "oxfordlancers.example/operate/roster",
      ),
      P(
        "W1-02",
        "Choosing a file, and the season it will write into",
        `The season is stated before a file is chosen, because the import inherits it and never asks
         — <code>OD7-season-inherit</code>. Everything on this screen that described events had to be
         rewritten; the first shoot photographed "This season has 110 events · 5 Drafts · 103
         Approved" above a heading that said "Import last season's squad".`,
        [
          "<strong>The counts describe the roster</strong>, not the calendar, and name the season this writes into",
          "<strong>Four steps, about a squad file</strong> rather than a term card",
          "<strong>Choose the squad file</strong> — the shipped file input, relabelled",
          "<strong>Download the template</strong> — six columns, three of them required",
          "<strong>What this import can never do</strong>: delete anybody, overwrite a confirmed fact, send anything, or create a season",
          "<strong>The column list replaces the AI prompt.</strong> A roster file comes off the club's own spreadsheet, so what belongs here is the shape of the file — and there is deliberately no column for date of birth or emergency contact",
        ],
        "oxfordlancers.example/operate/roster/import",
      ),
      P(
        "W1-03",
        "The proposal, and the duplicates underneath it",
        `The heart of the workflow. Nothing is written yet. Every row states its outcome in words as
         well as colour, and the totals above the table are the same numbers the table shows — the
         first shoot photographed "6 New · 0 Refused" over a table with two refusals, and the
         rendered PNG is how that was caught.`,
        [
          "<strong>One row per line of the file</strong>, each carrying <em>New</em>, <em>Carried forward</em>, <em>Unchanged</em> or <em>Refused</em>. The phone renders the same six rows as cards",
          "<strong>The totals agree with the table.</strong> 1 new, 2 carried forward, 1 unchanged, 2 refused",
          "<strong>Possible duplicates — the one thing the events import has no need of.</strong> One incoming row beside the candidate it matched, what matched, and the operator's answer. An unanswered duplicate refuses <em>its own row and nothing else</em>",
          "<strong>Confirm — add 4 players.</strong> The count is what will actually be written, not the number of lines in the file",
        ],
        "oxfordlancers.example/operate/roster/import",
      ),
      P(
        "W1-04",
        "What happened, after confirming",
        `The applied summary. <strong>Welcomes are queued, never sent</strong>: nothing is ever sent
         by hand, and this mission rides Mission 4's scheduler verbatim.`,
        [
          "<strong>One sentence first</strong>: four players on the roster, four welcomes queued",
          "<strong>The counts this workflow adds</strong> — welcomes queued and checklists generated — beside the four row outcomes",
          "<strong>Who arrived</strong>, each with their standing and what is outstanding behind them",
          "<strong>What was refused, and why</strong>, in words, so the operator knows exactly what to fix and re-import",
        ],
        "oxfordlancers.example/operate/roster/import",
      ),
    ],
  },
];

const SHOTS = JSON.parse(readFileSync(path.join(OUT, "shots", "shots.json"), "utf8"));
const SHOT_BY_ID = Object.fromEntries(SHOTS.screens.map((s) => [s.id, s]));
const DRAWN_ROUTE = "(drawn — no route on main)";
const routeOf = (url) =>
  String(url ?? "")
    .replace(/^oxfordlancers\.example/, "")
    .split("?")[0];
// A UUID is shortened in the frame for legibility; that is not a different page.
const sameRoute = (a, b) =>
  a === b ||
  a.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "#") === b.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "#") ||
  a.replace(/[0-9a-f]{8,}/g, "#") === b.replace(/[0-9a-f]{8,}/g, "#");

for (const wf of WORKFLOWS) {
  for (const screen of wf.screens) {
    const record = SHOT_BY_ID[screen.id];
    if (!record) {
      throw new Error(
        `${screen.id} is declared on a review page but has no entry in shots.json. ` +
          `A screen the reviewer can open must be a screen that was actually taken.`,
      );
    }
    const drawn = record.route === DRAWN_ROUTE;
    const proposed = routeOf(screen.url);
    screen.shotRoute = drawn ? null : record.route;
    // The frame shows the route that was really photographed. Where the
    // proposal's own route does not exist yet, the head says so in words.
    screen.frameUrl = drawn ? screen.url : `oxfordlancers.example${record.route}`;
    screen.proposedRoute = proposed && !sameRoute(proposed, record.route ?? "") ? proposed : null;
    screen.disposition = drawn ? "new" : screen.proposedRoute ? "new" : "modified";
  }
}

const GROUNDING_LABEL = {
  photograph: "Grounding: photographs · measured 1280 and 375",
  "code-only": "Grounding: code-only · drawn on both sides · measured 1280 and 375",
  mixed: "Grounding: mixed · photographs where a surface exists, drawn where none does",
};

for (const wf of WORKFLOWS) {
  let out = tpl;
  out = out.replace(/<title>.*?<\/title>/s, `<title>${wf.id} · ${wf.name}</title>`);
  out = out.replace("<h1>W6 · Open one player's record</h1>", `<h1>${wf.id} · ${wf.name}</h1>`);

  const headStart = out.indexOf(
    "        <p>\n          Everything the club knows about one player",
  );
  const headEnd = out.indexOf('      <div id="screens"></div>');
  const drawnNote =
    wf.grounding === "photograph"
      ? `<strong>Every screen here is a photograph on both sides</strong> — the same running page at
           <code>332bc6b</code>, differing only by the proposal evaluated into it. Where a screen's
           own route does not exist yet, it is photographed on the shell it reuses and its head says
           so; the URL bar always shows what was really photographed.`
      : wf.grounding === "code-only"
        ? `<strong>Nothing like this exists on <code>main</code></strong>, so every screen is
           <strong>drawn</strong> and labelled <em>New surface, nothing to compare</em>.`
        : `<strong>Mixed grounding.</strong> Screens on a surface that exists are photographed on both
           sides; screens with no analogue are drawn and labelled <em>New surface, nothing to
           compare</em>.`;
  const head = `        <p>
          ${wf.lede}
          ${drawnNote}
        </p>
        <p>
          <strong>Reading this review.</strong>
          <span class="side-label" style="background: #90a4ae; color: #fff"
            >Current — on main today</span
          >
          and
          <span class="side-label" style="background: var(--primary); color: #fff"
            >Proposed — this mission</span
          >. Nothing on this page is approved.
        </p>
        ${wf.noScreens ? `<div class="noscreens">${wf.noScreens}</div>` : `<span class="grounding">${GROUNDING_LABEL[wf.grounding]}</span>`}
        <div class="legend">
${wf.legend.map((l) => `          <span>${l}</span>`).join("\n")}
        </div>
      </header>
`;
  out = out.slice(0, headStart) + head + out.slice(headEnd);

  const sStart = out.indexOf("      const SCREENS = [");
  const sEnd = out.indexOf("      ];", sStart) + "      ];".length;
  const screens =
    "      const SCREENS = [\n" +
    wf.screens
      .map(
        (s) => `        {
          id: ${JSON.stringify(s.id)},
          title: ${JSON.stringify(s.title)},
          disposition: ${JSON.stringify(s.disposition)},
          drawn: ${s.shotRoute === null},
          blurb: \`${esc(s.blurb)}\`,
          deltas: [
${s.deltas.map((d) => `            \`${esc(d)}\``).join(",\n")},
          ],
          clockTag: CLOCK,
          url: ${JSON.stringify(s.frameUrl)},
          shotRoute: ${JSON.stringify(s.shotRoute)},
          proposedRoute: ${JSON.stringify(s.proposedRoute)},
        }`,
      )
      .join(",\n") +
    ",\n      ];";
  out = out.slice(0, sStart) + screens + out.slice(sEnd);
  // Cap every frame so a review page scrolls in one screen rather than for
  // metres, and let the reviewer scroll inside a shot to see the rest.
  out = out.replace(
    "</style>",
    `
      /* Capped frames — LAN intake feedback, 2026-08-31. A full-page shot of a
         long record ran to several thousand pixels, so a page of them could not
         be scanned. The shot is unchanged; the box it sits in is scrollable. */
      .shotbox {
        max-height: 520px;
        overflow: auto;
        overscroll-behavior: contain;
        position: relative;
      }
      .frame.phone .shotbox { max-height: 620px; }
      .shotbox img { display: block; }
      .scrollnote {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(0, 0, 0, 0.4);
        padding: 4px 10px 0;
      }
      .placard {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        min-height: 220px;
        padding: 32px 24px;
        background: repeating-linear-gradient(
          45deg,
          #f7f7f5,
          #f7f7f5 10px,
          #f2f2ef 10px,
          #f2f2ef 20px
        );
        border-radius: 6px;
      }
      /* The template's legend is a flex row of short chips. This mission's legend
         items are sentences, and flex-wrap laid them out as ragged columns that
         read as a broken table. Stack them. */
      .legend {
        display: block;
      }
      .legend span {
        display: block;
        margin-bottom: 7px;
        line-height: 1.6;
      }
      .noscreens {
        font-size: 13px;
        line-height: 1.65;
        color: rgba(0, 0, 0, 0.78);
        background: #f4f7f6;
        border-left: 3px solid #00695c;
        padding: 14px 16px;
        margin: 12px 0 4px;
        border-radius: 0 4px 4px 0;
      }
      .noscreens ul { margin: 8px 0 0; padding-left: 20px; }
      .noscreens li { margin-bottom: 5px; }
      .provenance {
        font-size: 12.5px;
        line-height: 1.6;
        color: rgba(0, 0, 0, 0.72);
        background: #fff4f7;
        border-left: 3px solid #c2185b;
        padding: 9px 12px;
        margin: 10px 0 4px;
        border-radius: 0 4px 4px 0;
      }
      .deltas.numbered li { list-style: none; position: relative; padding-left: 30px; }
      .deltas.numbered { padding-left: 0; }
      .pin {
        position: absolute;
        left: 0;
        top: 1px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #c2185b;
        color: #fff;
        font: 700 11px/20px system-ui, sans-serif;
        text-align: center;
      }
      .pin.inline { position: static; display: inline-block; vertical-align: -5px; }
      .pinnote { font-size: 12px; color: rgba(0, 0, 0, 0.5); margin: 12px 0 0; line-height: 1.9; }
      .placard strong { font-size: 14px; color: rgba(0, 0, 0, 0.68); }
      .placard span { font-size: 12.5px; color: rgba(0, 0, 0, 0.5); margin-top: 6px; max-width: 42ch; line-height: 1.55; }
    </style>`,
  );

  // A drawn screen has no current side. Photographing one against an unrelated
  // route produced a picture of the dashboard labelled "Current — on main
  // today", which is worse than showing nothing. Show the placard the standard
  // asks for instead.
  out = out.replace(
    /      const sideBlock = \(screen, which\) => \{[\s\S]*?\n      \};/,
    `      const sideBlock = (screen, which) => {
        const label = which === "current" ? "Current — on main today" : "Proposed — this mission";
        if (screen.drawn && which === "current") {
          return \`
          <div class="side current">
            <span class="side-label">New surface, nothing to compare</span>
            <div class="placard">
              <strong>This surface does not exist on <code>main</code></strong>
              <span>There is nothing to photograph, so both sides are drawn. The proposal below is a
              drawing, not a picture of running code — and its acceptance grounding is
              <code>code-only</code>.</span>
            </div>
          </div>\`;
        }
        return \`
          <div class="side \${which}">
            <span class="side-label">\${label}</span>
            <div class="pair">\${shot(screen, which, "desktop")}\${shot(screen, which, "phone")}</div>
          </div>\`;
      };`,
  );

  // The screen head does the explaining, because the application frame must not.
  // Each delta is numbered, and the same number is drawn as an outline chip on
  // the region it describes inside the proposed shot — Brian, 2026-08-31:
  // "if there is something relevant, it needs to be pointed out. I don't want
  // that through narration."
  const DELTAS_FIND =
    '            <ul class="deltas">${screen.deltas.map((d) => `<li>${d}</li>`).join("")}</ul>';
  const DELTAS_REPLACE = [
    '            ${screen.proposedRoute ? `<p class="provenance"><strong>Proposed route ' +
      "<code>${screen.proposedRoute}</code> does not exist on <code>main</code>.</strong> " +
      "The frames below are the real <code>${screen.shotRoute}</code>, the shell this reuses, " +
      "with the proposal evaluated into it. The URL bar shows what was photographed, " +
      'not what is proposed.</p>` : ""}',
    '            <ul class="deltas numbered">${screen.deltas.map((d, i) => `<li>' +
      '<span class="pin">${i + 1}</span>${d}</li>`).join("")}</ul>',
    '            ${screen.drawn ? "" : `<p class="pinnote">Each number above is drawn as a ' +
      '<span class="pin inline">n</span> outline on the region it describes, inside the ' +
      "<em>Proposed</em> shot. The shots are whole pages and scroll inside their box.</p>`}",
  ].join("\n");
  if (!out.includes(DELTAS_FIND)) throw new Error("The template's delta list moved.");
  out = out.replace(DELTAS_FIND, DELTAS_REPLACE);
  // Tell the reviewer the frames scroll.
  out = out.replace(
    '<div class="shotbox">',
    '<div class="scrollnote">scroll inside to see the rest</div><div class="shotbox">',
  );

  out = out.replace(
    'const CLOCK = "Now: Monday, 26 October 2026, 09:15";',
    'const CLOCK = "Baseline: main@332bc6b · seeded synthetic data";',
  );

  // Formatted on the way out, for the same reason build-proposals.mjs is.
  const target = path.join(OUT, `${wf.id}-${wf.slug}.html`);
  writeFileSync(
    target,
    await format(out, { ...(await resolveConfig(target)), parser: "html", filepath: target }),
  );
}
console.log(`built ${WORKFLOWS.length} review pages`);
