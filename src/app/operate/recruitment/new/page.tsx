import Box from "@mui/material/Box";
import { gateShellPage } from "../../gate";
import { readCurrentSeason } from "@/lib/services/seasons";
import AddRecruitForm from "./add-recruit-form";
import { PERSON_RECORD_BRIDGE } from "@/lib/auth/grants";

// `/operate/recruitment/new` — `W6`, LAN-206.
export default async function AddRecruitPage() {
  // LAN-429 bridge: replaced by LAN-432
  const gate = await gateShellPage("/operate/recruitment/new", PERSON_RECORD_BRIDGE);
  if ("screen" in gate) return gate.screen;

  const season = await readCurrentSeason();

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <AddRecruitForm seasonLabel={`Adding to ${season.label}.`} />
    </Box>
  );
}
