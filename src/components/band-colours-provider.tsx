"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  BAND_COLOURS,
  bandColoursFrom,
  DEFAULT_ROSTER_GROUP_COLOURS,
  type Band,
  type BandColours,
  type RosterGroupColourKeys,
} from "./band-colours";

/**
 * The roster group colours for one request — LAN-430. The `/operate` layout
 * reads `public.roster_group_colours` on the server and passes the ten keys
 * here; every banded Section, the roster board and the recruitment board draw
 * from it. Outside a provider (a test, a preview) the seeded colours stand.
 */
interface BandColoursValue {
  readonly keys: RosterGroupColourKeys;
  readonly bands: Readonly<Record<Band, BandColours>>;
}

const BandColoursContext = createContext<BandColoursValue>({
  keys: DEFAULT_ROSTER_GROUP_COLOURS,
  bands: BAND_COLOURS,
});

export function BandColoursProvider({
  groupColours,
  children,
}: {
  groupColours: RosterGroupColourKeys;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ keys: groupColours, bands: bandColoursFrom(groupColours) }),
    [groupColours],
  );
  return <BandColoursContext.Provider value={value}>{children}</BandColoursContext.Provider>;
}

/** Every band's colours, the ten roster groups in the club's chosen colours. */
export function useBandColours(): Readonly<Record<Band, BandColours>> {
  return useContext(BandColoursContext).bands;
}

/** The ten groups' palette keys, as stored — what the Roster categories dialog starts from. */
export function useRosterGroupColourKeys(): RosterGroupColourKeys {
  return useContext(BandColoursContext).keys;
}
