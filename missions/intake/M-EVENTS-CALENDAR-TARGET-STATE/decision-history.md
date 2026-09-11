# M-EVENTS-CALENDAR-TARGET-STATE — decision history relocated from source

Paragraphs that explained a decision inside a source comment, moved here by LAN-300 so the
source reads as code. Each keeps a one-line pointer at its old location. Nothing here changes
a decision; it records where one was explained.

## src/app/operate/events/templates/template-editor.tsx — `TemplateEditor` (module header)

> ## Two submissions of one form
>
> **Save…** posts to `previewEventTemplateAction`, which writes nothing and
> returns the blast radius. The dialog then posts the _same fields_ to
> `saveEventTemplateAction`, which recomputes that blast radius under its own
> locks and applies it. The operator is never shown one plan and given another,
> and the browser is never trusted to carry a plan forward — it carries the
> form, and the server decides again.
>
> That is why the dialog re-renders every field as a hidden input rather than
> posting an identifier for something the server stashed. There is no server-side
> draft to go stale, and no session state to disagree with the form.

Ids named: W8.

## src/app/operate/events/templates/template-editor.tsx — `TemplateEditor` (module header)

> ## The screen's whole job
>
> W8: "An operator who has never used this should be able to tell, from the
> screen, that editing a template is safe." So the confirmation names the drafts
> that will take the change, names the ones that will not **and why**, and states
> what will not move at all — approved events and past events, which are never
> touched by anything here.
>
> The button says what it will do. "Save and update 3 drafts" is a different
> promise from "Save", and the operator should not have to infer which one they
> are making.

Ids named: W8.
