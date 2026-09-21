-- LAN-356 — the club's 2026 Code of Conduct becomes the current version.
--
-- Brian, 2026-09-18: the club's own Code of Conduct document (approved,
-- supplied as a PDF, sha256 ab082021d715fd6bc171fe487192b3eadcf201ade1ce50346f757746c5ff68f1)
-- replaces the LAN-214 placeholder in the versioned slot. Committed at
-- `public/documents/oulafc-code-of-conduct-2026.pdf`, byte-identical to the
-- source. Two things:
--
--   1. One new `onboarding_agreement_versions` row, `agreement_type =
--      'code_of_conduct'`, `version_label = '2026-v1'`. `body` is the
--      document's own text, transcribed exactly (pypdf, proofread page by
--      page against the source) — sixteen numbered points (`1. ` .. `16. `)
--      with `- ` bullets under points 3, 7, 9, 10, 11 and 16, and the title
--      as a `## ` heading. No wording changed, no summarising; British
--      spellings stand as written, "Willfully" included. `pdf_path` points at
--      the committed file. `effective_from` is computed from the latest
--      existing `code_of_conduct` version the same way LAN-347 computed the
--      photo release's, so a `db:reset` that applies both migrations inside
--      one wall-clock second still orders them correctly: there is no
--      "current version" column anywhere in this schema, only "latest by
--      `effective_from`" (`readCurrentOnboardingAgreementVersionIn`, `order
--      by effective_from desc limit 1`), so an ambiguous tie would make the
--      current version a coin toss. The `placeholder-v1` row stays: an
--      agreement already recorded against it must keep resolving to the
--      words that were shown.
--
--   2. A player who ticked the placeholder has not agreed to 2026-v1
--      (Brian, decision 3). `internal.reset_superseded_code_of_conduct`
--      mirrors LAN-375's `internal.refresh_kit_distributed` — a function in
--      the `internal` schema, invoker security, exposed to nothing the Data
--      API can reach — and does the smallest correct thing for one
--      membership: when its Code of Conduct item is `complete` and the
--      agreement behind that completion does not point at the current
--      version, it stamps the stale `onboarding_agreements` row
--      `reopened_at` (LAN-347's own reopen shape — kept as history, never
--      deleted) and resets the item to `pending`, writing the item's own
--      `system` history row. A no-op otherwise. This migration calls it once
--      for every membership whose item is already complete, exactly as the
--      kit migration recomputed every existing membership for its own rule
--      — the three real players who may have ticked the placeholder are
--      asked again once this migration applies. Nothing about
--      `onboarding_agreements` or `onboarding_agreement_versions`'s own
--      insert-only posture changes: the function only ever stamps
--      `reopened_at` on a row already permitted to carry that stamp, and it
--      inserts no new agreement of its own.
--
-- No RLS or grant change beyond the one function: every table this touches
-- already carries the grants LAN-214/LAN-240/LAN-347/LAN-375 gave it.

-- ---------------------------------------------------------------------------
-- 1. The document itself, in the versioned slot
-- ---------------------------------------------------------------------------

insert into public.onboarding_agreement_versions
  (agreement_type, version_label, body, pdf_path, effective_from)
values (
  'code_of_conduct',
  '2026-v1',
  $body$## Code of Conduct for the Oxford University Lancers American Football Club (OULAFC)

1. The Oxford University Lancers American Football Club (“the Club”) does not tolerate any form of harassment and expects all members, employees, and visitors to treat each other with respect, courtesy and consideration.

2. All members of the Club are expected to read and agree to act in accordance with this Code of Conduct and the University of Oxford’s Policy and Procedure on Harassment. Oxford students are also required to act in accordance with the Code of Conduct set out in Statute XI. Membership may be removed or suspended for failing to do so, and opportunities for members to take part in activities within and on behalf of the Club may be restricted.

3. All members of the Club are expected to:
- Treat other members with dignity and respect
- Discourage any form of harassment by making it clear that such behaviour is unacceptable
- Support other members who feel that they have been subject to harassment

4. The club designates one or more member of their committee as ‘welfare officer(s)’ who will act as a source of advice and support for Club members in relation to welfare issues and during harassment complaints.

5. The Club’s designated welfare officer can be contacted for informal advice, including in relation to how you make a complaint. Support and advice is also available from the Sports Federation.

6. The Club Complaints Procedure provides steps for dealing with internal complaints. Clubs are required to have this in place and to follow these steps when they receive a complaint.

7. University of Oxford students can also seek support from:
- One of the University’s harassment advisors;
- College harassment advisors (for members of Oxford colleges);
- Their college deans or other officers with pastoral responsibilities, the Common Room welfare or equal opportunities officer or a student peer supporter;
- Oxford SU’s Student Advice Service
- Student Welfare and Support Services including:
- The University Counselling Service
- The University’s Sexual Harassment and Violence Support Service
- More information is available on the Oxford Students Harassment Pages, including a flow chart explaining the steps within the University’s complaints procedures (e.g. for complaints against staff and students).

8. All members of the club will abide by University regulations, BAFA regulations, and UK law.

9. In any club activity, no member shall:
- Act violently or abusively towards anyone.
- Print or publish media that will bring the club or university into disrepute.

10. In club matches and practices, no member shall:
- Be intoxicated by alcohol or recreational drugs.
- Act disrespectfully towards the referees, opposing team, or opposing fans.
- Willfully disregard BAFA regulations.

11. At social events, no member shall:
- Coerce or abuse any other fellow members or guests.
- Encourage or tolerate the excessive consumption of alcohol.
- Disregard the policies of the establishment hosting the team.
- Act disrespectfully or in any way bring the reputation of the club or university into disrepute.

12. No player shall consume Performance Enhancing Drugs of any kind.

13. All players shall disclose all injuries to the Head Coach, the club President, or to the welfare officer.

14. No player who experiences any symptoms of head trauma will return to play before they have been cleared by a doctor to do so. The minimum time out of action for a player diagnosed with a concussion is 2 weeks.

15. Members of the club are expected to arrive at all training sessions with all necessary kit and at the designated time. Members of the club are expected to be fully kitted by the designated start time.

16. Members of the club should:
- Attend all training sessions apart from those they have a genuine reason to miss (and coaches or at least one member of executive committee should be informed of your absence at least one day before session)
- Arrive at all training sessions with all necessary kit and at the designated time
$body$,
  '/documents/oulafc-code-of-conduct-2026.pdf',
  (select coalesce(max(effective_from), now()) + interval '1 second'
     from public.onboarding_agreement_versions
    where agreement_type = 'code_of_conduct')
);

-- ---------------------------------------------------------------------------
-- 2. Re-asking a player whose agreement no longer covers the current version
-- ---------------------------------------------------------------------------

create or replace function internal.reset_superseded_code_of_conduct(target_membership_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  item_row record;
  membership_row record;
  current_version_id uuid;
  agreement_row record;
begin
  select i.id, i.status
    into item_row
    from public.onboarding_items i
    join public.onboarding_item_types t on t.id = i.item_type_id
   where i.season_membership_id = target_membership_id and t.code = 'code_of_conduct'
   for update of i;

  -- No configured item, or not complete: nothing this player agreed to is stale.
  if not found or item_row.status <> 'complete' then
    return;
  end if;

  select person_id, season_id
    into membership_row
    from public.season_memberships
   where id = target_membership_id;

  select id
    into current_version_id
    from public.onboarding_agreement_versions
   where agreement_type = 'code_of_conduct'
   order by effective_from desc
   limit 1;

  select a.id, a.agreement_version_id
    into agreement_row
    from public.onboarding_agreements a
   where a.person_id = membership_row.person_id
     and a.season_id = membership_row.season_id
     and a.agreement_type = 'code_of_conduct'
     and a.reopened_at is null
   for update of a;

  -- No live agreement, or it already matches the current version: settled.
  if not found or agreement_row.agreement_version_id = current_version_id then
    return;
  end if;

  update public.onboarding_agreements
     set reopened_at = now()
   where id = agreement_row.id;

  update public.onboarding_items
     set status = 'pending'::public.onboarding_item_status,
         completed_on = null,
         updated_at = now()
   where id = item_row.id;

  insert into public.onboarding_item_history
    (onboarding_item_id, season_membership_id, from_status, to_status, actor_kind, reason)
  values
    (item_row.id, target_membership_id, 'complete', 'pending', 'system',
     'The Code of Conduct 2026-v1 supersedes the version this was agreed to (LAN-356).');
end;
$$;

comment on function internal.reset_superseded_code_of_conduct(uuid) is
  'Re-asks the Code of Conduct when the version this membership agreed to is no longer current (LAN-356): reopens the stale onboarding_agreements row (kept as history) and resets the item to pending, recording the change as system in its own history. A no-op when the item is not complete or the agreement already matches the current version.';

revoke all on function internal.reset_superseded_code_of_conduct(uuid) from public;
grant execute on function internal.reset_superseded_code_of_conduct(uuid) to service_role;

-- Every membership whose Code of Conduct is already complete, checked against
-- the version just inserted above — the same "recompute every existing
-- membership" shape the kit migration used for its own rule.
do $$
declare
  membership record;
begin
  for membership in
    select i.season_membership_id
      from public.onboarding_items i
      join public.onboarding_item_types t on t.id = i.item_type_id
     where t.code = 'code_of_conduct' and i.status = 'complete'
  loop
    perform internal.reset_superseded_code_of_conduct(membership.season_membership_id);
  end loop;
end;
$$;
