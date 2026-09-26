// @vitest-environment node
/**
 * The seat page's Access actions and the roster's Save colours — LAN-430 (W1,
 * W2 of LAN-423), against the local database, through the server actions the
 * pages call. Every write is undone after each case: the seat lines back to
 * the seed, the colours to the packet's, the suite's audit rows removed.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));

import type { Client } from "pg";

import { seededGrantsFor } from "@/lib/auth/capabilities";
import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import { closePool } from "@/lib/db";
import { readHolderHistory } from "@/lib/services/administration-audit";
import { ROSTER_GROUP_COLOURS_CHANGED } from "@/lib/services/roster-group-colours";
import {
  openObserver,
  seededIdentityCreatedAt,
} from "../../../../../../tests/helpers/service-layer";
import { saveRosterGroupColoursAction } from "../../../roster/group-colour-actions";
import { accessHistoryLines, accessHistoryTitle } from "../../presentation";
import {
  copyAccessAction,
  grantEverythingAction,
  planCopyAccessAction,
  setAccessGrantAction,
} from "./access-actions";

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
let templates: { id: string; name: string }[] = [];

function signedInAs(roleCodes: string[]): void {
  const access: OperatorAccess = {
    state: "active",
    operator: {
      authUserId: "00000000-1111-4111-8111-111111111111",
      personId: actorPersonId,
      displayName: "Caspian Hallowfield",
      roleCodes,
      grants: seededGrantsFor(roleCodes),
      isActive: true,
    },
  };
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

async function accessAuditCount(roleId: string): Promise<number> {
  const result = await observer.query<{ count: string }>(
    `select count(*) from public.audit_events
      where action like 'administration.access.%'
        and context -> 'administration' ->> 'roleId' = $1`,
    [roleId],
  );
  return Number(result.rows[0].count);
}

async function levelOf(roleCode: string, kind: string, key: string | null, templateId?: string) {
  const result = await observer.query<{ level: string }>(
    `select g.level from public.role_access_grants g
       join public.roles r on r.id = g.role_id
      where r.code = $1 and g.subject_kind = $2
        and g.subject_key is not distinct from $3
        and g.template_id is not distinct from $4::uuid`,
    [roleCode, kind, key, templateId ?? null],
  );
  return result.rows[0]?.level;
}

async function accessHistory(roleCode: string) {
  signedInAs(["president"]);
  const operator = (await resolveOperatorAccess()) as Extract<OperatorAccess, { state: "active" }>;
  return (await readHolderHistory(operator.operator, roleIds[roleCode])).filter(
    (entry) => entry.family === "access",
  );
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
  templates = (
    await observer.query<{ id: string; name: string }>(
      "select id, name from public.event_templates order by lower(name), id",
    )
  ).rows;
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
                       else case when g.subject_key = 'recruit_events' then 'view' else 'edit' end
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
});

afterAll(async () => {
  await observer?.end();
  await closePool();
});

describe("save on press — one line of each kind", () => {
  it("writes one audit row and one History entry per press, and the Notice reads it back", async () => {
    signedInAs(["president"]);
    const treasurer = roleIds.treasurer;
    const chalk = templates[0];

    const presses = [
      {
        line: { kind: "roster", key: "kit" } as const,
        level: "edit",
        notice: "Kit changed from None to Edit.",
      },
      {
        line: { kind: "recruiting", key: "recruit_events" } as const,
        level: "view",
        notice: "Event details changed from None to View.",
      },
      {
        line: { kind: "template", key: chalk.id } as const,
        level: "manage",
        notice: `${chalk.name} changed from None to Manage.`,
      },
      {
        line: { kind: "switch", key: "add_recruits" } as const,
        level: "yes",
        notice: "May add recruits changed from No to Yes.",
      },
    ];

    for (const [index, press] of presses.entries()) {
      const result = await setAccessGrantAction(treasurer, press.line, press.level);
      expect(result).toMatchObject({ ok: true, notice: press.notice });
      expect(await accessAuditCount(treasurer)).toBe(index + 1);
    }

    expect(await levelOf("treasurer", "roster_category", "kit")).toBe("edit");
    expect(await levelOf("treasurer", "event_template", null, chalk.id)).toBe("manage");

    const history = await accessHistory("treasurer");
    expect(history).toHaveLength(4);
    expect(history.map((entry) => accessHistoryLines(entry)[0]).sort()).toEqual(
      [
        "Kit: None → Edit",
        "Event details: None → View",
        `${chalk.name} (template): None → Manage`,
        "May add recruits: No → Yes",
      ].sort(),
    );
  });

  it("returns the refusal, and changes nothing, for an operator without role_management", async () => {
    signedInAs(["treasurer"]);
    const result = await setAccessGrantAction(
      roleIds.treasurer,
      { kind: "roster", key: "kit" },
      "edit",
    );
    expect(result.ok).toBe(false);
    expect(await levelOf("treasurer", "roster_category", "kit")).toBe("none");
    expect(await accessAuditCount(roleIds.treasurer)).toBe(0);
  });

  it("refuses a line outside the vocabulary before any write", async () => {
    signedInAs(["president"]);
    const result = await setAccessGrantAction(
      roleIds.treasurer,
      { kind: "roster", key: "attendance" },
      "edit",
    );
    expect(result).toMatchObject({ ok: false });
    expect(await accessAuditCount(roleIds.treasurer)).toBe(0);
  });
});

describe("the floor — a forged request against a fixed seat", () => {
  it("refuses lowering the President, whatever the request says, and records nothing", async () => {
    signedInAs(["president"]);
    for (const [line, level] of [
      [{ kind: "roster", key: "kit" }, "none"],
      [{ kind: "switch", key: "add_to_roster" }, "none"],
      [{ kind: "template", key: templates[0].id }, "view"],
    ] as const) {
      const result = await setAccessGrantAction(roleIds.president, line, level);
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.error).toMatch(/^The grant was not changed\./);
    }
    expect(await levelOf("president", "roster_category", "kit")).toBe("edit");
    expect(await levelOf("president", "switch", "add_to_roster")).toBe("yes");

    expect((await copyAccessAction(roleIds.president, roleIds.treasurer)).ok).toBe(false);
    expect((await grantEverythingAction(roleIds.it_officer)).ok).toBe(false);
    expect(await accessAuditCount(roleIds.president)).toBe(0);
  });
});

describe("whole-seat edits", () => {
  it("copies the Vice-President onto the Treasurer as one History entry listing every changed line", async () => {
    signedInAs(["president"]);
    const plan = await planCopyAccessAction(roleIds.treasurer, roleIds.vice_president);
    const expected = 11 + 3 + templates.length + 2;
    expect(plan).toMatchObject({ ok: true });
    if (plan.ok) expect(plan.lines).toHaveLength(expected);

    const result = await copyAccessAction(roleIds.treasurer, roleIds.vice_president);
    expect(result).toMatchObject({
      ok: true,
      notice: `Access copied from Vice-President. ${expected} grants changed.`,
    });
    expect(await accessAuditCount(roleIds.treasurer)).toBe(1);

    const [entry, ...rest] = await accessHistory("treasurer");
    expect(rest).toHaveLength(0);
    expect(accessHistoryTitle(entry)).toBe("Access copied from Vice-President");
    const lines = accessHistoryLines(entry);
    expect(lines).toHaveLength(expected);
    expect(lines[0]).toBe("Person: None → Edit");
    expect(lines).toContain("Contact & emergency: None → Edit");
    expect(lines.at(-1)).toBe("May add recruits: No → Yes");
    // No end date: the copied lines are ordinary rows, and the Treasurer is not made fixed.
    const again = await setAccessGrantAction(
      roleIds.treasurer,
      { kind: "roster", key: "kit" },
      "view",
    );
    expect(again.ok).toBe(true);
  });

  it("grants everything as one audit row", async () => {
    signedInAs(["president"]);
    const result = await grantEverythingAction(roleIds.kit_manager);
    expect(result).toMatchObject({ ok: true });
    expect(await accessAuditCount(roleIds.kit_manager)).toBe(1);
    expect(await levelOf("kit_manager", "roster_category", "contact_emergency")).toBe("edit");
  });
});

describe("Save colours — the roster's Edit categories", () => {
  it("changes Kit's colour with one audit row", async () => {
    signedInAs(["president"]);
    const result = await saveRosterGroupColoursAction({ ...SEEDED_COLOURS, kit: "red" });
    expect(result).toEqual({ ok: true });
    const stored = await observer.query<{ colour_key: string }>(
      "select colour_key from public.roster_group_colours where group_key = 'kit'",
    );
    expect(stored.rows[0].colour_key).toBe("red");
    const audit = await observer.query<{ count: string }>(
      "select count(*) from public.audit_events where action = $1",
      [ROSTER_GROUP_COLOURS_CHANGED],
    );
    expect(Number(audit.rows[0].count)).toBe(1);
  });

  it("returns an error, and changes nothing, for a seat without role_management or an unknown colour", async () => {
    signedInAs(["kit_manager"]);
    expect((await saveRosterGroupColoursAction({ kit: "red" })).ok).toBe(false);
    signedInAs(["president"]);
    expect((await saveRosterGroupColoursAction({ kit: "chartreuse" })).ok).toBe(false);
    const stored = await observer.query<{ colour_key: string }>(
      "select colour_key from public.roster_group_colours where group_key = 'kit'",
    );
    expect(stored.rows[0].colour_key).toBe("lancer_gold");
  });
});
