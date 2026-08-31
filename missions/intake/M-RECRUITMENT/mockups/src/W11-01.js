// W11-01 — Before you approve: what this event sends, to whom, on which ladder.
// Today the approval summary states one number and omits recruits from it.
const box = proposedBlock("teal");
blockTitle(box, "Before you approve — who this reaches, and what they get");
const table = document.createElement("div");
table.style.cssText =
  "display:grid;grid-template-columns:auto 1fr;gap:8px 18px;margin-top:10px;font-size:13.5px";
const line = (who, what) => {
  const a = document.createElement("div");
  a.textContent = who;
  a.style.cssText = "font-weight:700;white-space:nowrap";
  const b = document.createElement("div");
  b.textContent = what;
  table.append(a, b);
};
line("18 players", "Invitation now · reminder at 48h · escalation to the President 24h before");
line("6 recruits", "Invitation now · one polite follow-up at 48h · then nothing, ever");
line("4 coaches", "Invitation now · reminder at 48h");
box.append(table);
blockText(box, "Two ladders on one event. Each audience is chased on its own terms.");
const anchor = cardTemplate();
anchor?.parentElement?.insertBefore(box, anchor);

const defect = proposedBlock("amber");
blockTitle(defect, "What this fixes, verified in the running code");
blockText(
  defect,
  "scheduleEventLadder inserts a reminder for every invitation on the event, filtered only by " +
    "event_id — so a recruit invited today receives the player escalation ladder. And " +
    "countByCapacity omits recruits from these counts, so an operator approves without being " +
    "told how many recruits it reaches.",
);
anchor?.parentElement?.insertBefore(defect, anchor);
