import { describe, expect, it } from "vitest";

import { buildQrMatrix, qrMatrixToSvg, QrCapacityExceeded, type QrMatrix } from "./qr-matrix";

/**
 * Structural proof for the hand-rolled encoder — `qr-matrix.ts`'s own module
 * comment names what this cannot prove (an actual scan) and what it can: the
 * fixed-shape invariants a decoder's very first pass relies on.
 *
 * ## The round-trip below, and why it exists (correction round 1, F-LAN204-002)
 *
 * Every test above this comment checks the encoder against *itself* — that
 * both format-info copies agree, that finder patterns look like finder
 * patterns. None of them checks the encoder against the QR *standard*, and
 * two real defects lived behind exactly that gap: `BitWriter.toCodewords`
 * silently manufactured an extra padding byte (rounding to a byte boundary
 * before adding the terminator rather than after, so the terminator's own
 * bits and the boundary padding double-counted whenever the pre-terminator
 * length was not already byte-aligned — the common case), and
 * `drawFormatInformation` placed the 15-bit format value LSB-first when the
 * spec transmits it MSB-first, so both copies still agreed with each other
 * while both encoded the wrong error-correction level and mask. A real
 * scanner (Apple Vision, via `decode_qr.py`, not available in this
 * repository's own test run) returned `NO BARCODE FOUND` for output that
 * passed every test in this file as it stood.
 *
 * `decodeQrMatrixByteMode` below is a from-scratch, independent reader: it
 * re-derives the reserved-module set and walks the same zigzag order the
 * standard specifies (the same order any compliant decoder must assume,
 * because it is dictated by the spec rather than invented by the encoder),
 * undoes mask 0, reassembles codewords, and parses the byte-mode header —
 * mode nibble, character count, payload bytes — entirely independently of
 * `buildQrMatrix`'s own internal functions (it imports nothing from
 * `qr-matrix.ts` but the public `QrMatrix` type). `payloadEqualsInput`
 * fails exactly when the encoded matrix would not scan back to the text
 * that went in, which is the property a physical scanner also checks and
 * the property no earlier test here asserted. It does not re-verify the
 * Reed–Solomon codewords bit-for-bit (that half was independently confirmed
 * once, by hand, against a reference Python encoder's own codeword dump for
 * a short string, and is not repeated per test run) — only that the module
 * placement and the format-info-implied mask, level and codeword split
 * recover the original bytes.
 */

/** `dataCodewords`/`eccCodewords` for versions 1-5 at level L — `qr-matrix.ts`'s own table, restated independently. */
const DATA_CODEWORDS_BY_VERSION: Readonly<Record<number, number>> = Object.freeze({
  1: 19,
  2: 34,
  3: 55,
  4: 80,
  5: 108,
});
const ECC_CODEWORDS_BY_VERSION: Readonly<Record<number, number>> = Object.freeze({
  1: 7,
  2: 10,
  3: 15,
  4: 20,
  5: 26,
});

// GF(256) arithmetic, computed the same way `qr-matrix.ts` computes its own
// — the QR spec's own primitive polynomial is a fixed constant, not
// something this test and the module under test could plausibly agree on
// by sharing a bug — so that this test can recompute the Reed–Solomon
// codewords the grid *should* carry and compare them to the ones actually
// stored there.
const GF_EXP = new Array<number>(512);
const GF_LOG = new Array<number>(256);
(function buildTestGfTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}
function rsGeneratorPoly(eccCount: number): number[] {
  let g = [1];
  for (let power = 0; power < eccCount; power++) {
    const root = GF_EXP[power];
    const next = new Array<number>(g.length + 1).fill(0);
    for (let i = 0; i < g.length; i++) {
      next[i] ^= g[i];
      next[i + 1] ^= gfMul(g[i], root);
    }
    g = next;
  }
  return g;
}
/** The `eccCount` codewords `data` *should* carry, independently of however `data` was produced. */
function expectedEccCodewords(data: readonly number[], eccCount: number): number[] {
  const generator = rsGeneratorPoly(eccCount);
  const remainder = new Array<number>(data.length + eccCount).fill(0);
  for (let i = 0; i < data.length; i++) remainder[i] = data[i];
  for (let i = 0; i < data.length; i++) {
    const coefficient = remainder[i];
    if (coefficient === 0) continue;
    for (let j = 0; j < generator.length; j++) remainder[i + j] ^= gfMul(generator[j], coefficient);
  }
  return remainder.slice(data.length);
}

