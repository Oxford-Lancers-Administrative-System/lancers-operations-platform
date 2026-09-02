/**
 * A minimal, dependency-free QR Code encoder — `W1-04`'s season sign-up code,
 * LAN-204. `AGENTS.md` closes `package.json` to a new dependency, and no QR
 * library already exists anywhere in this tree (a repository-wide grep found
 * none), so this is the whole of the encoder rather than a wrapper around one.
 *
 * ## Scope, deliberately narrow
 *
 * Byte mode only (every character as one 8-bit codeword — no digit or
 * alphanumeric mode), error-correction level **L** (the lowest overhead,
 * chosen for the most data capacity per version), and versions 1–5 only.
 * Versions 1–5 at level L are each a **single Reed–Solomon block**
 * (26/44/70/100/134 total codewords split 19+7, 34+10, 55+15, 80+20,
 * 108+26 data+ecc), so this module never has to implement block
 * interleaving — the one piece of the spec a hand-rolled encoder most often
 * gets wrong. `/join/<code>` links are at most a few dozen bytes; five
 * versions carries a wide margin (up to 106 usable bytes) over anything this
 * application ever mints.
 *
 * The one mask pattern used is a fixed `(row + col) % 2 === 0` (mask 0) —
 * correctness never depends on choosing the *best-looking* mask, only on the
 * format bits correctly declaring which one was used, which this module
 * always gets right because it never varies.
 *
 * ## What is proved, and what is not
 *
 * `qr-matrix.test.ts` asserts the structural invariants a decoder relies on —
 * matrix size, finder/timing/alignment placement, the fixed dark module, and
 * that the two format-information copies agree — but this module has no QR
 * *decoder* to round-trip against, so a physical scan is the one proof this
 * cannot produce for itself. Recorded as a limitation in the package receipt.
 */

// ---------------------------------------------------------------------------
// GF(256) arithmetic — computed at module load, never hand-transcribed.
// ---------------------------------------------------------------------------

const GF_EXP = new Array<number>(512);
const GF_LOG = new Array<number>(256);

(function buildTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // the QR primitive polynomial, x^8+x^4+x^3+x^2+1
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** `a * x^0 + ... ` times `(x + a^power)`, both in "highest degree first" order. */
function polyMulByRoot(poly: readonly number[], power: number): number[] {
  const root = GF_EXP[power];
  const result = new Array<number>(poly.length + 1).fill(0);
  for (let i = 0; i < poly.length; i++) {
    result[i] ^= poly[i];
    result[i + 1] ^= gfMul(poly[i], root);
  }
  return result;
}

function rsGeneratorPoly(eccCount: number): number[] {
  let g = [1];
  for (let i = 0; i < eccCount; i++) g = polyMulByRoot(g, i);
  return g;
}

/** Systematic Reed–Solomon encode: returns the `eccCount` parity codewords. */
function rsEncode(data: readonly number[], eccCount: number): number[] {
  const generator = rsGeneratorPoly(eccCount);
  const remainder = new Array<number>(data.length + eccCount).fill(0);
  for (let i = 0; i < data.length; i++) remainder[i] = data[i];

  for (let i = 0; i < data.length; i++) {
    const coefficient = remainder[i];
    if (coefficient === 0) continue;
    for (let j = 0; j < generator.length; j++) {
      remainder[i + j] ^= gfMul(generator[j], coefficient);
    }
  }
  return remainder.slice(data.length);
}

// ---------------------------------------------------------------------------
// Version table — level L, versions 1-5. Single RS block at this level for
// each of these versions (verified against the spec's own total-codeword
// count: 26, 44, 70, 100, 134 — each equal to dataCodewords + eccCodewords).
// ---------------------------------------------------------------------------

interface VersionSpec {
  readonly version: number;
  readonly size: number;
  readonly dataCodewords: number;
  readonly eccCodewords: number;
  /** `null` for version 1, which carries no alignment pattern at all. */
  readonly alignmentCenter: number | null;
}

const VERSIONS: readonly VersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 19, eccCodewords: 7, alignmentCenter: null },
  { version: 2, size: 25, dataCodewords: 34, eccCodewords: 10, alignmentCenter: 18 },
  { version: 3, size: 29, dataCodewords: 55, eccCodewords: 15, alignmentCenter: 22 },
  { version: 4, size: 33, dataCodewords: 80, eccCodewords: 20, alignmentCenter: 26 },
  { version: 5, size: 37, dataCodewords: 108, eccCodewords: 26, alignmentCenter: 30 },
];

