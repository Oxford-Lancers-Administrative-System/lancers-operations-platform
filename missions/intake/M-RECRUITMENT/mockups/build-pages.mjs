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
      "<strong>Rebuilt 2026-08-31.</strong> Brian: <em>“You use the people workflow as the basis of it. It does not come from the people workflow… It needs to be a new page that's like the roster page, but it's just for the recruit.”</em> The first draft bolted cards onto the person record, which was the wrong entryway entirely",
      "<strong>Built on the player record's shell</strong> at <code>/operate/roster/[membershipId]</code> — the same banded cards, the same row markup, cloned rather than imitated. Reached by clicking a row on the recruit board",
      "<strong>The bands change because a recruit holds no membership:</strong> Person stays as it is, Onboarding becomes Recruitment, Season becomes Events, and the membership summary strip becomes a recruitment one",
      "<strong>What goes on it is not settled.</strong> Brian: <em>“I don't know what items go on this yet.”</em> This is the structure and the entry point; the contents are a proposal",
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
      inherit whatever shape it takes, and every door ends by firing it.`,
    grounding: "photograph",
    legend: [
      "<strong>Rebuilt from nothing, 2026-08-31.</strong> Brian: <em>“The WhatsApp flow is not correct. That's not what a WhatsApp page looks like… This is completely invented.”</em> The first draft drew a two-way chat thread on the events delivery page. Both were wrong: wrong surface, and a conversation that does not exist",
      "<strong>Every business-initiated WhatsApp message is a Meta-approved template.</strong> <code>src/lib/delivery/config.ts</code>: <em>“template is the only production shape.”</em> Free text exists on the loopback test path alone, and only <code>event_invitation</code> is approved today",
      "<strong>So this workflow is templates and delivery receipts</strong>, not messages somebody writes. Four new templates, each needing Meta approval with real lead time before anything sends",
    ],
    screens: [
      P(
        "W3-01",
        "The templates the club sends",
        `What each approved template actually says, and which have been submitted.`,
        [
          "<strong>1. Four new templates</strong>, plus the one already in use",
          "<strong>2. Each needs Meta approval</strong> before it can send — that lead time is a real gate, not a formality",
          "<strong>3. Nobody types to a recruit.</strong> The club's voice is the template, not whoever is holding the phone",
        ],
        "oxfordlancers.example/operate/admin/recruitment",
      ),
      P(
        "W3-02",
        "Where one recruit is in the ladder",
        `Her own record: which templates have gone, what came back, and what the club can honestly see.`,
        [
          "<strong>1. Five steps, with delivery state per step</strong>",
          "<strong>2. <code>read</code> is stored today and mapped to nothing</strong> — widening <code>delivery_outcome</code> is a frozen-model change",
          "<strong>3. Being in the community group is not observable.</strong> The Cloud API does not expose group membership, so she tells us or we do not know",
        ],
        "oxfordlancers.example/operate/recruits/0b938ce0",
      ),
      P(
        "W3-03",
        "The welcome that did not fire",
        `No opt-in evidence was recorded for the operator-add door, so the club says nothing to her.`,
        [
          "<strong>1. She exists on the board; the message waits</strong>",
          "<strong>2. It says what would release it</strong>",
          "<strong>3. This is the lawful-basis rule</strong> — Meta requires documented opt-in before a first business message, and GDPR requires a basis",
        ],
        "oxfordlancers.example/operate/recruits/f31a02c8",
      ),
    ],
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
        "The form",
        `Six questions, every one optional, none of which gates anything.`,
        [
          "<strong>1. Every field optional.</strong> Missing information never blocks a capture and never blocks the flip",
          "<strong>2. Position interest is explicitly not binding</strong> — it gives a coach something to talk to them about",
          "<strong>Decide:</strong> the six fields themselves. This is the first enumeration and it is a proposal",
        ],
        "oxfordlancers.example/a/9f3c…",
        "new",
      ),
      P(
        "W4-02",
        "The link that no longer works",
        `Expired, revoked and never-existed all show the same page.`,
        [
          "<strong>1. One page for all three cases</strong> — telling them apart would let somebody probe which tokens are real",
          "<strong>2. It exposes nothing</strong>: not the club, not the person, not whether the link was ever valid",
          "<strong>3. An operator can send a new one</strong>, and the old link stays dead",
        ],
        "oxfordlancers.example/a/9f3c…",
        "new",
      ),
      P(
        "W4-03",
        "How it gets sent",
        `Automatically, one day after the welcome, as an approved template carrying her own signed link.`,
        [
          "<strong>1. It is a template, not a message somebody writes</strong>",
          "<strong>2. <code>{{2}}</code> is her link</strong> — minted for her, tied to her person",
          "<strong>3. One reminder, three days later, once.</strong> Then nothing until an operator chooses to ask again",
        ],
        "oxfordlancers.example/operate/admin/recruitment",
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
        `The control exists and works. What it does not say is that using it sends that person a message.`,
        [
          "<strong>1. The entry point is unchanged</strong> — this is the shipped attendance sheet",
          "<strong>2. One line added</strong>: adds them to recruitment <em>and sends the club's welcome</em>",
          "<strong>Vocabulary, unresolved:</strong> the button says <em>Add walk-up</em>, the next page says <em>Add a walk-on</em>, the row chip says <em>Walk-on</em>, and the briefs say <em>walk-up</em>. One word should win and it is yours",
        ],
        "oxfordlancers.example/operate/events/1d76b9f8/attendance",
      ),
      P(
        "W5-02",
        "The form, with the read-back",
        `The shipped form at <code>?add=walk-up</code>, filled in. The four fields and the warning above them are exactly what main renders.`,
        [
          "<strong>1. The read-back step</strong> — Task 04 D-4 requires it and main does not implement it. Saving sends a real message to this number, so it is confirmed out loud first",
          "<strong>2. Everything else on this screen is shipped</strong>, including the alert that already says they are added to recruitment",
          "<strong>Correction:</strong> my specification claimed nothing told the operator this creates a recruit. That was wrong — the alert says it. Struck",
        ],
        "oxfordlancers.example/operate/events/1d76b9f8/attendance?add=walk-up",
      ),
      P(
        "W5-03",
        "A possible duplicate, before anything is written",
        `main mints a person here with no interactive check at all — the drift Task 09 amendment 4 recorded and sent to this mission.`,
        [
          "<strong>1. It offers, it does not block.</strong> At a touchline, blocking loses the person",
          "<strong>2. Nothing is written until the operator chooses</strong>",
          "<strong>3. Wider than the coach-only exception</strong> Task 09 §3 allows, which is why it is reconciled here",
        ],
        "oxfordlancers.example/operate/events/1d76b9f8/attendance?add=walk-up",
      ),
      P(
        "W5-04",
        "Refused: no mobile",
        `Your knowingly-accepted limitation, on the form where it actually bites.`,
        [
          "<strong>1. Nothing is saved</strong> — no person, no recruit, no attendance row",
          "<strong>2. It says why and what to do</strong> rather than leaving a dead button",
          "<strong>3. Task 04 D-1, knowingly:</strong> <em>“a walk-up we can't reach isn't in the pipeline.”</em> Not to be softened without a new decision",
        ],
        "oxfordlancers.example/operate/events/1d76b9f8/attendance?add=walk-up",
      ),
      P(
        "W5-05",
        "Saved",
        `The shipped success state at <code>?added=walk-up</code>, plus where she actually went.`,
        [
          "<strong>1. The green confirmation is shipped</strong> and already says they are in recruitment",
          "<strong>2. “In recruitment” is not a place you can click to.</strong> The addition is the link to her recruit record",
          "<strong>3. And what was sent</strong> — the welcome and the community-group invite",
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
      P(
        "W6-02",
        "Two refusals on this door",
        `Somebody who is already a player, and a recruit created without opt-in evidence.`,
        [
          "<strong>1. An existing member is refused, not converted.</strong> Creating a recruit beside a live membership would put a member on a board that messages people about joining",
          "<strong>2. No opt-in evidence: the recruit exists, the message waits.</strong> The record says why, and what would release it",
          "<strong>3. This is the lawful-basis claim made visible</strong> — Meta requires documented opt-in before a first business message",
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
      P(
        "W7-02",
        "Already on the list, and a retired code",
        `The common case at a second event, and what happens when a poster outlives its QR.`,
        [
          "<strong>1. “You are already on our list.”</strong> Nothing created, nothing sent, and it must not read as an error",
          "<strong>2. It confirms only what the submitter typed.</strong> A public page that answers “do you have X?” is a membership oracle",
          "<strong>3. A retired code shows the same invalid page</strong>, and operators see how many submissions it has taken since",
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
      P(
        "W8-02",
        "The empty queue",
        `What zero looks like, and why nothing drains itself.`,
        [
          "<strong>1. Nothing expires and nothing is auto-resolved</strong>",
          "<strong>2. A forgotten queue is visible as a count on the board</strong> rather than silently emptying",
          "<strong>3. Captures land here only when the check cannot decide safely</strong> — this is the normal state, not a broken one",
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
      "<strong>Corrected 2026-08-31.</strong> The first draft grounded this on Mission 4's Follow-ups queue and showed only the queue. Brian: <em>“you just showed me the follow-up queue and no output… That's not even the right place.”</em> The queue is Mission 4's chase surface for members who owe the club an answer — the opposite of a recruit — and a queue is not a journey",
      "<strong>The entry point is the recruit</strong>, not a queue. An operator is looking at a person when they decide to say something, so the button is on the person",
      "<strong>Four screens, because a send is a journey:</strong> where the button is, the composer, what happens when it sends, and the refusal",
    ],
    screens: [
      P(
        "W9-01",
        "Where you hit the button",
        `Her own record, with the action beside the ones that already exist. Her row on the board carries the same action.`,
        [
          "<strong>1. The button is on her</strong>, next to <em>Correct this record</em>",
          "<strong>2. What makes an operator want it</strong> is on the same screen: nothing said since 29 April",
          "<strong>3. Not a queue.</strong> Mission 4's Follow-ups queue chases members who owe an answer; a recruit owes nothing",
        ],
        "oxfordlancers.example/operate/recruits/0b938ce0",
      ),
      P(
        "W9-02",
        "The composer",
        `One recruit, one message, sent by a person, now.`,
        [
          "<strong>1. The operator is not composing blind</strong> — what she has not done is on the screen",
          "<strong>2. Three good starting points</strong>, in club voice, editable before sending. <strong>Decide:</strong> a blank box is neither good nor easy",
          "<strong>3. What it will never grow into</strong>: no cadence, no rung, no bulk send",
        ],
        "Opened from her row on the recruit board",
        "new",
      ),
      P(
        "W9-03",
        "Sent, and where it lands",
        `The output — the thing the first draft was missing entirely.`,
        [
          "<strong>1. Confirmed on the screen she is already on</strong>",
          "<strong>2. It lands on her record</strong>, attributed to the operator who sent it. That attribution is what makes an operator-composed message safe to allow",
          "<strong>3. It moves nothing on the ladder.</strong> Sending is the club talking, not the recruit answering",
        ],
        "oxfordlancers.example/operate/recruits/0b938ce0",
      ),
      P(
        "W9-04",
        "Refused: he declined",
        `The never-harsh rule is a guarantee, so it has to be visible somewhere. This is where.`,
        [
          "<strong>1. A recorded refusal never coexists with continued messaging</strong>",
          "<strong>2. It refuses and says why</strong>, rather than sending and failing",
          "<strong>3. Only he can change it.</strong> If he gets back in touch, an operator moves him back",
        ],
        "Opened from his row on the recruit board",
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
      P(
        "W12-02",
        "The same sheet, opened by a coach",
        `What is absent is the point.`,
        [
          "<strong>1. Names and attendance states. That is the whole payload</strong>",
          "<strong>2. Recruitment status, contact values, notes and signals are absent</strong> — not hidden. The data never reaches the browser",
          "<strong>3. A coach reading “declined” beside somebody standing in front of them</strong> is both a privacy leak and a bad afternoon",
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
