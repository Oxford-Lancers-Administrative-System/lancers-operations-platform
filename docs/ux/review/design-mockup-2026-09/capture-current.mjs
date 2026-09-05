// Scratch capture of the CURRENT player surfaces — LAN-225's player-surfaces
// addendum. Companion to `capture.mjs`, which photographs the proposal.
//
// ## Why this script exists at all
//
// `capture.mjs` runs against this branch, where `src/theme.ts` has already been
// widened, so it cannot photograph "what is on `main` today" — every page it
// opened would carry the proposed palette. `docs/ux/mockup-standards.md` wants
// both sides of a pair to be photographs, and the grey band on the review page
// says `main`. So the current side is taken from a **separate checkout of
// `main`**, served on its own port against the same local Supabase slot:
//
//   git worktree add --detach <somewhere> <main sha>
//   ln -s <repo>/node_modules <somewhere>/node_modules
//   cp .env.local <somewhere>/.env.local
//   (cd <somewhere> && npx next dev -p 3131)
//   node docs/ux/review/design-mockup-2026-09/capture-current.mjs \
//     --origin http://127.0.0.1:3131 --person <uuid> --invitation <uuid>
//
// ## Why it mints, and what it is careful about
//
// The seed mints no player tokens: `person_access_tokens` and
// `rsvp_access_tokens` are both empty after `db:reset` + `db:seed`, so every
// token-scoped route 404s until something issues one. This script issues the
// three it needs, in process, and **never writes a token anywhere** — not to
// the manifest, not to a file, not to stdout. The screenshots are full-page
// captures of the rendered document, not of the browser chrome, so no address
// bar and no token appears in the evidence either.
//
// The rules it follows are the services' own, because a hand-written insert
// misses them:
//   - a token is 32 random bytes base64url; `token_hash` is the lowercase
//     sha256 hex of the whole string (`mintToken`/`hashToken`);
//   - `person_access_tokens_one_live_per_person_season` makes revoke-then-insert
//     the only safe order for a durable person token;
//   - `rsvp_access_tokens.expires_at` is `NOT NULL` and the database refuses a
//     link for an event that has already started, so the expiry is the event's
//     own start;
//   - an answer token is not a bare secret: it is `<y|n>.<invitationId>.<nonce>`
//     and the hash covers the whole string. `/a/[token]` does not accept an
//     RSVP token, which is what made it 404 in the first pass.
//
// It is local-only by construction: it reads `SUPABASE_DB_URL` from the
// worktree's own `.env.local`, and `scripts/lib/local-db.mjs` refuses anything
// that is not loopback.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "dotenv";
import pg from "pg";
import { chromium } from "playwright";

const W = process.cwd();
const OUT = path.join(W, "docs/ux/review/design-mockup-2026-09/screens-current");
fs.mkdirSync(OUT, { recursive: true });

function arg(name, required = true) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? null : process.argv[index + 1];
  if (required && !value) throw new Error(`--${name} is required`);
  return value;
}

const origin = arg("origin");
const personId = arg("person");
const invitationId = arg("invitation");
/** The `main` commit the served checkout is at — recorded so the pair can be dated. */
const headSha = arg("head");

config({ path: path.join(W, ".env.local"), quiet: true });
const { resolveLocalDatabaseUrl } = await import(`${W}/scripts/lib/local-db.mjs`);

const mintToken = () => crypto.randomBytes(32).toString("base64url");
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const client = new pg.Client({ connectionString: resolveLocalDatabaseUrl() });
await client.connect();

const seasonRow = await client.query(
  `select sm.season_id
     from public.season_memberships sm
    where sm.person_id = $1 and sm.status = 'active'
    order by sm.created_at desc
    limit 1`,
  [personId],
);
if (seasonRow.rows.length === 0) throw new Error(`No active membership for person ${personId}`);
const seasonId = seasonRow.rows[0].season_id;

// 1. The durable person token — `/me/[token]`, its questionnaire, and the
//    tokenised sign-up and opt-out doors all read this one row.
const personToken = mintToken();
await client.query("begin");
await client.query(
  `update public.person_access_tokens
      set revoked_at = now(), revoked_reason = 'Superseded by a freshly issued durable link.'
    where person_id = $1 and season_id = $2 and not single_use and revoked_at is null`,
  [personId, seasonId],
);
await client.query(
  `insert into public.person_access_tokens (person_id, season_id, token_hash, single_use)
   values ($1, $2, $3, false)`,
  [personId, seasonId, hashToken(personToken)],
);

