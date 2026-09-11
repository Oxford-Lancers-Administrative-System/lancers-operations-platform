import Box from "@mui/material/Box";

/** The call icon on a board's phone card — drawn inline, no icon package in this dependency tree. */
export function PhoneIcon() {
  return (
    <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 18, height: 18 }}>
      <path
        fill="currentColor"
        d="M6.6 10.8c1.4 2.7 3.6 4.9 6.3 6.3l2.1-2.1c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.4 21 3 13.6 3 4.5c0-.6.4-1 1-1h3.6c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.2 1L6.6 10.8z"
      />
    </Box>
  );
}
