// @vitest-environment node
/**
 * The recovery configuration contract — LAN-125.
 *
 * Password recovery is configured in four places that cannot see one another:
 * the application's own constants, `supabase/config.toml` for the local stack,
 * the Cloud Run environment in `deploy.yml`, and the hosted Supabase dashboard,
 * whose only representation in this repository is the instructions Brian
 * follows in `docs/deployment.md`.
 *
 * Every one of the failures this file guards is **silent**. A destination
 * Supabase does not recognise is replaced with the Site URL rather than
 * refused, so the link lands on the sign-in page. A lost email template makes
 * Supabase send its own, whose link the application cannot complete. A hosted
 * hostname that drifts from `APP_BASE_URL` makes recovery work locally and fail
 * for the club, with nothing in any log. None of that shows up in a smoke test.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  MINIMUM_PASSWORD_LENGTH,
  PASSWORD_POLICY_HINT,
  RECOVERY_CALLBACK_PATH,
} from "../src/lib/auth/recovery";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), "utf8");

const config = read("supabase/config.toml");
const template = read("supabase/templates/recovery.html");

/** The template with its HTML comments removed — what Supabase actually renders. */
const templateBody = template.replace(/<!--[\s\S]*?-->/g, "");
const deployWorkflow = read(".github/workflows/deploy.yml");
const deploymentDoc = read("docs/deployment.md");
const localDoc = read("docs/local-development.md");

/** The value of a top-level `key = …` line, ignoring the commented examples. */
function setting(key: string): string {
  const match = new RegExp(`^${key}\\s*=\\s*(.+)$`, "m").exec(config);
  if (!match) throw new Error(`${key} is not set in supabase/config.toml.`);
  return match[1].trim();
}

/** The same, scoped to one TOML table, for keys that appear in several. */
function blockSetting(table: string, key: string): string {
  const lines = config.split("\n");
  const start = lines.findIndex((line) => line.trim() === `[${table}]`);
  if (start === -1) throw new Error(`[${table}] is not present in supabase/config.toml.`);

  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[/.test(line)) break;
    const match = new RegExp(`^${key}\\s*=\\s*(.+)$`).exec(line);
    if (match) return match[1].trim();
  }
  throw new Error(`${key} is not set under [${table}] in supabase/config.toml.`);
}

const allowedRedirects: string[] = JSON.parse(setting("additional_redirect_urls"));

describe("the local allow-list names the exact recovery destination", () => {
  it.each(["http://localhost:3000", "http://127.0.0.1:3000"])(
    "allow-lists %s with the recovery path",
    (origin) => {
      // Both loopback spellings, because a reviewer may open either and the
      // application builds the destination from whichever origin it was reached
      // on. The application constant is the source of the path.
      expect(allowedRedirects).toContain(`${origin}${RECOVERY_CALLBACK_PATH}`);
    },
  );

  it("uses exact URLs rather than a wildcard", () => {
    // A wildcard would allow-list every future route by accident, on the one
    // list whose whole job is to be narrow.
    for (const url of allowedRedirects) expect(url).not.toContain("*");
  });

  it("keeps the bare origins Supabase falls back to", () => {
    expect(allowedRedirects).toContain("http://localhost:3000");
    expect(allowedRedirects).toContain("http://127.0.0.1:3000");
  });

  it("agrees with the site URL's origin", () => {
    const siteUrl = new URL(JSON.parse(setting("site_url")));
    expect(allowedRedirects).toContain(siteUrl.origin);
  });
});

