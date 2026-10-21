#!/usr/bin/env node
/**
 * Derives every committed brand artefact from the files Brian supplied on
 * 9 September 2026 — LAN-277, LAN-269, LAN-279 — and on 16 September 2026 —
 * LAN-383, LAN-385.
 *
 * The supplied originals are not in the repository. They live on the review
 * machine at `~/.local/state/lancers-operations-platform/brand/` (Downloads is
 * not durable), and each has exactly one job:
 *
 *   award-sticker.svg         the application mark, icons and email
 *                                                   -> public/brand/icon-mark.svg, crest-email*.png
 *   og-image.png              the link preview      -> src/app/opengraph-image.png
 *   join-og-image.png         the sign-up preview   -> src/app/join/[code]/opengraph-image.png
 *
 * The square crest (`app-logo-group-2454.svg`, LAN-278) was the application
 * mark until LAN-509 put the round crest in its place; nothing reads it now.
 *
 * Both preview images are copied byte for byte and never re-encoded: LAN-269
 * and LAN-383 are one decision — the club supplied a picture, and the picture
 * is what a chat shows.
 *
 * This script is a one-off asset tool, not part of `npm run verify`: it reads
 * files outside the repository and so cannot run in CI. It exists so the
 * derived artefacts can be regenerated identically rather than described.
 *
 *   node scripts/generate-brand-assets.mjs [--source <dir>]
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Oxford Blue. The club navy, `theme.palette.primary.main`. */
const NAVY = "#002147";

const DEFAULT_SOURCE = path.join(os.homedir(), ".local/state/lancers-operations-platform/brand");

function sourceDir() {
  const flag = process.argv.indexOf("--source");
  return flag === -1 ? DEFAULT_SOURCE : path.resolve(process.argv[flag + 1]);
}

// ---------------------------------------------------------------------------
// SVG surgery
// ---------------------------------------------------------------------------

/**
 * The tight bounding box of everything an SVG actually draws, in its own user
 * units.
 *
 * Figma exports the artboard, not the mark, so a supplied file can carry
 * transparent margin. The header boxes are square and fixed (48px, 32px), so
 * margin baked into the viewBox is margin inside the box: the mark renders
 * smaller than the box and sits off-centre.
 * Cropping the viewBox is the "adjust the crop, not the box" LAN-278 asks for.
 *
 * Measured by rasterising at 4x and trimming, rather than by parsing path data:
 * a renderer's own idea of the ink is the one that matters, and it accounts for
 * masks and even-odd fills that a bezier walk would have to re-implement.
 */
async function inkBox(svg, viewBoxWidth) {
  const density = 72 * 4;
  const raster = await sharp(svg, { density }).png().toBuffer();
  const { width } = await sharp(raster).metadata();
  const { info } = await sharp(raster).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });

  const perUnit = viewBoxWidth / width;
  return {
    x: -info.trimOffsetLeft * perUnit,
    y: -info.trimOffsetTop * perUnit,
    width: info.width * perUnit,
    height: info.height * perUnit,
  };
}

function openTag(svg) {
  const match = /<svg\b[^>]*>/.exec(svg);
  if (!match) throw new Error("no <svg> element");
  return match[0];
}

function attribute(tag, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return match ? match[1] : null;
}

/** Everything between `<svg …>` and `</svg>` — the drawing itself. */
function body(svg) {
  return svg.slice(svg.indexOf(">", svg.indexOf("<svg")) + 1, svg.lastIndexOf("</svg>")).trim();
}

/**
 * Re-emit an SVG with its viewBox cropped to `box`, geometry untouched.
 *
 * Nothing inside is moved or rescaled: only the window onto it changes, so the
 * paths stay byte-for-byte the coordinates Brian's file draws.
 */
function crop(svg, box, header) {
  const round = (n) => Math.round(n * 100) / 100;
  const view = [round(box.x), round(box.y), round(box.width), round(box.height)];
  return [
    `<!-- ${header} -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${view[2]}" height="${view[3]}" ` +
      `viewBox="${view.join(" ")}" fill="none">`,
    body(svg),
    "</svg>",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Rasters
// ---------------------------------------------------------------------------

/**
 * The rasterisation density that gives `svg` a natural raster comfortably above
 * `size`, so the downscale has pixels to work with without decoding a 9000px
 * square for a 16px frame.
 */
function densityFor(svg, size) {
  const declared = Number(attribute(openTag(svg), "width")) || 512;
  return Math.max(72, Math.min(72 * 8, Math.ceil((size * 4 * 72) / declared)));
}

/**
 * A square PNG of `svg` at `size`, RGBA.
 *
 * `ensureAlpha` looks redundant on a drawing that already has one and is not:
 * `next build` decodes `favicon.ico` itself, and its ICO reader accepts **only**
 * RGBA PNG frames — a three-channel PNG fails the build outright with "The PNG
 * is not in RGBA format!". `palette: false` keeps sharp from quantising the
 * small frames into an indexed PNG for the same reason.
 *
 * `ground` flattens onto an opaque colour first. That is for `apple-icon` alone:
 * iOS masks the icon to a rounded square and paints black wherever the alpha is,
 * so a transparent corner shows as a black corner. Everything else keeps the
 * badge's own transparency outside the disc (LAN-385) — the badge carries its
 * own navy ground and gold ring, so it reads on a light or a dark tab strip
 * without a square behind it.
 */
async function png(svg, size, ground = null) {
  const pipeline = sharp(Buffer.from(svg), { density: densityFor(svg, size) }).resize(size, size, {
    fit: "fill",
  });
  if (ground !== null) pipeline.flatten({ background: ground });
  return pipeline.ensureAlpha(1).png({ compressionLevel: 9, palette: false }).toBuffer();
}

/**
 * An `.ico` holding PNG frames.
 *
 * ICO has carried PNG payloads since Windows Vista and every browser this app
 * supports reads them; the alternative, a bottom-up BMP with an AND mask, buys
 * nothing here and costs four times the bytes at 48px.
 */
function ico(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  let offset = 6 + frames.length * 16;
  const directory = frames.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });

  return Buffer.concat([header, ...directory, ...frames.map((f) => f.png)]);
}

