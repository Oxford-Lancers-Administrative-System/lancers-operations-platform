import React, { useCallback, useEffect, useState, useRef, useId } from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  CssBaseline,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  ThemeProvider,
  Typography,
  createTheme,
} from "@mui/material";

const theme = createTheme({
  palette: {
    primary: { main: "#123c31" },
    secondary: { main: "#a78038" },
    background: { default: "#f5f6f3" },
  },
  typography: { fontFamily: "Arial, sans-serif" },
  shape: { borderRadius: 10 },
});
const when = (value) => {
  if (!value) return "Not recorded";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "Unreadable date"
    : new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/London",
      }).format(d);
};
const words = (value) =>
  String(value ?? "Unknown")
    .replaceAll("_", " ")
    .replace(/^./, (s) => s.toUpperCase());
const tone = (status) =>
  ["failed", "due"].includes(status)
    ? "warning"
    : ["delivered_evidence", "simulated_delivered"].includes(status)
      ? "success"
      : "default";
function Picker({ label, value, onChange, options }) {
  const id = useId();
  return (
    <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
      <InputLabel id={id}>{label}</InputLabel>
      <Select labelId={id} label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([id, name]) => (
          <MenuItem key={id} value={id}>
            {name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
function PersonCard({ person, capabilities, onSave }) {
  const [settings, setSettings] = useState(person.settings);
  const [busy, setBusy] = useState(false);
  const update = (key, value) =>
    setSettings((current) => ({
      ...current,
      [key]: value,
      ...(key === "identity" ? { delivery: "intercepted", responder: "none" } : {}),
    }));
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6">{person.name}</Typography>
        <Typography>{person.phone ?? "No current phone number"}</Typography>
        {person.settings.destinationChanged && (
          <Alert severity="warning">
            The destination changed. Actual delivery and simulated responses have been stopped for
            this person.
          </Alert>
        )}
        <Stack direction={{ xs: "column", md: "row" }} sx={{ my: 2, gap: 2 }}>
          <Picker
            label="Identity"
            value={settings.identity}
            onChange={(v) => update("identity", v)}
            options={[
              ["unclassified", "Not identified"],
              ["synthetic", "Synthetic person"],
              ["real", "Real person"],
            ]}
          />
          <Picker
            label="Delivery"
            value={settings.delivery}
            onChange={(v) => update("delivery", v)}
            options={[
              ["intercepted", "Intercept locally"],
              ["real", "Actual SMS"],
            ]}
          />
          <Picker
            label="Intercepted outcome"
            value={settings.outcome}
            onChange={(v) => update("outcome", v)}
            options={[
              ["delivered", "Simulated delivery"],
              ["undelivered", "Accepted, not delivered"],
              ["failed", "Simulated failure"],
            ]}
          />
        </Stack>
        <Typography variant="body2">
          Recruitment and onboarding forms are always manual. Simulation answers event RSVPs and
          event questions only. Actual delivery requires explicit selection and the configured test
          tunnel. Unselected destinations stay intercepted.
        </Typography>
        <Stack direction={{ xs: "column", md: "row" }} sx={{ mt: 2, gap: 2 }}>
          <Picker
            label="Response profile"
            value={settings.responder}
            onChange={(v) => update("responder", v)}
            options={[
              ["none", "No simulation"],
              ["prompt", "Prompt · after 1 minute"],
              ["late", "Late · chosen delay"],
              ["never", "Non-responder"],
            ]}
          />
          <Picker
            label="Event question completion"
            value={settings.completion}
            onChange={(v) => update("completion", v)}
            options={[
              ["all", "All answers"],
              ["minimum", "Required minimum"],
              ["partial", "Partial answers"],
              ["none", "No answers"],
            ]}
          />
          <Picker
            label="Event answer"
            value={settings.eventAnswer ?? "yes"}
            onChange={(v) => update("eventAnswer", v)}
            options={[
              ["yes", "Attending"],
              ["no", "Not attending"],
            ]}
          />
          {settings.responder === "late" && (
            <TextField
              size="small"
              label="Response delay (hours)"
              type="number"
              value={settings.delayHours}
              onChange={(e) => update("delayHours", Number(e.target.value))}
            />
          )}
        </Stack>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Synthetic responses use the application’s form actions. Partial completes half of missing
          onboarding details, two football-background answers, or half of event questions. Existing
          answers are preserved. Minimum fills required fields and player checklist steps; office
          verification remains outstanding.
        </Typography>
        <Button
          sx={{ mt: 1 }}
          variant="outlined"
          disabled={busy || !capabilities.routing}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(person.id, settings);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save person settings"}
        </Button>
        {!capabilities.routing && (
          <Typography variant="body2">
            Start the local test-integrated app to enable these controls.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function App() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [person, setPerson] = useState(
      () => new URLSearchParams(window.location.search).get("person") ?? "",
    ),
    [event, setEvent] = useState(
      () => new URLSearchParams(window.location.search).get("event") ?? "",
    ),
    [tab, setTab] = useState(0),
    [message, setMessage] = useState(null),
    [query, setQuery] = useState("");
  const [hours, setHours] = useState("24");
  const refreshVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(
        `/api/snapshot?person=${encodeURIComponent(person)}&event=${encodeURIComponent(event)}`,
      );
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      if (version === refreshVersion.current) setData(body);
    } catch (e) {
      if (version === refreshVersion.current)
        setError(e.message || "Could not refresh local evidence.");
    } finally {
      if (version === refreshVersion.current) setLoading(false);
    }
  }, [person, event]);
  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 3000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);
  async function savePerson(personId, settings) {
    setError("");
    try {
      const response = await fetch("/api/person", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-panel": document.querySelector('meta[name="test-panel"]').content,
        },
        body: JSON.stringify({ personId, settings }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await refresh();
    } catch (error) {
      setError(error.message || "Could not save these settings.");
    }
  }
  async function runTest(value) {
    setError("");
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-panel": document.querySelector('meta[name="test-panel"]').content,
        },
        body: JSON.stringify({ hours: value }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ bgcolor: "primary.main", color: "white", py: 3 }}>
        <Container maxWidth="xl">
          <Stack
            direction="row"
            sx={{ gap: 2, alignItems: "center", justifyContent: "space-between" }}
          >
            <Box>
              <Typography variant="overline">OXFORD LANCERS · LOCAL TESTING</Typography>
              <Typography variant="h4" component="h1">
                SMS control panel
              </Typography>
            </Box>
            <Chip label="This Mac only" sx={{ bgcolor: "#e5eee7", color: "#163e2e" }} />
          </Stack>
          <Typography sx={{ mt: 1, color: "#d6e5dc" }}>
            Make changes in the app. Watch the messages here.
          </Typography>
        </Container>
      </Box>
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{ gap: 1, justifyContent: "space-between" }}
          >
            <Box>
              <Typography variant="subtitle2">Evidence refreshed</Typography>
              <Typography>
                {data ? when(data.asOf) : "Connecting to your local database…"}
              </Typography>
            </Box>
            <Stack direction="row" sx={{ gap: 1 }}>
              <Button variant="outlined" onClick={refresh} disabled={loading}>
                Refresh
              </Button>
              {data && (
                <Button variant="contained" href={data.appUrl} target="_blank" rel="noreferrer">
                  Open normal app
                </Button>
              )}
            </Stack>
          </Stack>
          {loading && (
            <Typography variant="body2" role="status">
              Refreshing local evidence…
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {data?.callbackError && <Alert severity="warning">{data.callbackError}</Alert>}
          {!data && loading && <CircularProgress aria-label="Loading local messages" />}
          {data && (
            <>
              <Alert severity="info">
                Use the normal app to create events and people. The panel processes due messages
                automatically every 10 seconds. Unselected destinations are intercepted.
              </Alert>
              {data.callbackError && <Alert severity="error">{data.callbackError}</Alert>}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6">
                    Shared test clock · {when(data.clock ?? data.asOf)}
                  </Typography>
                  <Typography variant="body2">
                    {data.clock
                      ? "Test time is paused between advances."
                      : "Following real time until your first advance."}
                  </Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} sx={{ mt: 2, gap: 2 }}>
                    <TextField
                      size="small"
                      label="Advance by hours"
                      type="number"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      disabled={data.runner?.busy}
                    />
                    <Button
                      variant="contained"
                      disabled={!data.capabilities.clock || data.runner?.busy}
                      onClick={() => runTest(Number(hours))}
                    >
                      Advance time
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={!data.capabilities.routing || data.runner?.busy}
                      onClick={() => runTest(0)}
                    >
                      Process due now
                    </Button>
                  </Stack>
                  <Typography role="status" sx={{ mt: 1 }}>
                    {data.runner?.busy ? "Processing workflows and responses…" : "Ready"}
                  </Typography>
                  <Typography variant="body2">
                    Actual SMS recipients:{" "}
                    {data.people
                      .filter((p) => p.settings.delivery === "real")
                      .map((p) => `${p.name} (${p.phone})`)
                      .join(", ") || "None — all messages stay local"}
                  </Typography>
                </CardContent>
              </Card>
              <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                variant="scrollable"
                allowScrollButtonsMobile
              >
                <Tab label="Message timeline" />
                <Tab label="People" />
                <Tab label="Workflow checklist" />
                <Tab label="Responses" />
              </Tabs>
              {tab === 0 && (
                <>
                  <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
                    <Picker
                      label="Person"
                      value={person}
                      onChange={setPerson}
                      options={[["", "All people"], ...data.people.map((p) => [p.id, p.name])]}
                    />
                    <Picker
                      label="Event"
                      value={event}
                      onChange={setEvent}
                      options={[
                        ["", "All events and workflows"],
                        ...data.events.map((e) => [e.id, e.name]),
                      ]}
                    />
                  </Stack>
                  <Typography variant="body2">
                    Showing {data.jobs.length} of {data.total} jobs, newest first. Captured means
                    intercepted locally; accepted alone does not prove phone delivery.
                  </Typography>
                  {data.jobs.length === 0 && (
                    <Alert severity="info">
                      No jobs match this selection. Choose another person or event, or create and
                      approve an event in the normal app.
                    </Alert>
                  )}
                  {data.jobs.map((job) => (
                    <Card key={job.id} variant="outlined">
                      <CardContent>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}

                          sx={{ gap: 1, justifyContent: "space-between" }}
                        >
                          <Box>
                            <Typography variant="h6">{words(job.kind)}</Typography>
                            <Typography>
                              {job.person} · {job.destination ?? "No destination recorded"}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {job.event ?? "Person workflow"} · {words(job.channel)}
                            </Typography>
                          </Box>
                          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                            <Chip size="small" label={words(job.identity)} />
                            <Chip
                              size="small"
                              color={tone(job.observed)}
                              label={words(job.observed)}
                            />
                          </Stack>
                        </Stack>
                        <Divider sx={{ my: 1.5 }} />
                        <Stack
                          direction={{ xs: "column", sm: "row" }}

                          sx={{ gap: 1, justifyContent: "space-between" }}
                        >
                          <Box>
                            <Typography variant="body2">
                              Planned: {when(job.scheduled_for)}
                            </Typography>
                            <Typography variant="body2">
                              Actual capture / attempt:{" "}
                              {when(job.capture?.actualAt ?? job.capture?.at ?? job.requested_at)}
                            </Typography>
                          </Box>
                          <Button onClick={() => setMessage(job)}>Inspect message</Button>
                        </Stack>
                        {job.last_error && (
                          <Typography sx={{ mt: 1 }} color="error">
                            {job.last_error}
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
              {tab === 1 && (
                <>
                  <Typography>
                    Identify people here before enabling simulated responses or actual delivery.
                  </Typography>
                  <TextField
                    size="small"
                    label="Find a person"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {data.people.filter((p) =>
                    (p.name + " " + (p.phone ?? "")).toLowerCase().includes(query.toLowerCase()),
                  ).length === 0 && (
                    <Alert severity="info">
                      No people match “{query}”. Refine the search or add a person in the normal
                      app.
                    </Alert>
                  )}
                  {data.people
                    .filter((p) =>
                      (p.name + " " + (p.phone ?? "")).toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((p) => (
                      <PersonCard
                        key={p.id + JSON.stringify(p.settings)}
                        person={p}
                        capabilities={data.capabilities}
                        onSave={savePerson}
                      />
                    ))}
                </>
              )}
              {tab === 3 && (
                <>
                  <Typography>
                    Planned and completed synthetic form actions. Real people answer for themselves
                    in the app.
                  </Typography>
                  {data.responses?.length === 0 && (
                    <Alert severity="info">
                      Choose a synthetic person and response profile, then trigger a workflow in the
                      normal app. A delivered intercepted message schedules their response.
                    </Alert>
                  )}
                  {data.responses?.map((r) => (
                    <Card variant="outlined" key={r.id}>
                      <CardContent>
                        <Typography variant="h6">
                          {r.person} · {words(r.kind)}
                        </Typography>
                        <Chip size="small" label={r.result?.status ?? "Scheduled"} />
                        <Typography>
                          Due: {when(r.at)} · {words(r.profile)} · {words(r.completion)}
                        </Typography>
                        {r.result && (
                          <Typography>
                            {r.result.action} · Test time: {when(r.result.testAt)}
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
              {tab === 2 && (
                <>
                  <Alert severity="warning">
                    No workflow has passed owner acceptance yet. Captured messages alone do not
                    establish correctness.
                  </Alert>
                  <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
                    <Picker
                      label="Person"
                      value={person}
                      onChange={setPerson}
                      options={[["", "All people"], ...data.people.map((p) => [p.id, p.name])]}
                    />
                    <Picker
                      label="Event"
                      value={event}
                      onChange={setEvent}
                      options={[["", "All events"], ...data.events.map((e) => [e.id, e.name])]}
                    />
                  </Stack>
                  <Typography>{data.checklist?.scope}</Typography>
                  <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                    {Object.entries(data.checklist?.counts ?? {}).map(([status, count]) => (
                      <Chip key={status} label={`${words(status)}: ${count}`} />
                    ))}
                  </Stack>
                  <Typography variant="body2">
                    Showing {data.checklist?.rows.length} of {data.checklist?.total} expectations.
                    “Observed” proves an attempt exists, not that Meta delivered it or the wording
                    is correct.
                  </Typography>
                  {data.checklist?.rows.map((row) => (
                    <Card key={row.id} variant="outlined">
                      <CardContent>
                        <Typography>
                          {data.people.find((p) => p.id === row.personId)?.name ??
                            "Person not linked"}{" "}
                          · {row.event}
                        </Typography>
                        <Typography>
                          {words(row.kind)} · {when(row.at)} · {words(row.channel)}
                        </Typography>
                        <Chip
                          size="small"
                          label={words(row.status)}
                          color={
                            ["missing", "unexpected", "failed"].includes(row.status)
                              ? "warning"
                              : "default"
                          }
                        />
                        <Typography variant="body2">{row.reason}</Typography>
                        <Button
                          onClick={() => {
                            setPerson(row.personId);
                            setEvent(row.eventId);
                            setTab(0);
                          }}
                        >
                          View messages
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {[
                    "Event invitations, reminders and nudges",
                    "Changes and cancellations",
                    "Event escalation and repair",
                    "Recruitment welcome, details and interest cycle",
                    "Recruit event follow-up",
                    "Onboarding arrival doors and welcome",
                    "Onboarding chase, nudge and exhaustion",
                    "Consent, refusal and correctly withheld messages",
                    "Multiple events and workflows per person",
                  ].map((label) => (
                    <Card variant="outlined" key={label}>
                      <CardContent>
                        <Stack direction="row" sx={{ gap: 2, justifyContent: "space-between" }}>
                          <Typography>{label}</Typography>
                          <Chip size="small" label="Not tested" />
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </>
          )}
        </Stack>
      </Container>
      <Dialog open={!!message} onClose={() => setMessage(null)} fullWidth maxWidth="md">
        <DialogTitle>{message ? words(message.kind) : "Message"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {message && (
              <>
                <Typography>
                  {message.person} · {message.destination ?? "Destination not recorded"}
                </Typography>
                <Alert severity="info">
                  {message.capture
                    ? message.transport === "real"
                      ? "Actual Twilio request. Delivery status comes from Twilio status callbacks."
                      : "Intercepted locally. Any delivery confirmation shown is simulated."
                    : "No captured payload is linked to this attempt. Transport was not recorded by this apparatus."}
                </Alert>
                <Typography>
                  Planned: {when(message.scheduled_for)}
                  <br />
                  Attempted: {when(message.requested_at)}
                  <br />
                  Captured: {when(message.capture?.at)}
                </Typography>
                {message.preview && (
                  <>
                    {message.preview.warnings.map((warning, i) => (
                      <Alert key={i} severity="warning">
                        {warning}
                      </Alert>
                    ))}
                    <Typography variant="h6">
                      {message.preview.sender
                        ? `Text as sent from ${message.preview.sender}`
                        : "Message as sent"}
                    </Typography>
                    <Typography
                      sx={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        bgcolor: "#edf3ed",
                        p: 2,
                        borderRadius: 2,
                      }}
                    >
                      {message.preview.body ?? "No body captured."}
                    </Typography>
                    {message.preview.buttons.map((button, i) => (
                      <Box key={i}>
                        <Typography variant="subtitle2">{button.label}</Typography>
                        <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                          {button.url ?? "Not in submitted template"}
                        </Typography>
                        {button.url && (
                          <Button
                            href={button.url.replace(
                              "https://marvel-indiscernible-daxton.ngrok-free.dev",
                              data.appUrl,
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open local form
                          </Button>
                        )}
                      </Box>
                    ))}
                    <Typography variant="caption">
                      {typeof message.preview.characters === "number"
                        ? `${message.preview.characters} characters. Links open the local app when the tunnel is not running.`
                        : "Captured locally."}
                    </Typography>
                  </>
                )}
                {message.capture?.channel === "email" && (
                  <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {message.capture.payload.text ?? "No plain-text body captured."}
                  </Typography>
                )}
                <Button onClick={() => setMessage(null)}>Close</Button>
              </>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </ThemeProvider>
  );
}
createRoot(document.getElementById("root")).render(<App />);