function versionForSize(size: number): number {
  const version = (size - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > 5) {
    throw new Error(`Unsupported matrix size for this decoder: ${size}`);
  }
  return version;
}

function alignmentCenterForVersion(version: number): number | null {
  return version === 1 ? null : 4 * version + 10;
}

/** The same reserved-module set `qr-matrix.ts`'s own `buildReservedMask` computes, re-derived. */
function reservedModules(size: number, version: number): boolean[][] {
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const markBlock = (r0: number, c0: number, r1: number, c1: number) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) reserved[r][c] = true;
  };
  markBlock(0, 0, 7, 7);
  markBlock(0, size - 8, 7, size - 1);
  markBlock(size - 8, 0, size - 1, 7);
  for (let i = 0; i < size; i++) {
    reserved[6][i] = true;
    reserved[i][6] = true;
  }
  const center = alignmentCenterForVersion(version);
  if (center !== null) markBlock(center - 2, center - 2, center + 2, center + 2);
  markBlock(8, 0, 8, 8);
  markBlock(0, 8, 8, 8);
  markBlock(size - 8, 8, size - 1, 8);
  markBlock(8, size - 8, 8, size - 1);
  return reserved;
}

/**
 * Walks the matrix's own zigzag order and undoes mask 0 — the part of
 * reading a symbol that is identical whether the codewords turn out to be
 * data or padding. Split out so the round-trip decoder and the stronger,
 * whole-codeword check below (F-LAN204-CORR1-009) both start from the same
 * independently-derived bits without duplicating the walk.
 */
function readMatrixCodewords(matrix: QrMatrix): {
  dataCodewords: number[];
  eccCodewords: number[];
} {
  const { size, modules } = matrix;
  const version = versionForSize(size);
  const dataCodewordCount = DATA_CODEWORDS_BY_VERSION[version];
  const eccCodewordCount = ECC_CODEWORDS_BY_VERSION[version];
  const reserved = reservedModules(size, version);

  const bits: number[] = [];
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (reserved[row][c]) continue;
        const raw = modules[row][c] ? 1 : 0;
        bits.push((row + c) % 2 === 0 ? raw ^ 1 : raw);
      }
    }
    upward = !upward;
  }

  const byteAt = (byteIndex: number): number => {
    let value = 0;
    for (let b = 0; b < 8; b++) value = (value << 1) | bits[byteIndex * 8 + b];
    return value;
  };
  const totalCodewords = dataCodewordCount + eccCodewordCount;
  const codewords: number[] = [];
  for (let i = 0; i < totalCodewords; i++) codewords.push(byteAt(i));
  return {
    dataCodewords: codewords.slice(0, dataCodewordCount),
    eccCodewords: codewords.slice(dataCodewordCount),
  };
}

/**
 * Reads a matrix back to the UTF-8 text that produced it — byte mode, level
 * L, mask 0 only, matching the whole of what `qr-matrix.ts` ever emits.
 *
 * F-LAN204-CORR1-009: this function is **not** the round-trip's real proof
 * against the terminator/padding-ordering defect (F-LAN204-002) —
 * `payloadEqualsExpectedDataCodewords` below is. It reads exactly the bytes
 * the payload occupies (`dataCodewords[0]` through the byte the last
 * payload character's low nibble sits in), which for a short payload sit
 * entirely before the first codeword the ordering bug actually corrupts:
 * the terminator's own zero bits and the boundary padding's zero bits
 * happen to coincide, byte for byte, in that one shared byte regardless of
 * which order produced them, so the text this function returns is
 * identical whether the bug is present or not. The RS-consistency check
 * just below is blind to the same defect for an unrelated reason:
 * `rsEncode` computes valid parity for *whatever* data codewords it is
 * given, buggy or not, so a self-consistent but wrong data sequence still
 * passes it. Both checks are kept — a decoder needs exactly this
 * text-recovery behaviour, and RS-consistency is still the property a real
 * scanner's own error correction depends on — but this file's actual proof
 * against F-LAN204-002's defect class is the whole-codeword comparison
 * below, not this string.
 */