// 2. The single-use answer token — `/a/[token]`. `y` is the answer the button
//    in the message carried; the confirm page is what it lands on.
const answerToken = `y.${invitationId}.${mintToken()}`;
await client.query(
  `insert into public.person_access_tokens (person_id, season_id, token_hash, single_use)
   values ($1, $2, $3, true)`,
  [personId, seasonId, hashToken(answerToken)],
);

// 3. The RSVP token — `/rsvp/[token]`. The audit could not capture a valid one
//    (the link travels by email and the local scheduler does not run future
//    jobs), which is why S5's current side had to borrow `/a/[token]`'s chrome.
const startsAt = await client.query(
  // The services' own `EVENT_START_EXPRESSION`, verbatim: both
  // `rsvp-tokens.ts` and `player-answer-tokens.ts` answer "when does this
  // start?" in the club's timezone, and a second, slightly different copy is
  // exactly the drift they warn about.
  `select (e.scheduled_on + coalesce(e.starts_at, '00:00'::time)) at time zone 'Europe/London'
            as starts_at
     from public.invitations i join public.events e on e.id = i.event_id
    where i.id = $1`,
  [invitationId],
);
const rsvpTokenId = crypto.randomUUID();
const rsvpToken = mintToken();
await client.query(
  `update public.rsvp_access_tokens
      set superseded_at = now(), superseded_by_token_id = $2
    where invitation_id = $1 and id <> $2 and revoked_at is null and superseded_at is null`,
  [invitationId, rsvpTokenId],
);
await client.query(
  `insert into public.rsvp_access_tokens (id, invitation_id, token_hash, expires_at)
   values ($1, $2, $3, $4)`,
  [rsvpTokenId, invitationId, hashToken(rsvpToken), startsAt.rows[0].starts_at],
);
await client.query("commit");
await client.end();

const p = encodeURIComponent(personToken);
const ROUTES = [
  { id: "C9-player-home", route: `/me/${p}`, mirrors: "/me/[token]" },
  { id: "C10-details", route: `/me/${p}/details`, mirrors: "/me/[token]/details" },
  {
    id: "C10b-agreement",
    route: `/me/${p}/details?step=code_of_conduct`,
    mirrors: "/me/[token]/details?step=code_of_conduct",
  },
  { id: "C11-answer", route: `/a/${encodeURIComponent(answerToken)}`, mirrors: "/a/[token]" },
  { id: "C5-rsvp", route: `/rsvp/${encodeURIComponent(rsvpToken)}`, mirrors: "/rsvp/[token]" },
];
const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "phone", width: 375, height: 812 },
];

const browser = await chromium.launch();
const manifest = [];
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  // The same exclusion `capture.mjs` makes, and for the same reason: `next dev`
  // floats a dev-tools badge over the bottom-left corner, and it never ships.
  await context.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent =
      "nextjs-portal, [data-nextjs-dev-tools-button] { display: none !important }";
    document.addEventListener("DOMContentLoaded", () => document.head.append(style));
  });
  const page = await context.newPage();
  const seen = await (async () => {
    await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    return page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  })();
  console.log(`${vp.label}: measured ${seen.width}x${seen.height}`);

  for (const entry of ROUTES) {
    // `/a/[token]`'s token is single use, and its own confirm page does not
    // spend it — only the POST does. The desktop pass and the phone pass
    // therefore read the same live token, which is what makes the pair a pair.
    const file = `${entry.id}--${vp.label}.png`;
    const started = Date.now();
    try {
      const response = await page.goto(`${origin}${entry.route}`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, file), fullPage: true, timeout: 60_000 });
      const size = await page.evaluate(() => document.documentElement.scrollHeight);
      manifest.push({
        id: entry.id,
        mirrors: entry.mirrors,
        viewport: vp.label,
        measured: seen,
        file,
        status: response?.status() ?? null,
        pageHeight: size,
        ms: Date.now() - started,
      });
      console.log(`  ${file} ${response?.status()} (${size}px, ${Date.now() - started}ms)`);
    } catch (error) {
      manifest.push({
        id: entry.id,
        mirrors: entry.mirrors,
        viewport: vp.label,
        file,
        error: String(error.message).slice(0, 200),
      });
      console.log(`  ${file} FAILED: ${String(error.message).slice(0, 140)}`);
    }
  }
  await context.close();
}
await browser.close();

fs.writeFileSync(
  path.join(OUT, "manifest.json"),
  JSON.stringify(
    {
      side: "current",
      headSha,
      origin,
      note: "Captured from a separate checkout of main served against the same local Supabase slot. No token is recorded here or anywhere else.",
      personId,
      invitationId,
      at: new Date().toISOString(),
      captures: manifest,
    },
    null,
    2,
  ) + "\n",
);
console.log("done");
