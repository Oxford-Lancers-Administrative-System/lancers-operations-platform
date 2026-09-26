import Box from "@mui/material/Box";
import { gateShellPage } from "../../gate";
import { readCurrentSeason } from "@/lib/services/seasons";
import AddRecruitForm from "./add-recruit-form";
import { ADD_RECRUITS } from "@/lib/auth/roster-access";

// `/operate/recruitment/new` — `W6`, LAN-206.
export default async function AddRecruitPage() {
  // LAN-432: the May add recruits switch.
  const gate = await gateShellPage("/operate/recruitment/new", ADD_RECRUITS);
  if ("screen" in gate) return gate.screen;

  const season = await readCurrentSeason();

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <AddRecruitForm seasonLabel={`Adding to ${season.label}.`} />
    </Box>
  );
}
