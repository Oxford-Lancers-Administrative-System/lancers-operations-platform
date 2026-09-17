-- LAN-375 — the Kit group: which kit a player was issued, and a Kit
-- Distributed flag that stops being typed by hand.
--
-- Source: Clint's kit sheet, values verbatim, spellings included. Eleven
-- items, one single-select each, blank or one value. This records which kit
-- was issued; it is not an inventory and nothing counts stock.
--
-- Three things:
--
--   1. `kit_item_options` — what each item allows, reference data, the
--      sheet's own words in the sheet's own order. Read and never written by
--      the application: a new helmet size is a migration, exactly as a
--      position vocabulary version is. Clint's spellings are reproduced
--      exactly, "Champro all porpose L" and "Schutt skill S" included,
--      because the sheet is the record and correcting it here would put the
--      application's words and the club's words out of step.
--
--   2. `kit_issue_records` — one row per filled item, keyed (membership,
--      item), value proved against that item's own list by composite foreign
--      key. Braces 1 and Braces 2 are two plain columns of this table's own
--      shape, each blank or one value, with no count field anywhere (Brian,
--      2026-09-16). Blank is the absence of a row.
--
--   3. Kit Distributed becomes derived. The `kit_sorted` onboarding item
--      stays exactly where it is, in the Onboarding group, and stays the red
--      flag it was; what changes is that nobody types it. It reads complete
--      when all five of Helmet, Shoulder Pads, Lower Pads, Lowers and
--      Practice Jersey carry a value, and pending otherwise. Team Mouthguard
--      is deliberately not in the rule.
--
--      The derivation is a trigger rather than a view or a service-layer
--      computation because the item is a real row that other things already
--      read, count and report on — the board's onboarding summary, the
--      outstanding-items notice, the chase. Making it a view would mean
--      rewriting all of those; making it a service-layer rule would leave the
--      one thing the requirement insists on — that it can never be hand-set —
--      resting on every future caller remembering. The trigger writes the
--      item's own history row as `system`, so when it flipped is still
--      recorded, and `isDerivedItem` refuses a hand set in the service layer
--      on top.
--
-- Formalwear keeps Tie and Bow tie (LAN-387) and the club's blue game socks
-- are a kit item here, not formalwear.

create type public.kit_item as enum (
  'helmet',
  'shoulder_pads',
  'lower_pads',
  'lowers',
  'practice_jersey',
  'loaner_cleats',
  'team_mouthguard',
  'team_gloves',
  'braces_1',
  'braces_2',
  'socks'
);

-- ---------------------------------------------------------------------------
-- 1. What each item allows (reference data)
-- ---------------------------------------------------------------------------

create table public.kit_item_options (
  item public.kit_item not null,
  value text not null,
  sort_order smallint not null,

  constraint kit_item_options_pkey primary key (item, value),
  constraint kit_item_options_value_not_blank check (btrim(value) <> '')
);

comment on table public.kit_item_options is
  'What each issued-kit item allows — Clint''s kit sheet, LAN-375, values and spellings verbatim. Reference data: a new size is a migration.';

