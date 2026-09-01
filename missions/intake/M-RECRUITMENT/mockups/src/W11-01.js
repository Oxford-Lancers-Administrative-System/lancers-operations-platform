// W11-01 — Where the separation begins: the event's Type.
//
// Renumbered on 2026-08-31. This screen is the FIRST step of the journey -
// creating the event - and it was numbered 02 because it was captured after the
// audience screen and bolted on afterwards. Brian: "at the very least, the
// numbering is screwed up." Screen numbers follow the journey everywhere else.
//
// The shipped form's Type control decides which audience groups the event may
// carry. D46: recruits exist on a Recruitment event and nowhere else. Nothing
// here is added — the control is the application's own, set to Recruitment.
const typeField = $("[data-field='eventType']");
const control = typeField?.closest(".MuiFormControl-root, .MuiTextField-root") ?? typeField;
const shown = control?.querySelector(".MuiSelect-select, [role='combobox']");
if (shown) shown.textContent = "Recruitment";
if (control) mark(control, 1);

// 2. The template's own note about what this type carries. The form already
//    explains the consequence of the Type it is set to; on Recruitment that
//    sentence is where the recruits group is announced.
const boundaryNote = $("[data-testid='draft-boundary-note']") ?? $(".MuiAlert-root");
if (boundaryNote) mark(boundaryNote, 2);
