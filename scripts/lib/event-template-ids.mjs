/**
 * The identifiers of the seven templates the schema ships with — LAN-265.
 *
 * `supabase/migrations/20260916090000_event_templates.sql` writes these seven
 * rows with fixed literal identifiers rather than `gen_random_uuid()`, because
 * they are schema rather than data: they arrive with the migration, identically
 * on every machine. Each is a UUIDv5 over the namespace
 * `6f2b1d0a-3c47-5e18-9a6d-2b8e4f7c1a55` and the key `event_templates:<class>`.
 *
 * This module exists so the scripts that write events without going through the
 * application — the local seed and the tester-week showcase loader — can name
 * the template an event belongs to without a round trip, exactly as they already
 * name a season or a term. It is deliberately **not** imported by anything under
 * `src/`: the service layer resolves a template by reading it, because after
 * LAN-265 an operator's own templates are as legitimate as these seven and code
 * that reached for a literal would silently mean "one of the original seven".
 *
 * A row here is keyed by the behavioural class it shipped as. An operator may
 * rename any of these seven, and renaming does not move its identifier — which
 * is the whole point of storing the identifier on the event.
 */

export const SEEDED_TEMPLATE_IDS = Object.freeze({
  practice: "7e34a764-7ed1-535e-8cef-73e00a62eafc",
  strength_and_conditioning: "8fb4acfc-1d41-53b0-bda8-202f454a8629",
  chalk: "b547e0b3-f48c-5601-9dc6-e8725fc434f9",
  game: "67fbd6c7-1c6c-55d5-ab83-f85816c4c2ae",
  social: "8de00424-52a8-52ad-9c9f-a29823f9c4bf",
  recruitment: "ae03257b-292e-5a97-b6ef-c3a6a2b839d7",
  meeting: "660cdcb7-51e3-5a19-aaa2-08c5256af288",
});

/**
 * The template a synthetic event of this class belongs to.
 *
 * Throws rather than defaulting: a class with no template here is a widened
 * `public.event_type` whose template nobody created, and an event written
 * against the practice template because a lookup missed would be a wrong row
 * that loads cleanly.
 */
export function seededTemplateIdFor(eventType) {
  const id = SEEDED_TEMPLATE_IDS[eventType];
  if (!id) {
    throw new Error(
      `No seeded event template for the class "${eventType}". ` +
        "Add it to scripts/lib/event-template-ids.mjs and to the migration that seeds it.",
    );
  }
  return id;
}
