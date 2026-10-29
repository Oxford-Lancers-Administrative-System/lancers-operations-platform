import fs from "node:fs";

/**
 * LAN-514. The local delivery sink's reader for a streamed email body.
 *
 * The sink runs inside the application's own process, so a sink that read a
 * 27 MB body whole — the text, the parsed JSON, the decoded file — would make
 * the application look as if it held the attachment whole when it does not.
 * This parses the JSON as it arrives and sends each attachment's base64
 * content straight to a file, decoding as it goes, so the sink's memory stays
 * as flat as the send's. Local only; nothing deployed reaches it.
 */

/** Where a string value at a given path goes instead of into memory. */
export interface DivertedString {
  write(bytes: Buffer): void;
  /** What stands in the parsed value for the string. */
  end(): unknown;
}

type PathPart = string | number;

type Frame =
  | {
      readonly kind: "object";
      readonly value: Record<string, unknown>;
      key: string | null;
      state: "key" | "colon" | "value" | "comma";
      empty: boolean;
    }
  | { readonly kind: "array"; readonly value: unknown[]; state: "value" | "comma" };

const QUOTE = 0x22;
const BACKSLASH = 0x5c;

function isWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09;
}

/**
 * An incremental JSON parser. `divert` is asked, for every string value, where
 * it goes; `null` keeps it in memory as usual. A diverted string may not hold
 * an escape (base64 never does), and one that does is a parse error.
 */
export class StreamingJsonParser {
  private readonly stack: Frame[] = [];
  private root: unknown = undefined;
  private hasRoot = false;
  private mode: "structure" | "string" | "scalar" = "structure";
  private stringIsKey = false;
  private stringParts: Buffer[] = [];
  private escaped = false;
  private diverted: DivertedString | null = null;
  private scalar = "";

  constructor(private readonly divert: (path: readonly PathPart[]) => DivertedString | null) {}

  write(chunk: Uint8Array): void {
    const bytes = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    let index = 0;
    while (index < bytes.length) {
      if (this.mode === "string") {
        index = this.continueString(bytes, index);
        continue;
      }
      const byte = bytes[index];
      if (this.mode === "scalar") {
        if (isWhitespace(byte) || byte === 0x2c || byte === 0x7d || byte === 0x5d) {
          this.finishScalar();
          continue; // the delimiter is read again, as structure
        }
        this.scalar += String.fromCharCode(byte);
        index += 1;
        continue;
      }
      this.structure(byte);
      index += 1;
    }
  }

  end(): unknown {
    if (this.mode === "scalar") this.finishScalar();
    if (this.mode !== "structure" || this.stack.length > 0 || !this.hasRoot) {
      throw new Error("The JSON ended early.");
    }
    return this.root;
  }

  private path(): PathPart[] {
    return this.stack.map((frame) =>
      frame.kind === "object" ? (frame.key ?? "") : frame.value.length,
    );
  }

  private structure(byte: number): void {
    if (isWhitespace(byte)) return;
    const frame = this.stack.at(-1);
    if (!frame) {
      if (this.hasRoot) throw new Error("Unexpected data after the JSON value.");
      this.startValue(byte);
      return;
    }
    if (frame.kind === "object") {
      if (frame.state === "key") {
        if (byte === 0x7d && frame.empty) return this.close();
        if (byte !== QUOTE) throw new Error("Expected a key.");
        this.startString(true);
        return;
      }
      if (frame.state === "colon") {
        if (byte !== 0x3a) throw new Error("Expected a colon.");
        frame.state = "value";
        return;
      }
      if (frame.state === "value") {
        this.startValue(byte);
        return;
      }
      if (byte === 0x2c) {
        frame.state = "key";
        frame.empty = false;
        return;
      }
      if (byte === 0x7d) return this.close();
      throw new Error("Expected a comma or the end of an object.");
    }
    if (frame.state === "value") {
      if (byte === 0x5d && frame.value.length === 0) return this.close();
      this.startValue(byte);
      return;
    }
    if (byte === 0x2c) {
      frame.state = "value";
      return;
    }
    if (byte === 0x5d) return this.close();
    throw new Error("Expected a comma or the end of an array.");
  }

  private startValue(byte: number): void {
    if (byte === 0x7b) {
      this.stack.push({ kind: "object", value: {}, key: null, state: "key", empty: true });
      return;
    }
    if (byte === 0x5b) {
      this.stack.push({ kind: "array", value: [], state: "value" });
      return;
    }
    if (byte === QUOTE) {
      this.startString(false);
      return;
    }
    this.mode = "scalar";
    this.scalar = String.fromCharCode(byte);
  }

