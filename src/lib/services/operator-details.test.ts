// @vitest-environment node
/**
 * Operator onboarding with a phone number or an email — LAN-459, against the
 * real local database, a real Auth server for the logins a seat opens, and an
 * accepting WhatsApp transport that records what would have been sent.
 *
 * Brian's rules (2 October 2026), each proved here:
 *
 *   * email whenever the club has one, even with a phone number; WhatsApp only
 *     when a phone number is all it has, and then exactly one message;
 *   * the phone-only person is seated with no account, sent a link to the
 *     details form, and saving the form opens their account and invites the
 *     email they gave, with no operator step; the link dies on save;
 *   * the signed-in form is due after first sign-in until the required
 *     personal facts are complete;
 *   * the seat page reads each request as requested, not delivered or received.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";
import { capabilityRoleCodes, seededGrantsFor } from "@/lib/auth/capabilities";
import type { ResolvedOperator } from "@/lib/auth/operator";
import type { EnvironmentSource } from "@/lib/delivery/config";
import { TEMPLATE_NAMES } from "@/lib/delivery/templates";
import { closePool, isServiceError, withTransaction } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  grantSeasonMessagingConsentIn,
  withdrawSeasonMessagingConsentIn,
} from "./messaging-consent";
import { setLightsOutClockForTesting } from "./messaging-schedule/lights-out";
import {
  assignRole,
  replaceRoleHolder,
  SEAT_LOGIN_EMAIL_REQUIRED_RULE,
} from "./operator-administration";
import {
  COLLEGE_ADDRESS_MESSAGE,
  completeOperatorDetailsFromLink,
  inviteOperatorWithoutEmail,
  readOperatorDetailsStatuses,
  readOperatorDetailsView,
  saveOperatorDetails,
  sendOperatorDetailsRequest,
} from "./operator-details";
import { operatorDetailsDueIn } from "./operator-details/facts";
import { supabaseOperatorIdentity, type OperatorIdentityPort } from "./operator-identity";
import { activateOperatorAccount } from "./operator-invitations";
import { resolvePersonTokenIn } from "./player-answer-tokens";
import { findCurrentSeasonIn } from "./seasons";
import {
  agePastSafetyPacing,
  clearRecipientSafetyState,
  openObserver,
  seededActorPersonId,
} from "../../../tests/helpers/service-layer";

const MARKER = "LAN459OperatorDetails";
const CALLBACK = "http://localhost:3000/auth/invitation";
/** A coaching seat that takes any number of holders. */
const SEAT = "running_backs_coach";

const CONFIGURED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "5550001",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  WHATSAPP_APP_SECRET: "not-a-real-app-secret",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
  EMAIL_API_KEY: "not-a-real-key",
  EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
};

let observer: Client;
let actorPersonId: string;
let seasonId: string;
const authUsers = new Set<string>();
const invitations: { email: string; redirectTo: string }[] = [];
let sent: { url: string; body: Record<string, unknown> }[] = [];

function transport(url: string, init: RequestInit): Promise<Response> {
  const body = JSON.parse(typeof init.body === "string" ? init.body : "{}");
  sent.push({ url, body });
  const id = `wamid.${MARKER}.${crypto.randomUUID()}`;
  return Promise.resolve(
    new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}
const messaging = { source: CONFIGURED, transport };

/** Real logins (unique against `auth.users`, deleted afterwards); a recorded, undelivered send. */
function identity(): OperatorIdentityPort {
  const real = supabaseOperatorIdentity();
  return {
    async createLogin(email) {
      const created = await real.createLogin(email);
      authUsers.add(created.authUserId);
      return created;
    },
    async sendInvitation(email, redirectTo) {
      invitations.push({ email, redirectTo });
    },
    changeLoginEmail: (authUserId, email) => real.changeLoginEmail(authUserId, email),
    deleteLogin: (authUserId) => real.deleteLogin(authUserId),
  };
}

const administrator = (): ResolvedOperator => ({
  authUserId: "00000000-0000-4000-8000-0000000459aa",
  personId: actorPersonId,
  displayName: "Administrator",
  roleCodes: [...capabilityRoleCodes("role_management")],
  grants: seededGrantsFor([...capabilityRoleCodes("role_management")]),
  isActive: true,
});

let unique = 0;
function address(tag: string): string {
  unique += 1;
  return `lan459-${tag}-${unique}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

// Ofcom's reserved drama range: synthetic, and unroutable by design. One per
// call, so the per-destination sending allowance never holds one test's
// message behind another's.
function phone(): string {
  unique += 1;
  return `+447700900${String(500 + unique).padStart(3, "0")}`;
}

async function person(
  tag: string,
  contacts: { email?: string; phone?: string } = {},
): Promise<string> {
  const inserted = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, tag],
  );
  const id = inserted.rows[0].id;
  if (contacts.email) {
    await observer.query(
      `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source)
       values ($1, 'email', 'personal', $2, true, 'fixture')`,
      [id, contacts.email],
    );
  }
  if (contacts.phone) {
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1, 'phone', $2, true, 'fixture')`,
      [id, contacts.phone],
    );
  }
  return id;
}

