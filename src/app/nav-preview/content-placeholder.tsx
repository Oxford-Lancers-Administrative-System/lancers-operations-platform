import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";

/**
 * Neutral page-content stand-in for the nav frames — LAN-195.
 *
 * The point of every frame on this route is the navigation, never the page
 * beneath it. `Skeleton` renders no words, so there is nothing here that could
 * be read as the narrative prose the application frame is not allowed to
 * carry, and nothing that could be mistaken for a real page's content.
 */
export default function ContentPlaceholder() {
  return (
    <Stack spacing={2} sx={{ mt: 3 }}>
      <Skeleton variant="rounded" height={96} />
      <Skeleton variant="rounded" height={220} />
      <Skeleton variant="rounded" height={140} />
    </Stack>
  );
}
