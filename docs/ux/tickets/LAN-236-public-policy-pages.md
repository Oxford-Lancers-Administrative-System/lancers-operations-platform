# LAN-236 — public policy documents

Brian requested a draft PR on 8 September 2026 for `/privacy`,
`/data-deletion` and `/terms`, to queue the URLs for an owner deployment.
He selected the General Manager as the interim privacy contact. LAN-11 already
records the club as its own controller; LAN-86 owns the live-data policy gate.

## Interface contract

Three anonymous, read-only documents use the existing `PublicShell` at its
medium reading width. One h1 per page; sequential h2 sections; shared links to
all three documents at the foot. The layout wraps at 375px with no horizontal
scroll. No login, private record, form, database query or new cookie is needed.
Exact route matching in the proxy bypasses session refresh only for these three
documents. Existing protected routes retain their checks.

No pre-existing ticket wireframes cover these new documents. The existing
public shell and typography are reused; desktop and 375px screenshots are the
visual review artifacts. No new domain concept or access capability is added.

## Publication status and owner review

The PR queues routes and concrete draft text, not an approved legal policy.
Each document explicitly identifies itself as a draft. Do not enter these URLs
in Meta as an effective policy until Brian approves the completed text and the
draft notice is removed in the reviewed diff.

Required before publication:

- Confirm and insert the General Manager's monitored club email. Do not invent
  an address or use a personal account from a screenshot.
- Confirm purpose-specific lawful bases against LAN-11/LAN-86 and add them to
  the privacy notice; membership alone is not an Article 6 basis label.
- Approve retention periods or usable retention criteria, including audit
  history and backup deletion, and add them to the notice. The synthetic pilot
  retention rule is not a real-member retention schedule.
- Confirm active providers, international processing and the applicable
  transfer safeguards; add accurate disclosures. A London database location
  alone does not establish that all processing stays in the UK.
- Confirm the data categories, sources, cookie use, mandatory/optional fields
  and any relevant special-category processing disclosures against the deployed
  release. No health-processing permission is created by this notice.
- Review the deletion process and response timing, and approve the proposed
  terms of use. These pages do not implement erasure or change club rules.
- Set the effective date, remove the draft notice and obtain visual approval
  against the final PR head before the owner merges and deploys.

LAN-236 remains open for Sports Federation follow-up and permanent club
handover. The PR must reference it without claiming to close it.

## Meta and production handoff

After owner approval, merge and owner-run `gh workflow run deploy.yml`, visit
each URL without signing in and confirm HTTP 200 and the approved content:

- `https://app.oxfordlancers.com/privacy` → Meta Privacy policy URL
- `https://app.oxfordlancers.com/data-deletion` → Data deletion instructions URL
- `https://app.oxfordlancers.com/terms` → Terms of Service URL

Replace the Facebook-homepage placeholders. Revisit Publish to see Meta's
remaining requirements. No webhook, secret, scheduler, schema or pilot-data
change belongs to this PR. App publication and deployment remain owner actions.

Reference used for the review checklist:
[ICO: What privacy information should we provide?](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/)
