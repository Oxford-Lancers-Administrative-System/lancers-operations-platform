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
  {
    id: "W2",
    slug: "add-one-player-by-hand",
    name: "Add one player by hand",
    grounding: "photograph",
    lede: `One person turns up who was not in the file. An operator enters them and they arrive
      exactly where an imported player arrives \u2014 on this season's roster in onboarding, with the
      same checklist and the same welcome.`,
    legend: [
      "<strong>This workflow builds no surface.</strong> <code>/operate/roster/new</code> exists, built by LAN-74 as the returner intake, and every screen here is that page photographed as it runs",
      "<strong>Most of it already works.</strong> <code>enterReturningPlayer</code> already mints the person, creates the membership <em>at onboarding</em>, writes the transition, <strong>generates the checklist</strong>, and audits all of it \u2014 in one transaction",
      "<strong>What is missing is that nothing is sent.</strong> Subject area <code>S2</code> says this door \u201copens nothing\u201d; read against the code that means there is no welcome, no signed link, and so no way for the person to answer. That is the whole of what W2 adds",
      "<strong>The second change is the required set.</strong> The form enforces only a first name today, while the item-and-ask inventory and <code>person-required.ts</code> both require last name and mobile as well",
      "<strong>Both decisions resolved the same way \u2014 leave it as shipped.</strong> Authority stays at the general-operator floor rather than W1's four-role, and personal email stays optional",
      "<strong>Nothing new is invented.</strong> Two added elements were removed on Brian's instruction; every screen here is a shipped surface with rewritten text",
    ],
    screens: [
      P(
        "W2-01",
        "The form, with the required set the club actually uses",
        `The shipped form, unchanged in shape. All three of first name, last name and mobile are
         required \u2014 but only two of those are a change, and the screen says which.`,
        [
          "<strong>First name was already required</strong> on <code>main</code>; the field simply never carried an asterisk, so a screen starring only the new ones would have said it was optional",
          "<strong>Last name becomes required.</strong> The missing-data queue chases a blank one on day one",
          "<strong>Mobile becomes required.</strong> The welcome travels by mobile, and without one the player is never told",
          "<strong>Personal email stays optional</strong> \u2014 it is one of the things the player's own link collects",
          "<strong>What confirming does</strong>, said in the page's <em>own</em> subtitle rather than a new banner underneath it \u2014 Brian, 2026-09-01: \u201cso long as we're not inventing new UX elements here\u201d",
        ],
        "oxfordlancers.example/operate/roster/new",
      ),
      P(
        "W2-02",
        "The duplicate check, driven for real",
        `Nothing here is this mission's to change. It is photographed because W2 has to show that
         adding one player runs the <em>same</em> duplicate question the import does, rather than a
         second one. The proposal fills the shipped form and presses the application's own
         <em>Check for matches</em>; the two candidates are real rows out of the seeded database.`,
        [
          "<strong>The count and the explicit-choice rule are shipped</strong>: the system never silently merges and never silently creates",
          "<strong>A real candidate</strong>, with what it matched on stated underneath \u2014 here, a phone number",
          "<strong>Already a member</strong> is flagged on the candidate, which is what feeds the shipped refusal step when the operator picks them",
        ],
        "oxfordlancers.example/operate/roster/new",
      ),
      P(
        "W2-03",
        "Where the operator lands, and the one thing that is new there",
        `The shipped redirect goes to the person's record, and that record already shows the
         generated checklist \u2014 the seven items in the ONBOARDING card below are real, not drawn.
         What it cannot show today is that anybody was told.`,
        [
          "<strong>The shipped <code>created-summary</code> sentence, rewritten.</strong> The record already renders a confirmation banner on <code>?created=1</code>; this names the one new fact in it \u2014 the welcome is queued \u2014 and adds no element",
          "<strong>The checklist below is evidence, not a proposal.</strong> Those seven items are what the shipped transaction generated; nothing on this card is drawn or changed",
        ],
        "oxfordlancers.example/operate/roster/9878545e-39aa-4342-8f9b-a50c2ff63a3f?created=1",
      ),
    ],
  },
  {
    id: "W3",
    slug: "a-flipped-recruit-lands-in-onboarding",
    name: "A flipped recruit lands in onboarding",
    grounding: "photograph",
    lede: `Mission 6's <code>W14</code> ends at the words "onboarding opens". This workflow is
      what those words mean. A recruit the club has been talking to for weeks arrives on the roster
      without being asked again for anything they have already said.`,
    legend: [
      "<strong>This workflow has no action of its own.</strong> Everything here is the consequence of one decision taken in Mission 6, inside that flip's single transaction",
      "<strong>Four things happen</strong>: the checklist generates, the recruit's answers carry across, their open recruit ask is superseded and audited, and the welcome is queued \u2014 the same message as both other doors",
      "<strong>Consent needs no copying.</strong> <code>season_messaging_consents</code> is unique on <code>(person_id, season_id)</code>, and the flip changes neither, so the row the recruit ticked at the door simply <em>is</em> their consent. Not carried, not re-asked",
      "<strong>The flip is not walkable yet.</strong> LAN-204, which builds Mission 6's board, record and flip, is in Backlog \u2014 so a flipped recruit was seeded locally and photographed rather than proposed onto somebody else's record",
      "<strong>One trigger, and nothing downstream of it.</strong> <code>onboarding-opened</code> is both the welcome and the start of the chase. What the ask contains \u2014 the missing required personal fields as one derived item, plus every pending checklist item \u2014 belongs to <strong>W4</strong>; the queue and the nudge to <strong>W8</strong>; the cadence to <strong>W12</strong>. A flipped recruit is chased identically to anybody else",
      "<strong>No new surface and no new card.</strong> Everything this produces is read on Mission 5's record; where the supersession and the queued welcome appear is <strong>W6's</strong> activity log",
    ],
    screens: [
      P(
        "W3-01",
        "What a flipped recruit's record looks like the moment they land",
        `A photograph on both sides of a person who really is one: a prospect at <code>joined</code>
         pointing at a membership at <code>onboarding</code> through
         <code>converted_membership_id</code>, with the seven items the checklist generates and a
         consent row granted at the door on 14 August. The proposal here marks; it changes almost
         nothing.`,
        [
          "<strong>What carried across</strong> \u2014 mobile, personal email, college and matriculation year, from the recruit door and questionnaire A. They are confirmed on the form, never retyped",
          "<strong>What recruitment never asks</strong> \u2014 expected graduation, degree field, date of birth and emergency contact are blank, and are asked of everyone at onboarding whichever door they used",
          "<strong>The checklist, generated by the flip's transaction.</strong> Seven items, all pending, 0 of 7 resolved",
          "<strong>The season card</strong>: onboarding, confirmed the day the flip committed, never activated \u2014 activation is a separate human gate and is W10's. <strong>Note that Entry reads <em>New</em>:</strong> on this surface a flipped recruit is currently indistinguishable from a hand-added player, which is the open decision below",
        ],
        "oxfordlancers.example/operate/roster/deff9490-89a8-4a03-91bb-3175223b4d26",
      ),
    ],
  },
  {
    id: "W4",
    slug: "say-yes-and-fill-in-your-details",
    name: "Say yes and fill in your details",
    grounding: "photograph",
    lede: `One link, five steps: the player's details, the Code of Conduct, the photo release, BUCS
      Play, then Hudl. Still one open ask. This is the mission's largest workflow and its only one
      whose actor is not an operator.`,
    legend: [
      "<strong>Required now means required.</strong> Owner direction, 2026-09-02: \"The form that they're being sent for the onboarding should be required… For recruits, they are not required. For onboarding, they are required.\" That split already exists in shipped code — <code>person-required.ts</code> asks a recruit for three facts and a player for ten — so the asterisks are the player tier, not an invention. <strong>It does collide with an approved invariant; see the decision below</strong>",
      "<strong>Five pages, on Brian's direction.</strong> The Code of Conduct, the photo release, BUCS Play and now Hudl are each their own page: \"the instructions for Huddle should also be on its own separate page\"",
      "<strong>W4's surface does not exist on <code>main</code>.</strong> Every screen is shot on <code>/a/[token]</code>, the answer link — the nearest implemented player-facing, no-login, signed-link form. The current side is that page as it ships; the proposed side is the same running page transformed. Neither side is a drawing",
      "<strong>The link is already on <code>main</code>.</strong> <code>person_access_tokens</code> ships one live durable credential per person per season, enforced by a partial unique index — <code>T11-one-request</code>'s \"one open ask, ever\". Five pages, still one link",
      "<strong>There is no way to store a document or take a signature.</strong> No storage bucket, no document table, no blob column, no signature capture; the only file input in the application is the event CSV import, which stores nothing. Both document steps are new substrate",
      "<strong>Three doors, one sequence — with one visible difference.</strong> A flipped recruit sees no consent step, because <code>season_messaging_consents</code> is unique per person per season and theirs already says granted",
    ],
    screens: [
      P(
        "W4-01",
        "Step 1 — your details, with the onboarding required set",
        `Merrick Thornbury arrived in this season's import. <strong>Ten fields now carry an
         asterisk</strong> — the player tier from <code>person-required.ts</code> — and the emergency
         contact is five fields, matching what the database stores.`,
        [
          "<strong>The strip is the map of the sequence</strong> — five steps behind one link, and where this person is in it. Subscriptions, kit, the squad photo and the comms groups are the club's to tick and never appear here",
          "<strong>Consent, still the first thing asked.</strong> Unticked, because this is the moment it is asked",
          "<strong>What the club already holds arrives filled in.</strong> The ask is to confirm it, never to retype it",
          "<strong>What it does not hold is blank — and is now required.</strong> The player cannot finish step 1 without it",
          "<strong>Date of birth</strong> is required, collected here, and never appears on any list, board or queue",
          "<strong>The emergency contact, as five fields.</strong> First name is required because the table demands it; <strong>phone is required because a contact you cannot ring is not one</strong> — that second one is mine, not the database's, and is flagged as a decision",
          "<strong>The required set itself</strong>, said in the player's own terms. This is where the recruit flow and the onboarding flow part company",
        ],
        "oxfordlancers.example/me/[token]/details",
      ),
      P(
        "W4-02",
        "Step 1 for a flipped recruit — no consent step, and the same required set",
        `Rosalind Penhaligon is the seed's own prospect, flipped to <code>joined</code>, with consent
         granted at the door on 14 August. <strong>Consent is absent</strong>; the required set is
         not. She gave three facts at the recruit door where three was all the club asked for, and
         onboarding now asks for ten.`,
        [
          "<strong>Consent was given at the door</strong>, and the strip says when and where",
          "<strong>Where W4-01 opens with the tick, this page opens with a sentence saying why it is not asking.</strong> No tick anywhere, and no way to reach one",
          "<strong>What the recruit door and questionnaire A already collected</strong> — confirmed, never asked twice",
          "<strong>The facts recruitment never asks for, now required</strong>: expected graduation, degree field, date of birth",
          "<strong>And the whole emergency contact, blank in all five fields</strong>, because recruitment never asks for one at all",
          "<strong>The two flows, stated on the page.</strong> Three fields at the recruit door, ten at onboarding — exactly the tiers <code>person-required.ts</code> already ships",
        ],
        "oxfordlancers.example/me/[token]/details",
      ),
      P(
        "W4-03",
        "Step 2 — the Code of Conduct, on its own page",
        `The document is on the page, it scrolls, and agreeing is only possible from the end of it.
         The pane is shown scrolled to its end because the end is where the mechanic lives.
         <strong>The words are placeholder and say so</strong> — the real text is Clint's through
         Task 07, and there is nowhere on <code>main</code> to put it.`,
        [
          "<strong>The strip carries the version</strong>, which does not exist yet. An agreement that does not name what was agreed to is not worth recording",
          "<strong>The document, on the page.</strong> Scrolled to its end here. This is new substrate: nothing on <code>main</code> stores a document",
          "<strong>The agreement, reachable only from the bottom.</strong> Dated, recorded against that version, and stored as theirs",
        ],
        "oxfordlancers.example/me/[token]/code-of-conduct",
      ),
      P(
        "W4-04",
        "Step 3 — the photo release, and the signature question",
        `Same shape as the Code of Conduct, deliberately. Brian: "Do we have a way to handle signed
         documents right now in the thing? I don't think so." <strong>He is right — there is
         none.</strong>`,
        [
          "<strong>Asked again every season</strong>, of everybody. The returner carve-out was removed at the boundary",
          "<strong>The document, on the page</strong>, in the same pane as the Code of Conduct's. One mechanism, two documents",
          "<strong>The agreement</strong>, in the same place and shape",
          "<strong>OPEN DECISION.</strong> A true signature — drawn, or a signed PDF — needs object storage and a signature control, and the application has neither. Recording the version, the moment and the person needs no new infrastructure. <strong>Recommended: the second</strong>, with e-signature additive later",
        ],
        "oxfordlancers.example/me/[token]/photo-release",
      ),
      P(
        "W4-05",
        "Step 4 — BUCS Play, as a set of steps",
        `Brian: "Bucs play should be a set of steps. Again, that's its own page as well." Hudl has
         now left this page and taken its own. <strong>The steps are placeholder and say so</strong> —
         Task 10 deferred that copy to this mission and nobody has written it.`,
        [
          "<strong>The club records only what the player says.</strong> Nothing done on BUCS Play is visible to this system",
          "<strong>The steps</strong>, which is what makes this a page rather than a tick",
          "<strong>The copy that does not exist yet</strong>, marked rather than invented",
          "<strong>The player's answer records <code>claimed</code>, never <code>complete</code></strong>. A named human confirms it against the BUCS roster, on W6",
        ],
        "oxfordlancers.example/me/[token]/bucs-play",
      ),
      P(
        "W4-06",
        "Step 5 — Hudl, on its own page",
        `Owner direction, 2026-09-02: "the instructions for Huddle should also be on its own separate
         page. Not tagged on." Hudl is the one checklist item whose <strong>first half is the club's
         job</strong> — an operator invites, the player accepts — and this page has to be honest
         about that rather than implying the player is the hold-up.`,
        [
          "<strong>The half the club owns, said at the top.</strong> Hudl's own roster reads <em>Pending Invite</em> between the two halves",
          "<strong>The steps</strong>, now that this is a page of its own",
          "<strong>The copy still owed.</strong> The email-invite method is assumed — Brian, 2026-09-01: \"doesn't really matter for my purposes\"",
          "<strong>\"No invitation has reached me\"</strong> — the answer that hands the item back to the club. Without it, a player who was never invited has no way to say so, and the queue would chase them for the club's own omission",
        ],
        "oxfordlancers.example/me/[token]/hudl",
      ),
      P(
        "W4-07",
        "Done — what is still outstanding, by section, each one a link",
        `Owner direction, 2026-09-02: the previous draft said this in one sentence and "that line is
         very hard to tell. It should honestly be a set of options… it should list below in dots,
         like a list… if they click on that link, it brings them back to the form that has that
         information."`,
        [
          "<strong>The strip, now covering all six things the sequence touches</strong>",
          "<strong>What is left, by section, in dots</strong> — and every bullet is a link back to the step that collects it. A player who wants to finish one thing goes straight to it",
          "<strong>The rule underneath.</strong> All of it is on the link they already hold; no second link is ever sent",
        ],
        "oxfordlancers.example/me/[token]/details",
      ),
      P(
        "W4-08",
        "Already complete — the link opened with nothing left to give",
        `The shipped answer link already has this state and its own words for it. This reuses that
         shape rather than inventing a second way to say the same thing, and there is no sequence to
         re-enter.`,
        [
          "<strong>Everything the player themselves owns is done</strong>, and the page says so rather than showing an empty form",
          "<strong>The club still has items outstanding against this person.</strong> None is the player's, so none appears here — the operator-owned half lives on W6's record",
        ],
        "oxfordlancers.example/me/[token]/details",
      ),
      P(
        "W4-09",
        "Expired, revoked, or never real — the one uniform page",
        `<code>/a/[token]/not-found.tsx</code> already renders one response for every unusable link:
         unknown, revoked and expired alike, at 404, with identical copy and no variant that could
         let them diverge. W4 keeps that page. <strong>One sentence cannot come across.</strong>`,
        [
          "<strong>The one sentence that changes.</strong> The shipped body talks about an event having started — the answer link's business, untrue of a collection link",
          "<strong>And what must not change.</strong> It never says which of unknown, expired or revoked this link is, and it is the same page, at the same status code, for all three",
        ],
        "oxfordlancers.example/me/[token]/details",
      ),
    ],
  },
  {
    id: "W5",
    slug: "fix-something-the-club-has-wrong",
    name: "Fix something the club has wrong",
    grounding: "photograph",
    lede: `A player's details change during the season, or the club has something wrong. They open the
      link they already hold and change it. <strong>That is the whole workflow</strong> — one screen,
      and it is deliberately an ordinary form.`,
    legend: [
      "<strong>Where it sits.</strong> W4 is the form, given once. W5 is that same form still live in November — not a second surface and not a second link, just the same page showing everything rather than only the gaps. Anything else the club needs to change, it changes its own way at <code>/operate/people/[personId]/edit</code>",
      "<strong>Why it exists at all.</strong> There are no player logins, so the signed link is the only route a player will ever have to their own data — and Mission 5 shipped the operator edit path recording in its own spec that it was the <em>interim</em> answer until a person could fix their own record. Its missing-data queue has nothing acting on it from the player's side today",
      "<strong>Three things came out on Brian's direction, 2026-09-02.</strong> No declining a fact — \"they have to give the date of birth and information\", which supersedes <code>T11-refused</code>. No system-generated one-fact ask — which supersedes <code>M6</code>; a person chases and the message carries the compiled link, and that is W8's. And no explanation living inside the page: \"too much UI narration… too narrative in design\"",
      "<strong>Provenance already exists on <code>main</code>, and it is derived.</strong> <code>person-record.ts</code> answers \"who supplied this value\" from <code>audit_events</code> — Brian's own LAN-184 choice rather than adding columns. This workflow adds no provenance columns; it adds the ranking, and the <code>disputed</code> state Mission 5 deliberately did not ship",
      "<strong>One rule survives, because boundary item 14 is approved</strong>: a player's answer never <em>silently</em> overwrites what an operator recorded. On the screen that is one clause on a source line, and nothing else",
    ],
    screens: [
      P(
        "W5-01",
        "The follow-up form — everything the club holds, editable",
        `Nothing is outstanding; Merrick came here himself. Every value is editable and every value
         says where it came from. The page carries no commentary about itself — the previous draft's
         paragraph-long notices are gone, and what needs saying is here, outside the frame.`,
        [
          "<strong>Nothing is outstanding.</strong> This is not a chase and the strip does not pretend to be one — and it says the club keeps previous values, which is the thing a person about to change something actually wants to know",
          "<strong>A value they gave.</strong> Changing it changes it: their prerogative, in Brian's words, and no ceremony around it",
          "<strong>A value an operator recorded.</strong> One clause on the source line — <em>a change here is checked by a person</em> — and nothing else on the page. Both values are kept and <strong>W7</strong> resolves it. The player is never told which officer",
          "<strong>Required still means required.</strong> There is no way to decline a fact here or anywhere: <code>T11-refused</code> is superseded",
        ],
        "oxfordlancers.example/me/[token]/details",
      ),
    ],
  },
  {
    id: "W6",
    slug: "one-players-onboarding-record",
    name: "One player's onboarding record",
    grounding: "photograph",
    lede: `An operator opens one player and sees the whole truth about them: every item, who said it
      and when, everything the club has ever asked them counted by section, and one place to
      complete, waive, mark not applicable or reopen. <strong>This adds no new surface</strong> — it
      deepens the Onboarding section that already ships.`,
    legend: [
      "<strong>The record ships and is good.</strong> It already has the Onboarding section, a row per item, the Required chip and the outstanding alert. Three things are genuinely absent, and they are this workflow",
      "<strong><code>claimed</code> is not in the enum.</strong> <code>onboarding_item_status</code> is <code>pending → invited → complete | waived | not_applicable</code>. R2-V needs a state meaning \"the player says done, awaiting confirmation\"",
      "<strong>There is no history.</strong> <code>onboarding_items</code> stores current state only, so the record can say an item is complete but never that it was complete, reopened in November, and completed again",
      "<strong>The shipped provenance says when, never who.</strong> <code>provenanceNote</code> renders \"Completed &lt;day&gt;\" and nothing else",
      "<strong>A live database constraint contradicts an approved decision.</strong> R2-R makes waive reason-free; <code>onboarding_items_waiver_is_justified</code> currently refuses a waiver without one. Unwinding it is a forward-only migration, named here so the Mission Lead does not meet it at implementation time",
      "<strong>Nothing gates, and this is where that is enforced.</strong> No item blocks anything for anybody; derived completeness is display-only and never flips membership — activation is a human declaration, and W10's",
    ],
    screens: [
      P(
        "W6-01",
        "The checklist, with who said it and when",
        `The same rows the record already renders, using the note slot and the status text they
         already have. <strong>No chip, no colour, no element the record does not use elsewhere</strong> —
         the first draft added a coloured pill beside the shipped status and it read as a second,
         contradicting one.`,
        [
          "<strong>A trust-class item, completed on the player's own word.</strong> R2-V: it completes without a human and carries player-claimed provenance",
          "<strong>The state the enum does not have.</strong> The player has said it; the compliance owner has not confirmed it. <code>claimed</code> is new",
          "<strong>Who, not just when.</strong> The shipped note says “Completed 30 August” and stops",
          "<strong>History, not just current state.</strong> Reopened on 1 September, waived on 20 August, three earlier changes — none of which the record can say today",
        ],
        "oxfordlancers.example/operate/roster/b7242a9d",
      ),
      P(
        "W6-02",
        "Resolving one item, using the control the record already has",
        `The row's status is an editable field; clicking it opens a <code>Select</code>. This proposal
         clicks that real control rather than drawing one, so the menu on screen is MUI's own — and
         adds the single option <code>R2-R</code> needs and the shipped list does not have.`,
        [
          "<strong>The three resolutions the record ships</strong>: complete, waived, not applicable",
          "<strong>And the one it does not.</strong> Reopen is the only way back from a terminal state, and it is never automatic — not on a timer, and not at a season boundary on its own. Choosing <em>Waived</em> must also stop demanding a reason, which <code>onboarding_items_waiver_is_justified</code> currently refuses to allow",
        ],
        "oxfordlancers.example/operate/roster/b7242a9d",
      ),
      P(
        "W6-03",
        "The activity log — every ask and every answer, individually",
        `Brian, 2026-09-02: the first draft's one-line-per-section summary "is just not useful… I want
         to see the individual items that come underneath, when it was asked versus when it was
         received." So this is <strong>the record's own <code>StatusHistory</code> markup</strong>,
         already on this page, with its entries replaced. <strong>LAN-105, the old Post-MVP home for
         a per-player log, is Canceled — this is its only home.</strong>`,
        [
          "<strong>One entry per event</strong>, asked and answered alike, in the pattern this page already uses for status changes",
          "<strong>An answer, against the asks above it.</strong> Four asks and one partial answer — six of ten fields — is the shape of a real chase, and no summary count shows it",
          "<strong>Asked repeatedly, claimed by the player, never confirmed by the club.</strong> That gap is the one the queue cannot see",
          "<strong>And the item whose first half is the club's own</strong>: an invitation the club sent, before any ask of the player at all",
        ],
        "oxfordlancers.example/operate/roster/b7242a9d",
      ),
    ],
  },
  {
    id: "W7",
    slug: "settle-a-disputed-fact",
    name: "Settle a disputed fact",
    grounding: "photograph",
    lede: `W5 lets a player say the club is wrong without overwriting it. This is the other half: an
      operator sees the club's value, the player's answer and the whole history, and decides —
      leaving the flag, the correction and the confirmation each attributable.`,
    legend: [
      "<strong>The surface is the person record, not the roster record.</strong> The facts a player can contest — name, contact, college, course, date of birth — are person facts, and <code>/operate/people/[personId]</code> is where they already render",
      "<strong>The record is further along than the roster one for this.</strong> It already has a Fact row per fact, a bordered <code>By</code> badge naming who supplied each value, and a history section filterable by field and by actor. <strong>A disputed fact is that row carrying a second value and a second badge</strong> — not a new component",
      "<strong>Mission 5 left this seam deliberately.</strong> <code>REQ-no-disputed</code>: \"There is no contested-value field, no verification-mark field and no confidence class anywhere below — not struck out, never added\"",
      "<strong>The losing value is retained, never deleted.</strong> Append-only, so the decision is auditable and reversible",
      "<strong>A disputed fact gates nothing and is never chased.</strong> The person has already answered; there is nothing to ask them for",
      "<strong><code>T07-merge-precedence</code> gets no screen.</strong> <code>season_messaging_consents</code> is unique per person per season, so merging two people who both consented must choose one. That is a write-time rule, and its only surface is one more line in Mission 5's existing merge comparison. <strong>Recommended: the most restrictive state wins, not the most recent</strong> — record-keeping must never manufacture permission a person declined",
    ],
    screens: [
      P(
        "W7-01",
        "A disputed fact, on the record that already shows who said what",
        `The club recorded Farrowgate; the player says Brasenose. Both values sit in the same Fact
         row, each carrying the record's own attribution badge — the same one it already uses for
         “intake form” and “display name”.`,
        [
          "<strong>The club's value and who recorded it.</strong> Both already ship; only the second value below is new",
          "<strong>The player's answer, against it.</strong> Same row, same type, same badge. Nothing is struck out and nothing is replaced until an operator decides",
        ],
        "oxfordlancers.example/operate/people/a48825ac",
      ),
      P(
        "W7-02",
        "Settled — and the superseded value kept",
        `One value stands. The other is retained rather than deleted, which is what makes the
         decision auditable and reversible, and what the frozen inventory means by “flag, correction
         and confirmation each attributable”.`,
        [
          "<strong>The value that won, and who confirmed it.</strong> The confirmation is its own attributable act, distinct from whoever originally recorded the value",
          "<strong>And the value that lost, kept.</strong> Append-only: a superseded value survives, so nothing about this decision is irreversible",
        ],
        "oxfordlancers.example/operate/people/a48825ac",
      ),
    ],
  },
  {
    id: "W8",
    slug: "work-the-queue-and-nudge",
    name: "Work the queue and nudge",
    grounding: "photograph",
    lede: `An operator opens the outstanding list on a Monday, sees who is furthest behind, when each
      was last contacted and when the machine will next write — and nudges one person or several in
      one action, each receiving only their own compiled ask.`,
    legend: [
      "<strong>Mission 5 shipped this table knowing nothing acted on it.</strong> Name, Status, To the club, Missing, Correct — sortable, and honest about who is behind. What it cannot say is whether anybody has <em>asked</em>",
      "<strong>A nudge sends the person's own compiled ask</strong>, not a new message and not a one-fact question. <code>OD7-no-targeted-ask</code> settled that the system never generates a single-field ask, so there is nothing else it could send",
      "<strong>Batch means several people, not one message to several people.</strong> Each gets their own link, and a link is scoped to one person by construction — <code>person_access_tokens</code> permits exactly one live credential per person per season",
      "<strong>Operator nudges are outside the cap.</strong> The automated chase stops after a configured number of messages that actually arrived; a human never is. The queue <em>warns</em> when the chase is exhausted rather than refusing, because that is exactly who a person should be looking at",
      "<strong>Nothing on this screen fires on a timer.</strong> <code>R4-T</code>'s trigger set is onboarding-open, the operator nudge, a standing condition, and reopen — and reopen never auto-fires",
      "<strong>LAN-93 is a dependency, not an option.</strong> The cap counts messages known to have <em>arrived</em>, so delivery callbacks are what make “the chase is exhausted” true rather than a guess. This is the screen that displays it",
    ],
    screens: [
      P(
        "W8-01",
        "The queue, with what it cannot say today",
        `Two columns and one action. A welcome sent three weeks ago and a nudge sent yesterday are not
         the same situation, and the shipped table cannot tell them apart.`,
        [
          "<strong>When they were last contacted, and what kind it was</strong> — the welcome, a follow-up, or a human nudge",
          "<strong>And when the machine will write next, or that it will not.</strong> Three rows here say it will not, and each is a different human job — W8-03 is those three",
          "<strong>The action the queue is missing.</strong> Today it can only route to Correct; it cannot ask anybody for anything",
        ],
        "oxfordlancers.example/operate/people/missing",
      ),
      P(
        "W8-02",
        "Several people, one action, and one ask each",
        `<code>T11-batch-nudge</code>. This is not a group message and cannot become one — each
         selected person receives their own compiled ask on their own link, carrying only what is
         outstanding for them.`,
        [
          "<strong>Selection</strong>, which the queue does not have today",
          "<strong>One action across the three.</strong> Three messages go out, not one — addressed individually, each carrying only that person's own outstanding items",
          "<strong>The second person's automated chase has already run out.</strong> An operator nudge is outside the cap and is not stopped by it; the queue says so rather than refusing",
        ],
        "oxfordlancers.example/operate/people/missing",
      ),
      P(
        "W8-03",
        "The three the machine will not write to again",
        `“Next: never” is not one state. Each of these is a different reason and a different human
         job, and a queue that collapsed them into a blank cell would hide all three.`,
        [
          "<strong>Exhausted.</strong> The chase stopped itself after the configured number of messages that actually arrived — and <strong>W9</strong> is what happens next",
          "<strong>Unmessageable.</strong> No basis to send, so nothing is sent — and the person is not silently dropped from the list either",
          "<strong>Terminal delivery failure.</strong> No automated email is sent in its place, and the cap is not burned by a message that never arrived",
        ],
        "oxfordlancers.example/operate/people/missing",
      ),
    ],
  },
  {
    id: "W9",
    slug: "pick-up-a-chase-that-ran-out",
    name: "Pick up a chase that ran out",
    grounding: "photograph",
    lede: `The machine has asked somebody as many times as it is allowed to and got nothing back. It
      stops, permanently, and tells a human — carrying a count and a link but <strong>no
      names</strong>. That human contacts the person themselves, and records what happened.`,
    legend: [
      "<strong>Three moments, and only two have a screen.</strong> The escalation message, the list behind its link, and the record of what the human did. The message gets no screen because it is a message — drawing one would invent a surface this application does not have",
      "<strong>The message carries no names, deliberately.</strong> It travels over a channel the club does not control the endpoint of: an officer's personal phone, possibly shared, possibly outliving their term. So it is worthless to anyone who is not already an operator — <em>3 people have stopped answering, open the queue</em> — and the names sit behind the login",
      "<strong>An office, not a person.</strong> Presidents change every year, and an escalation addressed to a person stops working the day they hand over — silently, which is the worst possible failure for the one message that exists to catch what everything else missed",
      "<strong>Exhausted means five messages that arrived.</strong> <code>T11-cap-delivered</code>: the cap counts delivery, so a message that failed does not burn a rung. Failing to reach somebody is a different state with a different escalation, on W8-03",
      "<strong>Exhaustion removes nobody.</strong> The chase stops; the person stays on the roster, their items stay outstanding, and they remain entirely welcome. Only a human restarts it, and the way they do that is W8's nudge, outside the cap",
      "<strong>Step three is deliberately outside the system.</strong> Somebody rings the player or catches them at training. The club does not need software to have a conversation — it needs to remember the conversation happened",
    ],
    screens: [
      P(
        "W9-01",
        "Where the link lands",
        `The same queue W8 works, scoped to the people whose chase has run out. <strong>Names appear
         here because here is behind a login</strong> — that contrast with the message is the whole
         privacy design.`,
        [
          "<strong>The count the message carried was 3.</strong> This is the 3, and it is the first place they have names",
          "<strong>Five delivered messages, none answered.</strong> Someone who received them and did not reply — not someone the club failed to reach, which is a different state entirely",
          "<strong>And the one control that restarts it.</strong> Only a human, and outside the cap",
        ],
        "oxfordlancers.example/operate/people/missing",
      ),
      P(
        "W9-02",
        "What the human did, on the record",
        `The record's own history markup — the same one W6's activity log uses — carrying the last
         permitted message, the chase stopping itself, the conversation in the car park, and what
         came of it.`,
        [
          "<strong>The last message the machine was allowed to send</strong>, and that it arrived",
          "<strong>The chase stopping itself, and the escalation going out.</strong> The count is on the record even though it was never in the message",
          "<strong>The part that happened in a car park.</strong> A human, a date, and what they did — the thing that would otherwise exist nowhere",
          "<strong>And what came of it</strong>, which is the only reason any of this exists",
        ],
        "oxfordlancers.example/operate/roster/b7242a9d",
      ),
    ],
  },
  {
    id: "W10",
    slug: "activate-a-player",
    name: "Activate a player",
    grounding: "photograph",
    lede: `The committee decides somebody is properly part of the team. An operator says so, and they
      become active. <strong>That is all it is</strong> — and almost all of it already ships.`,
    legend: [
      "<strong>The flip ships.</strong> <code>setMembershipStatus</code> exists, the Season section's Status field is an editable select carrying all five statuses, and every flip is written append-only to <code>season_membership_status_events</code>",
      "<strong>Mission 5 already considered the one thing this workflow might have added, and withdrew it.</strong> From <code>membership.ts</code>'s own header: the transition table was removed on Brian's <code>Q-12</code> decision — \"we can flip to whatever status we want to go in\" — and <em>\"a warn-only confirmation on <code>onboarding → active</code> was proposed and then withdrawn in the same walkthrough\"</em>. That is this exact transition",
      "<strong>So W10 adds no control.</strong> <code>OD7-activation-flips</code> says the same from this mission's side: activation just flips them to active",
      "<strong>“Outstanding shown as context” is already true.</strong> The Onboarding section sits directly above the Season section on the same page. Re-presenting it inside the status control would be the withdrawn confirmation wearing a different hat",
      "<strong>Activation completes, waives and closes nothing.</strong> Every outstanding item stays outstanding and stays chased by W8 — <code>R3</code> makes an active player with an unfinished checklist the <em>normal</em> case",
      "<strong>Nothing derives it.</strong> W6's \"ready to activate\" is display-only and never flips a membership on its own (<code>R3-C</code>)",
    ],
    screens: [
      P(
        "W10-01",
        "Activation, on the control that already ships",
        `Two things on one page, and neither is new: the checklist, and the status field. The whole
         design of this workflow is the decision not to put anything between them.`,
        [
          "<strong>The context, and it is the page.</strong> Every item and its state, directly above the control — no summary, no confirmation, no repetition inside the dialog",
          "<strong>The control, unchanged.</strong> The application's own select, carrying the five statuses this record has been able to flip between since <code>Q-12</code> removed the transition table",
        ],
        "oxfordlancers.example/operate/roster/b7242a9d",
      ),
      P(
        "W10-02",
        "Active, with an unfinished checklist",
        `<code>R3</code>: the normal case, not an exception. The point of this screen is what is
         <em>absent</em> from it — no warning, no blocked action, nothing flagged.`,
        [
          "<strong>Still three of seven, the day after activation.</strong> Becoming active resolved, waived and closed nothing",
          "<strong>And the alert still names what is outstanding</strong>, in the same words it used while they were onboarding. The chase carries on exactly as it did the day before",
          "<strong>Active.</strong> The only gate this mission has, and it gates squad membership rather than anything a checklist could withhold",
        ],
        "oxfordlancers.example/operate/roster/b7242a9d",
      ),
    ],
  },
  {
    id: "W11",
    slug: "set-onboardings-chase",
    name: "Set onboarding's chase",
    grounding: "photograph",
    lede: `The onboarding checklist is one packet. This workflow says <strong>how many times the club
      chases somebody about it, how often, and how long before the chase gives up</strong> — and
      nothing else.`,
    legend: [
      "<strong>The previous draft of this workflow had the wrong target and was removed.</strong> Brian, 2026-09-02: \"We're not taking the individual items and bringing them to operators. Only the core four ever make changes in here… It should just define how many times we are going to chase them, how often we are going to chase them, and how long before the chase exhausts. That's it.\" The inventory went from twelve workflows to eleven",
      "<strong>The checklist is fixed.</strong> It is the approved item-and-ask inventory, and nobody turns items on or off. <code>R1</code> and <code>R2-V2</code> are superseded",
      "<strong>Nobody is assigned an item.</strong> Only the four-role group resolves anything — <code>R2</code> superseded. \"If the kit operator needs to go off and do something with a kit, they can go and run that on their own\"",
      "<strong>Verification behaviour survives</strong> as a property of each item in the approved inventory rather than a setting, so W6 stands as approved: BUCS Play is still claimed then confirmed",
      "<strong>There are no quiet hours.</strong> Brian, 2026-09-02 — that half of <code>T11-suppression</code> is out, and the shipped page already says so in its own standing note",
      "<strong>The cap counts messages that arrived.</strong> A failure consumes nothing, which is what makes “the chase is exhausted” a fact rather than a guess — and why LAN-93 is a dependency rather than an option",
    ],
    screens: [
      P(
        "W11-01",
        "Onboarding's chase, on the club's messaging schedule",
        `Three numbers and an office. That is the entire configuration this mission has, now the
         checklist itself is settled by the approved inventory.`,
        [
          "<strong>How many times.</strong> The cap, counted only when a message actually arrives",
          "<strong>How often, and how long before it gives up.</strong> Then it stops for good and a person takes over — which is W9",
          "<strong>The escalation office.</strong> W9 depends on this and nothing else sets it. An office rather than a person, because presidents change every year",
          "<strong>Beside the recruit ladder</strong>, which is Mission 6's and which this mission does not touch",
        ],
        "oxfordlancers.example/operate/admin/messaging",
      ),
      P(
        "W11-02",
        "Where this actually lives, and why that is a decision",
        `<code>messaging_schedules</code> is keyed by <code>event_type</code>. Mission 6 added the
         recruit ladder to it as two columns, and <strong>both are null on all five rows</strong>,
         because recruitment's cadence has nothing to do with practices or games. This photographs
         the table as it really is, so the shape question is visible rather than described.`,
        [
          "<strong>The grain.</strong> Every row is an event type, and the club's recruitment cadence is not a property of a practice",
          "<strong>The two columns Mission 6 added</strong>, null on all five rows because there is no event they belong to",
          "<strong>The same emptiness on every row.</strong> Four more columns for onboarding would repeat it five times over. <strong>Recommended: a small table of its own</strong> — one row of club policy, keyed by nothing",
        ],
        "oxfordlancers.example/operate/admin/messaging",
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
        /* NOT \`contain\`. Scroll chaining is what lets the page keep moving once
           a shot reaches its own end; \`contain\` froze the page wherever the
           cursor sat over a frame, which on a five-screen review is almost
           everywhere. Brian, 2026-09-01: "W403 through W405 are not on this
           page." They were on it; they could not be reached. */
        overscroll-behavior: auto;
        position: relative;
      }
      /* And a way to reach any screen without scrolling to it at all. */
      .screenindex {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: baseline;
        margin: 22px 0 8px;
        padding: 12px 14px;
        background: #f4f7f6;
        border-left: 3px solid #00695c;
        border-radius: 0 4px 4px 0;
        font-size: 12.5px;
      }
      .screenindex strong {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
        color: rgba(0, 0, 0, 0.55);
        margin-right: 4px;
      }
      .screenindex a {
        color: #00695c;
        text-decoration: none;
        border: 1px solid rgba(0, 105, 92, 0.35);
        border-radius: 4px;
        padding: 3px 9px;
        background: #fff;
      }
      .screenindex a:hover { background: #00695c; color: #fff; }
      section.screen { scroll-margin-top: 12px; }
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

  // An index built from whatever actually rendered, so it can never list a
  // screen the page does not have.
  out = out.replace(
    "</body>",
    `    <script>
      (function () {
        var host = document.getElementById("screens");
        if (!host) return;
        var sections = [].slice.call(host.querySelectorAll("section.screen"));
        if (!sections.length) return;
        var nav = document.createElement("nav");
        nav.className = "screenindex";
        var parts = ["<strong>Screens<\\/strong>"];
        sections.forEach(function (section) {
          var tab = section.querySelector(".tab");
          var id = (tab ? tab.textContent : "").trim();
          if (!id) return;
          if (!section.id) section.id = id;
          parts.push('<a href="#' + id + '">' + id + '<\\/a>');
        });
        nav.innerHTML = parts.join("");
        host.parentNode.insertBefore(nav, host);
      })();
    <\/script>
  </body>`,
  );

  // Formatted on the way out, for the same reason build-proposals.mjs is.
  const target = path.join(OUT, `${wf.id}-${wf.slug}.html`);
  writeFileSync(
    target,
    await format(out, { ...(await resolveConfig(target)), parser: "html", filepath: target }),
  );
}
console.log(`built ${WORKFLOWS.length} review pages`);