describe("the recovery email template is configured and is the right shape", () => {
  it("is declared, with a path that resolves", () => {
    expect(config).toMatch(/^\[auth\.email\.template\.recovery\]$/m);
    // Read from inside `[auth.email.template.recovery]` rather than by
    // first-match on the whole file. LAN-131 added a second template block
    // (`[auth.email.template.invite]`), and a first-match read would then have
    // silently checked *that* template's path and reported the recovery
    // template configured whatever had happened to it.
    const contentPath = JSON.parse(blockSetting("auth.email.template.recovery", "content_path"));
    expect(fs.existsSync(path.join(repoRoot, contentPath))).toBe(true);
  });

  it("links to this application carrying the token hash", () => {
    // The failure it prevents: Supabase's built-in email links to its own
    // /verify endpoint, which returns the session in a URL fragment a
    // server-rendered page cannot read, and only in the browser that asked.
    expect(templateBody).toContain("{{ .RedirectTo }}");
    expect(templateBody).toContain("{{ .TokenHash }}");
    expect(templateBody).toContain("type=recovery");
  });

  it("does not use the confirmation URL", () => {
    // Asserted against the rendered body rather than the file, because the
    // file's comment explains at length why `{{ .ConfirmationURL }}` is wrong.
    expect(templateBody).not.toContain("{{ .ConfirmationURL }}");
    expect(templateBody).toContain("{{ .TokenHash }}");
  });

  it("contains no address, credential or token value", () => {
    expect(templateBody).not.toMatch(/@(?!media)[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(templateBody).not.toMatch(/password\s*[:=]\s*\S/i);
  });
});

describe("the password rule has one source", () => {
  it("matches the configured minimum, which Supabase is the final word on", () => {
    expect(Number(setting("minimum_password_length"))).toBe(MINIMUM_PASSWORD_LENGTH);
  });

  it("has no composition requirement, and the copy does not invent one", () => {
    expect(JSON.parse(setting("password_requirements"))).toBe("");
    expect(PASSWORD_POLICY_HINT).toContain(String(MINIMUM_PASSWORD_LENGTH));
    expect(PASSWORD_POLICY_HINT).not.toMatch(/uppercase|symbol|digit|number required/i);
  });
});

describe("public registration is still refused, and email login still works", () => {
  it("keeps [auth].enable_signup false", () => {
    // The recovery flow adds a second unauthenticated Auth surface. Neither it
    // nor anything added with it may turn registration back on.
    expect(setting("enable_signup")).toBe("false");
  });

  it("keeps the email provider itself enabled", () => {
    // In this CLI version `[auth.email].enable_signup` also gates the email
    // provider, so setting it false disables password *logins*. The block-scoped
    // read is what distinguishes it from the one above.
    const emailBlock = /^\[auth\.email\]$([\s\S]*?)^\[/m.exec(config)![1];
    expect(emailBlock).toMatch(/^enable_signup = true$/m);
  });
});

describe("the hosted instructions and the deployed environment cannot drift", () => {
  const appBaseUrl = /APP_BASE_URL=(\S+?)(?:,|\s|$)/.exec(deployWorkflow)?.[1];

  it("sets an https application origin on the revision", () => {
    expect(appBaseUrl, "APP_BASE_URL is not set in deploy.yml").toBeDefined();
    expect(new URL(appBaseUrl!).protocol).toBe("https:");
    expect(new URL(appBaseUrl!).pathname).toBe("/");
  });

  it("documents the same host as the hosted Site URL", () => {
    expect(deploymentDoc).toContain(appBaseUrl!);
  });

  it("documents the exact hosted redirect URL the application will ask for", () => {
    // This is the entry Brian pastes into the Supabase dashboard. If it is not
    // exactly what `resetPasswordForEmail` asks for, hosted recovery silently
    // lands on the sign-in page.
    expect(deploymentDoc).toContain(`${appBaseUrl}${RECOVERY_CALLBACK_PATH}`);
  });

  it("distinguishes the local CLI configuration from the hosted dashboard", () => {
    expect(deploymentDoc).toMatch(/dashboard/i);
    expect(deploymentDoc).toMatch(/local only/i);
    expect(localDoc).toMatch(/local only/i);
  });

  it("tells Brian about SMTP and the email template, not just the URLs", () => {
    expect(deploymentDoc).toMatch(/SMTP/);
    expect(deploymentDoc).toMatch(/Email Templates/i);
  });

  it("gives the local walkthrough the captured-mail address and both origins", () => {
    expect(localDoc).toContain("54324");
    expect(localDoc).toContain(`http://localhost:3000${RECOVERY_CALLBACK_PATH}`);
    expect(localDoc).toContain(`http://127.0.0.1:3000${RECOVERY_CALLBACK_PATH}`);
  });

  it("puts no credential in either document", () => {
    for (const document of [deploymentDoc, localDoc]) {
      expect(document).not.toMatch(/sb_secret_|service_role_key\s*=\s*\S|SMTP_PASSWORD\s*=\s*\S/);
    }
  });
});
