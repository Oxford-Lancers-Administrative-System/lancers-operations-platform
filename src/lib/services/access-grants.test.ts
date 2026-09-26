// @vitest-environment node
/**
 * The seat access service and the roster group colours — LAN-429 (LAN-423),
 * against the local database. Every write this suite makes is undone after
 * each case: the seat lines go back to the seed, the colours to the packet's,
 * the suite's templates are deleted and its audit rows removed, so the
 * printed-access test (`tests/printed-access.test.ts`) reads the seed whatever
 * ran before it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { seededGrantsFor } from "@/lib/auth/capabilities";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { closePool, isServiceError, type ServiceError } from "@/lib/db";
import {
  copyAccessFrom,
  FIXED_SEAT_RULE,
  grantEverything,
  planCopyAccessFrom,
  planGrantEverything,
  readSeatAccess,
  setAccessGrant,
} from "./access-grants";
import { readHolderHistory } from "./administration-audit";
import {
  createEventTemplate,
  deleteEventTemplate,
  type EventTemplateInput,
} from "./event-templates";
import {
  readRosterGroupColours,
  ROSTER_GROUP_COLOURS_CHANGED,
  setRosterGroupColours,
} from "./roster-group-colours";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const NAME_MARKER = "LAN429AccessSuite";

const SEEDED_COLOURS: Record<string, string> = {
  person: "blue",
  membership: "blue",
  onboarding: "lancer_gold",
  kit: "lancer_gold",
  availability: "slate",
  coaching: "indigo",
  offensive: "teal",
  defensive: "purple",
  special_teams: "brown",
  warmup: "cyan",
};

let observer: Client;
let actorPersonId: string;
const roleIds: Record<string, string> = {};

function operator(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: actorPersonId,
    displayName: "Rowan Ashdown",
    roleCodes,
    grants: seededGrantsFor(roleCodes),
    isActive: true,
  };
}

const administrator = () => operator(["president"]);

async function refusalFrom(call: () => Promise<unknown>): Promise<ServiceError> {
  try {
    await call();
  } catch (error) {
    if (isServiceError(error)) return error;
    throw error;
  }
  throw new Error("Expected a refusal, and the call succeeded.");
}

async function levelOf(code: string, kind: string, key: string | null, templateId: string | null) {
  const result = await observer.query<{ level: string }>(
    `select g.level from public.role_access_grants g
       join public.roles r on r.id = g.role_id
      where r.code = $1 and g.subject_kind = $2
        and g.subject_key is not distinct from $3
        and g.template_id is not distinct from $4::uuid`,
    [code, kind, key, templateId],
  );
  return result.rows[0]?.level;
}

async function accessAuditRows(roleId: string) {
  const result = await observer.query<{
    action: string;
    from_state: string | null;
    to_state: string | null;
    context: { administration: { roleId: string; detail: Record<string, unknown> } };
  }>(
    `select action, from_state, to_state, context from public.audit_events
      where action like 'administration.access.%'
        and context -> 'administration' ->> 'roleId' = $1
      order by occurred_at, id`,
    [roleId],
  );
  return result.rows;
}

function templateInput(name: string): EventTemplateInput {
  return {
    name,
    colourKey: "lancer_gold",
    defaultVenue: null,
    defaultDeliveryMode: null,
    defaultDurationMinutes: null,
    defaultDescription: null,
    defaultRequiredEquipment: null,
    defaultIsMandatory: null,
    audienceGroups: [],
  };
}

beforeAll(async () => {
  observer = await openObserver();
  const person = await observer.query<{ id: string }>(
    `select id from public.people
      where created_at = $1::timestamptz and merged_into_person_id is null
      order by id limit 1`,
    [await seededIdentityCreatedAt(observer)],
  );
  actorPersonId = person.rows[0].id;
  const roles = await observer.query<{ id: string; code: string }>(
    "select id, code from public.roles",
  );
  for (const role of roles.rows) roleIds[role.code] = role.id;
});

afterEach(async () => {
  // Back to the seed: the five full seats at the maximum, everyone else none.
  await observer.query(
    `update public.role_access_grants g
        set level = case
              when r.code in ('president', 'general_manager', 'it_officer', 'vice_president', 'secretary')
                then case g.subject_kind
                       when 'event_template' then 'manage'
                       when 'switch' then 'yes'
                       else case when g.subject_key in ('recruit_events', 'attendance') then 'view' else 'edit' end
                     end
              else 'none'
            end
       from public.roles r
      where r.id = g.role_id`,
  );
  await observer.query(
    "delete from public.audit_events where action like 'administration.access.%'",
  );
  await observer.query("delete from public.audit_events where action = $1", [
    ROSTER_GROUP_COLOURS_CHANGED,
  ]);
  for (const [group, colour] of Object.entries(SEEDED_COLOURS)) {
    await observer.query(
      "update public.roster_group_colours set colour_key = $2 where group_key = $1",
      [group, colour],
    );
  }
  await observer.query(
    `delete from public.audit_events where entity_table = 'event_templates'
        and context ->> 'name' like $1`,
    [`${NAME_MARKER}%`],
  );
  await observer.query("delete from public.event_templates where name like $1", [
    `${NAME_MARKER}%`,
  ]);
});

afterAll(async () => {
  await observer?.end();
  await closePool();
});

describe("setAccessGrant — one line, one audit row, one History entry", () => {
  it("changes a line and records it where the seat's History reads it", async () => {
    const treasurer = roleIds.treasurer;

    const result = await setAccessGrant(administrator(), {
      roleId: treasurer,
      subject: { kind: "roster", key: "kit" },
      level: "edit",
    });

    expect(result.changes).toEqual([
      { subject: { kind: "roster", key: "kit" }, from: "none", to: "edit" },
    ]);
    expect(result.grants.roster.kit).toBe("edit");
    expect(await levelOf("treasurer", "roster_category", "kit", null)).toBe("edit");

    const rows = await accessAuditRows(treasurer);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "administration.access.changed",
      from_state: "none",
      to_state: "edit",
    });
    expect(rows[0].context.administration.detail).toMatchObject({
      subjectKind: "roster_category",
      subjectKey: "kit",
    });

    const history = await readHolderHistory(administrator(), treasurer);
    expect(history.map((entry) => entry.label)).toContain("Access changed");
    const entry = history.find((item) => item.action === "administration.access.changed");
    expect(entry?.role).toEqual({ id: treasurer, code: "treasurer", assignmentId: null });
    expect(entry?.target.personId).toBeNull();
  });

  it("records nothing when the line is already at that level", async () => {
    const result = await setAccessGrant(administrator(), {
      roleId: roleIds.treasurer,
      subject: { kind: "roster", key: "kit" },
      level: "none",
    });
    expect(result.changes).toEqual([]);
    expect(await accessAuditRows(roleIds.treasurer)).toHaveLength(0);
  });

  it("sets a template line and a switch", async () => {
    const templates = await observer.query<{ id: string }>(
      "select id from public.event_templates where name = 'Social'",
    );
    const social = templates.rows[0].id;

    await setAccessGrant(administrator(), {
      roleId: roleIds.social_secretary,
      subject: { kind: "template", templateId: social },
      level: "manage",
    });
    await setAccessGrant(administrator(), {
      roleId: roleIds.social_secretary,
      subject: { kind: "switch", key: "add_recruits" },
      level: "yes",
    });

    expect(await levelOf("social_secretary", "event_template", null, social)).toBe("manage");
    expect(await levelOf("social_secretary", "switch", "add_recruits", null)).toBe("yes");
    expect(await accessAuditRows(roleIds.social_secretary)).toHaveLength(2);
  });

  it("lowers a removable seat — the Vice-President starts full and is not fixed", async () => {
    await setAccessGrant(administrator(), {
      roleId: roleIds.vice_president,
      subject: { kind: "roster", key: "contact_emergency" },
      level: "view",
    });
    expect(await levelOf("vice_president", "roster_category", "contact_emergency", null)).toBe(
      "view",
    );
  });

  it("refuses a level the line does not admit", async () => {
    const refusal = await refusalFrom(() =>
      setAccessGrant(administrator(), {
        roleId: roleIds.treasurer,
        subject: { kind: "recruiting", key: "recruit_events" },
        level: "edit",
      }),
    );
    expect(refusal.kind).toBe("constraint_violated");
    expect(await levelOf("treasurer", "recruiting_category", "recruit_events", null)).toBe("none");
  });

  it("sets Attendance to View and refuses Edit on it (round 6, M5)", async () => {
    await setAccessGrant(administrator(), {
      roleId: roleIds.treasurer,
      subject: { kind: "roster", key: "attendance" },
      level: "view",
    });
    expect(await levelOf("treasurer", "roster_category", "attendance", null)).toBe("view");
    const refusal = await refusalFrom(() =>
      setAccessGrant(administrator(), {
        roleId: roleIds.treasurer,
        subject: { kind: "roster", key: "attendance" },
        level: "edit",
      }),
    );
    expect(refusal.kind).toBe("constraint_violated");
    expect(await levelOf("treasurer", "roster_category", "attendance", null)).toBe("view");
  });

  it("refuses an operator without role_management", async () => {
    const refusal = await refusalFrom(() =>
      setAccessGrant(operator(["secretary"]), {
        roleId: roleIds.treasurer,
        subject: { kind: "roster", key: "kit" },
        level: "edit",
      }),
    );
    expect(refusal.kind).toBe("not_permitted");
    expect(await levelOf("treasurer", "roster_category", "kit", null)).toBe("none");
  });
});

describe("the floor — a fixed seat's lines cannot be changed", () => {
  it.each(["president", "general_manager", "it_officer"])(
    "refuses lowering a line of the %s, and changes nothing",
    async (code) => {
      const refusal = await refusalFrom(() =>
        setAccessGrant(administrator(), {
          roleId: roleIds[code],
          subject: { kind: "roster", key: "contact_emergency" },
          level: "none",
        }),
      );
      expect(refusal.kind).toBe("not_permitted");
      expect(refusal.rule).toBe(FIXED_SEAT_RULE);
      expect(await levelOf(code, "roster_category", "contact_emergency", null)).toBe("edit");
      expect(await accessAuditRows(roleIds[code])).toHaveLength(0);
    },
  );

  it("refuses copying onto a fixed seat and granting everything to one", async () => {
    expect(
      (
        await refusalFrom(() =>
          copyAccessFrom(administrator(), {
            roleId: roleIds.president,
            sourceRoleId: roleIds.treasurer,
          }),
        )
      ).rule,
    ).toBe(FIXED_SEAT_RULE);
    expect(
      (await refusalFrom(() => grantEverything(administrator(), { roleId: roleIds.it_officer })))
        .rule,
    ).toBe(FIXED_SEAT_RULE);
    expect(await levelOf("president", "roster_category", "person", null)).toBe("edit");
  });

  it("marks the fixed seats on the seat page's read", async () => {
    expect((await readSeatAccess(administrator(), roleIds.general_manager)).seat.isFixed).toBe(
      true,
    );
    expect((await readSeatAccess(administrator(), roleIds.vice_president)).seat.isFixed).toBe(
      false,
    );
  });
});

describe("copyAccessFrom and grantEverything — one audited action each", () => {
  it("copies every line of the source seat, planned first, as one audit row", async () => {
    const planned = await planCopyAccessFrom(administrator(), {
      roleId: roleIds.treasurer,
      sourceRoleId: roleIds.vice_president,
    });
    // Every line of the Treasurer moves: 12 + 3 + templates + 2.
    const templateCount = Number(
      (await observer.query<{ n: string }>("select count(*) as n from public.event_templates"))
        .rows[0].n,
    );
    expect(planned).toHaveLength(12 + 3 + templateCount + 2);

    const result = await copyAccessFrom(administrator(), {
      roleId: roleIds.treasurer,
      sourceRoleId: roleIds.vice_president,
    });
    expect(result.changes).toEqual(planned);
    expect(result.grants.roster.contact_emergency).toBe("edit");
    expect(result.grants.roster.attendance).toBe("view");

    const rows = await accessAuditRows(roleIds.treasurer);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("administration.access.copied");
    expect(rows[0].context.administration.detail).toMatchObject({
      sourceRoleId: roleIds.vice_president,
      sourceRoleCode: "vice_president",
    });
    expect(rows[0].context.administration.detail.changes).toHaveLength(planned.length);
  });

  it("copies a fixed seat's values without its fixed status", async () => {
    await copyAccessFrom(administrator(), {
      roleId: roleIds.kit_manager,
      sourceRoleId: roleIds.president,
    });
    // Still removable afterwards.
    await setAccessGrant(administrator(), {
      roleId: roleIds.kit_manager,
      subject: { kind: "roster", key: "person" },
      level: "view",
    });
    expect(await levelOf("kit_manager", "roster_category", "person", null)).toBe("view");
  });

  it("grants everything as one audit row, and records nothing a second time", async () => {
    const planned = await planGrantEverything(administrator(), { roleId: roleIds.media_secretary });
    const result = await grantEverything(administrator(), { roleId: roleIds.media_secretary });
    expect(result.changes).toEqual(planned);
    expect(result.grants.recruiting.recruit_events).toBe("view");
    expect(result.grants.roster.attendance).toBe("view");
    expect(result.grants.switches.add_to_roster).toBe("yes");

    const again = await grantEverything(administrator(), { roleId: roleIds.media_secretary });
    expect(again.changes).toEqual([]);

    const rows = await accessAuditRows(roleIds.media_secretary);
    expect(rows.map((row) => row.action)).toEqual(["administration.access.granted_all"]);
  });
});

describe("templates — a new template's lines, and a deleted one's", () => {
  it("seeds twenty lines: manage for the fixed seats, none for every other", async () => {
    const created = await createEventTemplate(
      actorPersonId,
      templateInput(`${NAME_MARKER} Film review`),
      [],
    );

    const lines = await observer.query<{ code: string; level: string }>(
      `select r.code, g.level from public.role_access_grants g
         join public.roles r on r.id = g.role_id
        where g.template_id = $1::uuid order by r.code`,
      [created.id],
    );
    expect(lines.rows).toHaveLength(20);
    const managers = lines.rows.filter((row) => row.level === "manage").map((row) => row.code);
    expect(managers.sort()).toEqual(["general_manager", "it_officer", "president"]);
    expect(
      lines.rows.filter((row) => row.level !== "manage").every((row) => row.level === "none"),
    ).toBe(true);
    // Vice-President and Secretary included.
    expect(lines.rows.find((row) => row.code === "vice_president")?.level).toBe("none");
    expect(lines.rows.find((row) => row.code === "secretary")?.level).toBe("none");
  });

  it("removes a template's lines with it, and audits the loss", async () => {
    const created = await createEventTemplate(
      actorPersonId,
      templateInput(`${NAME_MARKER} Spare`),
      [],
    );
    await setAccessGrant(administrator(), {
      roleId: roleIds.social_secretary,
      subject: { kind: "template", templateId: created.id },
      level: "view",
    });

    await deleteEventTemplate(actorPersonId, created.id);

    const lines = await observer.query(
      "select 1 from public.role_access_grants where template_id = $1::uuid",
      [created.id],
    );
    expect(lines.rows).toHaveLength(0);

    const audit = await observer.query<{ context: { accessLinesRemoved: unknown[] } }>(
      `select context from public.audit_events
        where action = 'event_template.deleted' and entity_id = $1::uuid`,
      [created.id],
    );
    expect(audit.rows[0].context.accessLinesRemoved).toEqual([
      { roleCode: "general_manager", level: "manage" },
      { roleCode: "it_officer", level: "manage" },
      { roleCode: "president", level: "manage" },
      { roleCode: "social_secretary", level: "view" },
    ]);
  });
});

describe("setRosterGroupColours — one audit row, a line per changed group", () => {
  it("reads the packet's starting colours", async () => {
    expect(await readRosterGroupColours()).toEqual(SEEDED_COLOURS);
  });

  it("changes the named groups only, and records one row listing them", async () => {
    const result = await setRosterGroupColours(administrator(), {
      kit: "orange",
      person: "blue",
      warmup: "lime",
    });
    expect(result.changes).toEqual([
      { group: "warmup", from: "cyan", to: "lime" },
      { group: "kit", from: "lancer_gold", to: "orange" },
    ]);
    expect((await readRosterGroupColours()).kit).toBe("orange");

    const rows = await observer.query<{ context: { changes: unknown[] } }>(
      "select context from public.audit_events where action = $1",
      [ROSTER_GROUP_COLOURS_CHANGED],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].context.changes).toHaveLength(2);
  });

  it("refuses an unknown colour or group, and a seat without role_management", async () => {
    expect(
      (await refusalFrom(() => setRosterGroupColours(administrator(), { kit: "#ff0000" }))).kind,
    ).toBe("constraint_violated");
    expect(
      (await refusalFrom(() => setRosterGroupColours(administrator(), { recruits: "blue" }))).kind,
    ).toBe("constraint_violated");
    expect(
      (await refusalFrom(() => setRosterGroupColours(operator(["secretary"]), { kit: "red" })))
        .kind,
    ).toBe("not_permitted");
    expect(await readRosterGroupColours()).toEqual(SEEDED_COLOURS);
  });
});
