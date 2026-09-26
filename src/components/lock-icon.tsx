import Box from "@mui/material/Box";

/**
 * The lock a locked record section shows in place of its chevron — LAN-432,
 * the approved W3-03 and W3-04b photographs. Drawn inline, like `PhoneIcon`:
 * there is no icon package in this dependency tree. It takes the colour of
 * the text around it.
 */
export function LockIcon({ size = 18 }: { size?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      role="img"
      aria-label="Locked"
      data-lock-indicator
      sx={{ width: size, height: size, flexShrink: 0 }}
    >
      <path
        fill="currentColor"
        d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.1-9H8.9V6a3.1 3.1 0 0 1 6.2 0v2z"
      />
    </Box>
  );
}
