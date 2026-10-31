/**
 * The largest provider callback a webhook route will read. Meta's and Resend's
 * payloads are a few KB; 64 KiB stops an unauthenticated caller choosing the
 * cost of the HMAC that verifies it.
 */
export const MAX_CALLBACK_BYTES = 64 * 1024;

/**
 * Reads the body and stops the moment it passes `limit` bytes, so an
 * unauthenticated caller who omits or understates `content-length` cannot make
 * this process buffer a body it was always going to refuse (LAN-352).
 * `request.text()` would read all of it first and measure afterwards.
 *
 * `null` means the body was over the limit.
 */
export async function readBodyUpTo(request: Request, limit: number): Promise<string | null> {
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