function seat(personId: string) {
  return assignRole({
    operator: administrator(),
    personId,
    roleCode: SEAT,
    callbackUrl: CALLBACK,
    identity: identity(),
    messaging,
  });
}

async function accountOf(personId: string) {
  const result = await observer.query<{ id: string; login_email: string; auth_user_id: string }>(
    "select id, login_email, auth_user_id from public.operator_accounts where person_id = $1",
    [personId],
  );
  return result.rows[0] ?? null;
}

async function detailsJobs(personId: string) {
  const result = await observer.query<{ id: string; status: string; last_error: string | null }>(
    `select id, status::text as status, last_error from public.notification_jobs
      where person_id = $1 and idempotency_key like 'operator-details:%'
      order by created_at`,
    [personId],
  );
  return result.rows;
}

/** The token the last WhatsApp message's form button carried. */
function lastSentToken(): string {
  const body = sent.at(-1)!.body as {
    template: { components: { type: string; parameters: { text: string }[] }[] };
  };
  const button = body.template.components.find((component) => component.type === "button")!;
  return button.parameters[0].text;
}

const COMPLETE = {
  givenName: MARKER,
  middleName: "",
  familyName: "Coach",
  knownAs: "",
  mobile: "+447700900461",
  personalEmail: "",
  dateOfBirth: "",
};

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
  const season = await withTransaction((tx) => findCurrentSeasonIn(tx));
  if (!season) throw new Error("The seeded database has no current season.");
  seasonId = season.id;
});

afterEach(async () => {
  sent = [];
  invitations.length = 0;
  setLightsOutClockForTesting(null);
  await agePastSafetyPacing(observer);
  await clearRecipientSafetyState(observer);
});

afterAll(async () => {
  const people = "(select id from public.people where given_name = $1)";
  const jobs = `(select id from public.notification_jobs where person_id in ${people})`;
  await observer.query(`delete from public.delivery_results where notification_job_id in ${jobs}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in ${jobs}`,
    [MARKER],
  );
  await observer.query(`delete from public.notification_jobs where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.audit_events
      where actor_person_id in ${people} or entity_id in ${people}
         or context -> 'administration' ->> 'targetPersonId' in (select id::text from public.people where given_name = $1)
         or entity_id in (select id from public.contact_points where person_id in ${people})`,
    [MARKER],
  );
  await observer.query(`delete from public.person_access_tokens where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.season_messaging_consents where person_id in ${people}`,
    [MARKER],
  );
  await observer.query(`delete from public.role_assignments where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.operator_accounts where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.person_aliases where person_id in ${people}`, [MARKER]);
  await observer.query(`delete from public.contact_points where person_id in ${people}`, [MARKER]);
  await observer.query(`delete from public.people where given_name = $1`, [MARKER]);
  const admin = createAdminClient();
  for (const id of authUsers) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  await observer.end();
  await closePool();
});

/** Midday in London — outside lights-out, whatever the machine's clock says. */
function daytime(): void {
  setLightsOutClockForTesting(() => new Date("2026-10-05T11:00:00Z"));
}

