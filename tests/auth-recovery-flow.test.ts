// @vitest-environment node
/**
 * Password recovery, against the real local Supabase stack — LAN-125.
 *
 * The parts of this flow that cannot honestly be mocked are here: the email
 * that is actually sent, the link shape the template actually produces, the
 * session Supabase actually issues, and what it does with a link that has
 * already been spent. `src/app/forgot-password/actions.test.ts` and the route
 * handler's own suite cover the branches this cannot reach on demand.
 *
 * Three claims the rest of the implementation is built on are pinned here,
 * because each one is a silent, total failure if it stops being true:
 *
 *   1. The recovery email carries `token_hash` to this application's
 *      `/auth/recovery`. If `supabase/templates/recovery.html` is lost or its
 *      `content_path` stops resolving, Supabase sends its own email instead —
 *      no error, and every link then lands somewhere the application cannot
 *      complete.
 *
 *   2. A recovery session is stamped `amr: otp` and a password sign-in is
 *      stamped `amr: password`. That difference is the *only* thing stopping an
 *      already-signed-in browser from setting a new password without knowing
 *      the current one.
 *
 *   3. Requesting through a client with no PKCE state produces a link any
 *      device can present. A client built by `@supabase/ssr` cannot, and the
 *      symptom would be an invalid-link screen for every operator who opens the
 *      email on their phone.
 *
 * Every identity here is synthetic, created and deleted by this file. It never
 * touches the fixed local review account, whose password lives in protected
 * machine-local state and must keep working after this suite runs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SLOT_DEFINITIONS } from "../scripts/lib/local-supabase-coordinator.mjs";
import { RECOVERY_CALLBACK_PATH } from "../src/lib/auth/recovery";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const configured = Boolean(url && publishableKey && secretKey);

if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but the local Supabase environment is incomplete.");
}

/**
 * The captured-email server's port, for whichever slot this stack is.
 *
 * Taken from the coordinator's own slot table rather than hard-coded, because
 * the overflow slot runs Mailpit on 55324 and a hard-coded 54324 would make
 * this suite pass against another worktree's database.
 */
function mailpitBaseUrl(): string {
  const apiPort = Number(new URL(url!).port);
  const slot = SLOT_DEFINITIONS.find(
    (candidate: { ports: { api: number } }) => candidate.ports.api === apiPort,
  );
  if (!slot) throw new Error(`No coordinator slot serves the Supabase API on port ${apiPort}.`);
  return `http://127.0.0.1:${slot.ports.mailpit}`;
}

/** Synthetic, and unique per run so a rerun cannot collide with its own leftovers. */
function syntheticAddress(): string {
  return `lan125-recovery-${Date.now()}-${Math.floor(Math.random() * 1e6)}@oxfordlancers.local`;
}

const ORIGINAL_PASSWORD = "original-synthetic-passphrase";
const REPLACEMENT_PASSWORD = "replacement-synthetic-passphrase";

/** No cookies, no PKCE state — exactly what `createStatelessClient()` builds. */
function statelessClient(): SupabaseClient {
  return createClient(url!, publishableKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "implicit",
    },
  });
}

