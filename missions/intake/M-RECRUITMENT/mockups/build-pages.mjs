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
      P(
        "W1-03",
        "The empty board",
        `Michaelmas week one, before anybody has been captured. A board with nothing on it should say how somebody gets onto it.`,
        [
          "<strong>1. It names the four doors</strong> rather than saying “no results”",
          "<strong>2. It is not an error state.</strong> Every board is empty at the start of a season",
          "<strong>3. It points at where the QR and the group link are administered</strong>, which is what an operator needs next",
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
      "<strong>Built card for card on the shipped player record</strong> at <code>/operate/roster/[membershipId]</code>. Brian, 2026-08-31: <em>“We shouldn't invent UI elements here. We should see what the roster is, and we should see the player and all the stuff there.”</em> Every card below is a shipped card with its content replaced, not a new one",
      "<strong>PERSON is kept as it ships</strong> — read-only, with its own <em>Open the person record →</em>. Mission 5 owns those facts and owns correcting them",
      "<strong>ONBOARDING becomes RECRUITMENT</strong> in the board's teal, <strong>SEASON becomes THE RECRUIT-STAGE ASK</strong>, <strong>THEIR OTHER SEASONS becomes NOTES</strong>, and STATUS HISTORY stays and carries recruitment's own changes",
      "<strong>The shipped ATTENDANCE table becomes RECRUITMENT EVENTS, reused whole</strong> — <code>Event · Date · RSVP · Attendance · Event status</code>, the columns Brian approved for the board on the same day, in the violet the record already gives that card. Mandatory is dropped because a recruit has no mandatory events",
      "<strong>It is clearly under recruitment.</strong> Recruitment is selected on the left, the line under the name reads <em>Recruitment · 2026-27</em>, the route is <code>/operate/recruitment/…</code> and the button at the foot reads BACK TO RECRUITMENT",
      "<strong>Open:</strong> the events card is violet here because that is the shipped colour, while W1's approved event bands are blue. Making them consistent means changing approved work, so it waits on Brian",
    ],
    screens: [
      P(
        "W2-01",
        "A recruit at the top of the funnel",
        `Rosalind Penhaligon, identified, captured at the Freshers' Fair stand. Almost nothing is
         recorded about her, which is the normal case at the top of the funnel and not an exception —
         so the page has to read well when it is nearly empty.`,
        [
          "<strong>1. PERSON is the shipped card</strong>, read-only, routing out to the person record",
          "<strong>2. RECRUITMENT holds the recruit's own stored fields</strong> and only those — status, how they came in, first contact, committed on. <code>On WhatsApp</code> is gone: Brian struck it from the board the same day as not a recruit field",
          "<strong>3. THE RECRUIT-STAGE ASK is unsent</strong>, so every answer reads <em>Not answered</em>. This is what the card looks like at its emptiest",
          "<strong>4. RECRUITMENT EVENTS is the shipped attendance table</strong>, trimmed to the recruitment events and with Mandatory dropped",
          "<strong>5. NOTES are the operator's own</strong>, attributed and dated, with somewhere to write the next one",
        ],
        "oxfordlancers.example/operate/recruitment/rosalind-penhaligon",
      ),
      P(
        "W2-02",
        "The same page with something on it",
        `Tobias Wrenfield, engaged: the ask answered in his own words, two events attended, a note
         already written, and one recruitment field open for editing. It exists because W2-01 alone
         only ever shows the page empty — Brian, 2026-08-31: “I should be able to make edits and
         updates as it makes sense for that particular user. I should see when they fill out
         information.”`,
        [
          "<strong>1. The ask is answered</strong>, and the answers are the recruit's own — the six-field set from W4 as Brian amended it, including the two yes/no questions about playing and watching",
          "<strong>2. A recruitment field is open for editing in place</strong>, which is the half of this workflow W2-01 asserts and never shows",
          "<strong>3. The events table has content</strong>: an RSVP that became an attendance, and a walk-up that never had an RSVP at all",
        ],
        "oxfordlancers.example/operate/recruitment/tobias-wrenfield",
      ),
      P(
        "W2-03",
        "Sending a questionnaire",
        `The dialog a send button opens. It asks nothing about which questionnaire — the button
         already chose — and shows when that one last went out, because the point is not bothering
         somebody twice.`,
        [
          "<strong>1. Every message is a Meta-approved template</strong> — <code>config.ts:168</code>, <em>“template is the only production shape”</em> — so this chooses one and fires it. There is no composer anywhere in the mission",
          "<strong>2. Pressing SEND is the handoff to W4</strong>, which owns the template, the signed link and the form the recruit opens",
        ],
        "oxfordlancers.example/operate/recruitment/tobias-wrenfield",
      ),
      P(
        "W2-04",
        "The send that will not fire",
        `Kept from W9 when that workflow was folded on 2026-08-31. NEVER HARSH is a guarantee, so the
         product enforces it rather than leaving it to whoever is holding the phone.`,
        [
          "<strong>1. The button stays.</strong> Hiding it would leave an operator wondering whether they had missed something; the dialog says why it will not fire and what would have to change first",
          "<strong>2. There is no “send anyway”.</strong> Under templates-only there is nothing to compose and nothing to override — the only way to message him again is for his status to stop being <code>declined</code>",
        ],
        "oxfordlancers.example/operate/recruitment/ambrose-kittiwake",
      ),
    ],
  },
  {
    id: "W3",
    slug: "say-yes-to-the-club",
    name: "Removed — no workflow here",
    lede: `Removed on 2026-08-31 on Brian's instruction. The number is kept so that nothing
      renumbers; nothing should be built here.`,
    grounding: "photograph",
    noScreens: `<strong>W3 was removed on 2026-08-31.</strong> Brian:
      <em>“W3 doesn't seem to hold anything. It should just be flat-out removed. Don't renumber
      anything.”</em> and <em>“At least there are no screens associated with it. It seems to have
      rolled into something else.”</em>
      <p>Earlier the same day he had folded it into the doors and W10, and its three screens moved
      to <code>W10-03</code>, <code>W2-03</code> and <code>W6-03</code>. What remained was a
      specification with no actor journey of its own and no surface.</p>
      <p><strong>The number is deliberately kept and never reused</strong>, so W4 through W14 hold
      the numbers they were frozen with.</p>
      <p>Its five decisions all found new owners and none was dropped —
      <code>D3</code>, <code>SIGNON-OWNED</code> and <code>SIGNON-LADDER</code> to
      <a href="W10-administer-recruitments-machinery.html">W10</a>, which owns what fires the
      welcome and on what trigger; <code>AM-presence</code> and <code>T08-row8</code> to
      <a href="W2-one-recruits-record.html">W2</a>, because channel presence is a fact about one
      recruit. Both homes await Brian's word. See
      <code>workflows/W3-say-yes-to-the-club.md</code>.</p>`,
    legend: [
      "<strong>Every business-initiated WhatsApp message is a Meta-approved template.</strong> <code>src/lib/delivery/config.ts</code>: <em>“template is the only production shape.”</em> Free text exists on the loopback test path alone, and only <code>event_invitation</code> is approved today",
      "<strong>So nobody types to a recruit.</strong> The club's voice is the template, not whoever is holding the phone — which is why there is no composer anywhere in this mission",
      "<strong>Group membership is not observable.</strong> The Cloud API does not expose it at all, so a recruit joining the community group is recorded when they tell us, and never watched for",
    ],
    screens: [],
  },
  {
    id: "W4",
    slug: "fill-in-your-details",
    name: "Fill in your details",
    lede: `The recruit-stage ask: a form minted for one recruit and linked to their person, sent by
      the cycle rather than by a person.`,
    grounding: "mixed",
    legend: [
      "<strong>The field set is enumerated here for the first time anywhere.</strong> Task 08 routed these fields to Task 09 and never listed them; Mission 5's packet records the set as an open unknown",
      "<strong>W4-01 and W4-02 are drawn</strong> — every signed-link token table is empty in the seeded data, so no such page renders anything but the uniform invalid state",
      "<strong>W4-03 answers Brian's question</strong> about how it gets sent: automatically, as an approved template carrying her own link",
    ],
    screens: [
      P(
        "W4-01",
        "Questionnaire A — who you are",
        `The recruit supplies or confirms their own personal details. Prefilled with what the door
         captured, so the ask is a correction rather than an interrogation.`,
        [
          "<strong>1. Their own name at the top</strong> — Brian, 2026-08-31: <em>“They should have the player name near the top as well.”</em>",
          "<strong>2. Every control is the application's own</strong>, cloned off a live page before it is cleared. <code>/a/[token]</code> exists on main but both token tables are empty in the seed, so nothing renders it and the screen must be drawn — the controls need not be",
          "<strong>3. The fields are Mission 5's</strong>. This mission owns the asking; Mission 5 owns what the record does with an answer",
        ],
        "oxfordlancers.example/a/9f3c…",
      ),
      P(
        "W4-02",
        "Questionnaire B — how you came to football",
        `The recruit-stage field set, sent at a different time from the first. The wording is
         deliberately plainer than the earlier draft's.`,
        [
          "<strong>1. Less casual, and it asks the thing</strong> — Brian struck <em>“Have you played before?”</em> and <em>“Any position you fancy?”</em>: <em>“The questions are a little bit too casual. They should really ask these things about this.”</em>",
          "<strong>2. The control matches the question</strong>, and not by choice: the shipped <code>QuestionField</code> has three branches, so <code>boolean</code> gives the two “have you ever” questions a Yes/No dropdown, <code>choice</code> gives position, gear and how-they-heard their own options, and <code>text</code> gives the open one a fill-in",
          "<strong>3. Nothing gates.</strong> Every field optional; one polite reminder and then nothing",
        ],
        "oxfordlancers.example/a/7b21…",
      ),
      P(
        "W4-03",
        "The link that no longer works",
        `One page for expired, revoked and never-existed. Moved here from W4-02 when the two
         questionnaires took the first two screens.`,
        [
          "<strong>Telling them apart would tell an attacker which tokens exist</strong> — the E1 404-uniformity precedent. It exposes nothing about the club, the person, or whether the link was ever valid",
          "<strong>What used to be W4-03 is deleted.</strong> It was photographed on <code>/operate/admin/messaging</code>, which is why it wore the messaging-schedule sidebar, and its subject — how the ask gets sent — is W10's machinery, not this workflow's",
        ],
        "oxfordlancers.example/a/9f3c…",
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
        "The sheet, and the way in",
        `The shipped attendance sheet and its own ADD WALK-UP control. Nothing is changed: Brian,
         2026-08-31, "This flow should be identical to the way the roster works right now."`,
        [
          "<strong>1. The control is the shipped one.</strong> An earlier draft relabelled it ADD A WALK-ON; the flow is identical to what ships, so the control is too",
        ],
        "oxfordlancers.example/operate/events/1d76b9f8/attendance",
      ),
      P(
        "W5-02",
        "The walk-up form, filled in",
        `The shipped form and its four shipped fields, with nothing added to it. The read-back step an
         earlier draft proposed here is gone, along with the duplicate-check and no-mobile screens
         that stood beside it — Brian: "there are basically needless extensions on this and
         narration, particularly on W5-02."`,
        [],
        "oxfordlancers.example/operate/events/1d76b9f8/attendance?add=walk-up",
      ),
      P(
        "W5-03",
        "Saved — she is in the Walk-ups section",
        `The third step, and the whole of it. Walk-ons have their own section already:
         attendance-groups.tsx renders a Walk-ups group, open by default and drawn only when it holds
         somebody. The seeded event has none, so this screen puts her in it using the sheet's own
         group and row markup.`,
        [
          "<strong>1. The Walk-ups section is the confirmation.</strong> The shipped component's own comment says closing it would close <em>“the only confirmation that the walk-up was recorded”</em>. The count in the strip reads 1 with her in it",
          "<strong>2. The long green line shrinks to “Walk-up added”.</strong> It ships as <em>“Walk-on recorded. They are in recruitment as somebody to follow up, and were not put on the roster.”</em> — Brian: <em>“I don't like the extra text… a smaller text box that says 'Walkup added' is perfectly fine, as long as it disappears if multiple walkups get added.”</em> It is about the last add, not a tally; the section below carries the record",
        ],
        "oxfordlancers.example/operate/events/1d76b9f8/attendance?added=walk-up",
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
        "Adding a recruit by hand",
        `The shipped add-a-person form, reading as recruitment. Its four fields stay as they are and
         an Academic section is proposed beneath them, because Brian asked for more than a name and a
         number: "At the minimum, we need the name, first name, last name, and phone number. And then
         maybe the other details underneath it."`,
        [
          "<strong>1. The extra fields are the person record's own</strong>, in the order <code>MISSING_FILTER_FIELDS</code> lists them, and the shipped person-edit form already groups College and Matriculation year under a section headed Academic. They are text inputs because that is what this product uses for them — there is no college dropdown anywhere in it",
          "<strong>The opt-in is a field, not a callout.</strong> Task 09 §9.1 requires this door to capture one; a control captures it where a callout only talks about it. It is a fixed set and should be a select, but no select renders on this route to clone",
        ],
        "oxfordlancers.example/operate/recruitment/new",
      ),
      P(
        "W6-02",
        "The duplicate check, as it actually runs",
        `Not a drawing. This screen fills the shipped form with somebody already in the club, presses
         the application's own CHECK FOR DUPLICATES, and photographs the answer. An earlier draft drew
         an amber refusal panel on top of a check the form already performs — Brian: "I don't
         understand at all what W6-02 is doing."`,
        [
          "<strong>1. Two candidates, with the reasons they matched</strong> and a THIS IS THEM on each, so the operator links rather than creating a second record. All shipped",
          "<strong>This is also the answer to the condition on W5.</strong> This door has the duplicate check; the walk-up door deliberately has none, because Brian removed that path — <em>“they know who's on their roster, there are only 40 people”</em>",
        ],
        "oxfordlancers.example/operate/recruitment/new",
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
        "Sign yourself in, at the QR code",
        `A stand at a Freshers' Fair, not a registration. One name and one way to reach them is the
         whole ask.`,
        [
          "<strong>1. It refuses nobody</strong> and blocks on nothing",
          "<strong>No public self-entry page exists on main</strong>, so the surface is drawn; the controls are cloned from the shipped add-a-person form",
        ],
        "oxfordlancers.example/join",
      ),
      P(
        "W7-02",
        "Have you signed up with us before?",
        `The whole of the duplicate handling at this door, and it takes one question. Brian,
         2026-08-31: "There should just be a quick check to say, 'Hey, have you already registered
         before?'... If they say yes, it says 'Great,' and then pops them to the WhatsApp board. If
         it's no, it creates it as a new thing."`,
        [
          "<strong>1. The person at the stand is the one who knows.</strong> Asking them needs no operator, no queue and no notification — which is why the parked review queue that used to be W8-02 is deleted",
          "<strong>2. It cannot become a lookup tool.</strong> A stranger can type any name, so the match is confirmed only in terms the visitor already supplied — a first name they typed and the last three digits of the number they typed. The same reasoning as the E1 uniform-invalid page",
          "<strong>Both answers end in the same place.</strong> Yes adds nothing; No creates a new person; either way they go to the group",
        ],
        "oxfordlancers.example/join",
      ),
      P(
        "W7-03",
        "Signed in, and on to WhatsApp",
        `Both answers land here. Pressing the button is the opt-in, which is why this door carries a
         natural one and the operator-add door in W6 has to ask for it.`,
        [],
        "oxfordlancers.example/join",
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
      "<strong>Re-grounded 2026-08-31.</strong> Brian: <em>“That's not where in the fucking workflow it belongs. That's not how the duplicate checks get done. That's not where it happens.”</em> The first draft used the merge screen. Merge resolves two records that both exist; this workflow resolves a submission against a record before anything is written",
      "<strong>The check itself already ships.</strong> <code>create-person-form.tsx</code> is a check-then-create: press <em>Check for duplicates</em> and the form answers <em>Already in the club</em> with candidate rows, or says plainly that nothing matched. <code>W8-01</code> drives that real form and photographs its real answer",
      "<strong>Only the queue is new</strong>, and it exists for one case: a self-serve door with nobody at the keyboard to choose",
    ],
    screens: [
      P(
        "W8-01",
        "The check, on the door being used",
        `The duplicate check is not a page of its own: it is a step belonging to whichever door is
         open, rendered inside that door. This is it while adding a recruit by hand.`,
        [
          "<strong>1. Each candidate says who they actually are</strong> — a player this season, another recruit, or somebody long gone. A name and a phone number cannot separate two Brindlewoods",
          "<strong>The check itself is real</strong>: the screen presses the application's own CHECK FOR DUPLICATES and photographs the answer",
          "<strong>W8-02 is deleted.</strong> It was a parked review queue, and Brian replaced the whole idea with one question asked at the door in W7-02. Anything that still slips through is resolved in the people table's own merge, which already ships and belongs to Mission 5",
        ],
        "oxfordlancers.example/operate/recruitment/new",
      ),
    ],
  },
  {
    id: "W9",
    slug: "follow-up-with-a-recruit",
    name: "Folded — no workflow here",
    lede: `Folded on 2026-08-31. Three of its four screens had already been built into W2, and the
      fourth — the refusal — is now a state of W2's send dialog.`,
    grounding: "photograph",
    noScreens: `<strong>W9 was folded on 2026-08-31.</strong> Brian: <em>“W9 feels like it's already been
      done in part, and I don't know what exactly it's trying to get at.”</em> He was right, and the
      duplication was this intake's own doing: W2's send dialog was built after W9 was drafted and does
      what W9 described.
      <ul>
        <li><strong>Where you hit the button</strong> — <a href="W2-one-recruits-record.html">W2</a>, the two send buttons on the record</li>
        <li><strong>Choosing what to send</strong> — <a href="W2-one-recruits-record.html">W2</a>, screen <code>W2-03</code>, with the dates it last went out</li>
        <li><strong>Sent, and where it lands</strong> — <a href="W2-one-recruits-record.html">W2</a>, the send line on the card and the entry in the audit</li>
        <li><strong>Refused, because they declined</strong> — <a href="W2-one-recruits-record.html">W2</a>, screen <code>W2-04</code></li>
      </ul>
      <p>Brian had already narrowed it himself: when a general <em>Send a follow-up</em> button was
      proposed he struck it and asked for one button per questionnaire, which collapsed “follow up”
      into “send a questionnaire” on the record.</p>
      <p>Its three decisions found new owners and none was dropped — <code>NEVER-HARSH</code> to
      <a href="W10-administer-recruitments-machinery.html">W10</a>, because it constrains what the club
      sends at all, and <code>FOLLOWUP-IS-M6</code> and <code>M5-nogoal-messaging</code> to
      <a href="W2-one-recruits-record.html">W2</a>. The number is kept and never reused.</p>`,
    legend: [
      "<strong>Corrected 2026-08-31.</strong> The first draft grounded this on Mission 4's Follow-ups queue and showed only the queue. Brian: <em>“you just showed me the follow-up queue and no output… That's not even the right place.”</em> The queue is Mission 4's chase surface for members who owe the club an answer — the opposite of a recruit — and a queue is not a journey",
      "<strong>The entry point is the recruit</strong>, not a queue. An operator is looking at a person when they decide to say something, so the button is on the person",
      "<strong>Four screens, because a send is a journey:</strong> where the button is, the composer, what happens when it sends, and the refusal",
    ],
    screens: [],
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
      "<strong>Rebuilt 2026-08-31.</strong> Brian: <em>“You just fucking didn't do W10… There's literally nothing here about the QR code. You just screenshotted it.”</em> The QR administration <em>was</em> built, and appended to the bottom of a 3,557px page inside a 520px review box, so the only thing visible was the top of an untouched messaging screen. It is its own screen now, and every region lands above the page's first card",
      "<strong>The proposed boundary:</strong> Mission 4 owns the scheduler and the transport; recruitment owns what is sent, on what trigger, in what order, and whether a step runs at all. Recruitment declares a cycle and never schedules",
    ],
    screens: [
      P(
        "W10-01",
        "The recruitment cycle",
        `What the club sends, on what trigger, in what order, and whether each step runs at all. The
         proposed route is /operate/admin/recruitment; the photograph is of the messaging schedule,
         whose BODY is replaced rather than decorated — recruitment's cycle does not sit above Mission
         4's event cadences, it is a different page.`,
        [
          "<strong>1. The WhatsApp flow differs by door, and that is the answer to how somebody gets into the group.</strong> A QR recruit joined it themselves at the stand, so the welcome is not for them. A walk-up and an operator-add have a number and no group membership, so for those two the welcome IS the way in, carrying the link",
          "<strong>2. Two questionnaires, sent at different times</strong>, each with one reminder — the shape Brian settled after this screen was first drawn",
          "<strong>3. What it never does.</strong> Nothing fires at a recruit who declined; there is never a second reminder; event invitations are the event's own; and free text is impossible",
          "<strong>4. The community-group link</strong> lives in one place. A rotated link behind a live QR code is the most likely silent failure in the mission",
        ],
        "oxfordlancers.example/operate/admin/recruitment",
      ),
      P(
        "W10-02",
        "The QR codes",
        `Minting and revoking a code that is printed on a poster is its own job with its own
         consequences.`,
        [
          "<strong>1. Each code says where it is printed</strong>, because revoking one kills a physical poster and nothing on screen would otherwise say so",
          "<strong>2. Every code points at the club's own /join page</strong>, never at WhatsApp directly — which is what lets the group link change without reprinting anything",
        ],
        "oxfordlancers.example/operate/admin/recruitment",
      ),
      P(
        "W10-03",
        "The templates behind the cycle",
        `Moved here from W3 when that workflow was folded. Every business-initiated WhatsApp message is
         a Meta-approved template — <code>config.ts:168</code>, “template is the only production
         shape”.`,
        [
          "<strong>1. Four of the five do not exist yet.</strong> Only <code>event_invitation</code> is approved today",
          "<strong>2. That is a gate, not a detail.</strong> Meta review takes days to weeks and is outside the club's control, so the cycle can be built and cannot run until they clear. Stated on the screen rather than buried in a decision log",
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
      "Brian, 2026-08-31: <em>“none of the machinery to explain how we separate out recruitment recruits from non-recruits.”</em> <strong>The machinery already ships.</strong> <code>audience-builder.tsx</code> offers a Capacity filter whose <em>Recruits</em> option appears on a Recruitment event and nowhere else — D46, in the running code at the baseline. The first draft answered the question with an invented table instead of pointing at the control",
      "<strong>W11-02 was captured and then never put on this page</strong>, so the one screen that explains why a Recruits audience exists at all was invisible. It is here now",
      "<strong>Both defects are real and verified in the running code.</strong> <code>scheduleEventLadder</code> inserts a reminder for every invitation filtered only by <code>event_id</code>, and <code>countByCapacity</code> omits recruits from the approval counts",
    ],
    screens: [
      P(
        "W11-02",
        "Where the separation begins — the event's Type",
        `The shipped form's Type control decides which audience groups the event may carry. Nothing
         here is added: the control is the application's own, set to Recruitment.`,
        [
          "<strong>D46: recruits exist on a Recruitment event and nowhere else.</strong> Setting the Type is what makes a Recruits audience exist, and it is already how the product works",
          "<strong>The form already explains the consequence of its own Type.</strong> That sentence is where the recruits group is announced to the operator",
        ],
        "oxfordlancers.example/operate/events/new",
      ),
      P(
        "W11-01",
        "Choosing the audience, and what each one receives",
        `The shipped audience builder, with the Capacity filter set to Recruits. The separation is a
         control that exists; what does not exist is the second ladder.`,
        [
          "<strong>The shipped Capacity filter, set to Recruits.</strong> This is the separation, and it is running code today — not a proposal",
          "<strong>The shipped candidate list</strong>, filtered to the recruits, in the shipped row treatment",
          "<strong>What each audience is chased with — this is the new part.</strong> One event, two ladders: players get the escalation, recruits get one invitation and at most one polite follow-up, then nothing, ever",
          "<strong>The approval summary omits recruits from its count today.</strong> <code>countByCapacity</code> filters them out, so an operator approves an event without being told how many recruits it reaches",
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
      "<strong>Rebuilt 2026-08-31.</strong> Brian: <em>“I don't know why we're reinventing fucking UI. That's perfectly good. For a recruitment event, the recruits just need to go on top as their own category.”</em> The first draft authored a replacement row with its own state buttons. Nothing is authored now",
      "<strong>The sheet already groups.</strong> Attending, Everyone else and Walk-ups each have a toggle, a label, a detail line, a count chip and a list of rows. The proposal clones that group wholesale, renames it, fills it with cloned real rows and moves it to the front — every control, chip and spacing below is the application's own markup",
      "The sheet derives its roster from memberships, so <strong>invited recruits do not appear on it at all</strong> today. That is the gap Task 09 §9.1 names, and adding a group is the whole of the fix",
      "A recruit's funnel status never appears on a sheet a coach can open — a coach reading “declined” beside somebody standing in front of them is both a privacy leak and a bad afternoon",
    ],
    screens: [
      P(
        "W12-01",
        "The sheet on the day",
        `A fourth group at the top of the shipped sheet, built from the shipped sheet's own group
         markup. Everything below it is untouched.`,
        [
          "<strong>Recruits as a category at the top</strong> — Task 09 D11, and the sheet's own grouping mechanism rather than a new one. Names and the sheet's own state controls; nothing else on a recruit row that a player row does not have",
        ],
        "oxfordlancers.example/operate/events/1d76b9f8/attendance",
      ),
      P(
        "W12-02",
        "The same sheet, opened by a coach",
        `What is absent is the point — and absence cannot be drawn as a card listing what is absent,
         because that is narration. This is the real coach view; the outlines point at where to look.`,
        [
          "<strong>The recruits group is here.</strong> A coach records attendance for recruits like anyone else — the group is not withheld from them",
          "<strong>A recruit row carries a name and an RSVP line and nothing else.</strong> No status, no source, no notes, no link to the board — absent from the page <em>and</em> from the payload, which is the LAN-75 contract. The data never reaches the browser, so there is nothing to reveal by inspecting the page",
          "<strong>The navigation a coach receives.</strong> Recruits is not in it",
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
      P(
        "W13-02",
        "Bringing somebody back",
        `<code>disengaged</code> is explicitly recoverable, and people resurface in Hilary.`,
        [
          "<strong>1. One status change, back up the ladder</strong>",
          "<strong>2. Nothing had to be rebuilt</strong>, because nothing was deleted when she left",
          "<strong>3. No new person and no second recruit row</strong> — Task 09's worked example E",
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
      P(
        "W14-03",
        "Refused: she is already on the team",
        `A constraint refusing, said as a sentence rather than as a failed save.`,
        [
          "<strong>1. One membership per person per season</strong> — invariant I2",
          "<strong>2. Nothing was written</strong>",
          "<strong>3. This is not a duplicate check.</strong> Task 09 D7 is explicit that there is none at the flip; I2 is the only guard",
        ],
        "Interrupts the status change on the recruit board",
        "new",
      ),
    ],
  },
];

// Every frame's URL bar, and every screen's disposition, are derived from
// shots.json rather than asserted here. Eighteen of thirty-six screens used to
// print a route that does not exist on `main` — `/operate/recruits`,
// `/operate/recruits/review`, `/operate/admin/recruitment` — above a photograph
// of a different page, and every one of them called itself `modified`. That
// single defect, repeated, is what read as "the wrong screen" four times.
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
           <code>e669331</code>, differing only by the proposal evaluated into it. Where a screen's
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
    'const CLOCK = "Baseline: main@e669331 · seeded synthetic data";',
  );

  writeFileSync(path.join(OUT, `${wf.id}-${wf.slug}.html`), out);
}
console.log(`built ${WORKFLOWS.length} review pages`);
