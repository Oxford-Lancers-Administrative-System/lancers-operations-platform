# Local walk data — W4

Not a repository fixture and not committed as one. This is what a session runs
against its own mission slot after `npm run db:start` to photograph W4's five
screens, and it must be re-run after any `db:reset`.

Synthetic throughout. No real member data.

## The shell, and why there is seeding at all

W4's own surface does not exist on `main`. Every screen is shot on
`/a/[token]` — the answer link — which is the nearest implemented
player-facing, no-login, signed-link form. Reaching it needs a live answer
token, and the base seed mints none: `rsvp_access_tokens` and
`person_access_tokens` are both empty after `db:start`.

An answer token is `y.<invitation uuid>.<43-char base64url nonce>`, stored as
`sha256(whole string)` in `person_access_tokens` with `single_use = true`
(`src/lib/services/player-answer-tokens.ts`, `issueAnswerTokenIn`). Minting one
by hand is what the two `insert`s below do.

## The two subjects

**Merrick Thornbury** (`a48825ac-…`) is a seeded player already at `onboarding`
in 2026-27. His record really does hold his name, mobile, personal email and an
emergency contact, and really is missing college, matriculation year, expected
graduation, degree field and date of birth. Only one thing is changed: his
checklist is set back to all-`pending`, which is the state an import leaves a
person in on the day they arrive.

```sql
update onboarding_items
   set status = 'pending', completed_on = null,
       waived_reason = null, waived_by_person_id = null
 where season_membership_id = 'b7242a9d-07b8-4bab-8f3b-d0a16657d517';
```

**Rosalind Penhaligon** (`0b938ce0-…`) is the base seed's own
`recruitment_prospects` row, at `identified` and unconverted. She is flipped —
the same person W3 photographed, and the flip Mission 6's `W14` will perform:

```sql
-- What the recruit door and questionnaire A collected. The four facts
-- recruitment never asks for are cleared, so the gaps the screen shows are
-- the real ones: expected graduation, degree field, date of birth,
-- emergency contact.
update people set college = 'Brasenose', matriculation_year = 2024,
       expected_graduation_year = null, degree_field = null, date_of_birth = null
 where id = '0b938ce0-031c-4b81-880f-c3b5256e27b2';

delete from contact_points where person_id = '0b938ce0-…';
insert into contact_points (person_id, kind, raw_value, normalised_value, is_preferred, scope, source)
values ('0b938ce0-…','phone','07700 900312','+447700900312',true,null,'recruit sign-up'),
       ('0b938ce0-…','email','rosalind.penhaligon@brasenose.ox.ac.example',
        'rosalind.penhaligon@brasenose.ox.ac.example',true,'personal','recruit sign-up');

insert into season_memberships (person_id, season_id, status, entry, confirmed_on)
values ('0b938ce0-…','b452e316-…','onboarding','new','2026-09-01');   -- → f762fde4-…

update recruitment_prospects
   set status = 'joined', committed_on = '2026-08-26', converted_membership_id = 'f762fde4-…'
 where person_id = '0b938ce0-…';

-- Granted at the door, and unique per person per season: this row IS her
-- consent, which is why W4-02 has no consent step.
insert into season_messaging_consents (person_id, season_id, state, source, changed_at)
values ('0b938ce0-…','b452e316-…','granted','qr_self_entry','2026-08-14T18:20:00Z');

insert into onboarding_items (season_membership_id, season_id, item_type_id, status)
select 'f762fde4-…','b452e316-…', t.id, 'pending'
  from onboarding_item_types t where t.season_id = 'b452e316-…';

insert into season_membership_status_events
  (season_membership_id, from_status, to_status, occurred_at, actor_label, reason)
values ('f762fde4-…', null, 'onboarding', '2026-09-01T09:40:00Z', 'Secretary',
        'Recruit flipped to joined (Mission 6 W14)');
```

She holds no invitation, so the answer-link shell needs one. `capacity` is
`'player'`, which the audience table's own check constraint requires to carry
`season_membership_id` and a null `person_id`; `participant_id` is generated
and must not be supplied:

```sql
insert into event_audience_members (event_id, season_id, capacity, season_membership_id, person_id)
select id, season_id, 'player', 'f762fde4-…', null
  from events where id = '8951eeb2-…';          -- vs Harewell Hawks, 13 Sep, 2 questions

insert into invitations (event_id, event_status, season_id, capacity,
                         audience_member_id, season_membership_id, person_id, status, issued_at)
select id, status, season_id, 'player', '<audience member>', 'f762fde4-…', null, 'issued', now()
  from events where id = '8951eeb2-…';
```

## The tokens

One durable credential is minted per subject, and one single-use answer token
per invitation. Both are stored only as digests, so the plaintext below exists
only for as long as the shoot needs it and is regenerated every run.

```sql
insert into person_access_tokens (person_id, season_id, token_hash, single_use)
values (<person>, 'b452e316-…', sha256hex('y.<invitation>.<nonce>'), true);
```

`W4-05` needs no row at all: a well-formed token naming a uuid that is not an
invitation resolves to `unknown`, which is the whole point of that screen.

## What each screen was shot against

| Screen  | Route             | Subject                                           |
| ------- | ----------------- | ------------------------------------------------- |
| `W4-01` | `/a/y.f7ee136f-…` | Merrick Thornbury — step 1, the imported returner |
| `W4-02` | `/a/y.3ec61c6f-…` | Rosalind Penhaligon — step 1, the flipped recruit |
| `W4-03` | `/a/y.f7ee136f-…` | step 2, the Code of Conduct                       |
| `W4-04` | `/a/y.f7ee136f-…` | step 3, the photo release                         |
| `W4-05` | `/a/y.f7ee136f-…` | step 4, BUCS Play                                 |
| `W4-06` | `/a/y.f7ee136f-…` | step 5, Hudl                                      |
| `W4-07` | `/a/y.f7ee136f-…` | Merrick, having finished the sequence             |
| `W4-08` | `/a/y.3ec61c6f-…` | Rosalind, with nothing left to give               |
| `W4-09` | `/a/y.153f0efc-…` | no subject — a token that resolves to nothing     |

`W4-03` through `W4-07` are states of the sequence that no seeded row produces —
a document read to its end, an agreement taken, a finished run. They are
transformations of the same running page, on the same real credential, and the
content they show is marked as proposed on the review page.
