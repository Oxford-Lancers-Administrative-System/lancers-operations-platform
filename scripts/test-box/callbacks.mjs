import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Twilio's signature: the callback URL, then every parameter name+value in name order. */
export function twilioSignature(url, params, authToken) {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");
  return crypto.createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

/** Apply simulated receipt via the normal signed callback, never by editing delivery rows. */
export async function confirmIntercepted(db, directory, { baseUrl, env }) {
  const source = path.join(directory, "transport-evidence");
  if (!fs.existsSync(source) || !env.TWILIO_AUTH_TOKEN || !env.APP_BASE_URL) return 0;
  const receipts = path.join(directory, "simulated-receipts");
  fs.mkdirSync(receipts, { recursive: true, mode: 0o700 });
  let count = 0;
  for (const file of fs.readdirSync(source).filter((f) => f.endsWith(".json"))) {
    const record = JSON.parse(fs.readFileSync(path.join(source, file), "utf8"));
    if (
      record.transport !== "intercepted" ||
      record.channel !== "sms" ||
      record.simulatedOutcome !== "delivered" ||
      !record.providerMessageId
    )
      continue;
    const receipt = path.join(
      receipts,
      crypto.createHash("sha256").update(record.providerMessageId).digest("hex") + ".json",
    );
    if (fs.existsSync(receipt)) continue;
    const match = await db.query(
      "select 1 from delivery_attempts where provider_message_id=$1 and accepted_at is not null",
      [record.providerMessageId],
    );
    if (!match.rowCount) continue;
    // The same query string the adapter put on its StatusCallback, so the
    // signed URL matches what the route rebuilds from APP_BASE_URL.
    const query = record.kind && record.kind !== "unknown" ? `?kind=${record.kind}` : "";
    const params = {
      MessageSid: record.providerMessageId,
      MessageStatus: "delivered",
      To: String(record.recipient),
      From: String(record.payload?.From ?? ""),
    };
    const signedUrl = `${env.APP_BASE_URL.replace(/\/+$/, "")}/api/webhooks/twilio${query}`;
    const response = await fetch(baseUrl + "/api/webhooks/twilio" + query, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": twilioSignature(signedUrl, params, env.TWILIO_AUTH_TOKEN),
      },
      body: new URLSearchParams(params).toString(),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error("Simulated delivery confirmation was refused by the local callback route.");
    // HTTP 200 also covers ignored and duplicate callbacks. Only persist a
    // simulated receipt once the application has recorded delivery evidence.
    const confirmed = await db.query(
      "select 1 from delivery_results where provider_message_id=$1 and outcome='delivered'",
      [record.providerMessageId],
    );
    if (!confirmed.rowCount)
      throw new Error("The local callback route has not recorded simulated delivery yet.");
    fs.writeFileSync(
      receipt,
      JSON.stringify({
        providerMessageId: record.providerMessageId,
        simulated: true,
        confirmedAt: new Date().toISOString(),
      }),
      { mode: 0o600, flag: "wx" },
    );
    count++;
  }
  return count;
}
