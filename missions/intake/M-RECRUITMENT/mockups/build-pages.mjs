// Generate one review page per workflow, in the format the People & Roster
// mission established. The stylesheet and page shell are lifted from that
// mission's page so the two reviews read identically; only the screen data and
// the header prose are this mission's.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const TEMPLATE = path.resolve(
  "../../../missions/intake/M-PEOPLE-AND-ROSTER/mockups/W6-open-one-players-record.html",
);
const OUT = "missions/intake/M-RECRUITMENT/mockups";
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
    slug: "the-recruit-board",
    name: "The recruit board",
    lede: `Recruitment's own board: one line per recruit for the open season, in the club's existing
      board language. Its columns decide which recruit facts and which signals exist, and every
      other workflow puts something on it or takes something off it.`,
    grounding: "photograph",
    legend: [
      "Three bands, where the roster has three — but a recruit holds no membership, so <strong>Onboarding and Season describe nothing</strong> and are replaced",
      "Rows are <strong>synthetic</strong>. Rosalind Penhaligon and Tobias Wrenfield are really seeded and render with their real facts; four more are invented so a board can be judged as a board",
      "<strong>Two artifacts of the mockup, not the design:</strong> the pinned column overlays the Notes text when scrolled, and the old Roster nav item still paints as selected because React re-renders that subtree",
    ],
    screens: [
      P(
        "W1-01",
        "The board, at the left end",
        `What an operator opens. The pinned recruit, the person facts they already know how to read,
         and the first of the recruitment facts this mission owns.`,
        [
          "<strong>1. Person band, unchanged.</strong> Same slate, same read-only treatment, same routing out to the person record",
          "<strong>2. Recruitment band, new, teal.</strong> A new colour because these are a new kind of fact. <strong>Decide:</strong> the colour is yours",
          "<strong>3. Status is the seven-value ladder</strong>, coloured per rung, edited in the cell. <code>joined</code> is the one value a cell never writes — W14 intercepts it",
          "<strong>4. <code>On WhatsApp</code> already exists</strong> on the person record at the baseline and is empty on both seeded recruits — so channel presence needs no new storage",
          "<strong>5. The filters changed.</strong> Availability and Missing onboarding data describe memberships a recruit does not hold",
        ],
        "oxfordlancers.example/operate/recruits",
      ),
      P(
        "W1-02",
        "Scrolled to the recruitment and event columns",
        `The same board after the sideways scroll. This is where every fact this mission owns lives,
         and it is the whole point of appending one column per recruitment event.`,
        [
          "<strong>1. Event columns append at the right end</strong>, oldest first, so the term reads left to right",
          "<strong>2. Each event cell is three glyphs</strong>: invited, answered, attended",
          "<strong>3. A recruit never invited</strong> shows dashed outlines, so absence is visible rather than ambiguous",
          "<strong>Decide:</strong> three glyphs in one cell is dense. The alternative triples the width",
        ],
        "oxfordlancers.example/operate/recruits",
      ),
    ],
  },
  {
    id: "W2",
    slug: "one-recruits-record",
    name: "One recruit's record",
    lede: `Everything the club knows about one recruit on one working page. The person half is
      Mission 5's and routes out; the recruitment half is this mission's and is editable here.`,
    grounding: "photograph",
    legend: [
      "Task 08's 2026-08-27 amendment forbids recruitment facts on the person record — <em>“There's nothing on here related to recruits… It's a person record.”</em> So this is a separate surface that reuses that page's shell",
      "Both recruits shown are <strong>really seeded</strong> and render their real facts",
      "The shipped page renders the <strong>Recruit chip twice</strong>. That is a defect this mission found; this page does not reproduce it",
    ],
    screens: [
      P(
        "W2-01",
        "A recruit at the top of the funnel",
        `Rosalind Penhaligon, identified, captured at the Freshers' Fair stand four days ago. Almost
         nothing is recorded about her, which is the normal case and not an exception.`,
        [
          "<strong>1. The person cards are untouched</strong> and become read-only context",
          "<strong>2. Four recruitment cards are added</strong>: where they are, what we have seen, what we have said, and notes",
          "<strong>3. Signals are dated facts with a source</strong> — never scored, never ranked, and nothing moves a stage on its own",
          "<strong>4. Notes carry an author and a date.</strong> <strong>Decide:</strong> an unattributed note is not evidence",
        ],
        "oxfordlancers.example/operate/recruits/0b938ce0",
      ),
      P(
        "W2-02",
        "A recruit further along",
        `Tobias Wrenfield, engaged: in the group, ask answered, two events attended. What a full
         signal set looks like once the sign-on flow and a couple of events have run.`,
        [
          "<strong>1. What they told us</strong> is the recruit-stage field set from W4, attributed to them",
          "<strong>2. The group join is recorded, never watched for</strong> — the 2026-08-28 research found group membership is not exposed by the Cloud API at all",
          "<strong>3. Every event shows invited, answered and attended</strong>, the same three facts the board's columns carry",
        ],
        "oxfordlancers.example/operate/recruits/192fd288",
      ),
    ],
  },
  {
    id: "W3",
    slug: "say-yes-to-the-club",
    name: "Say yes to the club",
    lede: `The smallest journey in the mission and the most load-bearing outside it: Missions 7 and 8
      inherit whatever shape it takes, and every door in this mission ends by firing it.`,
    grounding: "mixed",
    legend: [
      "Brian's own sequence, 2026-08-31: <em>“First notification goes out today to invite them in. If they sign in, they get asked. If they accept, they get asked to fill out some details immediately. They get a polite reminder…”</em>",
      "<strong>W3-02 is drawn</strong> — these are WhatsApp messages, and no inbound conversation is captured anywhere on main; the webhook parses only <code>statuses[]</code>",
    ],
    screens: [
      P(
        "W3-01",
        "Where each recruit is in the flow",
        `The operator's view, built on Mission 4's delivery screen — the nearest thing the product
         already has to “what did we send and what came back”.`,
        [
          "<strong>1. The five-step ladder</strong> is visible per recruit rather than inferred from delivery rows",
          "<strong>2. What the club can honestly see</strong> is stated next to what it sends — the join is recorded, never watched for",
          "<strong>3. Opt-in evidence is per door.</strong> Operator add is the one door with no natural opt-in, and the welcome does not fire without it",
        ],
        "oxfordlancers.example/operate/events/1d76b9f8/delivery",
      ),
      P(
        "W3-02",
        "What the recruit actually receives",
        `Four messages, then silence until a person chooses to say something. This is the only place
         the never-harsh rule is actually visible.`,
        [
          "<strong>1. Welcome and group invite</strong> on capture, from every door — Task 09 D3",
          "<strong>2. The standard ask</strong> immediately after they accept. <strong>Decide:</strong> what it asks is open — the recommendation is one question",
          "<strong>3. One polite reminder</strong>, the next day, only if nothing came back. This is the message the old never-chased rule forbade",
          "<strong>4. Then the W4 form</strong>, and then nothing",
        ],
        "WhatsApp · Oxford Lancers",
        "new",
      ),
    ],
  },
  {
    id: "W4",
    slug: "fill-in-your-details",
    name: "Fill in your details",
    lede: `The recruit-stage ask: a form minted for one recruit and linked to their person, asked
      politely and reminded once.`,
    grounding: "code-only",
    legend: [
      "<strong>Drawn on both sides.</strong> <code>person_access_tokens</code>, <code>rsvp_access_tokens</code> and <code>club_link_tokens</code> are all empty in the seeded data, so no signed-link page renders anything but the uniform invalid state",
      "The field set is <strong>enumerated here for the first time anywhere</strong>. Task 08 routed these fields to Task 09 and never listed them; Mission 5's packet records the set as an open unknown",
    ],
    screens: [
      P(
        "W4-01",
        "The form",
        `Six questions, every one optional, none of which gates anything.`,
        [
          "<strong>1. Every field optional.</strong> Missing information never blocks a capture and never blocks the flip — Task 09 D5, invariant 4",
          "<strong>2. Position interest is explicitly not binding</strong> — it gives a coach something to talk to them about",
          "<strong>3. How they heard about us</strong> is the only recruitment-effectiveness question worth asking",
          "<strong>Decide:</strong> the six fields themselves. This is the first enumeration and it is a proposal",
        ],
        "oxfordlancers.example/a/9f3c…",
        "new",
      ),
    ],
  },
  {
    id: "W5",
    slug: "capture-a-walk-up-as-a-recruit",
    name: "Capture a walk-up as a recruit",
    lede: `Somebody turns up and an operator or coach writes them down in seconds, at the touchline,
      without leaving attendance. This is the only recruitment door that exists today.`,
    grounding: "photograph",
    legend: [
      "Brian, 2026-08-31: <em>“We need to go through that entire flow, and there's probably going to be some significant rework… just for clarity purposes.”</em>",
      "<strong>Three defects at the baseline justify the rework:</strong> no read-back step despite Task 04 D-4 requiring one, no interactive duplicate check, and nothing telling the operator that saving creates a recruit and sends a message",
      "The <strong>375px frame is the real one</strong> here — this is the one workflow performed on a phone, in the cold",
    ],
    screens: [
      P(
        "W5-01",
        "Capturing somebody at the touchline",
        `The attendance sheet keeps its shipped behaviour entirely. What changes is the capture form
         beside it, and what the operator is told about what they are doing.`,
        [
          "<strong>1. Name and mobile required, email optional</strong> — Task 04 D-1. A walk-up the club cannot reach is not captured, knowingly",
          "<strong>2. The read-back step</strong>, required by Task 04 D-4 and unimplemented at the baseline. Saving sends a real message, so the number is confirmed out loud",
          "<strong>3. A duplicate check that offers rather than blocks.</strong> The shipped path mints a person with no check at all",
          "<strong>4. The form says what saving does</strong> — creates a recruit, sends the welcome, records attendance. Nothing on the shipped screen says any of it",
        ],
        "oxfordlancers.example/operate/events/1d76b9f8/attendance",
      ),
    ],
  },
  {
    id: "W6",
    slug: "add-a-recruit-by-hand",
    name: "Add a recruit by hand",
    lede: `The club finds somebody it wants and puts them in deliberately — proactive sourcing as a
      first-class path rather than a fallback.`,
    grounding: "photograph",
    legend: [
      "The shipped add-a-person form and its duplicate check are reused wholesale. One card is added",
      "This is the <strong>one door carrying no natural opt-in</strong> — Task 09 §9.1. A number sourced in conversation was not given by its owner for this purpose",
    ],
    screens: [
      P(
        "W6-01",
        "Adding somebody the club went looking for",
        `Everything about the shipped form stays. The addition is the evidence that makes the welcome
         lawful to send from this door.`,
        [
          "<strong>1. How we came by this number</strong>, recorded as a sentence plus a confirmation. <strong>Decide:</strong> free text alone is unauditable, a tick alone records nothing — the recommendation is both",
          "<strong>2. Without it the welcome does not fire</strong>, and the record says why",
          "<strong>3. Source and a first note</strong> while they are fresh",
        ],
        "oxfordlancers.example/operate/recruits/new",
      ),
    ],
  },
  {
    id: "W7",
    slug: "sign-yourself-in",
    name: "Sign yourself in",
    lede: `A recruit at the Freshers' Fair stand puts themselves into the club's system, on the
      club's own page, and comes out of it in the community group.`,
    grounding: "code-only",
    legend: [
      "<strong>Drawn on both sides.</strong> There is no public self-entry page on main",
      "Brian, 2026-08-31: <em>“they go to a form. And then, once they submit the form, they should get a login, basically an invite to the WhatsApp group.”</em> <strong>“A login” is read here as the group invite and the signed link, not an account</strong> — Task 08 §3 fixes that there are no player logins in Release One. Flagged rather than assumed",
      "The <strong>375px frame is the real one</strong> — nobody scans a QR on a desktop",
    ],
    screens: [
      P(
        "W7-01",
        "The page behind the QR",
        `Four fields on the club's own domain, and what happens when the club already has them.`,
        [
          "<strong>1. The club's own page on the club's own domain</strong> — Brian, 2026-08-28. They are signing in to the club's application, not a form somewhere else",
          "<strong>2. The same capture standard as every other door</strong>: name and mobile, email optional",
          "<strong>3. If we already have them, they are told</strong> — Brian, 2026-08-31. Nothing is created and nothing is sent",
          "<strong>Decide:</strong> the duplicate telling confirms only what the submitter typed. A public page that volunteers who else the club holds is a membership oracle",
        ],
        "oxfordlancers.example/join",
        "new",
      ),
    ],
  },
  {
    id: "W8",
    slug: "resolve-a-possible-duplicate",
    name: "Resolve a possible duplicate",
    lede: `A capture the system could not safely resolve waits for a human, and one operator decision
      settles it — without ever having silently created a person, merged two, or messaged a member.`,
    grounding: "photograph",
    legend: [
      "The shipped merge screen is the nearest analogue, but <strong>merge resolves two records that both exist</strong>. This queue resolves a submission that does not exist yet against a record that does",
      "Nothing is written until a human decides — the locked rule at the centre of R2",
    ],
    screens: [
      P(
        "W8-01",
        "The queue",
        `Three parked captures, each comparing what somebody submitted against what the club already
         holds. Two outcomes: link, or create.`,
        [
          "<strong>1. A submission beside a record</strong>, not two records. Nothing is written yet, so there is nothing to merge",
          "<strong>2. Everything is held</strong> — no person, no recruit, no welcome. An existing member never receives a “welcome to the club” message",
          "<strong>3. A declined recruit signing up again</strong> is a real case, and it is the operator's to read rather than the system's to guess",
          "<strong>4. Attendance was recorded regardless.</strong> Capture always stands; only the recruit record waits",
        ],
        "oxfordlancers.example/operate/recruits/review",
      ),
    ],
  },
  {
    id: "W9",
    slug: "follow-up-with-a-recruit",
    name: "Follow up with a recruit",
    lede: `An operator says something polite to a recruit, quickly, from wherever they already are —
      and the message is good without the operator having to write it well.`,
    grounding: "mixed",
    legend: [
      "This workflow exists because of the 2026-08-31 amendment. Until then the rule was that recruits are never chased and human touches happen outside the system",
      "Brian: <em>“That is not Mission 7. That is Mission 6. Mission 7 can inherit from Mission 6 if it wants to.”</em>",
      "<strong>W9-02 is drawn</strong> — there is no composer anywhere in the application. Mission 5 sends nothing and Mission 4 sends only from its ladder",
    ],
    screens: [
      P(
        "W9-01",
        "Who needs a word",
        `Built on Mission 4's Follow-ups queue, the closest thing the product has to “who needs a
         word”.`,
        [
          "<strong>1. The operator is not composing blind</strong> — what the recruit has not done is on the screen",
          "<strong>2. Good default messages</strong>, one per common situation, in club voice. <strong>Decide:</strong> a blank box is neither good nor easy",
          "<strong>3. What this surface will not do</strong>: no cadence, no rung, no bulk send",
        ],
        "oxfordlancers.example/operate/admin/follow-ups",
      ),
      P(
        "W9-02",
        "The composer",
        `One recruit, one message, sent by a person, now.`,
        [
          "<strong>1. Opened from her row</strong>, without losing place",
          "<strong>2. A starting point, then edited</strong>, because a real person is sending it",
          "<strong>Decide:</strong> one recruit at a time, no multi-select. The moment it sends to many it is a campaign and the rule is gone",
        ],
        "Opened from the recruit board",
        "new",
      ),
    ],
  },
  {
    id: "W10",
    slug: "administer-recruitments-machinery",
    name: "Administer the messages, cycles and QR",
    lede: `What recruitment says, when it says it, whether a step runs at all, and which QR codes are
      live — changed by an operator rather than an engineer.`,
    grounding: "photograph",
    legend: [
      "This is the workflow Brian named as the one he was least sure of: <em>“I'm most confused about this one. I think we need to go through the workflow and find the boundary there.”</em>",
      "It is drawn tenth rather than third for exactly that reason — the boundary is found against the flows that configure it, not guessed in the abstract",
      "<strong>The proposed boundary:</strong> Mission 4 owns the scheduler and the transport; recruitment owns what is sent, on what trigger, in what order, and whether a step runs at all. Recruitment declares a cycle and never schedules",
    ],
    screens: [
      P(
        "W10-01",
        "The recruitment cycle",
        `The shipped messaging schedule is the shell and the language. Recruitment's cycle is a
         sibling object in that language, not a new column on it.`,
        [
          "<strong>1. The boundary, stated on the screen</strong> rather than left implicit",
          "<strong>2. The cycle as a sequence</strong> of five named steps, each editable, each able to be turned off entirely",
          "<strong>3. The community-group link</strong> with when it last changed — the most likely silent failure in the mission is a rotated link nobody notices",
          "<strong>4. QR codes minted, named, counted and revocable.</strong> <strong>Decide:</strong> whether these belong here or on their own screen",
        ],
        "oxfordlancers.example/operate/admin/recruitment",
      ),
    ],
  },
  {
    id: "W11",
    slug: "run-a-recruitment-event",
    name: "Run a recruitment event",
    lede: `An operator schedules a session recruits are invited to, invites recruits and players
      together where that is what the session is, and approves it knowing exactly what it sends.`,
    grounding: "photograph",
    legend: [
      "Brian, 2026-08-31: <em>“we should be able to invite players and recruits, but recruits get treated differently.”</em> Two ladders, not one suppressed ladder",
      "<strong>Both defects are real and verified in the running code.</strong> <code>scheduleEventLadder</code> inserts a reminder for every invitation filtered only by <code>event_id</code>, and <code>countByCapacity</code> omits recruits from the approval counts",
    ],
    screens: [
      P(
        "W11-01",
        "Before you approve",
        `The change is the approval summary: today it states one audience number and omits recruits
         from it entirely.`,
        [
          "<strong>1. Both audiences and both ladders</strong>, stated before approval",
          "<strong>2. A recruit gets one invitation and at most one polite follow-up</strong>, then nothing",
          "<strong>3. A recruit who says no is never asked why.</strong> <strong>Decide:</strong> R5's reason-on-no is a member obligation; demanding one of a recruit is harsh",
          "<strong>4. The defect this fixes</strong>, named on the screen with the code that causes it",
        ],
        "oxfordlancers.example/operate/events/1d76b9f8",
      ),
    ],
  },
  {
    id: "W12",
    slug: "take-attendance-at-a-recruitment-event",
    name: "Take attendance at a recruitment event",
    lede: `On the day, whoever is holding the phone records who actually turned up — recruits first,
      everyone else below — and captures the people nobody expected.`,
    grounding: "photograph",
    legend: [
      "The sheet derives its roster from memberships, so <strong>invited recruits do not appear on it at all</strong>. That is the gap Task 09 §9.1 names",
      "A recruit's funnel status never appears on a sheet a coach can open — a coach reading “declined” beside somebody standing in front of them is both a privacy leak and a bad afternoon",
    ],
    screens: [
      P(
        "W12-01",
        "The sheet on the day",
        `Recruits at the top, everyone else below, and what a recruit's absence actually means.`,
        [
          "<strong>1. Recruits at the top</strong> — Task 09 D11, optimised for scanning who showed up",
          "<strong>2. Names only.</strong> No funnel status on a sheet a coach can open",
          "<strong>3. A recruit who does not turn up triggers nothing.</strong> “Did not show up” is deliberately not a recruit status",
          "<strong>4. Turnout is the sum of the records.</strong> No separate headcount — D8, superseding Register F4",
        ],
        "oxfordlancers.example/operate/events/1d76b9f8/attendance",
      ),
    ],
  },
  {
    id: "W13",
    slug: "take-a-recruit-off-the-board",
    name: "Take a recruit off the board",
    lede: `A recruit who is not going to onboarding leaves the board without leaving the record, and
      nothing further is sent to them.`,
    grounding: "photograph",
    legend: [
      "Brian, 2026-08-31: <em>“that's a status change, right? A moves statuses, and then the board resorts, more or less.”</em> There is deliberately no separate removal mechanism, no archive and no delete",
      "Every walk-up is a recruit and every QR scan is a recruit — which is what makes the exits load-bearing. Without them the board fills with everybody who ever stood near the stand",
    ],
    screens: [
      P(
        "W13-01",
        "The board after an exit",
        `Clementine Varrow moves to declined. She leaves the top of the board, the board resorts, and
         her record is untouched.`,
        [
          "<strong>1. A status change and nothing more</strong>",
          "<strong>2. The board resorts</strong> — the exits sink to the bottom rather than disappearing",
          "<strong>3. She stops receiving everything</strong>, including anything an operator tries to send from W9",
          "<strong>Decide:</strong> <code>void</code> as a separate marker rather than a seventh status value. Every other value says something about the person; <code>void</code> says the record is wrong",
        ],
        "oxfordlancers.example/operate/recruits",
      ),
    ],
  },
  {
    id: "W14",
    slug: "flip-a-recruit-to-joined",
    name: "Flip a recruit to joined",
    lede: `One of the core four decides a recruit is in, and that one decision creates the season
      membership, puts them on the roster, and opens onboarding.`,
    grounding: "mixed",
    legend: [
      "Brian, 2026-08-31: <em>“When it flips to ‘Join,’ there should be a pop-up… ‘Join’ means these people are being officially added to some season… and they're moved on to Onboard.”</em>",
      "<strong>W14-01 is drawn</strong> — no confirmation of this kind exists in the application",
      "<strong>On the team is not active.</strong> Activation is a separate later gate and is Mission 7's",
    ],
    screens: [
      P(
        "W14-01",
        "The interruption",
        `The status change to joined interrupts rather than committing silently, and names exactly
         what it is about to do.`,
        [
          "<strong>1. It names the three consequences</strong> — membership, roster, onboarding — and the season",
          "<strong>2. It says what it will not do</strong>: make her active",
          "<strong>3. Cancel writes nothing</strong>",
          "<strong>4. Only the four roles ever see it</strong> — Task 09 D5",
        ],
        "Interrupts the status change on the recruit board",
        "new",
      ),
      P(
        "W14-02",
        "Where she lands",
        `The roster, with the flip's four consequences confirmed on the surface that shows them.`,
        [
          "<strong>1. Joined this season</strong>, on the roster, in onboarding",
          "<strong>2. Not active</strong>, and the screen says so",
          "<strong>3. Audited</strong> — who flipped, when, into which season",
        ],
        "oxfordlancers.example/operate/roster",
      ),
    ],
  },
];

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
      ? `<strong>The surfaces here exist on <code>main</code></strong>, so every screen is a
           <strong>photograph on both sides</strong> — the same running page at <code>e669331</code>,
           differing only by the proposal evaluated into it.`
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
        <span class="grounding">${GROUNDING_LABEL[wf.grounding]}</span>
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
          drawn: ${s.disposition === "new"},
          blurb: \`${esc(s.blurb)}\`,
          deltas: [
${s.deltas.map((d) => `            \`${esc(d)}\``).join(",\n")},
          ],
          clockTag: CLOCK,
          url: ${JSON.stringify(s.url)},
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

  // Tell the reviewer the frames scroll.
  out = out.replace(
    '<div class="shotbox">',
    '<div class="scrollnote">scroll inside to see the rest</div><div class="shotbox">',
  );

  out = out.replace(
    'const CLOCK = "Now: Monday, 26 October 2026, 09:15";',
    'const CLOCK = "Baseline: main@e669331 · seeded synthetic data";',
  );

  writeFileSync(path.join(OUT, `${wf.id}-${wf.slug}.html`), out);
}
console.log(`built ${WORKFLOWS.length} review pages`);
