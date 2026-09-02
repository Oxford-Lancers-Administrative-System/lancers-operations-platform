# Open decisions — M-ONBOARDING-AND-INFORMATION-COMPLETION

Everything still undecided in this mission's intake, as at **2026-09-02**, with
what each one costs and what is recommended. Written for Brian to take to the
team; nothing here is an owner action yet and no Linear issue exists for any of
it.

Intake has reached W4 of 12. W1–W3 are approved and closed. **Some of the
questions below will not be fully answerable until W5–W12 are drafted**, and
that is noted where it applies.

---

## 1 · Needs a decision before this mission can be built

### 1.1 The player's link and where the form lives

**Question.** Does the player's onboarding form live at `/me/[token]/details` —
a second page on the season credential they already hold — or on its own route
with its own token?

**Why it matters.** It decides whether a person ever holds two live links.

**Recommended: `/me/[token]/details`.** `person_access_tokens` already ships one
live durable credential per person per season, enforced by a database index.
That *is* "one open ask, ever". A separate token costs a migration, a second
resolver, a second revocation path, and permits the thing the rule exists to
prevent.

**Team input needed?** No. Engineering detail; Brian's call alone.

---

### 1.2 Signed documents — the photo release and the Code of Conduct

**Question.** Does the club need a real signature on the photo release, or is a
dated agreement against a named version enough?

**What exists today: nothing.** No storage bucket is configured, no table holds
a document or a blob, nothing captures a signature, and the only file input in
the whole application is the event CSV import, which parses in memory and stores
nothing.

| Option                                          | What it needs                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| **Dated agreement against a version** *(rec.)*  | Two ordinary tables. No object storage, no upload, no signature control |
| Drawn signature or signed PDF                   | Object storage, an upload pipeline, a signature control, and a retention decision |

**Recommended: the dated agreement**, with e-signature additive later if the
club's position changes. It records who agreed, to exactly which words, and
when — which is what a dispute actually turns on.

**Team input needed? YES.** This is a club-liability question, not an
engineering one. Whoever owns the club's legal exposure should say whether a
dated agreement is sufficient for the photo release.

---

### 1.3 Where the Code of Conduct and photo release text is administered

**Question.** Who puts the document text into the system, and on what screen?

**Status.** Deferred on Brian's instruction, 2026-09-01: "there probably needs
to be an administration page to handle that. I don't really want to think about
that right now."

**Recommended: `W11`**, which already owns per-season checklist configuration.
**This does not block W4** — W4 needs the slot to exist and be versioned, not to
know who fills it.

**Team input needed?** No, but it must be settled before W11 is drafted.

---

### 1.4 The emergency contact's `relationship` field

**Question.** Is "relationship to you" asked for?

**Status.** `person_emergency_contacts` already has the column. Brian has now
listed the emergency contact's fields **twice** — 2026-09-01 and 2026-09-02 —
and named first name, last name, email and phone both times, never relationship.
It is currently on the form as the one optional field.

**Recommended: drop it or confirm it explicitly.** Cheap either way.

**Team input needed?** No.

---

## 2 · Content the club owes, which nobody has written

None of these blocks a build or a walk. **All of them block a real send.**

| What                              | Who owns it        | Where it stands                                                                                              |
| --------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Code of Conduct text**          | Clint, via Task 07 | Never written into this system. W4-03 carries labelled placeholder text                                        |
| **Photo release text**            | Clint, via Task 07 | Same. W4-04 carries labelled placeholder text                                                                  |
| **Consent wording**               | Clint, via Task 07 | Placeholder in a real versioned slot                                                                           |
| **BUCS Play instructions**        | **This mission**   | Task 10 deferred it to Task 11, which is this mission. Nobody has drafted it. Stewart described it on 2026-08-11 |
| **Hudl instructions**             | **This mission**   | Same. Nobody has drafted it                                                                                    |

**Team input needed? YES**, for all five. These are words the club has to write,
and two of them are this mission's own debt.

---

## 3 · Scope gaps nobody owns

### 3.1 Active-membership maintenance has no mission

Task 11's **M5** — keeping an active member's details current after onboarding
ends — is excluded from this mission because onboarding stops at activation.
**No other mission has claimed it.**

**Team input needed? YES.** It is a real ongoing club operation with no home.

### 3.2 Nothing creates a season

`readCurrentSeason` throws when no season exists, so the roster already requires
one, and the import inherits the roster's current season rather than opening
one. **Nothing anywhere in the codebase creates a season.** Mission 11 owns it
and does not exist yet.

**Consequence.** Release One cannot start a new season without it.

---

## 4 · Settled, but flagged to revisit

### 4.1 A flipped recruit is invisible on the roster

`membership_entry` stays `('new','returning')`. It is locked at the
recommendation — **but Brian never addressed it in his own words, and the `W3-01`
photograph argues against it**: the Entry column reads `New`, so a recruit the
club spent weeks on is indistinguishable from someone typed in by hand, on the
surface an operator actually works from.

Changing it is a schema and vocabulary change. **First thing to put back if it
bites.**

---

## 5 · Append-only record edits awaiting approval as a batch

Four proposed edits to product records, from `state.json.amendment_plan`.
**Nothing has been edited.** They go as one batch, with Brian seeing the whole
batch first.

| Id   | Target                              | Change                                                                          |
| ---- | ----------------------------------- | --------------------------------------------------------------------------------- |
| `A1` | Task 10, decision `R3-G`            | Record that the flagged/unflagged tracking distinction is dropped; due-timing carries subs paid instead. The governing half — nothing gates — is untouched |
| `A2` | Mission Portfolio v2, **row 7**     | Remove the coach and committee welcome flow from this mission's scope. **The row currently contradicts the approved boundary** |
| `A3` | Task 10, item 5 (BPS)               | BPS leaves the onboarding checklist and becomes a yes/no attribute on the roster |
| `A4` | Task 10, items 11 and 3             | The photo release is seasonal, asked of everyone every season; its returner carve-out is removed |

---

## Decided since the last review, for completeness

- **Required means required at onboarding** — the ten-field player tier from
  `person-required.ts`, blocking the form and never the player. Brian, 2026-09-02.
- **The emergency contact is required**: first name, last name, email, phone.
  Brian, 2026-09-02.
- **Hudl gets its own page**; the finishing page lists what is outstanding by
  section, in dots, each a link back to its step. Brian, 2026-09-02.
- **The form is a five-step sequence** behind one link. Brian, 2026-09-01.
