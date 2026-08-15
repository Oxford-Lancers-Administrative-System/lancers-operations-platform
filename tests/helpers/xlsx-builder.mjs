/**
 * Builds a minimal `.xlsx` in memory, for testing the showcase workbook reader.
 *
 * The club's real workbooks cannot be committed — they carry forty-two real
 * students' names, and this repository is public. So the reader's tests need
 * workbooks they construct themselves, which means writing the format as well
 * as reading it.
 *
 * Everything is stored uncompressed (ZIP method 0). A reader that handles
 * deflate handles stored trivially, and the point here is to exercise the XML
 * and the archive structure rather than zlib. One test deliberately checks a
 * deflated entry as well, and builds that one itself.
 */

import { deflateRawSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

/**
 * Packs named entries into a ZIP archive.
 *
 * `deflate` is opt-in per entry so a test can prove the reader inflates as well
 * as reads stored data.
 *
 * The JSDoc types are load-bearing rather than decorative: `tsc` checks this
 * file from the TypeScript suites that import it, and infers a parameter's type
 * from its default value when none is given — so `{ sharedStrings = [] }` alone
 * becomes `never[]`, and every caller passing a string fails to compile.
 *
 * @param {Record<string, string>} entries
 * @param {{ deflate?: boolean }} [options]
 * @returns {Buffer}
 */
export function zip(entries, { deflate = false } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name, "utf8");
    const raw = Buffer.from(text, "utf8");
    const payload = deflate ? deflateRawSync(raw) : raw;
    const method = deflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + payload.length;
  }

  const localBlock = Buffer.concat(locals);
  const centralBlock = Buffer.concat(centrals);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralBlock.length, 12);
  end.writeUInt32LE(localBlock.length, 16);

  return Buffer.concat([localBlock, centralBlock, end]);
}

/**
 * A workbook with one or more named sheets.
 *
 * `sheets` maps a sheet name to an array of `[address, xmlCellBody]` pairs,
 * where the body is the inside of a `<c>` element including its attributes —
 * so a test can write a shared string, an inline string, an error or a number
 * without this helper deciding for it.
 *
 * @param {Record<string, [string, string][]>} sheets
 * @param {{ sharedStrings?: string[], deflate?: boolean }} [options]
 * @returns {Buffer}
 */
export function workbook(sheets, { sharedStrings = [], deflate = false } = {}) {
  const names = Object.keys(sheets);

  const entries = {
    "[Content_Types].xml": '<?xml version="1.0"?><Types/>',
    "xl/workbook.xml":
      '<?xml version="1.0"?><workbook><sheets>' +
      names
        .map(
          (name, index) =>
            `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
        )
        .join("") +
      "</sheets></workbook>",
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0"?><Relationships>' +
      names
        .map(
          (_, index) =>
            `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`,
        )
        .join("") +
      "</Relationships>",
  };

  if (sharedStrings.length > 0) {
    entries["xl/sharedStrings.xml"] =
      '<?xml version="1.0"?><sst>' +
      sharedStrings.map((value) => `<si>${value}</si>`).join("") +
      "</sst>";
  }

  names.forEach((name, index) => {
    const rows = new Map();
    for (const [address, body] of sheets[name]) {
      const row = Number(/(\d+)$/.exec(address)[1]);
      if (!rows.has(row)) rows.set(row, []);
      rows.get(row).push(`<c r="${address}" ${body}`);
    }

    entries[`xl/worksheets/sheet${index + 1}.xml`] =
      '<?xml version="1.0"?><worksheet><sheetData>' +
      [...rows.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([row, cells]) => `<row r="${row}">${cells.join("")}</row>`)
        .join("") +
      "</sheetData></worksheet>";
  });

  return zip(entries, { deflate });
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
