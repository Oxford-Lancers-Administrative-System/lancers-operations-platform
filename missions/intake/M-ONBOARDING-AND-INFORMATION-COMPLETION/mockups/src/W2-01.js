// W2-01 — The form, with the required set the club actually uses.
//
// Route: /operate/roster/new, which exists. Unlike W1 this workflow builds no
// surface; both sides are the same shipped page, differing by two things.
selectRosterNav();

// Assert the page before touching it. The shell carries a form of its own, so
// `$("form")` matched that one and found no fields — a failure that reads as
// "the form is empty" when the truth is "this is the wrong form".
must(
  $$("h1, h2").find((h) => /add player/i.test(h.textContent)),
  "this is not the add-player page",
);
const fields = $$(".MuiTextField-root");
must(fields, "the add-player page has no text fields");
const form = must(fields[0].closest("form"), "the fields are not inside a form");

const labelOf = (field) => field.querySelector("label");

/** Mark a field required the way MUI does: an asterisk in the label. */
const requireField = (field, note) => {
  const label = must(labelOf(field), "a field has no label to mark required");
  if (!/\*/.test(label.textContent)) {
    const star = document.createElement("span");
    star.textContent = " *";
    star.style.color = "#d32f2f";
    label.append(star);
  }
  if (note) {
    const help = document.createElement("p");
    help.className = "MuiFormHelperText-root";
    help.style.cssText = "margin:3px 14px 0;font-size:12px;color:rgba(0,0,0,.6)";
    help.textContent = note;
    field.append(help);
  }
  return field;
};

const byLabel = (text) =>
  fields.find((f) => new RegExp(text, "i").test(labelOf(f)?.textContent ?? ""));

const given = must(byLabel("first name|given"), "there is no first-name field");
const family = must(byLabel("last name|family"), "there is no last-name field");
const phone = must(byLabel("phone|mobile"), "there is no phone field");
const email = must(byLabel("email"), "there is no email field");

// First name is ALREADY required on `main` — GIVEN_NAME_REQUIRED — but the
// shipped field carries no asterisk, so a screen that starred only the two new
// ones would say first name is optional. Marking all three is the honest
// picture; only two of them are a change.
mark(requireField(given, "Already required on main. The form just never said so."), 1);
mark(
  requireField(family, "Now required. The missing-data queue chases a blank last name on day one."),
  2,
);
mark(
  requireField(
    phone,
    "Now required. The welcome travels by mobile — without one the player is never told.",
  ),
  3,
);

const emailHelp = document.createElement("p");
emailHelp.className = "MuiFormHelperText-root";
emailHelp.style.cssText = "margin:3px 14px 0;font-size:12px;color:rgba(0,0,0,.6)";
emailHelp.textContent = "Optional. The player fills this in themselves from their welcome link.";
email.append(emailHelp);
mark(email, 4);

// What confirming actually does. The one genuinely new behaviour in this
// workflow, stated where the operator decides to do it.
const outcome = document.createElement("div");
outcome.className = "MuiAlert-root";
outcome.style.cssText =
  "display:flex;gap:12px;background:#e8f0fb;color:#0b3d91;border-radius:4px;" +
  "padding:10px 16px;margin-top:18px;font:400 14px/1.5 inherit";
outcome.innerHTML =
  '<span style="font-size:18px;line-height:1.3">ℹ</span>' +
  "<span>On confirming, this person joins the 2026-27 roster in onboarding, their checklist is " +
  "generated, and <strong>their welcome is queued</strong> — the same message an imported player " +
  "receives. All in one transaction.</span>";
form.append(outcome);
mark(outcome, 5);

await settle();
