# LAN-404 — the recruitment board's groups fold

Taken at `2234707a` against the local production build, through the real login,
at 1440×900 and 375×812 as measured from the browser context. That head is one
merge behind the branch's tip: `main` came in again afterwards for LAN-399's
operator playbook, which touches none of these screens.

`desktop-groups-open.png` and `phone375-groups-open.png` show the board as it
arrives for an operator who has never touched the setting: nothing is closed,
and every band — Person, Recruitment, and one per recruitment event — now
carries the roster board's own chevron, so the band itself is the control.
Nothing is closed by default because this board has no long tail: Person and
Recruitment are its subject, and each events group is an event somebody put
there deliberately.

`desktop-person-folded.png` and `phone375-person-folded.png` are the same board
for an operator whose account has the Person group folded. It leaves the one
narrow cell the roster board leaves, with its name written down it, and the row
height does not change. The setting lives under its own preferences key, so
folding Person here never folds the roster board's Person group.