insert into public.kit_item_options (item, value, sort_order) values
  ('helmet', 'Speedflex M', 1),
  ('helmet', 'Speedflex L', 2),
  ('helmet', 'Speedflex XL', 3),
  ('helmet', 'Veng Pro L', 4),
  ('helmet', 'Veng Pro XL', 5),
  ('helmet', 'Air M', 6),
  ('helmet', 'Air L', 7),
  ('helmet', 'Air XL', 8),
  ('helmet', 'Xenith XL', 9),
  ('shoulder_pads', 'Riddell OL/DL 2XL', 1),
  ('shoulder_pads', 'Riddell OL/DL XL', 2),
  ('shoulder_pads', 'Riddell Skill L', 3),
  ('shoulder_pads', 'Riddell Skill M', 4),
  ('shoulder_pads', 'Riddell All purpose M', 5),
  ('shoulder_pads', 'Schutt OL/DL 2XL', 6),
  ('shoulder_pads', 'Schutt Skill L', 7),
  ('shoulder_pads', 'Schutt All purpose L', 8),
  ('shoulder_pads', 'Schutt Skill M', 9),
  ('shoulder_pads', 'Schutt All purpose M', 10),
  ('shoulder_pads', 'Schutt skill S', 11),
  ('shoulder_pads', 'Williams OL/DL 2XL', 12),
  ('shoulder_pads', 'Xenith OL/DL 2XL', 13),
  ('shoulder_pads', 'Bike RB/DB XL', 14),
  ('shoulder_pads', 'Douglas OL/DL XL', 15),
  ('shoulder_pads', 'Douglas Skill L', 16),
  ('shoulder_pads', 'Douglas Female S', 17),
  ('shoulder_pads', 'Douglas Female XL', 18),
  ('shoulder_pads', 'Shields OL/DL XL', 19),
  ('shoulder_pads', 'Shields all purpose L', 20),
  ('shoulder_pads', 'Shields all purpose M', 21),
  ('shoulder_pads', 'XTECH Skill XL', 22),
  ('shoulder_pads', 'Champro SKILL L', 23),
  ('shoulder_pads', 'Champro all porpose L', 24),
  ('shoulder_pads', 'Champro Skill M', 25),
  ('shoulder_pads', 'Champro Skill S', 26),
  ('shoulder_pads', 'Rawlings all purpose L', 27),
  ('lower_pads', '7 Pad Girdle', 1),
  ('lower_pads', '5 Pad Girdle + Knee', 2),
  ('lower_pads', 'Set of pads', 3),
  ('lowers', 'Yes - Solid Blue', 1),
  ('lowers', 'Yes - Blue with Gold Stripe', 2),
  ('lowers', 'No', 3),
  ('lowers', 'Other', 4),
  ('practice_jersey', 'Blue', 1),
  ('practice_jersey', 'White', 2),
  ('practice_jersey', 'Red', 3),
  ('loaner_cleats', 'Yes', 1),
  ('loaner_cleats', 'No', 2),
  ('team_mouthguard', 'Yes', 1),
  ('team_mouthguard', 'No', 2),
  ('team_gloves', 'Yes - OL/DL', 1),
  ('team_gloves', 'Yes - Skill', 2),
  ('team_gloves', 'No', 3),
  ('braces_1', 'Ankle - S', 1),
  ('braces_1', 'Ankle - M', 2),
  ('braces_1', 'Ankle - L', 3),
  ('braces_1', 'Ankle - XL', 4),
  ('braces_1', 'Knee - S', 5),
  ('braces_1', 'Knee - M', 6),
  ('braces_1', 'Knee - L', 7),
  ('braces_1', 'Knee - XL', 8),
  ('braces_1', 'Knee - XXL', 9),
  ('braces_1', 'Knee - XXXL', 10),
  ('braces_1', 'Knee - XXXXL', 11),
  ('braces_1', 'Shoulder', 12),
  ('braces_2', 'Ankle - S', 1),
  ('braces_2', 'Ankle - M', 2),
  ('braces_2', 'Ankle - L', 3),
  ('braces_2', 'Ankle - XL', 4),
  ('braces_2', 'Knee - S', 5),
  ('braces_2', 'Knee - M', 6),
  ('braces_2', 'Knee - L', 7),
  ('braces_2', 'Knee - XL', 8),
  ('braces_2', 'Knee - XXL', 9),
  ('braces_2', 'Knee - XXXL', 10),
  ('braces_2', 'Knee - XXXXL', 11),
  ('braces_2', 'Shoulder', 12),
  ('socks', 'Yes', 1),
  ('socks', 'No', 2);

-- ---------------------------------------------------------------------------
-- 2. What each player was issued
-- ---------------------------------------------------------------------------