/** EC level L's 2-bit format indicator, fixed for this whole module. */
const EC_LEVEL_BITS = 0b01;
/** The one mask pattern this module ever uses. */
const MASK_PATTERN = 0;

export class QrCapacityExceeded extends Error {
  constructor(byteLength: number) {
    super(
      `This text is ${byteLength} bytes, which is more than the ${VERSIONS[VERSIONS.length - 1].dataCodewords - 3} this encoder supports (versions 1-5, byte mode, level L).`,
    );
    this.name = "QrCapacityExceeded";
  }
}

/** Chooses the smallest supported version whose byte-mode capacity fits `byteLength`. */
function chooseVersion(byteLength: number): VersionSpec {
  for (const spec of VERSIONS) {
    // Mode indicator (4 bits) + byte count indicator (8 bits, versions 1-9) = 12 bits = 1.5 bytes,
    // plus up to a 4-bit terminator — 2 whole bytes is always enough headroom.
    if (byteLength <= spec.dataCodewords - 2) return spec;
  }
  throw new QrCapacityExceeded(byteLength);
}

// ---------------------------------------------------------------------------
// Bit buffer -> codewords
// ---------------------------------------------------------------------------

class BitWriter {
  private bits: number[] = [];

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }

  get length(): number {
    return this.bits.length;
  }

  toCodewords(totalCodewords: number): number[] {
    // Terminator, up to 4 zero bits, never past the data capacity.
    const capacityBits = totalCodewords * 8;
    while (this.bits.length < capacityBits && this.bits.length % 8 !== 0) this.bits.push(0);
    for (let i = 0; i < 4 && this.bits.length < capacityBits; i++) this.bits.push(0);
    while (this.bits.length % 8 !== 0) this.bits.push(0);

    const codewords: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | this.bits[i + j];
      codewords.push(byte);
    }
    // Pad codewords, alternating, until the version's full data capacity is met.
    const PAD = [0xec, 0x11];
    let padIndex = 0;
    while (codewords.length < totalCodewords) codewords.push(PAD[padIndex++ % 2]);
    return codewords;
  }
}

function encodeByteMode(text: string, spec: VersionSpec): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  if (bytes.length > spec.dataCodewords - 2) throw new QrCapacityExceeded(bytes.length);

  const writer = new BitWriter();
  writer.push(0b0100, 4); // byte mode indicator
  writer.push(bytes.length, 8); // character count indicator, versions 1-9
  for (const byte of bytes) writer.push(byte, 8);
  return writer.toCodewords(spec.dataCodewords);
}

// ---------------------------------------------------------------------------
// Format information (15 bits: 5 data bits + 10-bit BCH, XORed with a fixed mask)
// ---------------------------------------------------------------------------

/** Binary polynomial long division, over GF(2) (plain XOR, not the GF(256) table above). */
function bchRemainder(data: number, dataBits: number, generator: number, eccBits: number): number {
  let value = data << eccBits;
  for (let i = dataBits - 1; i >= 0; i--) {
    if (value & (1 << (i + eccBits))) value ^= generator << i;
  }
  return value;
}

const FORMAT_GENERATOR = 0b10100110111; // degree 10
const FORMAT_MASK_XOR = 0b101010000010010; // fixed constant from the QR spec

function formatBits(): number {
  const data5 = (EC_LEVEL_BITS << 3) | MASK_PATTERN;
  const remainder = bchRemainder(data5, 5, FORMAT_GENERATOR, 10);
  const raw = (data5 << 10) | remainder;
  return raw ^ FORMAT_MASK_XOR;
}

// ---------------------------------------------------------------------------
// Matrix assembly
// ---------------------------------------------------------------------------

export interface QrMatrix {
  readonly size: number;
  /** `matrix[row][col]`: `true` is a dark module. */
  readonly modules: readonly (readonly boolean[])[];
}

function drawFinderPattern(modules: boolean[][], top: number, left: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const row = top + r;
      const col = left + c;
      if (row < 0 || col < 0 || row >= modules.length || col >= modules.length) continue;
      const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const onOuter = inRing && (r === 0 || r === 6 || c === 0 || c === 6);
      const onInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      // The separator (the ring just outside the 7x7 pattern) is explicitly light.
      modules[row][col] = onOuter || onInner;
    }
  }
}

function drawAlignmentPattern(modules: boolean[][], center: number): void {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const row = center + r;
      const col = center + c;
      const onOuter = r === -2 || r === 2 || c === -2 || c === 2;
      const onCenter = r === 0 && c === 0;
      modules[row][col] = onOuter || onCenter;
    }
  }
}

