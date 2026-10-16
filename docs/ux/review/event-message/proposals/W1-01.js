const EMPTY = false;
const SEND_AT = "Fri 6 Nov · 14:00";
// Event message section, injected into the live event form after the
// questions section and before the ActionBar. Every element is a clone of a
// node already on the page (section, field group, text field, selects,
// icon buttons, outlined button), so it wears the application's own styling.
// Only the rendered brief carries its own styles: it is the rendered brief the
// player receives as an image, with the look Brian approved.
(async () => {
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

  // Round 1 (Brian): the preview is a full-width "Preview" disclosure below the
  // box, at the size the player receives it — the 900px-wide render scaled to
  // the column. The disclosure is the app's own collapsible Section, cloned
  // from the messaging plan (fetched, with its styles, from an approved
  // event's page when this page does not render one).
  const DISCLOSURE_SOURCE = "/operate/events/dc59ab3d-861c-42a0-ab30-51023527d057";
  async function nativeDisclosure() {
    let source = document.querySelector('[data-testid="section-messaging-plan-disclosure"]');
    if (!source) {
      const html = await (await fetch(DISCLOSURE_SOURCE, { credentials: "same-origin" })).text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc
        .querySelectorAll("style[data-emotion]")
        .forEach((style) => document.head.appendChild(document.importNode(style, true)));
      source = doc.querySelector('[data-testid="section-messaging-plan-disclosure"]');
    }
    const disclosure = document.importNode(source, true);
    disclosure.removeAttribute("data-testid");
    disclosure.setAttribute("open", "");
    disclosure.querySelector("h2").textContent = "Preview";
    const body = disclosure.querySelector(":scope > div");
    body.replaceChildren();
    return { disclosure, body };
  }
  function scaledBrief(host) {
    const inner = document.createElement("div");
    inner.style.cssText = "width:900px;transform-origin:0 0";
    inner.innerHTML = render(SAMPLE);
    const frame = document.createElement("div");
    frame.style.cssText =
      "overflow:hidden;border:1px solid rgba(0,0,0,0.23);border-radius:8px;background:#fff";
    frame.appendChild(inner);
    host.appendChild(frame);
    return () => {
      const scale = frame.clientWidth / 900;
      inner.style.transform = `scale(${scale})`;
      frame.style.height = `${Math.ceil(inner.offsetHeight * scale)}px`;
    };
  }

  const ICONS = {
    Heading: "M5 4v3h5.5v12h3V7H19V4z",
    Bold: "M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42M10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5",
    Bullet:
      "M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5m0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5m0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5M7 19h14v-2H7zm0-6h14v-2H7zm0-8v2h14V5z",
    "Itinerary line":
      "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8m.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
  };

  const questions = $('[data-testid="section-question-editor"]');
  const section = questions.cloneNode(true);
  section.removeAttribute("data-testid");
  $$("input[type=hidden]", section).forEach((n) => n.remove());
  $("h2", section).textContent = "Event messages";
  $("p", section)?.remove();
  $('[data-testid="recruit-questions-notice"]', section)?.remove();

  const ol = $("ol", section);
  const cards = $$("li", ol);
  const card = cards[0];
  cards.slice(1).forEach((n) => n.remove());

  const addButton = $('[data-testid="add-question"]', section);
  addButton.textContent = "Add event message";
  addButton.removeAttribute("data-testid");

  let fitPreview = null;
  if (EMPTY) {
    card.remove();
    ol.remove();
  } else {
    $("legend", card).textContent = "Event message 1";
    $$(
      '[data-testid="move-question-up"],[data-testid="move-question-down"],[data-testid="from-template-chip"]',
      card,
    ).forEach((n) => n.remove());

    const stack = $("fieldset > .MuiStack-root", card);
    const textField = $(".MuiTextField-root", stack); // the Question field
    const selectRow = textField.nextElementSibling; // Answer / Answering it
    const helperSource = $('[data-field="description"] .MuiFormHelperText-root');

    // Row: Hours before · Channel · Recipients
    const hours = textField.cloneNode(true);
    $("label", hours).textContent = "Hours before";
    $("legend span", hours).textContent = "Hours before";
    const hoursInput = $("input", hours);
    hoursInput.setAttribute("type", "number");
    hoursInput.setAttribute("value", "48");
    hoursInput.value = "48";
    const hoursHelp = helperSource.cloneNode(true);
    hoursHelp.removeAttribute("id");
    hoursHelp.textContent = SEND_AT;
    hours.appendChild(hoursHelp);

    const [channel, recipients] = $$(".MuiTextField-root", selectRow);
    const setSelect = (field, label, value) => {
      $(".MuiInputLabel-root", field).textContent = label;
      $("legend span", field).textContent = label;
      $('[role="combobox"]', field).textContent = value;
    };
    setSelect(channel, "Channel", "Both");
    setSelect(recipients, "Recipients", "Everyone invited");
    selectRow.insertBefore(hours, channel);
    textField.replaceWith(selectRow);

    // Toolbar: four icon buttons, cloned from the card's own icon button.
    const iconSource = $('[data-testid="move-question-down"]', questions);
    const toolbar = $(".MuiStack-root", stack).cloneNode(false); // the card's control row
    toolbar.style.justifyContent = "flex-start";
    for (const [label, path] of Object.entries(ICONS)) {
      const b = iconSource.cloneNode(false);
      b.removeAttribute("data-testid");
      b.setAttribute("aria-label", label);
      b.setAttribute("title", label);
      b.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="${path}"></path></svg>`;
      toolbar.appendChild(b);
    }

    // Message body: the Question text field again, with a textarea.
    const body = textField.cloneNode(true);
    $("label", body).textContent = "Message";
    $("legend span", body).textContent = "Message";
    const input = $("input", body);
    const ta = document.createElement("textarea");
    ta.className = input.className;
    ta.value = SAMPLE;
    ta.style.cssText = "resize:none;overflow:hidden";
    input.replaceWith(ta);
    $(".MuiInputBase-root", body).classList.add("MuiInputBase-multiline");

    const editorCol = document.createElement("div");
    editorCol.style.cssText = "display:flex;flex-direction:column;gap:4px;min-width:0";
    editorCol.append(toolbar, body);

    const { disclosure, body: previewBody } = await nativeDisclosure();
    fitPreview = scaledBrief(previewBody);
    stack.append(editorCol, disclosure);
  }

  questions.after(section);
  const ta = section.querySelector("textarea");
  if (ta) {
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight + 4}px`;
  }
  if (fitPreview) fitPreview();
})();
