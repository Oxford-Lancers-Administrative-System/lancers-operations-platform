# LAN-408 — an onboarding item reads on one line

Taken at `2234707a` against the local production build, through the real login,
at 1440×900 and 375×812 as measured from the browser context. That head is one
merge behind the branch's tip: `main` came in again afterwards for LAN-399's
operator playbook, which touches none of these screens.

`desktop-onboarding-one-line.png` is the Onboarding section of a membership
record, cropped from the full-page capture. Every item is one line in reading
order: the label, then the value, then the required marker after it. Before, the
`Required` or `Never blocks activation` chip claimed a line of its own above the
value, so each of the eleven rows was two lines tall.

The marker is one chip, never a pair. `Subscription invoiced — Not invoiced`
and `Comms groups joined — Not assigned` are required and outstanding, so their
`Required` is filled in the warning tone the section's own pending chips
already wear; `Kit Distributed — Yes` and `Photo release — Yes` are required
and settled, so the same word is drawn quietly; `Hudl access` and `Squad photo`
read `Not required`; and `Subscription paid` keeps `Never blocks activation`,
which says a different thing. No new colour and no new component.

`phone375-onboarding-one-line.png` is the whole record at 375 px, where the
label stacks above the value as every inline fact on this page does and the
value and its marker wrap together rather than truncating.
