import { ROSTER_GROUP_KEYS, type RosterGroupKey } from "@/lib/auth/grants";
import { templateColourFor } from "@/lib/services/event-template-input";
import { CLUB, SEMANTIC } from "@/theme-tokens";

/**
 * Where a band's colour comes from — LAN-430, W2 of mission
 * M-GRANULAR-ROLES-AND-PERMISSIONS (LAN-423).
 *
 * The ten roster groups wear the colour the club chose for them
 * (`public.roster_group_colours`, a palette key each), resolved on the server
 * by the `/operate` layout and handed to every band through
 * `BandColoursProvider` (`./band-colours-provider.tsx`). The record-only bands
 * — season, recruitment, attendance, history — keep their code colours. Pure:
 * no database, no React, safe in a client bundle.
 *
 * A band is a place, not a verdict: nothing here gives a group a meaning.
 */
export type Band =
  | "person"
  | "season"
  | "membership"
  | "availability"
  | "coaching"
  | "offensive"
  | "defensive"
  | "specialTeams"
  | "warmup"
  | "kit"
  | "recruitment"
  | "onboarding"
  | "attendance"
  | "history";

export interface BandColours {
  readonly header: string;
  /** The band head's text: charcoal on Lancer Gold and Orange, white elsewhere (`src/theme.test.ts`). */
  readonly text: string;
  readonly tint: string;
  /** The opaque version of `tint`, for sticky cells that must hide what scrolls under them. */
  readonly solid: string;
}

/** A roster group's colour, as a palette key. The ten groups of `ROSTER_GROUP_KEYS`. */
export type RosterGroupColourKeys = Readonly<Record<RosterGroupKey, string>>;

/** The seeded colours (`20261006090000_granular_access.sql`) — what a band wears before the layout says otherwise. */
export const DEFAULT_ROSTER_GROUP_COLOURS: RosterGroupColourKeys = Object.freeze({
  person: "blue",
  membership: "blue",
  onboarding: "lancer_gold",
  kit: "lancer_gold",
  availability: "slate",
  coaching: "indigo",
  offensive: "teal",
  defensive: "purple",
  special_teams: "brown",
  warmup: "cyan",
});

/** The ten bands a roster group owns. */
type RosterBand = Exclude<RosterGroupKey, "special_teams"> | "specialTeams";

/** The band a roster group draws as. Only Special teams is spelled differently. */
export function bandOfGroup(group: RosterGroupKey): RosterBand {
  return group === "special_teams" ? "specialTeams" : group;
}

/** How much of the band's colour its body carries — the same wash the code colours used. */
const TINT_ALPHA = 0.05;

function channels(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function toHex(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0").toUpperCase();
}

/** One palette swatch as a band: its accent for the head, its band text, and a light wash of the accent for the body. */
export function bandColoursForSwatch(colourKey: string): BandColours {
  const swatch = templateColourFor(colourKey);
  const [red, green, blue] = channels(swatch.accent);
  const over = (channel: number) => 255 - (255 - channel) * TINT_ALPHA;
  return Object.freeze({
    header: swatch.accent,
    text: swatch.bandText,
    tint: `rgba(${red}, ${green}, ${blue}, ${TINT_ALPHA})`,
    solid: `#${toHex(over(red))}${toHex(over(green))}${toHex(over(blue))}`,
  });
}

const WHITE_TEXT = CLUB.white;

/** The bands no roster group owns: their colours stay in code. */
const RECORD_ONLY_BANDS = Object.freeze({
  season: {
    header: CLUB.royalBlue,
    text: WHITE_TEXT,
    tint: "rgba(29, 66, 166, 0.045)",
    solid: "#F4F6FB",
  },
  recruitment: {
    header: CLUB.royalBlue,
    text: WHITE_TEXT,
    tint: "rgba(29, 66, 166, 0.045)",
    solid: "#F4F6FB",
  },
  attendance: {
    header: SEMANTIC.neutral.main,
    text: WHITE_TEXT,
    tint: "rgba(90, 87, 84, 0.05)",
    solid: "#F5F5F4",
  },
  history: {
    header: SEMANTIC.neutral.main,
    text: WHITE_TEXT,
    tint: "rgba(90, 87, 84, 0.05)",
    solid: "#F5F5F4",
  },
}) satisfies Readonly<Record<Exclude<Band, RosterBand>, BandColours>>;

/** Every band's colours, the ten roster groups drawn from `colours` (a missing group falls back to its seeded colour). */
export function bandColoursFrom(
  colours: Partial<Record<string, string>> = DEFAULT_ROSTER_GROUP_COLOURS,
): Readonly<Record<Band, BandColours>> {
  const groups = Object.fromEntries(
    ROSTER_GROUP_KEYS.map((group) => [
      bandOfGroup(group),
      bandColoursForSwatch(colours[group] ?? DEFAULT_ROSTER_GROUP_COLOURS[group]),
    ]),
  ) as Record<RosterBand, BandColours>;
  return Object.freeze({ ...RECORD_ONLY_BANDS, ...groups });
}

/** The bands in their seeded colours: what a surface outside the `/operate` layout (a test, a preview) draws. */
export const BAND_COLOURS: Readonly<Record<Band, BandColours>> = bandColoursFrom();
