# LAN-524 — make the Messaging queue's failures true failures

One file, `correct-message-outcomes.sql`, that **Brian runs by hand, once,
against hosted**, after the LAN-524 code is deployed. No agent runs it there.
Read [`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md) first.

## Why it exists

Read-only production inspection on 3 November 2026 found the Messaging queue
at 301 Attempted, with Retryable failures recurring for the same people.

| Rows | What they were                                                                                                                                                                                                                    | After                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 259  | WhatsApp receipts saying the number is not on WhatsApp, stored as `failed`, so 82 read **Retryable**. No retry can deliver them; the same code refused at send time is already final. The application now stores them `rejected`. | **Failed**                                                     |
| 18   | Emails the old 30-day sweep marked failed with WhatsApp's wording, before LAN-480 limited the sweep to WhatsApp. Nothing said they failed.                                                                                        | **Unknown**                                                    |
| 154  | Emails accepted before email delivery receipts reached the club (the first arrived 31 October 2026, 18:30 UTC). No receipt will ever arrive.                                                                                      | **Unknown**, as LAN-472 did for WhatsApp; LAN-501 reads it so. |

The 147 WhatsApp sends still Attempted are left alone: WhatsApp confirmed it
sent them and never confirmed arrival, and LAN-288's sweep moves each to Failed
thirty days after it was sent.

## What it changes

- `delivery_results.outcome`, `failed` to `rejected`, on a WhatsApp result
  whose attempt WhatsApp accepted and whose detail is one of the sentences the
  application stores for a code no retry can clear.
- For the falsely failed emails: deletes that result, rewords the attempt's
  reason, and returns the job to `processing` with no error. That is the state
  LAN-501 reads as Unknown.
- For the unreported emails: concludes the attempt with no outcome.

It creates nothing and needs no `cleanup.sql`. Running it a second time
changes nothing.

## Running it

1. Open the hosted project's SQL editor and paste the whole file.
2. Read the first result: the database and user. Stop if either is wrong.
3. Read the preview: one row per correction with its count. Expect about 259,
   18 and 154. Keep this output; it is the record of the change.
4. Let it finish. The last result repeats the three counts after the change.

Afterwards the Messaging queue shows about 147 Attempted, and the
not-on-WhatsApp messages read Failed with no Retry.

## Proof

`tests/message-outcome-correction.test.ts` runs this file against the local
database, inside a transaction it rolls back, over synthetic rows. Each
correction is proved, and so is each row it must leave alone: a provider
hiccup stays Retryable, an email sent after receipts and an unconfirmed
WhatsApp send stay Attempted, and a second run changes nothing. It also checks
that the script's list of sentences equals the application's.
