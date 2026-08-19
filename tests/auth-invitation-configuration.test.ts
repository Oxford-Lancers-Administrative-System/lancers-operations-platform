// @vitest-environment node
/**
 * The invitation configuration contract — LAN-131, `REQ-email-invitation-path`,
 * matrix row 22.
 *
 * The first-access invitation is configured in the same four places password
 * recovery is, and it fails in the same silent ways: a destination Supabase
 * does not recognise is replaced with the Site URL rather than refused, so the
 * link lands on the sign-in page holding a token nothing consumes; a missing
 * template makes Supabase send its own, whose link a server-rendered page
 * cannot complete; and neither produces an error anywhere.
 *
 * The invitation is worse than recovery on one axis, which is why this file
 * exists rather than three more cases in the recovery suite: a broken recovery
 * link inconveniences somebody who already has an account, and a broken
 * invitation link means a new officer never gets in at all — and the club's
 * only workaround would be the manual SQL provisioning this whole mission
 * exists to end.
 *
 * The hosted half is deliberately asserted against the documentation rather
 * than against the dashboard, because the dashboard has no representation in
 * this repository and no agent may touch it. Those cases are what stop the
 * exact values Brian has to paste from drifting away from what the application
 * will actually ask for.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  EMAIL_LINK_CALLBACK_PATHS,
  INVITATION_CALLBACK_PATH,
  INVITATION_LINK_TYPE,
  invitationCallbackUrl,
} from "../src/lib/auth/invitation";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), "utf8");

const config = read("supabase/config.toml");
const template = read("supabase/templates/invite.html");
/** The template with its HTML comments removed — what Supabase actually renders. */
const templateBody = template.replace(/<!--[\s\S]*?-->/g, "");
const deployWorkflow = read(".github/workflows/deploy.yml");
const deploymentDoc = read("docs/deployment.md");
const localDoc = read("docs/local-development.md");

function setting(key: string): string {
  const match = new RegExp(`^${key}\\s*=\\s*(.+)$`, "m").exec(config);
  if (!match) throw new Error(`${key} is not set in supabase/config.toml.`);
  return match[1].trim();
}

/**
 * The same, scoped to one TOML table.
 *
 * Line-based rather than one regular expression, because `content_path` and
 * `subject` now appear under two different template tables and a first-match
 * read would answer about whichever happens to come first in the file.
 */
function blockSetting(table: string, key: string): string {
  const lines = config.split("\n");
  const start = lines.findIndex((line) => line.trim() === `[${table}]`);
  if (start === -1) throw new Error(`[${table}] is not present in supabase/config.toml.`);

  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[/.test(line)) break;
    const match = new RegExp(`^${key}\\s*=\\s*(.+)$`).exec(line);
    if (match) return match[1].trim();
  }
  throw new Error(`${key} is not set under [${table}].`);
}

const allowedRedirects: string[] = JSON.parse(setting("additional_redirect_urls"));

describe("the local allow-list names the exact invitation destination", () => {
  it.each(["http://localhost:3000", "http://127.0.0.1:3000"])(
    "allow-lists %s with the invitation path",
    (origin) => {
      expect(allowedRedirects).toContain(`${origin}${INVITATION_CALLBACK_PATH}`);
    },
  );

  it("keeps the recovery destinations it already had", () => {
    // The invitation is added to the same list. A rewrite that replaced the
    // list rather than extending it would break recovery and pass every
    // assertion above.
    for (const path of EMAIL_LINK_CALLBACK_PATHS) {
      expect(allowedRedirects).toContain(`http://localhost:3000${path}`);
      expect(allowedRedirects).toContain(`http://127.0.0.1:3000${path}`);
    }
  });

  it("uses exact URLs rather than a wildcard", () => {
    for (const url of allowedRedirects) expect(url).not.toContain("*");
  });
});

