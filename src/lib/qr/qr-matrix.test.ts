import { describe, expect, it } from "vitest";

import { buildQrMatrix, qrMatrixToSvg, QrCapacityExceeded } from "./qr-matrix";

/**
 * Structural proof for the hand-rolled encoder — `qr-matrix.ts`'s own module
 * comment names what this cannot prove (an actual scan) and what it can: the
 * fixed-shape invariants a decoder's very first pass relies on.
 */
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
});