  private startString(isKey: boolean): void {
    this.mode = "string";
    this.stringIsKey = isKey;
    this.stringParts = [];
    this.escaped = false;
    this.diverted = isKey ? null : this.divert(this.path());
  }

  /** Reads string bytes from `index`; returns where reading stopped. */
  private continueString(bytes: Buffer, index: number): number {
    if (this.diverted) {
      const quote = bytes.indexOf(QUOTE, index);
      const backslash = bytes.indexOf(BACKSLASH, index);
      if (backslash !== -1 && (quote === -1 || backslash < quote)) {
        throw new Error("A diverted string may not hold an escape.");
      }
      if (quote === -1) {
        this.diverted.write(bytes.subarray(index));
        return bytes.length;
      }
      this.diverted.write(bytes.subarray(index, quote));
      const value = this.diverted.end();
      this.diverted = null;
      this.mode = "structure";
      this.emit(value);
      return quote + 1;
    }
    for (let at = index; at < bytes.length; at += 1) {
      const byte = bytes[at];
      if (this.escaped) {
        this.escaped = false;
      } else if (byte === BACKSLASH) {
        this.escaped = true;
      } else if (byte === QUOTE) {
        this.stringParts.push(Buffer.from(bytes.subarray(index, at)));
        const raw = Buffer.concat(this.stringParts).toString("utf8");
        this.stringParts = [];
        this.mode = "structure";
        const text = JSON.parse(`"${raw}"`) as string;
        if (this.stringIsKey) {
          const frame = this.stack.at(-1);
          if (frame?.kind === "object") {
            frame.key = text;
            frame.state = "colon";
          }
        } else {
          this.emit(text);
        }
        return at + 1;
      }
    }
    this.stringParts.push(Buffer.from(bytes.subarray(index)));
    return bytes.length;
  }

  private finishScalar(): void {
    this.mode = "structure";
    const value: unknown = JSON.parse(this.scalar);
    this.scalar = "";
    this.emit(value);
  }

  private close(): void {
    const frame = this.stack.pop();
    if (frame) this.emit(frame.value);
  }

  private emit(value: unknown): void {
    const frame = this.stack.at(-1);
    if (!frame) {
      this.root = value;
      this.hasRoot = true;
      return;
    }
    if (frame.kind === "object") {
      frame.value[frame.key ?? ""] = value;
      frame.state = "comma";
      return;
    }
    frame.value.push(value);
    frame.state = "comma";
  }
}

/** What stands in a parsed payload for an attachment's content written to disk. */
export interface SpooledAttachment {
  readonly spooledTo: string;
  /** Decoded bytes written. */
  readonly bytes: number;
  /** Base64 characters received. */
  readonly encodedLength: number;
  /** Whether every character was base64 and the padding came only at the end. */
  readonly validBase64: boolean;
}

export function isSpooledAttachment(value: unknown): value is SpooledAttachment {
  return typeof value === "object" && value !== null && "spooledTo" in value;
}

/** Decodes base64 as it arrives into `file`, four characters at a time. */
export function base64FileSink(file: string): DivertedString {
  const descriptor = fs.openSync(file, "w", 0o600);
  let carry = "";
  let bytes = 0;
  let encodedLength = 0;
  let valid = true;
  let padded = false;
  return {
    write(chunk) {
      const text = chunk.toString("latin1");
      encodedLength += text.length;
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || (padded && text.length > 0)) valid = false;
      if (text.includes("=")) padded = true;
      const joined = carry + text;
      const whole = joined.length - (joined.length % 4);
      carry = joined.slice(whole);
      if (whole > 0) {
        const decoded = Buffer.from(joined.slice(0, whole), "base64");
        fs.writeSync(descriptor, decoded);
        bytes += decoded.length;
      }
    },
    end() {
      if (carry.length > 0) {
        valid = false;
        const decoded = Buffer.from(carry, "base64");
        fs.writeSync(descriptor, decoded);
        bytes += decoded.length;
      }
      fs.closeSync(descriptor);
      const spooled: SpooledAttachment = {
        spooledTo: file,
        bytes,
        encodedLength,
        validBase64: valid,
      };
      return spooled;
    },
  };
}