describe("the invitation email template is configured and is the right shape", () => {
  it("is declared, with a path that resolves", () => {
    expect(config).toMatch(/^\[auth\.email\.template\.invite\]$/m);
    const contentPath = JSON.parse(blockSetting("auth.email.template.invite", "content_path"));
    expect(fs.existsSync(path.join(repoRoot, contentPath))).toBe(true);
  });

  it("has its own subject rather than Supabase's", () => {
    const subject = JSON.parse(blockSetting("auth.email.template.invite", "subject"));
    expect(subject).toMatch(/lancers/i);
    expect(subject).not.toBe("You have been invited");
  });

  it("links to this application carrying the token hash, typed as an invitation", () => {
    expect(templateBody).toContain("{{ .RedirectTo }}");
    expect(templateBody).toContain("{{ .TokenHash }}");
    expect(templateBody).toContain(`type=${INVITATION_LINK_TYPE}`);
  });

  it("does not use the confirmation URL", () => {
    // The built-in link returns the session in a URL fragment, which a
    // server-rendered page cannot read, and only in the browser that asked —
    // and nobody asks for their own invitation.
    expect(templateBody).not.toContain("{{ .ConfirmationURL }}");
  });

  it("does not use the recovery link type", () => {
    // A copy-paste of the recovery template would produce a link this
    // application's invitation callback refuses and whose token GoTrue would
    // not accept as an invitation either.
    expect(templateBody).not.toContain("type=recovery");
  });

  it("contains no address, credential or token value", () => {
    expect(templateBody).not.toMatch(/@(?!media)[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(templateBody).not.toMatch(/password\s*[:=]\s*\S/i);
  });

  it("says nothing about SQL, Supabase or an administrator-created password", () => {
    // `REQ-club-operating-guide` bans those from the club-facing guide, and the
    // same reasoning applies with more force to an email a new officer reads
    // before they have ever seen the application.
    expect(templateBody).not.toMatch(/supabase|sql|dashboard|temporary password/i);
  });
});

describe("public registration is still refused", () => {
  it("keeps [auth].enable_signup false", () => {
    // `REQ-invite-existing-person`: "public sign-up remains disabled". The
    // invitation path is an administrator inviting somebody, which the Auth
    // admin API does regardless of this flag — so there is no reason for this
    // work to have relaxed it, and this is what proves it did not.
    expect(setting("enable_signup")).toBe("false");
  });
});

describe("the link is only ever built on a trusted origin", () => {
  it("prefers the configured application origin", () => {
    expect(
      invitationCallbackUrl({
        appBaseUrl: "https://lancers.example.org",
        requestOrigin: "https://attacker.example.net",
      }),
    ).toBe(`https://lancers.example.org${INVITATION_CALLBACK_PATH}`);
  });

  it("falls back to the request origin only when it is loopback", () => {
    expect(invitationCallbackUrl({ requestOrigin: "http://localhost:3000" })).toBe(
      `http://localhost:3000${INVITATION_CALLBACK_PATH}`,
    );
  });

  it("refuses an unconfigured deployment rather than trusting the Host header", () => {
    // `null` is a refusal the caller must handle. A credential-establishing
    // link aimed by a request header is the worst email this application could
    // send.
    expect(invitationCallbackUrl({ requestOrigin: "https://attacker.example.net" })).toBeNull();
    expect(invitationCallbackUrl({})).toBeNull();
  });
});

describe("the hosted instructions and the deployed environment cannot drift", () => {
  const appBaseUrl = /APP_BASE_URL=(\S+?)(?:,|\s|$)/.exec(deployWorkflow)?.[1];

  it("documents the exact hosted redirect URL the application will ask for", () => {
    // This is the entry Brian pastes into the Supabase dashboard. If it is not
    // exactly what the Auth admin API is given as `redirectTo`, every hosted
    // invitation silently lands on the sign-in page.
    expect(appBaseUrl, "APP_BASE_URL is not set in deploy.yml").toBeDefined();
    expect(deploymentDoc).toContain(`${appBaseUrl}${INVITATION_CALLBACK_PATH}`);
  });

  it("tells Brian the invitation template is a dashboard action too", () => {
    expect(deploymentDoc).toMatch(/invit/i);
    expect(deploymentDoc).toMatch(/Email Templates/i);
  });

  it("gives the local walkthrough the captured-mail address and the invitation path", () => {
    expect(localDoc).toContain("54324");
    expect(localDoc).toContain(`http://localhost:3000${INVITATION_CALLBACK_PATH}`);
  });

  it("puts no credential in either document", () => {
    for (const document of [deploymentDoc, localDoc]) {
      expect(document).not.toMatch(/sb_secret_|service_role_key\s*=\s*\S|RESEND_API_KEY\s*=\s*\S/);
    }
  });
});
