/** LAN-297: local, self-contained manual test sheet. No captured links or credentials. */
import fs from "node:fs";
const base = ".lancers-runtime";
const m = JSON.parse(fs.readFileSync(base + "/small-squad/manifest.json"));
const recruitsFile = base + "/small-squad/recruits.json";
const addedRecruits = fs.existsSync(recruitsFile)
  ? JSON.parse(fs.readFileSync(recruitsFile, "utf8"))
  : [];
const panel = JSON.parse(fs.readFileSync(base + "/panel-runtime.json")).url;
const app = "http://localhost:3101";
const esc = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const link = (url, label) =>
  `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
const date = (s) =>
  new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
const eventLink = (i) => app + "/operate/events/" + m.events[i].id;
const cases = [
  [
    "01",
    "Invitations and quick answers",
    eventLink(0),
    "Open Week 1 practice. Review its 14-person audience, then approve it. Open the test panel and advance by 1 hour. Filter the message timeline to this event and open individual messages.",
    "12 SMS invitations can be delivered in simulation. Norbert and Osgood have no phone and use email fallback. The six quick Yes/No players plus Rowan (coach) answer after one simulated minute. Peregrine is the escalation recipient and is not in the event audience.",
  ],
  [
    "02",
    "Reminders and delayed answers",
    eventLink(0),
    "After case 01, advance by 24 hours, then by 12 hours. Check the message times and the Responses tab. Later advance another 24 hours.",
    "Hollis answers Yes after 30 hours, Ignatius No after 36 hours, and Jarrah Yes after 60 hours, measured from their captured message. Kestrel and Lysander remain silent. Required-only and partial profiles leave the optional organiser note blank.",
  ],
  [
    "03",
    "President escalation",
    eventLink(0),
    "Continue case 02 until the test clock is beyond the escalation time shown on the event’s messaging plan. With the initial practice, 84 total hours from the clean starting clock covers it. Filter messages to Peregrine.",
    "A mandatory-event nonresponse escalation goes to President Peregrine Ashcombe. There are four unanswered invitees: Kestrel, Lysander, Norbert and Osgood. The observed proof reached 7 Yes and 3 No current RSVPs.",
  ],
  [
    "04",
    "Change an invited event",
    app + "/operate/events/" + m.events.find((e) => e.name === "Week 2 practice").id,
    "Open Week 2 practice, approve it, and advance until its invitations have been captured. Change the venue or start time using the app’s amendment flow. Review and approve the change where requested.",
    "Inspect each change message and who receives it. Confirm that its copy and time match the change you made. Record any missing, duplicate or wrongly addressed message below.",
  ],
  [
    "05",
    "Cancel an invited event",
    eventLink(3),
    "Open Week 3 practice, approve it and advance until invitations are captured. Cancel it in the app and run the panel again.",
    "Inspect the cancellation messages and their audience. Future reminders should not continue for the cancelled event. A cancelled reminder after an RSVP is different from a cancelled event: always check the message type.",
  ],
  [
    "06",
    "Optional event",
    app + "/operate/events/" + m.events.find((e) => e.eventType === "social").id,
    "Approve Optional squad social. Advance through the invitation, response deadline and escalation checkpoint shown in its plan.",
    "Compare optional-event chasing with mandatory practice. Check the actual recipients and messages against the app’s configured policy; do not count a draft or a captured email as delivered.",
  ],
  [
    "07",
    "Manual onboarding",
    app + "/operate/roster/new",
    "Add a new returning player yourself. Supply their contact details and consent through the normal flow. Open the captured welcome link in the panel and have a human complete the forms. Leave another new person unfinished to inspect onboarding chases.",
    "No simulator fills any onboarding field or agreement. Existing seeded players begin complete; the two missing phone numbers are deliberate contact exceptions. New records default to no automatic response.",
  ],
  [
    "08",
    "Manual recruitment",
    app + "/operate/recruitment",
    "Add a recruit in Recruitment, or open the recruitment QR/signup route and enter their details manually. Follow their captured messages and complete the recruitment forms yourself. Create a recruitment event when you reach the event-invitation stage.",
    "Recruitment forms stay manual. To simulate a recruit’s event RSVP, explicitly mark that test person synthetic in the panel and select an event response profile. The event response restriction still prevents automatic recruitment form submission.",
  ],
  [
    "09",
    "Missing contact and recovery",
    app + "/operate/roster",
    "Find Norbert or Osgood. Inspect their event delivery attempts first. Then give one a valid fictional number in the app before another dispatch attempt.",
    "Before the repair, SMS cannot send and email is captured as fallback. After the repair, confirm the new destination in the panel and check a fresh delivery. New valid contacts work without a recipient allowlist refresh; actual SMS delivery still requires explicit per-person selection in the panel.",
  ],
];
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lancers · Small squad SMS walkthrough</title>
<style>body{font:16px/1.55 system-ui,sans-serif;color:#17243b;background:#f3f6fa;margin:0}main{max-width:1100px;margin:auto;padding:28px 20px 70px}h1{font-size:32px;line-height:1.2}h2{margin-top:32px}a{color:#1754a4;overflow-wrap:anywhere}nav{display:flex;gap:16px;flex-wrap:wrap}.box,article{background:white;border:1px solid #d6dfeb;border-radius:12px;padding:20px;margin:16px 0}article h3{margin-top:0}.muted{color:#516078}.badge{display:inline-block;background:#e8f0ff;border-radius:5px;padding:3px 9px;margin:3px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;border-bottom:1px solid #dce3ed;padding:10px;vertical-align:top}.scroll{overflow:auto}textarea{display:block;box-sizing:border-box;width:100%;min-height:65px;margin:8px 0;padding:10px;font:inherit;border:1px solid #9eacc0;border-radius:6px}select,button{font:inherit;padding:7px 10px}label{font-weight:600}.events{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}.events div{border:1px solid #dce3ed;padding:12px;border-radius:7px}small{display:block}@media print{body{background:white}nav,button{display:none}article{break-inside:avoid}textarea{border:0}.box{border:0}}@media(max-width:450px){main{padding:18px 12px}h1{font-size:26px}.box,article{padding:14px}}</style>
<main><p class="muted">LAN-297 · Manual local testing · ${date(m.today)}–${date(m.through)}</p><h1>Your small SMS test squad</h1><p><strong>Remote app:</strong> <a href="https://marvel-indiscernible-daxton.ngrok-free.dev" target="_blank" rel="noopener">https://marvel-indiscernible-daxton.ngrok-free.dev</a>. Operator access requires a login; personal forms use their captured links.</p><nav>${link(app + "/operate/events", "Open app")}${link(panel, "Open SMS panel")}<a href="#tests">Test steps</a><a href="#people">People and replies</a><a href="#events">Event URLs</a><button onclick="window.print()">Print / save PDF</button></nav>
<div class="box"><span class="badge">${15 + addedRecruits.length} synthetic people</span><span class="badge">13 synthetic players + coach + President</span><span class="badge">12 draft events</span><span class="badge">10 mandatory · 2 optional</span><p><strong>Start with case 01 below.</strong> All events start as drafts with their audience prepared. The four real recruits have no messages queued. Brian sends their personal questionnaires manually. Approve an event to begin its normal invitation flow. Test time starts today and advances only when you use the panel.</p><p>Simulated people answer <strong>event RSVPs and event questions only</strong>. You and your team fill out recruitment and onboarding forms. Synthetic people remain intercepted. The four real recruits are selected for actual SMS delivery; “simulated delivered” never means delivery to a real phone.</p><p>App: ${link(app, app)}<br>Messages and clock: ${link(panel, panel)}<br>Manual sheet: ${link("http://127.0.0.1:52904", "http://127.0.0.1:52904")}</p></div>
${m.realPeople?.length ? `<div class="box"><h2>Real recruits</h2><p>${m.realPeople.map((p) => esc(p.given + " " + p.family)).join(", ")}. Names and supplied phone numbers are preserved. Other details remain blank. These four are recruits with real SMS delivery enabled and automatic responses off. Brian triggers questionnaires and moves them onto the roster when ready.</p></div>` : ""}
${addedRecruits.length ? `<div class="box"><h2>Six added recruits</h2><p>The original 15-person squad now has six additional synthetic people. Forms remain manual. The Joined recruit also has an onboarding membership.</p><ul>${addedRecruits.map((p) => `<li>${link(app + "/operate/recruitment/" + p.prospectId, p.name)} — <strong>${esc(p.status)}</strong>. ${esc(p.note)}</li>`).join("")}</ul></div>` : ""}<h2 id="tests">What to do and what to expect</h2><p>Work down the first three cases on Week 1 practice. Later cases use separate events. Advancing time is global: it moves every approved event and every unfinished onboarding/recruitment flow.</p>
${cases.map(([id, title, url, action, expected]) => `<article id="case-${id}"><h3>${id} · ${esc(title)}</h3>${link(url, "Open this screen")}<p><strong>Do:</strong> ${esc(action)}</p><p><strong>Look for:</strong> ${esc(expected)}</p><label for="result-${id}">Your result </label><select id="result-${id}" data-save="${id}-result"><option>Not tested</option><option>Passed</option><option>Failed</option><option>Blocked</option></select><label for="notes-${id}"><small>What actually happened / issue number</small></label><textarea id="notes-${id}" data-save="${id}-notes" placeholder="Record messages, recipients and times you observed."></textarea></article>`).join("")}
<h2 id="people">People and expected replies</h2><p>All 15 have fictional email addresses under <code>squad.example</code>. The President receives escalations; the other 14 are in each prepared event audience.</p><div class="box scroll"><table><thead><tr><th>Person / role</th><th>Contact</th><th>Event behaviour</th><th>Questions on Yes</th></tr></thead><tbody>${m.people.map((p) => `<tr><td>${esc(p.given + " " + p.family)}<small>${esc(p.role)}</small></td><td>${esc(p.phone ?? "No phone — email fallback")}<small>${esc(p.email)}</small></td><td>${p.role === "President" ? "Escalation recipient" : p.responder === "never" ? "No automatic reply" : (p.responder === "prompt" ? "1 minute" : p.delayHours + " hours") + " → " + p.eventAnswer.toUpperCase()}</td><td>${p.eventAnswer === "no" || p.responder === "never" || p.role === "President" ? "—" : esc(p.completion)}</td></tr>`).join("")}</tbody></table></div>
<h2 id="events">Every event URL</h2><div class="events">${m.events.map((e) => `<div>${link(app + "/operate/events/" + e.id, e.name)}<small>${date(e.scheduledOn)} · 18:00–20:00 UK time</small><small>${e.mandatory ? "Mandatory" : "Optional"} · Draft</small>${link(app + "/operate/events/" + e.id + "/delivery", "Delivery details")}</div>`).join("")}</div>
<h2>Configured timing</h2><p>These are the current settings. Approval freezes the event’s actual plan; use that plan for exact dates, especially when approving late. Reminder opportunities are suppressed when the application considers them unnecessary.</p><div class="box scroll"><table><thead><tr><th>Type</th><th>Invite before event</th><th>RSVP deadline before event</th><th>Reminders</th><th>Escalation</th></tr></thead><tbody>${m.schedules.map((s) => `<tr><td>${esc(s.event_type.replaceAll("_", " "))}</td><td>${s.invitation_lead_days} days</td><td>${s.rsvp_by_days} days</td><td>Every ${s.reminder_cadence_hours}h; ${s.whatsapp_reminder_count} text, ${s.email_reminder_count} email</td><td>${s.escalation_hours}h after deadline, when applicable</td></tr>`).join("")}</tbody></table></div>
<h2>What has already been checked</h2><div class="box"><p>Before restoring this clean run, one mandatory practice was exercised through 84 simulated hours: 7 current Yes replies, 3 No replies, 4 unanswered invitees, and a completed escalation addressed to the President. No recruitment form answers or onboarding activity were generated. Twenty-two targeted tests and type checking passed.</p><p><strong>Still to test manually:</strong> cancellation, amendments, optional-event policy, new recruitment and onboarding journeys. Email fallback was captured and accepted locally; no email delivery receipt was proven.</p><p><strong>Known finding:</strong> late profiles may repeat their RSVP after a reminder. ${link("https://linear.app/brian-schuster/issue/LAN-298", "LAN-298 tracks it")}. The test panel’s full message wording also depends on the available template copy; a capture is the exact text sent.</p><p>New valid contacts are permitted in this local test environment without refreshing recipient allowlists. Messages are intercepted unless actual SMS delivery is explicitly selected for that person in the panel. Standard database reset commands restore the large dataset, so ask for the <strong>small-squad reset</strong> when you want to repeat this run.</p></div>
<p class="muted">Your results save in this browser on this local URL. The sheet does not submit forms or advance the app. Prior detailed audit files and findings have been retained privately.</p></main>
<script>const key='lan297-small-squad-${m.seasonId}';let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch{};for(const field of document.querySelectorAll('[data-save]')){if(saved[field.dataset.save]!==undefined)field.value=saved[field.dataset.save];field.addEventListener('input',()=>{saved[field.dataset.save]=field.value;try{localStorage.setItem(key,JSON.stringify(saved))}catch{}})}</script></html>`;
fs.writeFileSync(base + "/small-squad/index.html", html);
if (!fs.existsSync(base + "/manual-audit/previous-index.html"))
  fs.copyFileSync(base + "/manual-audit/index.html", base + "/manual-audit/previous-index.html");
fs.writeFileSync(base + "/manual-audit/index.html", html);
console.log("Updated local HTML guide: http://127.0.0.1:52904");
