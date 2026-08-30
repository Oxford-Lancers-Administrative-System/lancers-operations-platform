# Hamburger + drawer mockup — read this before approving LAN-195

**Branch:** `chore/nav-drawer-mockup`, cut from `main` at `0f02978`.
**Never merged, and never to be merged.**

**Run it:** `npx next dev -p 3211`, then open
<http://localhost:3211/nav-preview>. No login, no Supabase, no database
lease.

---

## What this is

A **running** mockup of the LAN-195 decision: replace the phone bottom bar's
nine illegible destinations with a hamburger button opening a left drawer.
Brian reviews this and approves it before anyone touches
`src/app/operate/shell-nav.tsx`.

It exists because a mockup of a navigation redesign that isn't itself
navigable proves nothing — you have to be able to tap the hamburger, watch
the drawer open over real content, tap a destination, and watch it close,
at the width the bug was found at. `/nav-preview` puts four things in front
of you, each a real, separately-rendered 375px or desktop viewport rather
than a resized window:

1. **Today's bug and the proposal, side by side, both genuinely 375px.**
   The left frame is today's real `ShellNav`, imported unmodified — the nine
   equal-flex destinations overlapping in their ~41.6px slots is the actual
   defect, not a redrawing of it. The right frame is the proposal, closed.
2. **The drawer open**, in its own 375px frame, so it's on screen without
   you having to find the button first — though the button works in every
   frame; open the closed one yourself if you'd rather drive it.
3. **Desktop, unchanged**, two frames at a fixed 1024px: today's real
   sidebar, and the proposal at the same width, so you can confirm they
   match rather than take it on faith.

## What this is not

- **Not `shell-nav.tsx`.** Nothing in `proposed-shell-nav.tsx` should be
  copied into it wholesale — see "What would actually change" below for the
  parts that would carry over versus the parts that exist only for this
  harness.
- **Not an authority over LAN-195.** Where this disagrees with the issue,
  the issue wins.
- **Not authorized, and it must never carry a real record.** It sits outside
  every protected prefix in `src/proxy.ts`, for the same reason
  `roster-preview` does: a mockup that needs a login is a mockup nobody
  opens. `SIGNED_IN_OPERATOR` in `fixtures.ts` is invented. Every
  destination, label and capability shown, though, is the real list from
  `src/app/operate/destinations.ts` — imported, not retyped, so this is
  never demonstrating a navigation LAN-195 didn't actually inherit.
- **Not a live Supabase session, but `.env.local` exists anyway.**
  `src/proxy.ts` calls `getSupabaseUrl()` unconditionally, on every request,
  before it ever checks which prefix is protected — so `next dev` cannot
  boot at all without the two `NEXT_PUBLIC_SUPABASE_*` variables present,
  regardless of whether the route needs them. The values here are the inert
  build-arg placeholders `docs/local-development.md` itself documents
  (`http://192.0.2.1:...` — TEST-NET-1, RFC 5737, guaranteed unroutable).
  Nothing was started, acquired or leased; there is no database at the other
  end of that URL to reach.

## Why the phone frames are `<iframe>`s, not a resized `<div>`

The real component and the proposal both use MUI's responsive `sx` props,
which compile to `@media` queries against the **browser's own** viewport.
Put either one inside a 375px-wide `Box` on a desktop browser and the
content does not narrow — the media query still reads your window's real
width and renders the desktop layout, just clipped by the box. An `<iframe>`
is a separate document with its own initial containing block, sized by its
`width` attribute, so its `@media` queries evaluate against that — a
genuinely narrow viewport, independent of how wide your window is. That is
what "browser resizing does not reliably reach 375px, so build the width
into the page" means in practice: the frame has to be a real viewport, or
the demonstration is not measuring what it claims to.

Two small route handlers make this possible: `live-shell/page.tsx` renders
today's unmodified `ShellNav`, and `proposed-shell/page.tsx` renders the
proposal — each standalone, so `/nav-preview` can embed either one at
whatever width and drawer state a given panel needs. Neither is meant to be
opened directly; they're addressed only by the iframes on `/nav-preview`.

## Design choices you're being asked to approve

Where LAN-195 left the shape to me, here's what I built and, in one
sentence each, what I didn't:

- **The top bar carries only the hamburger** — no wordmark, no section
  label, no page title. *Rejected: adding "Lancers" or the section label
  next to it* — the main content's own heading already says "Lancers
  Operations", and repeating it in a 56px bar felt like clutter earning
  nothing a screen reader or a glance needed.
