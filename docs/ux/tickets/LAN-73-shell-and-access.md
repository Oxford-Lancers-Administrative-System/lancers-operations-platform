# LAN-73 - Shell and access

Status: workflow direction approved by Brian on 12 August 2026; verify against the current live Linear issue before implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses, responses, and attendance records are synthetic and do not correspond to real members.

Approval evidence: [LAN-90 approval comment](https://linear.app/brian-schuster/issue/LAN-90/0-define-and-approve-the-minimum-ux-for-the-first-operational-vertical#comment-44f1c4de-cc9f-4708-86b3-b2ba555bf960) · [Notion approval record](https://app.notion.com/p/3ba488886d5781ed9adedd53635d1c6f)

## Purpose

Provide the `/operate` shell, Roster/Events/Report navigation, exact account-state recovery, and service-enforced capability boundaries.

The current live LAN-73 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route             | Audience                                           |
| ------ | ----------------- | -------------------------------------------------- |
| UX-01  | `/login`          | Operator                                           |
| UX-02  | `/operate/roster` | Authorized operator                                |
| UX-03  | `/operate`        | Signed-in user without linked operator profile     |
| UX-04  | `/operate`        | Signed-in user with inactive operator profile      |
| UX-05  | `/operate`        | Authenticated operator without required capability |

## Wireframes

- **UX-01 - Sign in to Lancers Operations:** [`desktop`](../wireframes/UX-01-sign-in-desktop.svg) / [`phone`](../wireframes/UX-01-sign-in-phone.svg)
- **UX-02 - Lancers Operations:** [`desktop`](../wireframes/UX-02-operator-shell-desktop.svg) / [`phone`](../wireframes/UX-02-operator-shell-phone.svg)
- **UX-03 - Operator profile not connected:** [`desktop`](../wireframes/UX-03-operator-unlinked-desktop.svg) / [`phone`](../wireframes/UX-03-operator-unlinked-phone.svg)
- **UX-04 - Operator access inactive:** [`desktop`](../wireframes/UX-04-operator-inactive-desktop.svg) / [`phone`](../wireframes/UX-04-operator-inactive-phone.svg)
- **UX-05 - You do not have access to this action:** [`desktop`](../wireframes/UX-05-operator-unauthorized-desktop.svg) / [`phone`](../wireframes/UX-05-operator-unauthorized-phone.svg)

## This ticket builds

- Email/password sign-in
- Operator shell under `/operate` with no Home destination
- Distinct exact-copy unlinked and inactive states with no protected data
- Ordinary operator capability mapping
- Narrow HC/OC/DC attendance-recorder capability
- Service authorization independent of navigation

## Explicitly not in this ticket

- Blanket President/Secretary full-MVP permission
- Player eligibility or returner verification states
- Operator account administration UI
- Branding polish or a custom design system

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, re-read the live owning issue and comments and reconcile any changes recorded after Brian’s 12 August 2026 approval.
- In implementation review, provide LAN-73, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).

## Decision history relocated from source (LAN-300)

### src/app/operate/destinations.ts — Follow-ups entry

> W5. "Shown as a Follow-ups item under Administration, above Operators" —
> the mockup's own placement, and `capability: null` rather than
> `role_management`: the workflow's primary actor is "the President, and
> any operator working follow-ups", not the three seats Operators and Roles
> are narrowed to. `readFollowUpsQueue`'s own floor is
> `requireGeneralOperator()`, the same as the participation table's.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/shell-nav.tsx — phone top bar (JSX comment)

> The phone top bar — approved choice 1: only the hamburger, no
> wordmark, no section label. Hidden at `md`, where the sticky sidebar
> already carries this chrome permanently. A plain `Box`, not a
> semantic `<header>`, so this never introduces a second landmark
> (a `banner`) alongside the one this file is careful to keep singular.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/shell-nav.tsx — backdrop

> The backdrop — the second of the three approved dismiss paths. Mounted
> only while open, so it carries no closed-state visibility logic to get
> wrong and adds nothing for a desktop shell, which never opens it.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/shell-nav.tsx — sidebar nav sx, alignSelf/height/overflowY