function decodeQrMatrixByteMode(matrix: QrMatrix): string {
  const { dataCodewords, eccCodewords } = readMatrixCodewords(matrix);

  // Are the stored ECC codewords actually what Reed–Solomon says these
  // exact data codewords should carry? A real scanner refuses the whole
  // symbol the moment this disagrees by more than the code can correct.
  const expectedEcc = expectedEccCodewords(dataCodewords, eccCodewords.length);
  if (!expectedEcc.every((byte, i) => byte === eccCodewords[i])) {
    throw new Error(
      `Reed-Solomon mismatch: the stored codewords are not internally consistent. ` +
        `data=[${dataCodewords.map((b) => b.toString(16)).join(",")}] ` +
        `storedEcc=[${eccCodewords.map((b) => b.toString(16)).join(",")}] ` +
        `expectedEcc=[${expectedEcc.map((b) => b.toString(16)).join(",")}]`,
    );
  }

  const first = dataCodewords[0];
  const mode = first >>> 4;
  if (mode !== 0b0100) throw new Error(`Expected byte mode (0100), read ${mode.toString(2)}`);
  const count = ((first & 0b1111) << 4) | (dataCodewords[1] >>> 4);

  const payload = new Uint8Array(count);
  // Each payload byte straddles two stored bytes at this 4-bit nibble offset
  // (mode+count consumed the first 12 bits), so read it 4 bits at a time.
  for (let i = 0; i < count; i++) {
    const hi = dataCodewords[1 + i] & 0b1111;
    const lo = dataCodewords[2 + i] >>> 4;
    payload[i] = (hi << 4) | lo;
  }
  return new TextDecoder().decode(payload);
}

/**
 * The full data-codeword sequence a correct encoder must produce for
 * `text` — mode nibble, character count, payload bytes, the terminator (up
 * to 4 zero bits, added *before* rounding to the next byte boundary, never
 * past capacity), then alternating `0xEC`/`0x11` padding bytes out to
 * `totalDataCodewords`. Written from scratch against the standard's own
 * clause order, independently of `qr-matrix.ts`'s `BitWriter` — sharing its
 * bug would need this test and the module under test to independently make
 * the identical ordering mistake, which is what an independent proof means.
 *
 * F-LAN204-CORR1-009: this closes the gap `decodeQrMatrixByteMode`'s own
 * doc comment names. F-LAN204-002's defect (rounding to a byte boundary
 * *before* the terminator, rather than after) leaves every payload byte
 * untouched and still produces internally-consistent Reed–Solomon parity —
 * so a bug confined to *how many bytes of padding follow the payload, and
 * what they contain* is invisible to both of those checks. Comparing the
 * grid's actual data codewords against this independently-reconstructed
 * expectation, byte for byte, is sensitive to exactly that: reintroducing
 * the defect shifts every codeword from the terminator onward, which this
 * comparison catches immediately where the round-trip and RS checks do not.
 */
function expectedDataCodewords(text: string, totalDataCodewords: number): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const bits: number[] = [];
  const pushBits = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  pushBits(0b0100, 4); // byte mode indicator
  pushBits(bytes.length, 8); // character count indicator, versions 1-9
  for (const byte of bytes) pushBits(byte, 8);

  const capacityBits = totalDataCodewords * 8;
  // Terminator first — up to 4 zero bits, never past capacity...
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
  // ...THEN round up to the next byte boundary. Reversing this order is
  // exactly F-LAN204-002's own defect, restated independently here rather
  // than imported from the module under test.
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  const PAD = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < totalDataCodewords) codewords.push(PAD[padIndex++ % 2]);
  return codewords;
}

