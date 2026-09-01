# Local walk data — W3

Not a repository fixture and not committed as one. This is the SQL a session
runs against its own mission slot to put a flipped recruit on the roster,
because LAN-204 is in Backlog and there is no flip to run.

```sql
-- season 2026-27
insert into people (given_name, family_name) values ('Rosalind','Penhaligon');
insert into contact_points (person_id, kind, raw_value, normalised_value, is_preferred, scope, source)
  values (<person>, 'phone', '07700 900312', '+447700900312', true, null, 'recruit sign-up'),
         (<person>, 'email', 'rosalind.penhaligon@brasenose.ox.ac.example',
          'rosalind.penhaligon@brasenose.ox.ac.example', true, 'personal', 'recruit sign-up');
update people set college = 'Brasenose', matriculation_year = 2024 where id = <person>;

insert into season_memberships (person_id, season_id, status, entry, confirmed_on)
  values (<person>, <season>, 'onboarding', 'new', '2026-09-01');
insert into recruitment_prospects
  (person_id, season_id, status, source, first_contact_on, committed_on, converted_membership_id)
  values (<person>, <season>, 'joined', 'Taster session sign-up', '2026-08-14', '2026-08-26', <membership>);
insert into season_messaging_consents (person_id, season_id, state, source, changed_at)
  values (<person>, <season>, 'granted', 'qr_self_entry', '2026-08-14T18:20:00Z');
insert into onboarding_items (season_membership_id, season_id, item_type_id, status)
  select <membership>, <season>, t.id, 'pending' from onboarding_item_types t where t.season_id = <season>;
insert into season_membership_status_events
  (season_membership_id, from_status, to_status, occurred_at, actor_label, reason)
  values (<membership>, null, 'onboarding', '2026-09-01T09:40:00Z', 'Secretary',
          'Recruit flipped to joined (Mission 6 W14)');
```

Synthetic throughout. No real member data.
