"use client";

import { useCallback, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";

import RosterBoard, { type AuditEvent } from "./roster-board";

/**
 * The preview's own controls, and the state the board is driven from.
 *
 * Everything in this file is **scaffolding**. It is styled to read as harness
 * chrome rather than as product — dark, monospaced, above the application frame
 * — because the working agreement keeps narrative text out of the UI, and
 * because a worker reading this tomorrow has to be able to tell at a glance
 * which parts are the specification and which parts are the rig.
 *
 * The two switches exist because they turn claims that are otherwise invisible
 * into things you can watch happen:
 *
 *   * **Availability grant.** Column visibility is a function of the viewer's
 *     category grants, and what is not granted is *absent from the DOM and the
 *     payload, not hidden in it*. Turn it off and the Availability column and
 *     its pinned control are gone — not greyed, gone — which is the behaviour
 *     that lets access widen later without a special case.
 *
 *   * **Season with no memberships.** The two empty states must be
 *     distinguishable, because the recovery differs: clear the filters, or
 *     enter the first returner. This is the one the W5 review could not
 *     photograph, because the seeded data contains no empty season.
 */
export default function PreviewShell() {
  const [availabilityGrant, setAvailabilityGrant] = useState(true);
  const [seasonEmpty, setSeasonEmpty] = useState(false);
  const [audit, setAudit] = useState<AuditEvent[]>([]);

  const onAudit = useCallback((event: AuditEvent) => {
    setAudit((current) => [...current, event]);
  }, []);

  const grants = availabilityGrant ? ["availability_read"] : [];

  return (
    <>
      <Box
        sx={{
          bgcolor: "grey.900",
          color: "common.white",
          px: { xs: 2, md: 3 },
          py: 1.5,
          mb: 3,
          borderRadius: 1,
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 1, md: 3 }}
          sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Chip
              size="small"
              label="Fidelity mockup"
              sx={{ bgcolor: "warning.main", color: "common.black", fontWeight: 700 }}
            />
            <Typography
              variant="body2"
              sx={{ fontFamily: "var(--font-geist-mono), monospace", color: "grey.400" }}
            >
              W5 · not the implementation · fake data, no database
            </Typography>
          </Stack>
          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={availabilityGrant}
                  onChange={(event) => setAvailabilityGrant(event.target.checked)}
                />
              }
              label={
                <Typography variant="body2" sx={{ color: "grey.300" }}>
                  availability_read grant
                </Typography>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={seasonEmpty}
                  onChange={(event) => setSeasonEmpty(event.target.checked)}
                />
              }
              label={
                <Typography variant="body2" sx={{ color: "grey.300" }}>
                  season has no memberships
                </Typography>
              }
            />
          </Stack>
        </Stack>
      </Box>

      <RosterBoard
        grants={grants}
        seasonEmpty={seasonEmpty}
        audit={audit}
        onAudit={onAudit}
      />
    </>
  );
}
