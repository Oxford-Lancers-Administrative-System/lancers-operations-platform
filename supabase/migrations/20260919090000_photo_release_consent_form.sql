-- LAN-347 — the photo release step becomes the University's own consent form.
--
-- Three things, and nothing else:
--
--   1. `people.address` / `people.postcode` — the postal address the
--      University's form asks for. Collected from the player on the photo
--      release step, correctable by an operator, printed on the player and
--      recruit records beside the other contact facts. Nullable, because every
--      person already on record has neither; blank is refused outright, so a
--      recorded value is always a value (the `people` table's own idiom —
--      `people_given_name_not_blank`).
--
--   2. `onboarding_agreements.printed_name` — the name as the player typed it
--      under the tick. Nullable, because rows already recorded under the
--      placeholder wording have none and history is not rewritten; the service
--      refuses a *new* agreement without one whenever the version's own body
--      asks for a printed name (`onboarding-agreement-body.ts`). Never a
--      signature, and never called one (Brian, 2026-09-14, LAN-347 decision 1;
--      LAN-213 settled that a tick is the model).
--
--   3. One new `onboarding_agreement_versions` row for `photo_release`,
--      carrying the University's wording verbatim — the consent form and its
--      Data Protection Privacy Notice. This is the slot LAN-214 built and
--      LAN-213 gated; the mechanism is unchanged, and the `placeholder-v1` row
--      stays exactly where it is because an agreement already recorded against
--      it must keep resolving to the words that were shown.
--
-- The body is plain text with `[[section]]` markers, one per block the page
-- renders. It is not JSON: the column is `text`, the wording is the artefact,
-- and a marker is the smallest thing that lets the page put a field where the
-- paper form has a box while leaving every printed word in the row rather than
-- in a component. `src/lib/services/onboarding-agreement-body.ts` is the one
-- reader; a body with no markers (the Code of Conduct's placeholder, until
-- LAN-282) is rendered as plain paragraphs, so nothing about this migration
-- changes that document.
--
-- The Activities and Purpose lines carry only their printed text, and the
-- form's three optional "insert any other…" lines stay empty — the club adds
-- nothing to the University's form (LAN-347 decision 2).
--
-- RLS and grants are unchanged: both tables already enable row level security
-- and already grant only the narrow server need to `service_role`, and a new
-- column on an existing table inherits that table's privileges.

-- ---------------------------------------------------------------------------
-- 1. The postal address, on the person
-- ---------------------------------------------------------------------------

alter table public.people
  add column address text,
  add column postcode text;

alter table public.people
  add constraint people_address_not_blank
    check (address is null or btrim(address) <> ''),
  add constraint people_postcode_not_blank
    check (postcode is null or btrim(postcode) <> '');

comment on column public.people.address is
  'Postal address, as the person typed it on the photo release step (LAN-347). Multi-line free text — never parsed, never split into lines here. Blank is refused; not recorded is null.';

comment on column public.people.postcode is
  'Postal code, as the person typed it (LAN-347). Free text, deliberately unvalidated: a UK postcode rule would refuse the real overseas addresses the club already holds.';

-- ---------------------------------------------------------------------------
-- 2. The printed name, on the agreement
-- ---------------------------------------------------------------------------

alter table public.onboarding_agreements
  add column printed_name text;

alter table public.onboarding_agreements
  add constraint onboarding_agreements_printed_name_not_blank
    check (printed_name is null or btrim(printed_name) <> '');

comment on column public.onboarding_agreements.printed_name is
  'The name the person typed under the tick, stored exactly as typed (LAN-347). Not a signature and never treated as one — the agreement is still version, moment and person. Null on rows recorded before the form asked for it.';

-- ---------------------------------------------------------------------------
-- 3. The University's wording, in the versioned slot
-- ---------------------------------------------------------------------------
--
-- `effective_from` is computed from the versions already on record rather than
-- defaulted to `now()`: both rows are written by migrations, and a reset that
-- applies them inside one transaction would give them the same `now()`, making
-- "the current version" a coin toss. One second after the latest photo release
-- version there is, whenever that was, is unambiguous forever.

insert into public.onboarding_agreement_versions
  (agreement_type, version_label, body, effective_from)