describe("seating: email whenever the club has one, WhatsApp only with a phone alone", () => {
  it("phone only: seated with no account, and sent one WhatsApp message with an operator_details link", async () => {
    daytime();
    const personId = await person("phone-only", { phone: phone() });

    const result = await seat(personId);

    expect(result.roleCode).toBe(SEAT);
    expect(result.invitation).toBeNull();
    expect(result.detailsRequest).toMatchObject({ outcome: "sent" });
    expect(await accountOf(personId)).toBeNull();
    expect(invitations).toHaveLength(0);

    expect(sent).toHaveLength(1);
    const template = (sent[0].body as { template: { name: string } }).template;
    expect(template.name).toBe(TEMPLATE_NAMES.onboarding_chase);

    // The token round-trips as its own purpose, and as nothing else.
    const token = lastSentToken();
    await withTransaction(async (tx) => {
      const own = await resolvePersonTokenIn(tx, token, "operator_details");
      expect(own).toMatchObject({ state: "valid", resolved: { personId, seasonId } });
      expect((await resolvePersonTokenIn(tx, token, "onboarding_details")).state).toBe("unknown");
      expect((await resolvePersonTokenIn(tx, token, null)).state).toBe("unknown");
    });

    const statuses = await readOperatorDetailsStatuses(administrator(), [personId]);
    expect(statuses.get(personId)).toEqual({ state: "requested", email: null });
  });

  it("email only: the account is created and the invitation emailed, as before; no WhatsApp", async () => {
    daytime();
    const email = address("email-only");
    const personId = await person("email-only", { email });

    const result = await seat(personId);

    expect(result.invitation).toMatchObject({ loginEmail: email, delivered: true });
    expect(result.detailsRequest).toBeNull();
    expect((await accountOf(personId))?.login_email).toBe(email);
    expect(invitations.map((sent) => sent.email)).toEqual([email]);
    expect(sent).toHaveLength(0);
    expect(await detailsJobs(personId)).toHaveLength(0);
  });

  it("both: email wins, and WhatsApp is not used", async () => {
    daytime();
    const email = address("both");
    const personId = await person("both", { email, phone: phone() });

    const result = await seat(personId);

    expect(result.invitation).toMatchObject({ loginEmail: email });
    expect(result.detailsRequest).toBeNull();
    expect(sent).toHaveLength(0);
    expect(await detailsJobs(personId)).toHaveLength(0);
  });

  it("neither: refused, naming the field, and nothing is seated", async () => {
    const personId = await person("neither");
    try {
      await seat(personId);
      throw new Error("seated a person with no email and no phone");
    } catch (error) {
      expect(isServiceError(error) && error.rule).toBe(SEAT_LOGIN_EMAIL_REQUIRED_RULE);
    }
    const seats = await observer.query(
      "select 1 from public.role_assignments where person_id = $1",
      [personId],
    );
    expect(seats.rows).toHaveLength(0);
  });

  it("replacing a holder with a phone-only successor sends the successor the request", async () => {
    daytime();
    const outgoing = await person("outgoing", { email: address("outgoing") });
    const seated = await seat(outgoing);
    const successor = await person("successor", { phone: phone() });
    // A handover cannot end an assignment on the day it began.
    const tomorrow = await observer.query<{ day: string }>(
      "select ((now() at time zone 'Europe/London')::date + 1)::text as day",
    );

    const result = await replaceRoleHolder({
      operator: administrator(),
      roleAssignmentId: seated.roleAssignmentId,
      successorPersonId: successor,
      effectiveFrom: tomorrow.rows[0].day,
      reason: "Handover under test",
      callbackUrl: CALLBACK,
      identity: identity(),
      messaging,
    });

    expect(result.invitation).toBeNull();
    expect(result.detailsRequest).toMatchObject({ outcome: "sent" });
    expect(await accountOf(successor)).toBeNull();
  });

  it("overnight the request waits for 07:00, and the seat still stands", async () => {
    setLightsOutClockForTesting(() => new Date("2026-10-05T23:30:00Z"));
    const personId = await person("overnight", { phone: phone() });

    const result = await seat(personId);

    expect(result.detailsRequest).toMatchObject({ outcome: "waiting" });
    expect(sent).toHaveLength(0);
    expect((await detailsJobs(personId))[0].status).toBe("pending");
  });

  it("a person who withdrew messaging this season is not sent it, and the seat page says not delivered", async () => {
    daytime();
    const personId = await person("withdrawn", { phone: phone() });
    await withTransaction((tx) => withdrawSeasonMessagingConsentIn(tx, personId, seasonId));

    const result = await seat(personId);

    expect(result.detailsRequest).toMatchObject({ outcome: "not_sent" });
    expect(result.detailsRequest?.reason).toMatch(/refused or withdrawn/);
    expect(sent).toHaveLength(0);
    const statuses = await readOperatorDetailsStatuses(administrator(), [personId]);
    expect(statuses.get(personId)?.state).toBe("not_delivered");
  });

  it("a coach with no consent record at all is sent it — consent is a recruit concept", async () => {
    daytime();
    const personId = await person("no-consent-row", { phone: phone() });
    const result = await seat(personId);
    expect(result.detailsRequest?.outcome).toBe("sent");
  });

  it("Send details request sends it again with a fresh link; refused once the club has an email", async () => {
    daytime();
    const personId = await person("again", { phone: phone() });
    await seat(personId);
    const first = lastSentToken();
    // One message per person per five minutes (LAN-394): "and then time passed".
    await agePastSafetyPacing(observer);

    const again = await sendOperatorDetailsRequest({
      operator: administrator(),
      personId,
      messaging,
    });
    expect(again.outcome).toBe("sent");
    expect(lastSentToken()).not.toBe(first);
    expect(await detailsJobs(personId)).toHaveLength(2);

    await observer.query(
      `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source)
       values ($1, 'email', 'personal', $2, true, 'fixture')`,
      [personId, address("later")],
    );
    await expect(
      sendOperatorDetailsRequest({ operator: administrator(), personId, messaging }),
    ).rejects.toMatchObject({ rule: "operator_details_request_not_needed" });
  });
});