create table public.kit_issue_records (
  id uuid primary key default gen_random_uuid(),
  season_membership_id uuid not null,
  season_id uuid not null,

  item public.kit_item not null,
  value text not null,

  recorded_by_person_id uuid references public.people (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint kit_issue_records_membership_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,
  constraint kit_issue_records_one_per_item unique (season_membership_id, item),
  constraint kit_issue_records_value_in_item
    foreign key (item, value)
    references public.kit_item_options (item, value) on update cascade
);

create index kit_issue_records_membership_idx
  on public.kit_issue_records (season_membership_id);
create index kit_issue_records_season_idx
  on public.kit_issue_records (season_id, item);

comment on table public.kit_issue_records is
  'Which kit a player was issued this season — one row per filled item (LAN-375). Blank is the absence of a row. Not an inventory: nothing here counts stock.';

-- ---------------------------------------------------------------------------
-- 3. Kit Distributed, derived
-- ---------------------------------------------------------------------------

-- The two functions live outside `public` on purpose. Anything in `public` is
-- in the schema the Data API is configured to expose, and a browser-safe key
-- listing an RPC that rewrites an onboarding item is exactly what
-- `tests/rls-posture.test.ts` exists to refuse. `internal` is exposed to
-- nothing; `service_role` is granted usage and execute at the end of this file
-- and no other role is.
create schema if not exists internal;

create or replace function internal.refresh_kit_distributed(target_membership_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  item_row record;
  should_be public.onboarding_item_status;
  filled integer;
begin
  select i.id, i.status
    into item_row
    from public.onboarding_items i
    join public.onboarding_item_types t on t.id = i.item_type_id
   where i.season_membership_id = target_membership_id and t.code = 'kit_sorted'
   for update of i;

  -- A membership whose season does not carry the item has nothing to derive.
  if not found then
    return;
  end if;

  select count(*)
    into filled
    from public.kit_issue_records k
   where k.season_membership_id = target_membership_id
     and k.item in ('helmet', 'shoulder_pads', 'lower_pads', 'lowers', 'practice_jersey');

  should_be := case when filled = 5 then 'complete'::public.onboarding_item_status
                    else 'pending'::public.onboarding_item_status end;

  if item_row.status = should_be then
    return;
  end if;

  update public.onboarding_items
     set status = should_be,
         completed_on = case when should_be = 'complete' then current_date else null end,
         updated_at = now()
   where id = item_row.id;

  insert into public.onboarding_item_history
    (onboarding_item_id, season_membership_id, from_status, to_status, actor_kind, reason)
  values
    (item_row.id, target_membership_id, item_row.status, should_be, 'system',
     'Derived from the kit issued (LAN-375).');
end;
$$;

comment on function internal.refresh_kit_distributed(uuid) is
  'Recomputes one membership''s Kit Distributed onboarding item from its issued kit — complete when Helmet, Shoulder Pads, Lower Pads, Lowers and Practice Jersey all carry a value (LAN-375). Team Mouthguard is deliberately not in the rule.';

create or replace function internal.kit_issue_records_refresh_flag()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform internal.refresh_kit_distributed(old.season_membership_id);
    return old;
  end if;

  perform internal.refresh_kit_distributed(new.season_membership_id);
  if tg_op = 'UPDATE' and old.season_membership_id <> new.season_membership_id then
    perform internal.refresh_kit_distributed(old.season_membership_id);
  end if;
  return new;
end;
$$;

create trigger kit_issue_records_refresh_flag
  after insert or update or delete on public.kit_issue_records
  for each row execute function internal.kit_issue_records_refresh_flag();

-- Every membership starts from the rule rather than from whatever was last
-- typed. Nothing has kit rows yet, so this reads every Kit Distributed item as
-- pending; a value recorded by hand before today is superseded, and its own
-- history row records that it was.
do $$
declare
  membership record;
begin
  for membership in
    select i.season_membership_id
      from public.onboarding_items i
      join public.onboarding_item_types t on t.id = i.item_type_id
     where t.code = 'kit_sorted'
  loop
    perform internal.refresh_kit_distributed(membership.season_membership_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------

alter table public.kit_item_options enable row level security;
alter table public.kit_issue_records enable row level security;

revoke all on table public.kit_item_options, public.kit_issue_records
  from anon, authenticated, service_role;

grant select on table public.kit_item_options to service_role;
grant select, insert, update, delete on table public.kit_issue_records to service_role;

revoke all on schema internal from public;
revoke all on function internal.refresh_kit_distributed(uuid) from public;
revoke all on function internal.kit_issue_records_refresh_flag() from public;

-- The trigger's own body calls `refresh_kit_distributed`, and that inner call
-- is checked at run time against whoever is writing the row.
grant usage on schema internal to service_role;
grant execute on function internal.refresh_kit_distributed(uuid) to service_role;
