# 0031 — The club hostname is served by Firebase Hosting, not a load balancer

**Status:** Accepted · **Date:** 2026-08-21 · **Extends:**
[0026](0026-hosted-runtime-database-connection.md) ·
**Constrains:** LAN-142, LAN-126

Decided and executed by Brian on 2026-08-21, after the cheaper option was tested
against the live project rather than assumed.

## Context

The deployed application answered only on its Cloud Run hostname,
`lancers-operations-platform-878714496182.europe-west2.run.app`. That address
cannot be given to members, and it cannot carry the WhatsApp URL-button
templates: a template submitted against it would have to be revoked, resubmitted
and re-reviewed once a permanent hostname existed, and every RSVP link already
issued would have to be reissued.

Cloud Run has a free custom-domain feature — domain mappings — and the obvious
move was to use it. It is refused here:

```
$ gcloud beta run domain-mappings create --service lancers-operations-platform \
    --domain app.oxfordlancers.com --region europe-west2
ERROR: 501 UNIMPLEMENTED: Creating domain mappings is not allowed in europe-west2.
```

The service is in `europe-west2` deliberately, co-located with hosted Supabase
in London ([0026](0026-hosted-runtime-database-connection.md)). The region is not
a mistake to correct.

Google's documented answer for an unsupported region is a global external
Application Load Balancer with a serverless NEG. It works, and it costs roughly
£15–20 per month **for existing**, before a single request — the forwarding rule
is billed hourly whether anyone visits or not. For a volunteer-run club whose
realistic traffic is a few hundred sessions a month, a fixed annual charge of
around £216 to attach a hostname is not proportionate.

## Decision

`app.oxfordlancers.com` is served by **Firebase Hosting**, configured with a
single catch-all rewrite to the existing Cloud Run service.

Firebase Hosting's Cloud Run rewrites explicitly support `europe-west2`. The
custom domain and its certificate belong to Firebase, which has no regional
restriction; Cloud Run keeps being addressed exactly as it was and never learns
it has a custom domain.

### What this deliberately does not change

- **The service does not move.** Still `lancers-operations-platform` in
  `europe-west2`, still co-located with the database. Moving to a
  mapping-supported region would have added a cross-region round trip to every
  database statement and taken the application tier out of the UK.
- **DNS authority does not move.** Nameservers remain GoDaddy. One `CNAME` was
  added on `app`; the apex, `www` and the mail records are untouched. Cloudflare
  would have been free and would have brought a WAF, but it requires moving the
  whole zone and a Worker to rewrite the Host header.
- **Cloud Run's own configuration.** `max-instances` and the runtime identity are
  unchanged.

### Cost

£0 at any plausible club scale. Firebase Hosting bills egress at $0.15/GB with
roughly 10GB/month free; realistic use is well under 1GB. It requires the Blaze
plan, attached to the billing account the project already used.

## Consequences

**Firebase is now in the request path**, and Firebase Hosting is governed by
Firebase's terms rather than the Google Cloud Terms of Service. Anyone debugging
a request that reaches the application must know there is a hop in front of it.

**Firebase forwards exactly one cookie, and the application is named for it.**
This is the constraint that nearly disqualified this decision, and it is not
optional. Firebase strips cookies from the requests it forwards so its CDN can
cache safely, permitting only the exact name `__session`. Supabase's default
`sb-<project-ref>-auth-token` is therefore deleted on every request: sign-in
appears to succeed and the next page bounces to `/login`, and password recovery
fails identically because `/auth/recovery` writes a session `/reset-password`
never receives. Both symptoms are silent. Every cookie-backed Supabase client
in this application consequently sets `cookieOptions` from
`src/lib/supabase/cookies.ts`, and `src/lib/supabase/cookies.test.ts` fails if
one stops.

The cost is a ceiling. `@supabase/ssr` splits a session larger than roughly
3180 bytes into `__session.0`, `__session.1`, … and Firebase strips those too,
with the same silent symptom. A real signed-in session measured 2653 bytes on
2026-08-21 — it fits, with about 500 bytes of headroom, and custom JWT claims
are the obvious way to spend it. `assertSessionCookieFitsOneCookie` logs a named
error the moment a session is split, so that day produces a log line rather than
another evening of mysterious sign-outs.

**Blaze egress has no ceiling**, unlike Cloud Run, which is bounded by
`max-instances: 3`. The hard billing cap and multi-recipient spend alerting in
LAN-143 exist because of this.

**Firebase Hosting provides no protection.** No WAF, no rate limiting, no bot
rules — it absorbs volumetric traffic because it is Google's edge, and forwards
everything else. Protecting the public endpoints is therefore an application
concern, and is open in LAN-144. Choosing Cloudflare there would supersede this
decision.

**Statically prerendered routes are cached at the edge for a year.** Next.js
sends `cache-control: s-maxage=31536000` on them, and a Cloud Run deploy does not
purge Firebase's cache. Today only `/` is affected and it is a placeholder with
no user data. When `/` becomes a real page, a `headers` override in
`firebase.json` is required, or a deploy will leave a stale page at the edge.
Dynamically rendered routes send `no-cache, no-store` and are unaffected — this
was verified against the live deployment before the hostname was attached.

**Do not "fix" this by building the load balancer.** It is the expensive option
this decision rejected, and it is not more correct. In particular,
`gcloud run integrations create --type=custom-domains` looks like a free native
feature and silently provisions exactly that load balancer.

## Alternatives rejected

| Option                 | Why not                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global external ALB    | ~£15–20/month fixed, from zero users. Supported and correct, but not proportionate                                                                                     |
| Move to `europe-west1` | Free mapping, but a cross-region hop on every database statement, the application tier leaves the UK, and the deploy identity, region variable and runbooks all change |
| Cloudflare free tier   | Free and brings a real WAF, but moves the whole DNS zone off GoDaddy and puts a third-party Worker in the path that carries auth tokens                                |
| AWS CloudFront         | Genuinely free at this scale, but adds a second cloud account and a second uncapped billing surface                                                                    |
| Bunny.net              | ~£1/month and simple, but a paid third-party vendor for something Google does for nothing                                                                              |