describe("buildQrMatrix", () => {
  it("sizes the matrix to the smallest version that fits the payload", () => {
    expect(buildQrMatrix("short").size).toBe(21); // version 1
    expect(buildQrMatrix("x".repeat(30)).size).toBe(25); // version 2
    expect(buildQrMatrix("http://localhost:3101/join/AbCdEfGhIjKl").size).toBe(29); // version 3
  });

  it("refuses a payload larger than version 5 can carry", () => {
    expect(() => buildQrMatrix("x".repeat(200))).toThrow(QrCapacityExceeded);
  });

  it("draws all three finder patterns as 7x7 dark rings with a dark 3x3 core", () => {
    const { size, modules } = buildQrMatrix("https://lancers.example.org/join/AbCdEfGhIjKl");
    const corners: [number, number][] = [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ];
    for (const [top, left] of corners) {
      // Outer ring, all four sides dark.
      for (let i = 0; i < 7; i++) {
        expect(modules[top][left + i]).toBe(true);
        expect(modules[top + 6][left + i]).toBe(true);
        expect(modules[top + i][left]).toBe(true);
        expect(modules[top + i][left + 6]).toBe(true);
      }
      // The ring just inside the border is light.
      expect(modules[top + 1][left + 1]).toBe(false);
      // The 3x3 core is solid dark.
      for (let r = 2; r <= 4; r++) {
        for (let c = 2; c <= 4; c++) expect(modules[top + r][left + c]).toBe(true);
      }
    }
  });

  it("draws the timing pattern alternating, starting dark, on row 6 and column 6", () => {
    const { size, modules } = buildQrMatrix("https://lancers.example.org/join/AbCdEfGhIjKl");
    for (let i = 8; i < size - 8; i++) {
      expect(modules[6][i]).toBe(i % 2 === 0);
      expect(modules[i][6]).toBe(i % 2 === 0);
    }
  });

  it("always sets the one fixed dark module", () => {
    const { size, modules } = buildQrMatrix("https://lancers.example.org/join/AbCdEfGhIjKl12");
    expect(modules[size - 8][8]).toBe(true);
  });

  it("writes the same format bits into both copies, in the format info region", () => {
    // Both copies encode the same 15 bits; read them back independently and compare.
    const { size, modules } = buildQrMatrix("https://lancers.example.org/join/AbCdEfGhIjKl");
    const copy1: number[] = [];
    for (let i = 0; i <= 5; i++) copy1.push(modules[8][i] ? 1 : 0);
    copy1.push(modules[8][7] ? 1 : 0);
    copy1.push(modules[8][8] ? 1 : 0);
    copy1.push(modules[7][8] ? 1 : 0);
    for (let i = 9; i <= 14; i++) copy1.push(modules[14 - i][8] ? 1 : 0);

    const copy2: number[] = [];
    for (let i = 0; i <= 7; i++) copy2.push(modules[size - 1 - i][8] ? 1 : 0);
    for (let i = 8; i <= 14; i++) copy2.push(modules[8][size - 15 + i] ? 1 : 0);

    expect(copy2).toEqual(copy1);
  });

  it("is deterministic for the same text", () => {
    const a = buildQrMatrix("https://lancers.example.org/join/AbCdEfGhIjKl");
    const b = buildQrMatrix("https://lancers.example.org/join/AbCdEfGhIjKl");
    expect(a).toEqual(b);
  });

  it("renders every dark module reached by the SVG as one rect, sized to the matrix plus a quiet zone", () => {
    const matrix = buildQrMatrix("https://lancers.example.org/join/AbCdEfGhIjKl");
    const svg = qrMatrixToSvg(matrix, 4);
    const expectedDimension = (matrix.size + 8) * 4;
    expect(svg).toContain(`width="${expectedDimension}"`);
    const rectCount = matrix.modules.flat().filter(Boolean).length;
    expect(svg.match(/<rect x=/g)?.length).toBe(rectCount);
  });

  /**
   * `formatBits()`'s own output for this module's one fixed configuration
   * (level L, mask 0), checked against a value this module did not compute
   * — Python's `qrcode` library's own `BCH_type_info((ERROR_CORRECT_L << 3) | 0)`,
   * which returned `0x77c4`. `qr-matrix.ts` never varies level or mask, so
   * this one constant is the whole of what a correct build ever needs to
   * place into the format-info region, and it is a single BCH computation
   * this repository has no reason to get wrong twice.
   */
  it("places the one fixed format-info value the QR standard defines for level L, mask 0", () => {
    const { modules } = buildQrMatrix("anything");
    const bit = (r: number, c: number) => (modules[r][c] ? 1 : 0);
    let value = 0;
    for (let i = 0; i <= 5; i++) value = (value << 1) | bit(8, i);
    value = (value << 1) | bit(8, 7);
    value = (value << 1) | bit(8, 8);
    value = (value << 1) | bit(7, 8);
    for (let i = 9; i <= 14; i++) value = (value << 1) | bit(14 - i, 8);
    expect(value).toBe(0x77c4);
  });

  /**
   * Asserts both what a decoder needs (the text round-trips) and what
   * `decodeQrMatrixByteMode`'s own doc comment says that alone cannot prove
   * (F-LAN204-CORR1-009): that the grid's actual data codewords, past the
   * payload and into the terminator and padding, match byte for byte what
   * `expectedDataCodewords` independently reconstructs from the same text.
   */
  function expectRoundTrip(text: string, label = text): void {
    const matrix = buildQrMatrix(text);
    expect(decodeQrMatrixByteMode(matrix), label).toBe(text);
    const version = versionForSize(matrix.size);
    const { dataCodewords } = readMatrixCodewords(matrix);
    expect(dataCodewords, `${label} — full data-codeword sequence`).toEqual(
      expectedDataCodewords(text, DATA_CODEWORDS_BY_VERSION[version]),
    );
  }

  describe("decodeQrMatrixByteMode — an independent reader, not this module's own placement code", () => {
    it("round-trips a two-character string, AND matches the exact expected codeword sequence (version 1, the case F-LAN204-002 failed on)", () => {
      expectRoundTrip("HI");
    });

    it("round-trips the shortest possible payload", () => {
      expectRoundTrip("A");
    });

    it("round-trips every byte length from 1 to 106 — every version and every terminator/padding phase — matching the exact expected codeword sequence each time", () => {
      for (let length = 1; length <= 106; length++) {
        expectRoundTrip("A".repeat(length), `length ${length}`);
      }
    });

    it("round-trips the real shape of a season sign-up URL", () => {
      expectRoundTrip("http://127.0.0.1:3101/join/vtWKurCWzGCj");
    });

    it("round-trips a URL long enough to need version 3", () => {
      const url = "https://lancers.example.org/join/AbCdEfGhIjKl12";
      expect(buildQrMatrix(url).size).toBe(29); // version 3, per the sizing test above
      expectRoundTrip(url);
    });
  });

  /**
   * A known-answer pin: the exact module grid for `"HI"` (version 1, level
   * L, mask 0), independently confirmed to carry the payload `HI` — by this
   * file's own `decodeQrMatrixByteMode` above, and, once, outside this test
   * run, by Apple Vision's real QR reader (`decode_qr.py`) against a
   * screenshot rendered from this exact SVG output. A future change that
   * alters *any* module here without breaking the round-trip tests above
   * (unlikely, but not impossible for a change that preserves semantics
   * while altering, say, a cosmetically-unused reserved cell) still shows
   * up as a diff against a grid a real scanner has actually read.
   */
  it("matches an exact, externally-scanned grid for a fixed short payload", () => {
    const { size, modules } = buildQrMatrix("HI");
    expect(size).toBe(21);
    const golden = [
      "111111100010101111111",
      "100000100000101000001",
      "101110101010001011101",
      "101110100000101011101",
      "101110100101101011101",
      "100000100111001000001",
      "111111101010101111111",
      "000000001010000000000",
      "111011111010101000100",
      "101100011111010101110",
      "001111111111011101111",
      "111101000011110111010",
      "101111111111011100100",
      "000000001010001000110",
      "111111101110100010011",
      "100000101100001000111",
      "101110101100101010101",
      "101110100111010101010",
      "101110101111011101101",
      "100000101001110111010",
      "111111101001011101111",
    ];
    const actual = modules.map((row) => row.map((cell) => (cell ? "1" : "0")).join(""));
    expect(actual).toEqual(golden);
  });
});