values (
  'photo_release',
  'oxford-consent-form-v1',
  $body$[[heading]]
Photograph / filming / interview consent form
[[lead]]
This is a consent form for photos, film or voice recording for the activities below.
[[event]]
Event
[[event-note]]
and duration if applicable
[[date]]
Date
[[name]]
Name
[[consent-line]]
agrees that the University of Oxford can photograph, film or record the voice of (your name and/or children’s names):
[[consent-line-tail]]
(for whom you are the parent / guardian) at the event set out above.
[[address]]
Address
[[postcode]]
Post code:
[[tel]]
Tel:
[[email]]
Email:
[[activities-intro]]
You confirm that Oxford University can use your photo, film or voice recording for the following activities and purpose:
[[activities]]
The ‘Activities’
Posting online, storing, saving, uploading, copying, sharing on social media
[[purpose]]
The ‘Purpose’
Use for printed and online materials for Oxford University (including publications, reports, promotional material, websites and social media)
[[permissions]]
You confirm that Oxford University can:
- store copies of any photograph/recording for as long as necessary to fulfil the Purpose;
- store the photograph and your contact details in the University’s photographic libraries and databases; and
- store your contact details on its databases for the purpose of contacting you if necessary.
[[clauses]]
1. The University will process the photograph/recording and your contact details and any related personal data in accordance with the Data Protection Privacy Notice (see back for more details).
2. This consent form is governed by and construed in accordance with English law and the University and you submit to the exclusive jurisdiction of the English courts.
[[agree]]
I agree to the terms
[[print-name]]
Print name
[[print-name-tail]]
to confirm you have accepted and agreed (or parent/guardian’s name if the individual is under 13 years of age or is a vulnerable adult)
[[privacy]]
Data Protection Privacy Notice
In the course of completing this Consent Form, you have provided information about yourself (‘personal data’). We (the University of Oxford) are the ‘data controller’ for this information, which means we decide how to use it and are responsible for looking after it in accordance with the Data Protection Act 2018 and the General Data Protection Regulation as implemented into UK law and associated data protection legislation.
## How we use your data
We will use your data for the Purposes as set out in this Consent Form. We are processing your data for these purposes only because you have given us your consent to do so, by signing this Consent Form.
You can withdraw your consent at any time by contacting us at the address set out below. In this event, we will stop the processing as soon as we can. However, this will not affect the lawfulness of any processing carried out before your withdrawal of consent.
We will only use your data for the purposes for which we collected it, unless we reasonably consider that we need to use it for another related reason and that reason is compatible with the original purpose. If we need to use your data for an unrelated purpose, we will seek your consent to use it for that new purpose.
## Who has access to your data?
Access to your data within the University will be provided to those who need to view it as part of their work in carrying out the purposes described above.
We may share your data with companies who provide services to us, such as for printing, web hosting, asset and social media management, and, if applicable:
These companies are required to take appropriate security measures to protect your data in line with our policies. We do not allow them to use your data for their own purposes. We permit them to process your data only for specified purposes and in accordance with our instructions.
We may also share your data with the following organisations for the reasons indicated:
Where we share your data with a third party, we will seek to share the minimum amount necessary.
## Retaining your data
We will only retain your data for as long as we need it to meet our purposes, including any relating to legal, accounting, or reporting requirements.
## Security
Your data will be held securely in accordance with the University’s policies and procedures. Further information is available at www.ox.ac.uk/privacy-policy.
## Where we store and use your data
We store and use your data on University premises, in both a manual and electronic form.
Electronic data may be transferred to, and stored at, a destination outside the United Kingdom (UK), for example, when we communicate with you using a cloud based service provider that operates outside the UK such as Survey Monkey, MailChimp, Eventbrite, Wufoo, Facebook, Instagram, Twitter etc, and/or:
Such transfers will only take place if one of the following applies:
- the country receiving the data is considered by the UK to provide an adequate level of data protection;
- the organisation receiving the data is covered by an arrangement recognised by the UK as providing an adequate standard of data protection;
- the transfer is governed by approved contractual clauses;
- the transfer has your consent;
- the transfer is necessary for the performance of a contract with you or to take steps requested by you prior to entering into that contract; or
- the transfer is necessary for the performance of a contract with another person, which is in your interests.
## Your rights
You have the right to:
- request access to your data (commonly known as a “subject access request”). This enables you to receive a copy of your data and to check that we are lawfully processing it.
- request correction of your data. This enables you to ask us to correct any incomplete or inaccurate information we hold about you.
- request erasure of your data. This enables you to ask us to delete or remove your data where there is no good reason for us continuing to process it. You also have the right to ask us to delete or remove your data where you have exercised your right to object to processing (see below).
- object to the processing of your data, where we are processing it to meet our public tasks or legitimate interests (or the legitimate interests of a third party) and there is something about your particular situation which makes you want to object to processing on this ground. You also have the right to object where we are processing your data for direct marketing purposes.
- request that the processing of your data is restricted. This enables you to ask us to suspend the processing of your data, for example, if you want us to establish its accuracy or the reason for processing it.
- request the transfer of your data to another party
Further information on these rights is available from the Information Commissioner’s Office (https://ico.org.uk/for-organisations/guide-to-the-general-data-protection-regulation-gdpr/individual-rights/).
Depending on the circumstances and the nature of your request, it may not be possible for us to do what you have asked, for example, where there is a statutory or contractual requirement for us to process your data and it would not be possible to fulfil our legal obligations if we were to stop.
## Contact
If you wish to raise any queries or concerns about our use of your data, please contact us at:
[[privacy-contact]]
Oxford University Lancers American Football Club
american.football@sport.ox.ac.uk$body$,
  (select coalesce(max(effective_from), now()) + interval '1 second'
     from public.onboarding_agreement_versions
    where agreement_type = 'photo_release')
);
