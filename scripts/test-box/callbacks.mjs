import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Apply simulated receipt via the normal signed webhook, never by editing delivery rows. */
export async function confirmIntercepted(db, directory, { baseUrl, env }) {
  const source = path.join(directory, "transport-evidence");
  if (!fs.existsSync(source) || !env.WHATSAPP_APP_SECRET) return 0;
  const receipts = path.join(directory, "simulated-receipts");
  fs.mkdirSync(receipts, { recursive: true, mode: 0o700 });
  let count = 0;
  for (const file of fs.readdirSync(source).filter((f) => f.endsWith(".json"))) {
    const record = JSON.parse(fs.readFileSync(path.join(source, file), "utf8"));
    if (
      record.transport !== "intercepted" ||
      record.channel !== "whatsapp" ||
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
    const payload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "local-test",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                statuses: [
                  {
                    id: record.providerMessageId,
                    status: "delivered",
                    timestamp: String(Math.floor(Date.parse(record.testAt ?? record.at) / 1000)),
                    recipient_id: record.recipient,
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const signature = crypto
      .createHmac("sha256", env.WHATSAPP_APP_SECRET)
      .update(payload)
      .digest("hex");
    const response = await fetch(baseUrl + "/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + signature },
      body: payload,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error("Simulated delivery confirmation was refused by the local webhook.");
    // HTTP 200 also covers ignored and duplicate callbacks. Only persist a
    // simulated receipt once the application has recorded delivery evidence.
    const confirmed = await db.query(
      "select 1 from delivery_results where provider_message_id=$1 and outcome='delivered'",
      [record.providerMessageId],
    );
    if (!confirmed.rowCount)
      throw new Error("The local webhook has not recorded simulated delivery yet.");
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
