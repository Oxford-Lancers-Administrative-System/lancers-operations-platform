# LAN-410 — the share message is on the panel

Taken at `2234707a` against the local production build, through the real login,
at 1440×900 and 375×812 as measured from the browser context.

`desktop-share-panel.png` is the Share this event panel on an approved event
with a live link. The six lines are rendered on the server, beside the link and
in the same monospace box the link already uses, and **Copy share message**
copies that text in the click handler itself. The counts agree with the event's
own headline — the panel reads 20 yes, 9 no and 12 still to answer against 41
invited and 20 said yes, because both come from the one `readHeadlineIn` path.

`phone375-share-panel.png` is the same panel at 375 px: the box wraps rather
than scrolling sideways, and the page has no horizontal scroll.

Stewart's fault was not the server. Four scripted runs through the real login
returned the six lines every time; Safari refused the clipboard write with
`NotAllowedError`, because the awaited server action had already let the click's
user activation lapse. The text being on the page is both what makes the copy
synchronous and what makes the message reachable by hand in any browser.