/** A PKCE client, mirroring what `@supabase/ssr` forces the callback to use. */
function pkceClient(): SupabaseClient {
  return createClient(url!, publishableKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
}

function adminClient(): SupabaseClient {
  return createClient(url!, secretKey!, { auth: { persistSession: false } });
}

interface CapturedMessage {
  ID: string;
  To: { Address: string }[];
  Subject: string;
}

async function messagesFor(address: string): Promise<CapturedMessage[]> {
  const response = await fetch(`${mailpitBaseUrl()}/api/v1/messages?limit=200`);
  const body = (await response.json()) as { messages: CapturedMessage[] };
  return body.messages.filter((message) =>
    message.To.some((recipient) => recipient.Address.toLowerCase() === address.toLowerCase()),
  );
}

/** Waits for the captured email, rather than sleeping a guessed interval. */
async function awaitRecoveryLink(address: string, timeoutMs = 10_000): Promise<URL> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [message] = await messagesFor(address);
    if (message) {
      const response = await fetch(`${mailpitBaseUrl()}/api/v1/message/${message.ID}`);
      const body = (await response.json()) as { Text?: string; HTML?: string };
      const found = /https?:\/\/[^\s"'<>)]+/.exec(body.Text ?? body.HTML ?? "");
      if (found) return new URL(found[0].replace(/&amp;/g, "&"));
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("No recovery email was captured within the timeout.");
}

const cleanUp: string[] = [];

/** One place, after every suite in this file, so no synthetic identity outlives the run. */
afterAll(async () => {
  if (!configured) return;
  const admin = adminClient();
  for (const id of cleanUp.splice(0)) await admin.auth.admin.deleteUser(id);
});

async function givenAnOperatorAccount(): Promise<string> {
  const email = syntheticAddress();
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: ORIGINAL_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  cleanUp.push(data.user.id);
  return email;
}

async function signInWith(email: string, password: string) {
  return statelessClient().auth.signInWithPassword({ email, password });
}

describe.runIf(configured)("password recovery, end to end", () => {
  let email: string;
  let link: URL;

  beforeAll(async () => {
    email = await givenAnOperatorAccount();
    const { error } = await statelessClient().auth.resetPasswordForEmail(email, {
      redirectTo: `http://127.0.0.1:3000${RECOVERY_CALLBACK_PATH}`,
    });
    expect(error).toBeNull();
    link = await awaitRecoveryLink(email);
  }, 30_000);

  it("emails a link to this application, not to Supabase's verify endpoint", () => {
    // Claim 1. If `supabase/templates/recovery.html` stops being found, Supabase
    // silently sends its own email, whose link returns the session in a URL
    // fragment that a server-rendered page cannot read.
    expect(link.pathname).toBe(RECOVERY_CALLBACK_PATH);
    expect(link.origin).toBe("http://127.0.0.1:3000");
    expect(link.searchParams.get("type")).toBe("recovery");
    expect(link.searchParams.get("token_hash")).toMatch(/^[0-9a-f]{20,128}$/);
  });

  it("carries no PKCE code, because the request left no verifier anywhere", () => {
    // Claim 3. A `?code=` here means the request was made through a
    // cookie-backed client and the link now only works in one browser.
    expect(link.searchParams.get("code")).toBeNull();
  });

  it("opens a recovery session that is distinguishable from a sign-in", async () => {
    // Claim 2, and the load-bearing one. Both halves are asserted: recovery is
    // `otp`, an ordinary sign-in is `password`. If they ever became the same
    // value, `/reset-password` would admit anybody already signed in.
    const recovery = await pkceClient().auth.verifyOtp({
      type: "recovery",
      token_hash: link.searchParams.get("token_hash")!,
    });

    expect(recovery.error).toBeNull();
    expect(amrMethods(recovery.data.session!.access_token)).toContain("otp");

    const signedIn = await signInWith(email, ORIGINAL_PASSWORD);
    expect(amrMethods(signedIn.data.session!.access_token)).toEqual(["password"]);
    expect(amrMethods(signedIn.data.session!.access_token)).not.toContain("otp");
  });

  it("refuses the same link a second time", async () => {
    // The exchange above consumed it. A reusable reset link is a permanent key
    // to the account sitting in a mailbox.
    const reused = await pkceClient().auth.verifyOtp({
      type: "recovery",
      token_hash: link.searchParams.get("token_hash")!,
    });

    expect(reused.error).not.toBeNull();
    expect(reused.data.session).toBeNull();
  });

  it("refuses a malformed and a wrong-type link the same opaque way", async () => {
    // All three failures produce one message, which is what lets
    // `/auth/recovery` redirect to one screen without an error code in the URL.
    const client = pkceClient();
    const garbage = await client.auth.verifyOtp({
      type: "recovery",
      token_hash: "0".repeat(56),
    });
    const wrongType = await client.auth.verifyOtp({
      type: "email",
      token_hash: link.searchParams.get("token_hash")!,
    });

    expect(garbage.error?.message).toBe(wrongType.error?.message);
    expect(garbage.error?.message).not.toMatch(/@|user|account|exists/i);
  });
});

describe.runIf(configured)("completing the recovery replaces the password", () => {
  let email: string;

  beforeAll(async () => {
    email = await givenAnOperatorAccount();
  }, 30_000);

  it("sets the new password, retires the old one, and spends the link", async () => {
    const { error: requestError } = await statelessClient().auth.resetPasswordForEmail(email, {
      redirectTo: `http://127.0.0.1:3000${RECOVERY_CALLBACK_PATH}`,
    });
    expect(requestError).toBeNull();

    const link = await awaitRecoveryLink(email);
    const tokenHash = link.searchParams.get("token_hash")!;

    const recoveryClient = pkceClient();
    const { error: verifyError } = await recoveryClient.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    expect(verifyError).toBeNull();

    const { error: updateError } = await recoveryClient.auth.updateUser({
      password: REPLACEMENT_PASSWORD,
    });
    expect(updateError).toBeNull();
    await recoveryClient.auth.signOut();

    const withNew = await signInWith(email, REPLACEMENT_PASSWORD);
    expect(withNew.error, "the new password does not work").toBeNull();

    const withOld = await signInWith(email, ORIGINAL_PASSWORD);
    expect(withOld.error, "the previous password still works").not.toBeNull();
    expect(withOld.data.session).toBeNull();

    const replayed = await pkceClient().auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    expect(replayed.error, "the used link can be replayed").not.toBeNull();
  }, 30_000);

  it("refuses a password under the configured minimum, whatever the form allowed", async () => {
    const { error: requestError } = await statelessClient().auth.resetPasswordForEmail(email, {
      redirectTo: `http://127.0.0.1:3000${RECOVERY_CALLBACK_PATH}`,
    });
    expect(requestError).toBeNull();

    const link = await awaitRecoveryLink(email);
    const recoveryClient = pkceClient();
    await recoveryClient.auth.verifyOtp({
      type: "recovery",
      token_hash: link.searchParams.get("token_hash")!,
    });

    // Supabase is the last of the three checks, after the browser attribute and
    // the server action. This proves the last one is really there.
    const { error } = await recoveryClient.auth.updateUser({ password: "short" });

    expect(error).not.toBeNull();
    await recoveryClient.auth.signOut();
  }, 30_000);
});

describe.runIf(configured)("an address with no account is not treated differently", () => {
  it("sends nothing, and says so to nobody", async () => {
    const nobody = syntheticAddress();

    const { error } = await statelessClient().auth.resetPasswordForEmail(nobody, {
      redirectTo: `http://127.0.0.1:3000${RECOVERY_CALLBACK_PATH}`,
    });

    // Supabase itself answers without an error — which is the behaviour the
    // uniform confirmation depends on. Reading anything else out of this call
    // would be reading an account oracle.
    expect(error).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await messagesFor(nobody)).toHaveLength(0);
  }, 30_000);
});

/** The `amr` methods on a verified access token, in order. */
function amrMethods(accessToken: string): string[] {
  const payload = JSON.parse(
    Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"),
  ) as { amr?: ({ method?: string } | string)[] };
  return (payload.amr ?? []).map((entry) =>
    typeof entry === "string" ? entry : (entry.method ?? ""),
  );
}