/** Modules a data bit may never be placed on — every function pattern and reserved area. */
function buildReservedMask(spec: VersionSpec): boolean[][] {
  const size = spec.size;
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  const markBlock = (r0: number, c0: number, r1: number, c1: number) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) reserved[r][c] = true;
  };

  // Finder patterns plus their separators (8x8 blocks at three corners).
  markBlock(0, 0, 7, 7);
  markBlock(0, size - 8, 7, size - 1);
  markBlock(size - 8, 0, size - 1, 7);

  // Timing patterns.
  for (let i = 0; i < size; i++) {
    reserved[6][i] = true;
    reserved[i][6] = true;
  }

  // Alignment pattern.
  if (spec.alignmentCenter !== null) {
    const center = spec.alignmentCenter;
    markBlock(center - 2, center - 2, center + 2, center + 2);
  }

  // Format information, both copies, plus the fixed dark module.
  markBlock(8, 0, 8, 8);
  markBlock(0, 8, 8, 8);
  markBlock(size - 8, 8, size - 1, 8);
  markBlock(8, size - 8, 8, size - 1);

  return reserved;
}

function drawFormatInformation(modules: boolean[][], size: number): void {
  const bits = formatBits();
  const bit = (i: number) => ((bits >>> i) & 1) === 1;

  // Copy 1 — hugging the top-left finder pattern.
  for (let i = 0; i <= 5; i++) modules[8][i] = bit(i);
  modules[8][7] = bit(6);
  modules[8][8] = bit(7);
  modules[7][8] = bit(8);
  for (let i = 9; i <= 14; i++) modules[14 - i][8] = bit(i);

  // Copy 2 — split across the top-right and bottom-left finder patterns.
  for (let i = 0; i <= 7; i++) modules[size - 1 - i][8] = bit(i);
  for (let i = 8; i <= 14; i++) modules[8][size - 15 + i] = bit(i);

  // The one module that is always dark, regardless of version or mask.
  modules[size - 8][8] = true;
}

function placeData(
  modules: boolean[][],
  reserved: boolean[][],
  size: number,
  codewords: readonly number[],
): void {
  const bits: number[] = [];
  for (const byte of codewords) for (let i = 7; i >= 0; i--) bits.push((byte >>> i) & 1);

  let bitIndex = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1; // the timing column is skipped, exactly as the spec requires
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (reserved[row][c]) continue;
        const bitValue = bitIndex < bits.length ? bits[bitIndex] : 0;
        bitIndex += 1;
        // Mask 0: invert wherever (row + col) is even.
        const masked = (row + c) % 2 === 0 ? bitValue ^ 1 : bitValue;
        modules[row][c] = masked === 1;
      }
    }
    upward = !upward;
  }
}

/** Builds the complete matrix (quiet zone excluded — a renderer's own margin) for one payload. */
export function buildQrMatrix(text: string): QrMatrix {
  const byteLength = new TextEncoder().encode(text).length;
  const spec = chooseVersion(byteLength);
  const dataCodewords = encodeByteMode(text, spec);
  const eccCodewords = rsEncode(dataCodewords, spec.eccCodewords);
  const codewords = [...dataCodewords, ...eccCodewords];

  const size = spec.size;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  drawFinderPattern(modules, 0, 0);
  drawFinderPattern(modules, 0, size - 7);
  drawFinderPattern(modules, size - 7, 0);
  if (spec.alignmentCenter !== null) drawAlignmentPattern(modules, spec.alignmentCenter);
  for (let i = 8; i < size - 8; i++) {
    modules[6][i] = i % 2 === 0;
    modules[i][6] = i % 2 === 0;
  }

  const reserved = buildReservedMask(spec);
  placeData(modules, reserved, size, codewords);
  drawFormatInformation(modules, size);

  return { size, modules: modules.map((row) => Object.freeze([...row])) };
}

/** An SVG document for the matrix — a quiet zone of 4 modules, per the spec's minimum. */
export function qrMatrixToSvg(matrix: QrMatrix, moduleSize = 8): string {
  const quiet = 4;
  const dimension = (matrix.size + quiet * 2) * moduleSize;
  const rects: string[] = [];
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (!matrix.modules[row][col]) continue;
      const x = (col + quiet) * moduleSize;
      const y = (row + quiet) * moduleSize;
      rects.push(`<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}"/>`);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" ` +
    `width="${dimension}" height="${dimension}" shape-rendering="crispEdges">` +
    `<rect width="${dimension}" height="${dimension}" fill="#ffffff"/>` +
    `<g fill="#000000">${rects.join("")}</g>` +
    `</svg>`
  );
}