// ---------------------------------------------------------------------------

async function main() {
  const source = sourceDir();
  const brand = path.join(REPO, "public/brand");
  const app = path.join(REPO, "src/app");
  await mkdir(brand, { recursive: true });

  const wrote = [];
  const put = async (file, data) => {
    await writeFile(file, data);
    wrote.push(path.relative(REPO, file));
  };

  // -- LAN-269, LAN-385, LAN-509: the application mark and the icons ------
  // Everything below is one SVG rendered at six sizes. The badge already is an
  // icon — a white crest on a navy disc inside a gold ring, transparent outside
  // the circle — so there is no navy square to compose it onto and no inset to
  // leave as margin. That wrapper existed because the gold-outline mark it
  // replaced was outline on nothing and had no ground of its own.
  const sticker = await readFile(path.join(source, "award-sticker.svg"), "utf8");
  const stickerView = attribute(openTag(sticker), "viewBox").split(/\s+/).map(Number);
  const stickerBox = await inkBox(Buffer.from(sticker), stickerView[2]);

  const badge = crop(
    sticker,
    stickerBox,
    "Brian's Award Sticker.svg, supplied 16 September 2026 (LAN-385). The " +
      "application mark, the favicon and the app icons (LAN-509). Used as " +
      "supplied: viewBox cropped to the mark, nothing redrawn or recoloured.",
  );

  // The name is unchanged from LAN-269 so every reader keeps working; what it
  // holds is the badge now, not the gold outline. Since LAN-509 it is also the
  // application mark `BrandMark` draws, on dark and light grounds alike.
  await put(path.join(brand, "icon-mark.svg"), badge);
  await put(path.join(app, "icon.svg"), badge);

  // iOS masks and rounds this itself and paints black through any alpha, so it
  // is the one raster given an opaque ground.
  await put(path.join(app, "apple-icon.png"), await png(badge, 180, NAVY));

  // The manifest's two sizes, for a pinned home-screen tile.
  await put(path.join(brand, "icon-192.png"), await png(badge, 192));
  await put(path.join(brand, "icon-512.png"), await png(badge, 512));

  // 16, 32 and 48 — the three a tab, a bookmark bar and a history entry use.
  // Straight downscales of the same badge: no tighter crop, because cropping a
  // round badge is cutting its ring off.
  await put(
    path.join(app, "favicon.ico"),
    ico([
      { size: 16, png: await png(badge, 16) },
      { size: 32, png: await png(badge, 32) },
      { size: 48, png: await png(badge, 48) },
    ]),
  );

  // -- LAN-398, LAN-456, LAN-491: the crest in every email -----------------
  // The round badge — navy disc, gold ring, three crowns, crossed lances, the
  // football — square and transparent outside the circle, exactly as the icons
  // above (LAN-491, Brian, 7 October 2026: the round crest, not the square
  // application mark, and no square treatment around it). The header shows it
  // 48px and the signature block 32px, so the committed raster is the 2x of the
  // larger slot; `@1x` is the matching non-retina rendition offered through
  // `srcset`. It carries its own ground, so it reads on the email's white card
  // with nothing behind it.
  await put(path.join(brand, "crest-email.png"), await png(badge, 96));
  await put(path.join(brand, "crest-email@1x.png"), await png(badge, 48));

  // -- LAN-269, LAN-383: the two link previews -----------------------------
  // Used exactly as supplied. LAN-269: "do not generate one." Copied, never
  // passed through sharp: re-encoding a supplied picture is modifying it.
  const preview = async (file, ...targets) => {
    const bytes = await readFile(path.join(source, file));
    const meta = await sharp(bytes).metadata();
    if (meta.width !== 1200 || meta.height !== 630) {
      throw new Error(`${file} must be 1200x630, found ${meta.width}x${meta.height}`);
    }
    for (const target of targets) await put(target, bytes);
  };

  await preview(
    "og-image.png",
    path.join(app, "opengraph-image.png"),
    path.join(app, "twitter-image.png"),
  );

  // The sign-up door's own card — the one link the club pushes at strangers.
  // It was drawn in code from the old square crest until LAN-383 replaced it with Brian's
  // recruitment image, which is used whole: no words drawn over it, and it
  // still reads nothing from `params`.
  await preview(
    "join-og-image.png",
    path.join(app, "join/[code]/opengraph-image.png"),
    path.join(app, "join/[code]/twitter-image.png"),
  );

  console.log(`Source: ${source}`);
  for (const file of wrote) console.log(`  wrote ${file}`);
}

await main();
