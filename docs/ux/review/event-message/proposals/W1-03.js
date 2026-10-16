// The event message joins the approval review's messaging plan as one more
// row, cloned from the plan's own rows and placed in time order.
// Event: Sun 8 Nov 14:00. 48 hours before = Fri 6 Nov 14:00.
(() => {
  const plan = document.querySelector('[data-testid="section-messaging-plan-disclosure"]');
  const heading = plan.querySelector("h2");
  heading.textContent = heading.textContent.replace(
    /(\d+) steps/,
    (_, n) => `${Number(n) + 1} steps`,
  );
  const rows = Array.from(plan.querySelectorAll('[data-testid="plan-row"]'));
  const last = rows[rows.length - 1];
  const row = rows[0].cloneNode(true);
  row.removeAttribute("data-testid");
  row.className = last.className; // the final row's style (no rule beneath)
  last.className = rows[0].className;
  const [when, side] = row.querySelectorAll("span");
  const [title, detail] = row.querySelectorAll("p");
  when.textContent = "Fri 6 Nov · 14:00";
  title.textContent = "Event message";
  detail.textContent = "48 hours before · WhatsApp and email · Everyone invited";
  side.textContent = "38 people";
  last.after(row);
})();