describe("the link: save the form, and the account and invitation follow", () => {
  it("saves the details, kills the link, opens the account and invites the email supplied", async () => {
    daytime();
    const mobile = phone();
    const personId = await person("link-save", { phone: mobile });
    await seat(personId);
    const token = lastSentToken();
    const email = address("supplied");

    const view = await readOperatorDetailsView(personId);
    expect(view.fields).toEqual([
      "givenName",
      "middleName",
      "familyName",
      "knownAs",
      "mobile",
      "personalEmail",
      "dateOfBirth",
    ]);
    expect(view.values).toMatchObject({ givenName: MARKER, familyName: "link-save", mobile });

    const saved = await completeOperatorDetailsFromLink({
      token,
      values: {
        ...COMPLETE,
        familyName: "Saved",
        knownAs: "Sav",
        mobile,
        personalEmail: email,
        dateOfBirth: "1980-04-02",
      },
      callbackUrl: CALLBACK,
      identity: identity(),
    });

    expect(saved).toEqual({ kind: "saved", invitationEmail: email });
    const account = await accountOf(personId);
    expect(account?.login_email).toBe(email);
    expect(invitations.map((sent) => sent.email)).toEqual([email]);

    const facts = await observer.query<{ family_name: string; dob: string }>(
      "select family_name, date_of_birth::text as dob from public.people where id = $1",
      [personId],
    );
    expect(facts.rows[0]).toEqual({ family_name: "Saved", dob: "1980-04-02" });
    const emails = await observer.query<{ scope: string; raw_value: string }>(
      `select scope::text as scope, raw_value from public.contact_points
        where person_id = $1 and kind = 'email' and valid_until is null`,
      [personId],
    );
    expect(emails.rows).toEqual([{ scope: "personal", raw_value: email }]);

    // The link dies on save.
    const again = await completeOperatorDetailsFromLink({
      token,
      values: { ...COMPLETE, personalEmail: address("second") },
      callbackUrl: CALLBACK,
      identity: identity(),
    });
    expect(again).toEqual({ kind: "unknown" });

    // The invited event is the person's own act, on the seat page as received.
    const event = await observer.query<{ actor_person_id: string }>(
      `select actor_person_id from public.audit_events
        where action = 'administration.operator.invited'
          and context -> 'administration' ->> 'targetPersonId' = $1`,
      [personId],
    );
    expect(event.rows.map((row) => row.actor_person_id)).toEqual([personId]);
    const statuses = await readOperatorDetailsStatuses(administrator(), [personId]);
    expect(statuses.get(personId)).toEqual({ state: "received", email });

    // They sign in with their details complete: the form is not due.
    await activateOperatorAccount(account!.auth_user_id);
    expect(await withTransaction((tx) => operatorDetailsDueIn(tx, personId))).toBe(false);
  });

  it("refuses a missing required field and a college address, and saves nothing", async () => {
    daytime();
    const personId = await person("link-refused", { phone: phone() });
    await seat(personId);
    const token = lastSentToken();

    const refused = await completeOperatorDetailsFromLink({
      token,
      values: { ...COMPLETE, familyName: "", personalEmail: "a.coach@chch.ox.ac.uk" },
      callbackUrl: CALLBACK,
      identity: identity(),
    });

    expect(refused).toEqual({
      kind: "invalid",
      errors: { familyName: "Last name is required.", personalEmail: COLLEGE_ADDRESS_MESSAGE },
    });
    expect(await accountOf(personId)).toBeNull();
    await withTransaction(async (tx) => {
      expect((await resolvePersonTokenIn(tx, token, "operator_details")).state).toBe("valid");
    });
  });
});