> From `md` up the panel is exactly one viewport tall and sticks to
> the top of it. All three of these lines are load-bearing:
>
> - `height` — a definite height, not a `maxHeight` ceiling with
>   no floor. The ceiling alone let the panel collapse to its
>   content, which put a dark block at the top of a long white
>   column. Brian found that on a real screen; the render tests
>   could not see it.
> - `alignSelf` — the layout's flex parent says `alignItems:
"stretch"`, and a stretched flex item fills its container,
>   which is taller than the viewport on any page that scrolls.
>   A sticky element with nowhere to move never sticks, so the
>   item opts out of stretching and takes its height from the
>   line above.
> - `overflowY` — a definite height needs somewhere for the
>   content to go on a short viewport, or the operator's name is
>   clipped off the bottom rather than scrolled to.
>
> The drawer at `xs` needs the same full-height, scrollable panel
> for the same reason — a long Administration list on a short
> phone.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/shell-nav.tsx — sidebar nav sx, zIndex/boxShadow array entry

> `zIndex` and `boxShadow` need `theme` (for the design tokens and
> the numeric shadow scale) and so cannot live in the plain object
> above — but they still have to stay out of the _next_ function
> below, in their own array entry. MUI's breakpoint-shorthand
> expansion (the `{ xs, md }` object form) does not coexist inside
> one sx object with an explicit `theme.breakpoints.up(...)` key:
> verified directly against this exact combination, where adding
> the override key silently dropped every other property's `md`
> value from the compiled CSS. Splitting the `sx` prop into an
> array — which MUI merges in order — sidesteps the interaction
> entirely.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/shell-nav.tsx — close control dismiss path

> The first of the three approved dismiss paths. Hidden at `md`,
> where there is nothing to dismiss.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/account-state.tsx — module header

> UX-03 and UX-04 — the two account states, at `/operate`.
>
> ## The copy is exact, and the two are different on purpose
>
> Brian approved both sentences on 12 August 2026 (LAN-107; `slice-ux.md` § 8).
> They differ because the next action differs: an unlinked account has to be
> connected to a club record, a deactivated one has to be re-enabled. A single
> message covering both would send at least one of those people somewhere
> useless, which is the defect LAN-95 had already found once in `/dashboard`.
>
> Reword nothing here without a recorded owner decision. The strings are
> asserted literally by test for that reason.
>
> ## What this screen may contain
>
> Nothing. No navigation, no operator name, no email address, no role, no
> counts, no links into the shell. The person reading it has a verified session
> and no operator access, and everything this repository holds about the club
> is off limits to them — including the fact that a Person record may exist
> behind their address. The only outward reference is "the club administrator",
> unnamed, because naming one would be a contact detail.
>
> Sign out is the only action, exactly as both wireframes show.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/layout.tsx — module header

> The `/operate` shell — UX-02, and the frame the account states are shown in.
>
> ## What it decides
>
> It resolves the operator once and picks one of three outcomes:
>
> - **no session** — redirect to `/login`. `src/proxy.ts` already does this
>   with the exact path preserved; this is the second line, for the case the
>   proxy matcher is changed or bypassed, and it deliberately does not try to
>   reconstruct a deep path it cannot see (a layout is not given one).
>
> - **unlinked or deactivated** — render the account state **instead of**
>   `children`. Not around it: an unrendered `children` element is a page
>   component React never invokes, so a child that forgot to guard itself
>   never runs a query, never renders and never leaks. That is why this
>   layout drops children rather than styling them away.
>
> - **active** — render the navigation and the page.
>
> ## What it is not
>
> It is not the authorization boundary, and no page may treat it as one. Layout
> and page are separate render entry points; a page reached in any way that
> skipped this layout would render unguarded. Every page under `/operate`
> therefore guards itself as well, which is duplication with a purpose: two
> independent checks, either of which refuses on its own.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/not-permitted.tsx — module header

> UX-05 — an active operator whose current roles do not permit the action.
>
> ## What it says, and what it must never say
>
> The heading and the sentence are the approved wireframe copy. The line the
> wireframe does not have — `requirement` — is required by the live LAN-73
> acceptance criteria: "refused any privileged action, with a message naming
> the role required". Live Linear outranks the wireframe (`slice-ux.md` § 1),
> and the addition is additive: it names what the _action_ needs.
>
> It never names what the reader holds, and never names who does hold the
> missing role. The first would tell whoever has the session what the account
> is worth; the second would publish the committee's composition to anybody who
> can reach a screen. `requirement` comes from `capabilities.ts`, which builds
> its sentence from the capability's own role list and from nothing about the
> actor.
>
> ## Why it is a screen and not a 404
>
> A refusal that pretends the destination does not exist leaves an operator who
> genuinely should have been given the role with no way to tell the difference
> between "ask for access" and "that page is gone". The recovery action is
> therefore a real one: return to a destination they can open.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/unavailable.tsx — module header

> What a screen shows when the service refused to hand it anything.
>
> Eight call sites across seven files had written this out identically — the
> roster, the events list, the coach's event list on that same page, an event,
> the calendar, the register, the delivery board and the create-event form —
> differing only in the heading and the test id, and on the create-event form
> not even carrying one. `events/[id]/edit` had already pulled its own version
> out into a local `Refusal`, which is the same conclusion reached once and not
> shared.
>
> Sharing it matters more than the line count. This is the screen an operator
> sees on the worst day, and the parts that are easy to get subtly wrong are
> the ones that were being retyped: the heading is an `h1` because it is the
> only heading on the page at that moment and a page whose sole heading is an
> `h6` is unreachable by heading navigation; the alert is a `warning` rather
> than an `error` because the club's data being briefly unavailable is not the
> operator's fault and must not read as one; and `maxWidth: 720` keeps a long
> database message to a readable measure instead of one line across a desktop.
>
> `message` is the service's own sentence. It is passed through rather than
> replaced with a generic one because `ServiceError` messages are written for
> the operator and never carry a row, a host or a connection string —
> `src/lib/db/errors.ts` is where that guarantee lives.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/page.tsx — module header + coach/unreachable comments

> `/operate` — account-state resolution, and the way in. Not a Home page.
>
> `docs/ux/slice-ux.md` § 3 and § 4: the shell has no Home destination, and
> "after authentication, the shell opens the first destination permitted by the
> operator's capability map". So an active operator never stays here; they are
> sent to that destination. What remains at this route is the two account
> states — UX-03 and UX-04, rendered by the gate — and the refusal that applies
> when an operator's roles permit no destination at all.
>
> Adding content here would create the Home page the UX contract removed.
>
> ---
>
> A coaching assignment passes through here like anybody else. This route
> renders no content — it resolves the account state and forwards — so
> refusing a coach would strand them at the front door of the one shell they
> are entitled to. Their destination refuses or admits them on its own.
>
> ---
>
> Unreachable while Roster is open to every operator, and deliberately still
> written: the day a destination gains a capability, an operator with none of
> them must get a refusal that says what is needed, not an empty shell.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/not-implemented.ts — module header

> The failure a privileged action raises once it has authorized the caller and
> found it has no behaviour yet.
>
> It is deliberately **not** a `ServiceError`. A `ServiceError` is a refusal or
> a rule the club recognises, and an operator may be shown one; this is a
> statement that the software is unfinished, which is a developer's problem and
> must never be mistaken for "you may not do that". Keeping the two classes
> apart is what lets a test assert that a _permitted_ caller got past the
> guard: the guard throws `NotPermitted`, and this is what is left when it did
> not.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/actions.ts — module header

> The slice's privileged server actions, and the authorization that will still
> be there when somebody fills them in.
>
> ## Why these exist now, empty
>
> LAN-73's acceptance criteria: "`requireRole` is enforced in the server action
> itself, not only in the page — proven by a test that calls the action
> directly with an under-privileged actor". That is not a property a page can
> have on the action's behalf, and it is not a property that can be added later
> without re-auditing every screen. So each privileged action in the slice gets
> its entry point here, with the guard already in it, and the issue that owns
> the behaviour fills in the body.
>
> Each one calls `requireCapability()` **first**, and each therefore:
>
> - resolves the actor from the verified session, never from an argument. A
>   server action is a POST endpoint the browser can call directly; an action
>   that accepted "who am I" would accept whatever was sent;
> - reads the permitted role codes from `src/lib/auth/capabilities.ts`, so no
>   action carries a policy of its own and changing access means changing one
>   file;
> - refuses with `NotPermitted`, whose message names what the action requires
>   and never what the caller holds.
>
> Deleting the guard from a page cannot grant any of them. Deleting it from
> here is the change a reviewer must catch, which is why every one of these has
> a test that calls it directly with an under-privileged actor.
>
> ## What they do not do
>
> Nothing. No read, no write, no audit row. Past the guard each raises
> `ActionNotImplemented`, which is not a `ServiceError` and is not a refusal —
> so a test can tell "authorized, and unbuilt" apart from "refused", which is
> exactly the distinction that proves the guard ran and passed.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/filter-search.ts — module header

> A search box that filters as you type, and the two bugs that shape it.
>
> ## Why this is shared rather than written twice
>
> The roster had it first. Its search box relied on the browser's implicit form
> submission — type, then press Enter — and Brian's verdict on the real screen
> was blunt and correct: "the search absolutely does not work. I cannot
> filter." A box that looks like a filter and only responds to a keypress
> nothing on screen mentions is a broken filter, whatever the HTML says.
>
> The events list then shipped with the identical broken version, and he found
> it again. Two screens re-inventing the same defect is the argument for one
> implementation, so this is that implementation and both screens call it.
>
> ## The two corrections it carries
>
> Neither is obvious, and both were paid for on a real screen:
>
> - **`q` defaults to what is in the box, not to the committed prop.** A
>   filter chosen inside the debounce window used to build its URL from the
>   older prop and silently discard the text just typed — and the pending
>   debounce would then fire with a stale filter and discard _that_. One of
>   the two was always lost. Independent review found it. `buildHref` is
>   therefore handed the current text.
> - **An arriving URL is adopted only when it says something new.** A
>   navigation landing while the operator keeps typing used to re-seed the
>   box from the older prop, jumping the caret and dropping the characters
>   typed in that window.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/filter-search.ts — committed URL adoption effect

> The URL is the source of truth — Back, Clear filters, a shared link — but
> only adopt it when it says something we did not just say ourselves.
>
> This used to carry a second clause, `|| search === typed`, meant to stop a
> landing navigation re-seeding the box while the operator kept typing.
> Independent review found it untested, and writing the missing test showed it
> was worse than inert.
>
> The clause only fires when the arriving URL says **exactly** what the box
> already holds — so it is never protecting unsaved keystrokes; there are none
> to protect. What it did was skip advancing `committed.current`, leaving a
> pending debounce believing it still had something to say.
>
> The redundant navigation that produced is worth stating precisely, because
> the mechanism is indirect: advancing `committed.current` does **not** cancel
> a running timer. What cancels it is the effect re-running — and it re-runs
> because changing a filter changes `filterKey`, which changes `hrefFor`'s
> identity, which is in the effect's dependency list. The timer is then
> recreated, sees `typed === committed.current`, and returns without pushing.
> A future change that memoised `hrefFor` differently would silently restore
> the double navigation, and the test would still pass.
>
> Adopting an identical value is safe: `setTyped` with the same string is a
> no-op to React, so there is no re-render and no caret to jump. The guard
> against stale props is `search === committed.current`, which is the one that
> was doing the work all along.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/gate.tsx — narrowRecorder refusal branch

> Refused with the ordinary refusal, not the coach one: UX-96 says "you
> cannot record attendance for this event", which is untrue here — this
> operator records attendance perfectly well, just not on this screen. The
> return link is their own destination, which they can always open.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
