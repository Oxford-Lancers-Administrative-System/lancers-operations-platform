import Box from "@mui/material/Box";
import { gateShellPage } from "../../gate";
import { readCurrentSeason } from "@/lib/services/seasons";
import AddRecruitForm from "./add-recruit-form";

/**
 * `/operate/recruitment/new` — `W6`, LAN-206. The board's `ADD RECRUIT`
 * button, now landing somewhere real: the shipped add-a-person form, wearing
 * recruitment's shell, with the Academic section `W6-01` adds and the
 * duplicate check `W8-01` drives.
 */
export default async function AddRecruitPage() {
  const gate = await gateShellPage("/operate/recruitment/new", "person_record_authority");
  if ("screen" in gate) return gate.screen;

  const season = await readCurrentSeason();

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <AddRecruitForm seasonLabel={`Adding to ${season.label}.`} />
    </Box>
  );
}
