import Button from "@mui/material/Button";
import { Section } from "./section";

/**
 * The club's players' WhatsApp group, offered as a link — LAN-327, and LAN-283
 * for the onboarding Done page.
 *
 * One component and one pair of words, because the player sees this in two
 * places and they have to be the same offer. It is a link shown, never a
 * tracked onboarding item (Brian, 2026-09-16): the club ticks off who is in a
 * messaging group itself. A deployment with no `PLAYER_WHATSAPP_GROUP_LINK`
 * renders nothing at all — never an explanation of what is missing.
 */

export const WHATSAPP_GROUP_HEADING = "The club's WhatsApp group";
export const JOIN_WHATSAPP_GROUP = "Join the WhatsApp group";

export function PlayerWhatsAppGroupSection({ link }: { link: string | null }) {
  if (link === null) return null;
  return (
    <Section title={WHATSAPP_GROUP_HEADING} testId="player-whatsapp-group">
      <Button
        href={link}
        variant="contained"
        sx={{ minHeight: 48 }}
        data-testid="player-whatsapp-group-link"
      >
        {JOIN_WHATSAPP_GROUP}
      </Button>
    </Section>
  );
}
