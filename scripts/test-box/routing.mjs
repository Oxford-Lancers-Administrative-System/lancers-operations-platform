/** Pure routing decision: an address match alone never authorizes actual egress. */
export function normalizeDestination(value) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return digits.startsWith("00")
    ? digits.slice(2)
    : digits.startsWith("0")
      ? "44" + digits.slice(1)
      : digits;
}
export function routeRecipient(recipient, people, settings) {
  const destination = normalizeDestination(recipient);
  const matches = people.filter((p) => normalizeDestination(p.phone) === destination);
  const selected = matches.filter((p) => settings[p.id]?.delivery === "real");
  if (selected.length === 0)
    return {
      mode: "intercepted",
      personId: matches.length === 1 ? matches[0].id : null,
      outcome:
        matches.length === 1 ? (settings[matches[0].id]?.outcome ?? "delivered") : "delivered",
    };
  if (matches.length !== 1)
    throw new Error(
      "Actual delivery refused: the destination belongs to more than one test person.",
    );
  const person = matches[0],
    choice = settings[person.id];
  if (
    choice.identity !== "real" ||
    choice.responder !== "none" ||
    normalizeDestination(choice.destination) !== destination
  )
    throw new Error(
      "Actual delivery refused: confirm this real person and their current destination again.",
    );
  return { mode: "real", personId: person.id, outcome: null };
}
export function assertProviderRequest(url, payload) {
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    target.hostname !== "graph.facebook.com" ||
    target.port ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    !/^\/v\d+\.\d+\/[^/]+\/messages$/.test(target.pathname)
  )
    throw new Error("The test router refused an unexpected provider endpoint.");
  if (
    payload?.messaging_product !== "whatsapp" ||
    payload.type !== "template" ||
    !payload.to ||
    !payload.template?.name?.endsWith("_test")
  )
    throw new Error("Actual test delivery requires an existing _test WhatsApp template.");
  return target;
}
