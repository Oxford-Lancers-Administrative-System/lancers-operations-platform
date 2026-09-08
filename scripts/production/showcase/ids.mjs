/**
 * Deterministic identifiers for every row the showcase creates — LAN-124.
 *
 * ## Why these are the ownership marker
 *
 * `docs/pilot-data-runbook.md` and `AGENTS.md` describe the ownership marker
 * for pilot data as "a deterministic identifier plus a `PILOT-<ISSUE-ID>`
 * sentinel", and every scenario under `scripts/pilot/` writes that sentinel into
 * a name so a human reading a row can see at a glance that it is not real.
 *
 * LAN-124 forbids exactly that: *"Do not put visible DEMO, TEST, or similar
 * markers into player or event names."* The showcase has to look like a living
 * football operation, and a roster of forty-two people each captioned
 * PILOT-LAN-124 does not.
 *
 * So the deterministic half of that convention carries the whole weight here,
 * and it is strengthened rather than merely kept. Every identifier below is a
 * UUIDv5 derived from a fixed namespace and a natural key — the person's name,
 * the event's source cell, the season's label. Nothing is random, nothing is
 * read back from the database to decide what to write next, and the same inputs
 * on any machine produce the same UUIDs.
 *
 * Three properties follow, and they are the reasons this is an acceptable
 * substitute for a visible sentinel rather than a way around it:
 *
 *   * **Rerunning is safe.** Every insert is `on conflict (id) do update`, so a
 *     second run converges on the same rows instead of creating a second set.
 *   * **Rollback is exact.** The loader can compute the complete set of
 *     identifiers it would create without consulting the database, and delete
 *     precisely those. It cannot delete a row it did not create, because it
 *     cannot name one — which is a stronger guarantee than a name-pattern
 *     `delete` gives.
 *   * **Provenance survives.** The manifest records, for every identifier, the
 *     source that produced it. A row in the database can be traced back to a
 *     workbook cell without a marker in the data itself.
 *
 * The trade is real and worth stating plainly: a human looking at the hosted
 * database sees rows that look like club data, because they are meant to. What
 * distinguishes them is the manifest and these identifiers, not the row itself.
 * That is Brian's decision of 15 August 2026, and the reason the runbook's
 * rollback step matters more here than it does for a `scripts/pilot/` scenario.
 *
 * ## LAN-221 — tokens
 *
 * Tester week needs a handful of *live* links — Brian's own RSVP link, his own
 * player page — written into a checklist before the load and resolving after
 * it. A link is a token, and a token is stored only as its SHA-256 digest, so
 * the loader has to be able to produce the plaintext deterministically. It
 * cannot do that from the public namespace alone: anyone with this repository
 * could then compute a live credential from its key. So every token is an
 * HMAC over the key with a secret Brian supplies in the private parameter file
 * (`tokenSecret`), which never leaves his machine. The digest the database
 * holds is the same `sha256(token)` the application computes.
 */

import { createHash, createHmac } from "node:crypto";

/**
 * The showcase's own namespace UUID.
 *
 * A fixed, arbitrary constant — the only thing that matters is that it is
 * stable and belongs to nothing else. Every identifier in the showcase descends
 * from it, so no other issue's deterministic keys can collide with these.
 */
export const SHOWCASE_NAMESPACE = "5e17e2a4-1c24-4f00-9a24-000000124124";

/**
 * RFC 4122 v5 (SHA-1, name-based).
 *
 * Implemented rather than imported: `node:crypto` has `randomUUID` but no
 * name-based generator, and the whole point of these identifiers is that they
 * are *not* random. Fifteen lines against a dependency in a public repository.
 */
export function uuidV5(name, namespace = SHOWCASE_NAMESPACE) {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  if (namespaceBytes.length !== 16) {
    throw new Error(`Not a UUID namespace: ${namespace}`);
  }

  const hash = createHash("sha1").update(namespaceBytes).update(Buffer.from(name, "utf8")).digest();

  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * The delimiter between the parts of a key.
 *
 * NUL, because it is the one byte that cannot occur in any input: table names,
 * person keys, season labels and spreadsheet cell references are all text a
 * human typed. A printable separator would be ambiguous — with a space,
 * `id("people", "a b")` and `id("people a", "b")` are the same key and
 * therefore the same row.
 *
 * Written as an escape rather than as a literal byte. It was a literal one
 * until independent review pointed out the consequence: two raw NULs made git
 * classify this file as binary, so the module that computes every identifier a
 * production-writing loader inserts and deletes by rendered no diff on GitHub
 * and could not be reviewed. Same bytes, same UUIDs, visible file.
 */
const SEPARATOR = "\u0000";

/**
 * An identifier for one row, namespaced by the table it belongs to.
 *
 * The table name is part of the key so that a person and the membership derived
 * from the same natural key do not collide. `id("people", "Alex Smith")` and
 * `id("season_memberships", "Alex Smith")` are unrelated UUIDs.
 */
export function id(table, ...parts) {
  return uuidV5(`${table}${SEPARATOR}${parts.join(SEPARATOR)}`);
}

/**
 * A stable key for a person, derived from their name as the workbook spells it.
 *
 * Normalised — case-folded, internal whitespace collapsed — so that a name
 * re-typed with a double space in a later version of the spreadsheet resolves to
 * the same person rather than creating a second one. Punctuation and accents are
 * deliberately *kept*: "O'Brien" and "OBrien" are different people until
 * somebody says otherwise, and silently merging them would be worse than
 * creating two rows a human can see.
 */
export function personKey(fullName) {
  return fullName.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * A deterministic plaintext token, in the exact shape the application mints —
 * 43 base64url characters, the encoding of 32 bytes (`TOKEN_PATTERN` in
 * `src/lib/services/rsvp-tokens.ts`, and the same in `club-link.ts`).
 *
 * HMAC-SHA256 over the namespaced key, keyed by the private `tokenSecret`. The
 * secret is required rather than defaulted: a default would be a public
 * constant, and a token computable from public constants is not a credential.
 */
export function token(secret, table, ...parts) {
  if (typeof secret !== "string" || secret.length < 16) {
    throw new Error(
      "The private parameter file must carry `tokenSecret`, at least 16 characters, " +
        "before any token can be computed. See OWNER-RUNBOOK.md § The private parameter file.",
    );
  }
  return createHmac("sha256", secret)
    .update(`${SHOWCASE_NAMESPACE}${SEPARATOR}${table}${SEPARATOR}${parts.join(SEPARATOR)}`)
    .digest("base64url")
    .slice(0, 43);
}

/** The digest every token table stores: lowercase hex SHA-256 of the plaintext. */
export function tokenHash(plaintext) {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/**
 * A recruitment sign-up code, in the application's own shape — 12 base64url
 * characters, the encoding of 9 bytes (`recruitment-signup-codes.ts`). Not a
 * credential: the QR is public by design, so it needs no secret.
 */
export function signupCode(...parts) {
  return createHash("sha256")
    .update(`${SHOWCASE_NAMESPACE}${SEPARATOR}signup${SEPARATOR}${parts.join(SEPARATOR)}`)
    .digest("base64url")
    .slice(0, 12);
}
