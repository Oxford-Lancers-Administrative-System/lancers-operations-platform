# LAN-403 — every section on a membership record folds

Taken at `2234707a` against the local production build, through the real login,
at the two widths `npm run visual:preflight` measures from the browser context
itself: 1440×900 and 375×812.

`desktop-record-default.png` and `phone375-record-default.png` are the record
as an operator who has never touched the setting arrives at it. Every section
now carries the band's own chevron — Person, Onboarding, Activity, Membership,
Coaching, Offensive, Defensive, Special teams, Warmup, Kit, Attendance, Their
other seasons and Status history — where only the last three could fold before.
Person, Onboarding and Membership are open; the long tail arrives closed, the
way Kit already did. The collapsed headings stay visible with their own titles.

`desktop-record-one-section-open.png` and `phone375-record-one-section-open.png`
are the same record for an operator whose account remembers everything folded
except Kit, which is what proves the state is stored per operator rather than
per screen: the page is thirteen bands and one open body. The groups the record
shares with the roster board — Coaching, Offensive, Defensive, Special teams,
Warmup and Kit — read that state from the one `operator_preferences` row the
board writes, and the four sections only the record has are kept in the same
list rather than a second one.
