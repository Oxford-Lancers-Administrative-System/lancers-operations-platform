// W11-02 — Where the separation begins: the event's Type.
//
// This screen was captured and then never put on the review page, so the one
// place that explains why a Recruits audience exists at all was invisible.
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
