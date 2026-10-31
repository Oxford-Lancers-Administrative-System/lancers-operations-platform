import type { OutboundAttachment } from "./provider";

/**
 * LAN-514. An email request body with its attachments streamed, so a send's
 * extra memory stays roughly constant whatever the file size.
 *
 * Building the body as one string made four or five whole copies of the
 * encoded file (the analysis on LAN-514 measured about twelve times the file
 * size: +227 MB at 20 MB). Here the JSON around the files is serialised once,
 * small, and each file goes out as base64 one slice at a time, read from the
 * database as it is needed. The analysis measured this shape at about +60 to
 * +90 MB RSS at 10 to 30 MB, most of it garbage the collector reclaims.
 *
 * The length is computed before a byte is read — base64 is exactly four
 * characters per three bytes, padded — and sent as `Content-Length`, so the
 * provider receives an ordinary fixed-length body rather than a chunked one.
 */

/**
 * One slice of a file: 3 MiB, a multiple of three, so every slice but the last
 * encodes to base64 with no padding and the pieces join into one valid string.
 */
export const ATTACHMENT_SLICE_BYTES = 3 * 1024 * 1024;

/** Base64 length of `bytes` bytes: four characters per three, padded. */
export function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

/**
 * Stands in for attachment `index`'s content in the JSON, then is replaced by
 * the streamed base64. NUL characters serialise as `\u0000`, which keeps the
 * marker out of anything an operator could type by accident.
 */
export function attachmentContentSlot(index: number): string {
  return `\u0000lan514-attachment-${index}\u0000`;
}

export interface StreamedEmailBody {
  /** The exact byte length of what `stream` produces. */
  readonly length: number;
  readonly stream: ReadableStream<Uint8Array>;
  /**
   * Whether the stream itself failed: a slice could not be read, came back
   * the wrong length, or the body was not the length declared. The send is
   * then this application's failure, not the provider's.
   */
  readonly failed: () => boolean;
}

/**
 * The request body for `json`, whose attachment `i` carries
 * {@link attachmentContentSlot}(i) as its content, with each slot replaced by
 * that file's bytes as base64, read in slices of `sliceBytes`.
 *
 * Throws before anything is read when the JSON does not hold each slot exactly
 * once. The stream errors, and the request with it, when a slice comes back
 * the wrong length — a file removed or changed mid-send is a failed attempt,
 * never a truncated attachment.
 */
export function streamEmailBody(
  json: Record<string, unknown>,
  attachments: readonly OutboundAttachment[],
  sliceBytes: number = ATTACHMENT_SLICE_BYTES,
): StreamedEmailBody {
  if (sliceBytes <= 0 || sliceBytes % 3 !== 0) {
    throw new Error("An attachment slice must be a positive multiple of three bytes.");
  }

  const serialised = JSON.stringify(json);
  const pieces: Buffer[] = [];
  let rest = serialised;
  attachments.forEach((_, index) => {
    const slot = JSON.stringify(attachmentContentSlot(index)).slice(1, -1);
    const at = rest.indexOf(slot);
    if (at === -1 || rest.indexOf(slot, at + slot.length) !== -1) {
      throw new Error("The email body does not hold each attachment's place exactly once.");
    }
    pieces.push(Buffer.from(rest.slice(0, at), "utf8"));
    rest = rest.slice(at + slot.length);
  });
  pieces.push(Buffer.from(rest, "utf8"));

  const length =
    pieces.reduce((total, piece) => total + piece.length, 0) +
    attachments.reduce((total, attachment) => total + base64Length(attachment.byteSize), 0);

  async function* produce(): AsyncGenerator<Uint8Array> {
    for (let index = 0; index < pieces.length; index += 1) {
      yield pieces[index];
      const attachment = attachments[index];
      if (!attachment) continue;
      for (let offset = 0; offset < attachment.byteSize; offset += sliceBytes) {
        const wanted = Math.min(sliceBytes, attachment.byteSize - offset);
        const bytes = await attachment.readSlice(offset, wanted);
        if (bytes.byteLength !== wanted) {
          throw new Error("An attachment changed while it was being sent.");
        }
        const slice = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        yield Buffer.from(slice.toString("base64"), "latin1");
      }
    }
  }

  const iterator = produce();
  let produced = 0;
  let failed = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          if (produced !== length) throw new Error("The email body was not the length declared.");
          controller.close();
          return;
        }
        produced += next.value.byteLength;
        controller.enqueue(next.value);
      } catch (error) {
        failed = true;
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });

  return { length, stream, failed: () => failed };
}