- **Dismissal is threefold and none of it is subtle**: an explicit close
  (×) at the top of the drawer, the standard backdrop tap and Escape key
  MUI's `Drawer` already gives you, and selecting any destination closes it
  too. *Rejected: dismiss-by-backdrop-only* — with the standards labels
  this drawer holds, undiscoverable dismissal felt like the wrong thing to
  bet on for a first look.
- **The drawer is 280px wide**, wider than the 226px desktop sidebar, since
  a touch target and a mouse pointer aren't the same thing. *Rejected:
  matching the sidebar's 226px exactly* — narrower felt cramped once real
  labels like "Messaging schedule" were in it at drawer width rather than
  bottom-bar width.
- **The secondary detail line now renders at every width**, not just `md`.
  It was hidden at `xs` only because the 48px bottom-bar row had nowhere to
  put it; the drawer has room, so a coach's shell now shows "This season's
  sessions" on a phone too. A side effect of the redesign, not a separate
  ask — flagging it so it isn't mistaken for scope creep in review.
- **One proposal, not a set of options.** LAN-195 asked for a single
  coherent design to react to, not a menu; the four choices above are the
  ones with real alternatives, and each is independently reversible if you'd
  rather have it the other way.

## How this keeps LAN-195's "one element set" invariant

The real component's own comment is the constraint: rendering a phone copy
and a desktop copy "would put every link in the accessibility tree twice."
MUI's stock responsive-drawer example does exactly that — a `permanent`
`Drawer` and a `temporary` `Drawer`, both always mounted, one hidden by CSS.
`display: none` does pull an element out of the accessibility tree, but two
mounted copies is still two sets of links in the DOM and two places a test
can assert against by accident.

`proposed-shell-nav.tsx` instead reads one `useMediaQuery` boolean and picks
**one branch per render**: the `md` branch is the sticky `Box` the real
component already uses today, copied verbatim; the `xs` branch is a fixed
top bar plus one `Drawer`. The destinations, the Administration group, the
section header and the signed-in footer are written once, in `NavList`, and
handed to whichever branch is chosen. At any moment there is exactly one
navigation landmark in the DOM — never a hidden second one.

The trade against the real component's pure-CSS approach: this switches on
a JS media-query match rather than a browser reflow, so server-rendered HTML
reflects whatever `useMediaQuery` resolves to before hydration — mobile,
absent a match — which can read as a one-frame flash at `md` on a slow
connection. The real component has no such flash today. Worth weighing
against the DOM-duplication risk above; it's the one open technical question
this mockup doesn't resolve for you.

## What would actually change in `shell-nav.tsx`, and what wouldn't

Carries over: the `md` branch's styling (copied here verbatim already), the
single-`NavList` structure, the choice of a `useMediaQuery`-picked branch
over MUI's stock dual-`Drawer` pattern, and `layout.tsx`'s bottom padding
moving to the top — demonstrated standalone in `proposed-shell/page.tsx`'s
`pt` in place of the real layout's `pb: {xs: 12}`.

Does not carry over, and is called out in code comments in
`proposed-shell-nav.tsx`: the mockup's notion of "current". The real
component reads `usePathname()` against real `/operate/*` hrefs; this route
is unauthenticated, and following one of those hrefs from an iframe here
would bounce straight to `/login`, breaking the demonstration. So selecting
a destination here just marks it locally and closes the drawer, rather than
navigating — the one place this mockup's mechanism differs from what ships.
The real implementation keeps `usePathname()` exactly as it is today.

## Open question this mockup surfaces but does not answer

**The `useMediaQuery` hydration flash**, above — whether it's acceptable, or
whether the real implementation should find a way to pick the branch without
depending on a client-side media-query match resolving before first paint.

## File map

| File | What it holds |
| --- | --- |
| `proposed-shell-nav.tsx` | The proposal itself — the component under review |
| `preview-shell.tsx` | Harness chrome and the five framed panels on `/nav-preview` |
| `live-shell/page.tsx` | Today's real, unmodified `ShellNav`, standalone — embedded at 375px (the defect) and at desktop width (unchanged) |
| `proposed-shell/page.tsx` | The proposal, standalone — embedded at 375px (closed, and `?open=1`) and at desktop width |
| `content-placeholder.tsx` | Wordless `Skeleton` blocks standing in for page content, so nothing here reads as narrative prose inside the application frame |
| `fixtures.ts` | The one invented value: `SIGNED_IN_OPERATOR` |

`npx tsc --noEmit` is clean for this route, and `next dev` serves
`/nav-preview`, `/nav-preview/live-shell` and `/nav-preview/proposed-shell`
(with and without `?open=1`) at 200.
