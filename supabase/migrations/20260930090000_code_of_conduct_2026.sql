-- LAN-356 — the club's 2026 Code of Conduct becomes the current version.
--
-- Brian, 2026-09-18: the club's own Code of Conduct document (approved,
-- supplied as a PDF, sha256 ab082021d715fd6bc171fe487192b3eadcf201ade1ce50346f757746c5ff68f1)
-- replaces the LAN-214 placeholder in the versioned slot. Committed at
-- `public/documents/oulafc-code-of-conduct-2026.pdf`, byte-identical to the
-- source.
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
-- No RLS or grant change: every table this touches already carries the
-- grants LAN-214 gave it.

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

