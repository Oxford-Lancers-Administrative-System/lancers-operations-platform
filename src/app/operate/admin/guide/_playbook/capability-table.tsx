import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  CAPABILITIES,
  CAPABILITY_KEYS,
  ROLE_LABELS,
  roleCodesPermit,
  type CapabilityKey,
} from "@/lib/auth/capabilities";

/**
 * What each seat may do — LAN-399, generated.
 *
 * The brief's requirement for this table is one word long and is the whole
 * point of it: *not hand-typed*. A table of twenty seats against eleven grants,
 * typed once and never opened again, is wrong the first time a grant moves and
 * gives a reader a confident answer that is false. So there is no data here.
 * The rows, the columns and every mark in the grid are read from
 * `src/lib/auth/capabilities.ts` at render time — the same frozen array the
 * server enforces from. A capability added, removed or regranted shows up here
 * because it showed up there, and `content.test.ts` asserts the equivalence
 * rather than the contents.
 *
 * Only seats that hold something are listed. Ten of the twenty hold nothing at
 * all, and twenty rows of which half are empty is a worse table, not a more
 * complete one — the line beneath says how many are missing and why, which is
 * the fact those ten rows would have carried.
 */
const CAPABILITY_TABLE_EMPTY_NOTE =
  "Seats that hold no privileged action are not listed. Somebody holding one signs in as an ordinary operator.";

/** The seats with at least one grant, in the catalogue's own order. */
export function seatsWithCapabilities(): readonly string[] {
  return Object.keys(ROLE_LABELS).filter((code) =>
    CAPABILITY_KEYS.some((key) => roleCodesPermit([code], key)),
  );
}

export function CapabilityTable() {
  const seats = seatsWithCapabilities();

  return (
    <Box>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small" data-testid="capability-table">
          <TableHead>
            <TableRow>
              <TableCell component="th" scope="col">
                Seat
              </TableCell>
              {CAPABILITY_KEYS.map((key) => (
                <TableCell key={key} component="th" scope="col">
                  {capabilityHeading(key)}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {seats.map((code) => (
              <TableRow key={code} data-testid={`capability-row-${code}`}>
                <TableCell component="th" scope="row" sx={{ whiteSpace: "nowrap" }}>
                  {ROLE_LABELS[code]}
                </TableCell>
                {CAPABILITY_KEYS.map((key) => {
                  const held = roleCodesPermit([code], key);
                  return (
                    <TableCell key={key} align="center">
                      {/* The mark is for sighted scanning; the text beside it is what a
                          screen reader announces, because a bare "Yes" column by column
                          is unreadable without the header in earshot. */}
                      <Box aria-hidden sx={{ fontWeight: 700 }}>
                        {held ? "✓" : "—"}
                      </Box>
                      <Box
                        sx={{
                          position: "absolute",
                          width: 1,
                          height: 1,
                          overflow: "hidden",
                          clip: "rect(0 0 0 0)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {held ? "Yes" : "No"}
                      </Box>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        {CAPABILITY_TABLE_EMPTY_NOTE}
      </Typography>
    </Box>
  );
}

/**
 * The column heading for one grant.
 *
 * `action` is a sentence written for a refusal ("approve an event and release
 * its invitations"), which is far too long for a column. The heading is its
 * first clause, capitalised — derived rather than retyped, so a reworded grant
 * reworders the heading with it.
 */
export function capabilityHeading(key: CapabilityKey): string {
  const action = CAPABILITIES[key].action;
  const clause = action.split(/,| and | — /)[0].trim();
  return clause.charAt(0).toUpperCase() + clause.slice(1);
}
