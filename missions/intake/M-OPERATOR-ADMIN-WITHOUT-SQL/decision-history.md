# M-OPERATOR-ADMIN-WITHOUT-SQL — decision history relocated from source

Paragraphs that explained a decision inside a source comment, moved here by LAN-300 so the
source reads as code. Each keeps a one-line pointer at its old location. Nothing here changes
a decision; it records where one was explained.

## src/app/operate/admin/roles/[roleId]/page.tsx — `RoleRecordPage` (file header)

> `REQ-admin-surfaces` names the three things this page presents, and it
> presents exactly those three: "current holder, a plain-language Permissions
> summary and holder history".
>
> ## The current holder, including when there is not one
>
> `DEC-account-state-separation` puts three different situations on this page
> and each has to read as itself:
>
> - a holder whose operator access is **deactivated** is still the holder,
>   and the page says so rather than showing a vacancy;
> - a successor who is still **Invitation pending** holds the seat "without
>   capabilities until activation", which is the state chip beside their name;
> - **Not assigned** appears only where a role was ended, because only End
>   role creates a vacancy.
>
> ## Permissions
>
> `describeRoleCapabilities()` is the projection of the arrays server
> enforcement reads — `REQ-capability-copy-consistency`, so "a later approved
> grant change updates authorization and plain-language UI copy together". No
> sentence on this page is written by hand, and half the catalogue's seats
> legitimately hold nothing, which is a sentence rather than an empty list.
>
> ## The seat itself is not editable
>
> `DEC-no-runtime-role-editing`. What the actions below change is who holds it.

Ids named: REQ-admin-surfaces, DEC-account-state-separation, REQ-capability-copy-consistency, DEC-no-runtime-role-editing.

## src/app/operate/admin/roles/[roleId]/page.tsx — Current holder panel, scheduled-holders block (now `current-holder-panel.tsx`)

> The half the index already showed and this page denied. Brian, on
> finding a seat that read "Not assigned + Alwyn Cholmondley from
> 1 Sept 2026" on the index and "Nobody holds this role" here: "That
> doesn't make sense."
>
> It sits inside the Current holder panel rather than in one of its own,
> because it is part of the answer to "who holds this seat" - the part
> about the near future. It is drawn whether or not the seat is filled:
> a successor lined up behind a departing holder is exactly as much a
> surprise, later, as one lined up behind a vacancy.

Ids named: REQ-admin-surfaces.

## src/app/operate/admin/roles/[roleId]/page.tsx — Permissions section, `limits` line

> The negative half — LAN-141 finding 10, and the reviewed prototype's
> own second paragraph. Without it the General Manager and the President
> produced word-for-word identical panels, in the mission whose subtlest
> locked decision is that one outranks the other. Every phrase is
> projected from `PROTECTED_LEADERSHIP_AUTHORITY`, the same table the
> guards read, so it cannot say one thing here and refuse another.

Ids named: REQ-capability-copy-consistency, LAN-141.
