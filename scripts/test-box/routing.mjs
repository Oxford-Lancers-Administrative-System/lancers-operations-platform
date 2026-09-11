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
/** LAN-330: the request must be a Twilio Messages form addressed to Twilio's own host. */
export function assertProviderRequest(url, form) {
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    target.hostname !== "api.twilio.com" ||
    target.port ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    !/^\/2010-04-01\/Accounts\/[^/]+\/Messages\.json$/.test(target.pathname)
  )
    throw new Error("The test router refused an unexpected provider endpoint.");
  const from = String(form?.From ?? "");
  const alphanumeric = /^[A-Za-z0-9 ]{1,11}$/.test(from) && /[A-Za-z]/.test(from);
  let callback = null;
  try {
    callback = new URL(form?.StatusCallback ?? "");
  } catch {
    callback = null;
  }
  if (
    !/^\+\d{7,15}$/.test(form?.To ?? "") ||
    !(alphanumeric || /^\+\d{7,15}$/.test(from)) ||
    !String(form?.Body ?? "").trim() ||
    !callback ||
    callback.protocol !== "https:"
  )
    throw new Error("Actual test delivery requires a complete Twilio message form.");
  return target;
}
