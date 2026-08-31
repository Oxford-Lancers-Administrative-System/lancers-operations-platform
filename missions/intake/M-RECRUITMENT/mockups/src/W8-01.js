// W8-01 — How the duplicate check actually gets done.
//
// Brian, 2026-08-31: "That's not where in the fucking workflow it belongs.
// That's not how the duplicate checks get done. That's not where it happens."
//
// He was right twice. The merge screen resolves two records that both exist;
// W8 resolves a submission against a record before anything is written. And the
// check itself already ships — `create-person-form.tsx` is a check-then-create:
// press Check for duplicates, and the form answers "Already in the club" with
// candidate rows, or says plainly that nothing matched. So this screen drives
// the real form and photographs the real answer.
fill("givenName", "Rosalind");
fill("familyName", "Penhaligon");
fill("mobile", "07700 900318");

// The application's own button, pressed, and its own result awaited. Nothing
// below this line is drawn.
await openControl("Check for duplicates", 1400);

// 1. The shipped check, and its shipped answer. This is where a duplicate is
//    caught — at capture, before a person exists. Task 09 D7.
const check = $("[data-testid='candidate-count']")?.closest(".MuiPaper-root, section, div");
if (check) mark(check, 1);

// 2. The explicit choice the form already demands. An exact match cannot be
//    created past without a written reason — the shipped override.
const reason = document.querySelector("input[name='overrideReason']");
if (reason) mark(reason.closest(".MuiFormControl-root, .MuiTextField-root") ?? reason, 2);