describe("signed in: the form after first sign-in, until complete", () => {
  it("is due after activation for an operator missing a personal fact, and not once saved", async () => {
    daytime();
    const email = address("signed-in");
    const personId = await person("signed-in", { email });
    await seat(personId);
    const account = await accountOf(personId);
    expect(await withTransaction((tx) => operatorDetailsDueIn(tx, personId))).toBe(false);

    const activated = await activateOperatorAccount(account!.auth_user_id);
    expect(activated?.activated).toBe(true);
    // No mobile on record: due, and with no way past it but saving.
    expect(await withTransaction((tx) => operatorDetailsDueIn(tx, personId))).toBe(true);

    const refused = await saveOperatorDetails({
      personId,
      actorPersonId: personId,
      values: { ...COMPLETE, familyName: "Signed", mobile: "", personalEmail: email },
    });
    expect(refused).toEqual({ ok: false, errors: { mobile: "Mobile phone is required." } });

    const saved = await saveOperatorDetails({
      personId,
      actorPersonId: personId,
      values: { ...COMPLETE, familyName: "Signed", mobile: phone(), personalEmail: email },
    });
    expect(saved).toEqual({ ok: true, email });
    expect(await withTransaction((tx) => operatorDetailsDueIn(tx, personId))).toBe(false);
    // Activation happens once; a second sign-in records nothing new.
    expect((await activateOperatorAccount(account!.auth_user_id))?.activated).toBe(false);
  });

  it("is not due for an operator whose personal facts are already complete", async () => {
    const email = address("complete");
    const personId = await person("complete", { email, phone: phone() });
    await seat(personId);
    await activateOperatorAccount((await accountOf(personId))!.auth_user_id);
    expect(await withTransaction((tx) => operatorDetailsDueIn(tx, personId))).toBe(false);
  });

  it("asks a player who is also a coach only for the personal facts still missing", async () => {
    const personId = await person("player-coach", { phone: phone() });
    await observer.query(
      `insert into public.season_memberships (person_id, season_id, status, entry)
       values ($1, $2, 'onboarding', 'returning')`,
      [personId, seasonId],
    );
    try {
      const view = await readOperatorDetailsView(personId);
      expect(view.fields).toEqual(["personalEmail"]);
    } finally {
      await observer.query("delete from public.season_memberships where person_id = $1", [
        personId,
      ]);
    }
  });
});

describe("Invite operator with a phone number or an email", () => {
  it("a new person with a phone only is created, seated and sent the request", async () => {
    daytime();
    const result = await inviteOperatorWithoutEmail({
      operator: administrator(),
      subject: { kind: "new", givenName: MARKER, familyName: "Invited", phone: phone() },
      roles: [{ roleCode: SEAT }],
      callbackUrl: CALLBACK,
      identity: identity(),
      messaging,
    });

    expect(result.kind).toBe("details_request");
    if (result.kind !== "details_request") return;
    expect(result.personCreated).toBe(true);
    expect(result.detailsRequest.outcome).toBe("sent");
    expect(await accountOf(result.personId)).toBeNull();
  });

  it("an existing person the club holds an email for is invited by email", async () => {
    daytime();
    const email = address("existing");
    const personId = await person("existing", { email, phone: phone() });

    const result = await inviteOperatorWithoutEmail({
      operator: administrator(),
      subject: { kind: "existing", personId },
      roles: [{ roleCode: SEAT }],
      callbackUrl: CALLBACK,
      identity: identity(),
      messaging,
    });

    expect(result.kind).toBe("email");
    expect(invitations.map((sent) => sent.email)).toEqual([email]);
    expect(sent).toHaveLength(0);
  });

  it("refuses a new person with neither", async () => {
    await expect(
      inviteOperatorWithoutEmail({
        operator: administrator(),
        subject: { kind: "new", givenName: MARKER, familyName: "Nothing", phone: null },
        roles: [{ roleCode: SEAT }],
        callbackUrl: CALLBACK,
      }),
    ).rejects.toMatchObject({ rule: "operator_invitation_email_or_mobile_required" });
  });
});

// Keeps the consent import honest: a granted row changes nothing about the rule.
it("a granted consent row does not stop the request", async () => {
  daytime();
  const personId = await person("granted", { phone: phone() });
  await withTransaction((tx) => grantSeasonMessagingConsentIn(tx, personId, seasonId));
  expect((await seat(personId)).detailsRequest?.outcome).toBe("sent");
});
