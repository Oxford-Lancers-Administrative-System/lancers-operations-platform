const STATUS = "Scheduled 6 Nov 14:00";
// Event detail, after approval: the event message as its own section after
// the messaging plan, cloned from the page's Questions section, with the
// rendered brief and its status value. The plan disclosure counts it too.
// Event: Sun 8 Nov 14:00. 48 hours before = Fri 6 Nov 14:00; now is 16 Oct,
// so the status is Scheduled.
(() => {
  const SAMPLE = `# GAMEDAY vs Cambridge
Varsity Bowl XVII. Please read everything.

> THIS IS THE REAL THING. Come prepared to play full out and leave everything out on the pitch.

## Attire
Shirt, team tie, chinos. **BLUES BLAZERS!**

## Meeting point
Iffley Road pickup location

## Itinerary
- 8:30 AM Arrive at Iffley Road pickup location
- 8:45 AM Bus leaves for Cambridge
- 11:15 AM Team walkthroughs
- 2:00 PM Kick-off
- 5:00 PM Match ends

> Respond to this event ASAP so we know who to expect on the bus.

## What to bring
- **BOD card (must bring)**
- **MOUTHGUARD (don't forget!)**
- Helmet
- Shoulder pads
- Cleats`;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  function render(md) {
    const NAVY = "#0a1f44";
    const GOLD = "#c9a227";
    const out = [];
    let list = null;
    let rows = null;
    const flush = () => {
      if (list)
        out.push(
          `<ul style="margin:0 0 14px;padding-left:22px;list-style:disc">${list.join("")}</ul>`,
        );
      if (rows)
        out.push(
          `<table style="border-collapse:collapse;width:100%;margin:0 0 14px">${rows.join("")}</table>`,
        );
      list = null;
      rows = null;
    };
    for (const raw of md.split("\n")) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) {
        flush();
        continue;
      }
      if ((m = line.match(/^- (\d{1,2}:\d{2}\s?(?:AM|PM)?)\s+(.*)$/i))) {
        if (list) flush();
        rows ??= [];
        rows.push(
          `<tr><td style="font-weight:700;white-space:nowrap;vertical-align:top;padding:4px 14px 4px 0;border-bottom:1px solid #eee">${esc(m[1])}</td><td style="padding:4px 0;border-bottom:1px solid #eee">${inline(m[2])}</td></tr>`,
        );
        continue;
      }
      if ((m = line.match(/^- (.*)$/))) {
        if (rows) flush();
        list ??= [];
        list.push(`<li style="margin:2px 0;display:list-item">${inline(m[1])}</li>`);
        continue;
      }
      flush();
      if ((m = line.match(/^## (.*)$/)))
        out.push(
          `<h3 style="color:${NAVY};font-size:20px;font-weight:700;margin:20px 0 10px;padding-bottom:4px;border-bottom:2px solid ${GOLD}">${inline(m[1])}</h3>`,
        );
      else if ((m = line.match(/^# (.*)$/)))
        out.push(
          `<h2 style="color:${NAVY};font-size:30px;line-height:1.15;font-weight:800;margin:0 0 8px">${inline(m[1])}</h2>`,
        );
      else if ((m = line.match(/^> (.*)$/)))
        out.push(
          `<div style="background:#fdf5d3;border-left:4px solid ${GOLD};padding:10px 12px;margin:0 0 14px;border-radius:2px">${inline(m[1])}</div>`,
        );
      else out.push(`<p style="margin:0 0 12px">${inline(line)}</p>`);
    }
    flush();
    return `<div style="background:#fff;color:#1a1a1a;font:17px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;padding:20px">${out.join("")}</div>`;
  }

  const plan = document.querySelector('[data-testid="section-messaging-plan-disclosure"]');
  const heading = plan.querySelector("h2");
  heading.textContent = heading.textContent.replace(
    /(\d+) steps/,
    (_, n) => `${Number(n) + 1} steps`,
  );
  const rows = Array.from(plan.querySelectorAll('[data-testid="plan-row"]'));
  if (rows.length) {
    const last = rows[rows.length - 1];
    const row = rows[0].cloneNode(true);
    row.removeAttribute("data-testid");
    row.className = last.className;
    last.className = rows[0].className;
    const [when, side] = row.querySelectorAll("span");
    const [title, detail] = row.querySelectorAll("p");
    when.textContent = "Fri 6 Nov · 14:00";
    title.textContent = "Event message";
    detail.textContent = "48 hours before · WhatsApp and email · Everyone invited";
    side.textContent = "38 people";
    last.after(row);
  }

  const source = document.querySelector('[data-testid="section-event-questions"]');
  const section = source.cloneNode(true);
  section.removeAttribute("data-testid");
  section.querySelector("h2").textContent = "Event messages";
  const items = Array.from(section.querySelectorAll("li"));
  items.slice(1).forEach((n) => n.remove());
  const item = items[0];
  item.removeAttribute("data-testid");
  item.querySelector("div p").textContent = "Event message 1";
  item.querySelector("div span").textContent = STATUS;
  item.querySelector(":scope > p").textContent =
    "48 hours before · WhatsApp and email · Everyone invited";
  const paper = document.createElement("div");
  paper.style.cssText =
    "margin-top:12px;max-width:420px;border:1px solid rgba(0,0,0,0.23);border-radius:8px;overflow:hidden;background:#fff";
  paper.innerHTML = render(SAMPLE);
  item.appendChild(paper);
  plan.after(section);
})();
