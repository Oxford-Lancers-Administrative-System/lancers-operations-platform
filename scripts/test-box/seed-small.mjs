#!/usr/bin/env node
/** LAN-297: Brian-approved, disposable local WhatsApp walkthrough dataset. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID as uuid } from "node:crypto";
import { runtime } from "./runtime.mjs";
import { connectLocal } from "../lib/local-db.mjs";
import { validatePersonSettings, readPanelState, writePanelState } from "./panel-state.mjs";

if (!process.argv.includes("--replace-local-data"))
  throw new Error("Explicit --replace-local-data is required. Stop the app and panel first.");
const active = await runtime();
for (const file of ["panel-runtime.json", "app-hooks-active.json"]) {
  const filename = path.resolve(".lancers-runtime", file);
  if (!fs.existsSync(filename)) continue;
  const { pid } = JSON.parse(fs.readFileSync(filename));
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {}
  if (alive) throw new Error("Stop this test box app and panel before replacing data.");
}
const db = await connectLocal(active.databaseUrl);
const directory = path.resolve(".lancers-runtime");
const stamp = new Date().toISOString();
const today = stamp.slice(0, 10);
const day = (offset) =>
  new Date(Date.parse(today + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
const archive = path.join(directory, "small-squad", "archive-" + stamp.replaceAll(":", "-"));
fs.mkdirSync(archive, { recursive: true, mode: 0o700 });
const before = {};
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
try {
  for (const { tablename } of (
    await db.query("select tablename from pg_tables where schemaname='public'")
  ).rows)
    before[tablename] = (
      await db.query(`select row_to_json(t) as r from public.${quote(tablename)} t`)
    ).rows.map((x) => x.r);
  fs.writeFileSync(path.join(archive, "database.json"), JSON.stringify(before), { mode: 0o600 });
  // Preserve explicitly real people during the mixed-squad reset. Never carry
  // their workflow history into a fresh run or invent replacement details.
  const previousState = readPanelState(directory);
  const realIds = Object.entries(previousState.people)
    .filter(([, settings]) => settings.identity === "real")
    .map(([id]) => id);
  if (realIds.length && !process.argv.includes("--preserve-real-people"))
    throw new Error("Real people are present; --preserve-real-people is required.");
  const realPeople = before.people.filter((person) => realIds.includes(person.id));
  if (realPeople.length !== realIds.length)
    throw new Error("A real panel identity has no person record; resolve before reset.");
  if (realPeople.some((person) => person.merged_into_person_id))
    throw new Error("Merged real identities need an explicit reset plan.");
  const realContacts = before.contact_points.filter((c) => realIds.includes(c.person_id));
  const realAliases = before.person_aliases.filter((a) => realIds.includes(a.person_id));
  const operator = before.operator_accounts.find((x) => !x.login_email?.includes("+coach"));
  const coach = before.operator_accounts.find((x) => x.login_email?.includes("+coach"));
  if (!operator || !coach) throw new Error("Both existing local review login links are required.");
  const oldSeason = before.seasons.find((x) => x.status === "active");
  const types = before.onboarding_item_types.filter((x) => x.season_id === oldSeason.id);
  if (types.length < 7) throw new Error("Missing current onboarding definitions.");
  const season = uuid(),
    committee = uuid();
  const roster = [
    ["Peregrine", "Ashcombe", "President", "prompt", "yes", "all", 0],
    ["Rowan", "Brindlewood", "Head coach", "prompt", "yes", "all", 0],
    ["Caspian", "Caldicott", "General Manager / player", "prompt", "yes", "all", 0],
    ["Dashiell", "Draycott", "Player", "prompt", "yes", "all", 0],
    ["Emrys", "Elverton", "Player", "prompt", "yes", "minimum", 0],
    ["Fenwick", "Fairhurst", "Player", "prompt", "no", "minimum", 0],
    ["Gideon", "Gorsemoor", "Player", "prompt", "no", "minimum", 0],
    ["Hollis", "Hallowfield", "Player", "late", "yes", "all", 30],
    ["Ignatius", "Inglewhite", "Player", "late", "no", "minimum", 36],
    ["Jarrah", "Jarrowdale", "Player", "late", "yes", "partial", 60],
    ["Kestrel", "Kirkbride", "Player", "never", "yes", "minimum", 24],
    ["Lysander", "Lanthorne", "Player", "never", "yes", "minimum", 24],
    ["Marlowe", "Mereworth", "Player", "prompt", "yes", "partial", 0],
    ["Norbert", "Netherby", "Player — no phone", "never", "yes", "minimum", 24],
    ["Osgood", "Oakhanger", "Player — no phone", "never", "yes", "minimum", 24],
  ].map(([given, family, role, responder, eventAnswer, completion, delayHours], i) => ({
    id: i === 0 ? operator.person_id : i === 1 ? coach.person_id : uuid(),
    given,
    family,
    role,
    phone: i < 13 ? "447700900" + String(201 + i) : null,
    email: given.toLowerCase() + "@squad.example",
    responder,
    eventAnswer,
    completion,
    delayHours,
    membershipId: i >= 2 ? uuid() : null,
  }));
  const actor = roster[0].id;
  const insert = async (table, row) => {
    const keys = Object.keys(row).map(quote).join(",");
    await db.query(
      `insert into public.${quote(table)} (${keys}) select ${keys} from jsonb_populate_record(null::public.${quote(table)},$1::jsonb)`,
      [JSON.stringify(row)],
    );
  };
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  // Same owner-only truncate strategy as seed-local; FK constraints remain enabled.
  await db.query(
    "truncate public.people, public.seasons, public.committee_years, public.terms restart identity cascade",
  );
  for (const p of roster)
    await insert("people", {
      id: p.id,
      given_name: p.given,
      family_name: p.family,
      college: "Synthetic College",
      matriculation_year: 2025,
      expected_graduation_year: 2029,
      degree_field: "Engineering Science",
      date_of_birth: "2004-01-15",
    });
  for (const person of realPeople) await insert("people", person);
  for (const contact of realContacts) await insert("contact_points", contact);
  for (const alias of realAliases) await insert("person_aliases", alias);
  await insert("seasons", {
    id: season,
    label: "2026-27",
    status: "active",
    position_vocabulary_id: oldSeason.position_vocabulary_id,
    starts_on: today,
    ends_on: null,
    opened_at: stamp,
    opened_by_person_id: actor,
  });
  await insert("committee_years", {
    id: committee,
    label: "2026-27",
    agm_held_on: today,
    starts_on: today,
    ends_on: day(365),
  });
  for (const [index, code] of [
    [0, "president"],
    [1, "head_coach"],
    [2, "general_manager"],
  ]) {
    const r = before.roles.find((x) => x.code === code);
    await insert("role_assignments", {
      person_id: roster[index].id,
      role_id: r.id,
      scope: r.scope,
      is_constitutional_office: r.is_constitutional_office,
      is_single_holder_seat: r.is_single_holder_seat,
      committee_year_id: r.scope === "committee_year" ? committee : null,
      season_id: r.scope === "season" ? season : null,
      effective_from: today,
      effective_to: null,
      appointed_by_person_id: actor,
      note: "Synthetic local walkthrough — LAN-297",
    });
  }
  for (const item of types) await insert("onboarding_item_types", { ...item, season_id: season });
  for (const p of roster) {
    for (const [kind, value] of [
      ["email", p.email],
      ["phone", p.phone],
    ])
      if (value)
        await insert("contact_points", {
          person_id: p.id,
          kind,
          raw_value: value,
          normalised_value: value,
          is_preferred: true,
          valid_from: today,
          source: "LAN-297 synthetic local scenario",
          scope: kind === "email" ? "personal" : null,
        });
    await insert("season_messaging_consents", {
      person_id: p.id,
      season_id: season,
      state: "granted",
      source: "operator_recorded",
      recorded_by_person_id: actor,
    });
    await insert("person_emergency_contacts", {
      person_id: p.id,
      given_name: "Synthetic",
      family_name: "Contact",
      relationship: "Parent",
      phone: "447700900999",
      recorded_by_person_id: actor,
    });
    if (p.membershipId) {
      await insert("season_memberships", {
        id: p.membershipId,
        person_id: p.id,
        season_id: season,
        status: "active",
        entry: "returning",
        confirmed_on: today,
        activated_on: today,
      });
      for (const item of types) {
        // LAN-301: Hudl resolves at Claimed; Complete is not one of its states.
        const status = item.code === "hudl_access" ? "claimed" : "complete";
        const id = uuid();
        await insert("onboarding_items", {
          id,
          season_membership_id: p.membershipId,
          season_id: season,
          item_type_id: item.id,
          status,
          completed_on: status === "complete" ? today : null,
        });
        await insert("onboarding_item_history", {
          onboarding_item_id: id,
          season_membership_id: p.membershipId,
          from_status: "pending",
          to_status: status,
          actor_kind: "operator",
          actor_person_id: actor,
          reason: "Established synthetic player; LAN-297 starting state",
        });
      }
      for (const version of before.onboarding_agreement_versions)
        await insert("onboarding_agreements", {
          person_id: p.id,
          season_id: season,
          agreement_type: version.agreement_type,
          agreement_version_id: version.id,
        });
    }
  }
  for (const link of before.operator_accounts)
    if ([actor, coach.person_id].includes(link.person_id)) await insert("operator_accounts", link);
  const events = [];
  const schedule = [
    ...Array.from({ length: 8 }, (_, i) => [5 + 7 * i, "practice", `Week ${i + 1} practice`, true]),
    [9, "chalk", "Chalk and questions", true],
    [23, "game", "Test game", true],
    [32, "social", "Optional squad social", false],
    [45, "strength_and_conditioning", "Optional conditioning", false],
  ].sort((a, b) => a[0] - b[0]);
  for (const [offset, eventType, name, mandatory] of schedule) {
    const e = { id: uuid(), name, eventType, scheduledOn: day(offset), mandatory };
    events.push(e);
    await insert("events", {
      id: e.id,
      season_id: season,
      name,
      event_type: eventType,
      status: "draft",
      scheduled_on: e.scheduledOn,
      starts_at: "18:00",
      ends_at: "20:00",
      venue: "Synthetic training ground",
      owner_person_id: actor,
      is_mandatory: mandatory,
      description:
        "LAN-297 local WhatsApp walkthrough. Confirm the audience and approve to start the invitation flow.",
    });
    await insert("event_questions", {
      event_id: e.id,
      prompt: "Do you need transport?",
      answer_type: "boolean",
      applies_to_capacities: ["player", "coach"],
      is_required: true,
      sort_order: 0,
    });
    await insert("event_questions", {
      event_id: e.id,
      prompt: "Anything the organiser should know?",
      answer_type: "text",
      applies_to_capacities: ["player", "coach"],
      is_required: false,
      sort_order: 1,
    });
  }
  await db.query("commit");
  for (const file of [
    "transport-evidence",
    "simulated-receipts",
    "responses",
    "captures",
    "delivery-sink",
    "panel-state.json",
    "app-hooks-active.json",
    "panel-runtime.json",
  ]) {
    const src = path.join(directory, file);
    if (fs.existsSync(src)) fs.renameSync(src, path.join(archive, file));
  }
  const state = { version: 1, clock: stamp, people: {} };
  for (const p of roster)
    state.people[p.id] = validatePersonSettings(
      {
        identity: "synthetic",
        delivery: "intercepted",
        responder: p.responder,
        eventAnswer: p.eventAnswer,
        completion: p.completion,
        delayHours: p.delayHours,
      },
      { phone: p.phone },
    );
  for (const person of realPeople) {
    const contact = realContacts.find(
      (c) => c.person_id === person.id && c.kind === "phone" && c.valid_until === null,
    );
    state.people[person.id] = validatePersonSettings(
      { identity: "real", delivery: "intercepted", responder: "none", completion: "none" },
      { phone: contact?.normalised_value ?? contact?.raw_value ?? null },
    );
  }
  writePanelState(directory, state);
  const manifest = {
    issue: "LAN-297",
    createdAt: stamp,
    today,
    through: day(56),
    seasonId: season,
    actor,
    people: roster,
    realPeople: realPeople.map((p) => ({ id: p.id, given: p.given_name, family: p.family_name })),
    events,
    schedules: before.messaging_schedules,
    archive,
  };
  fs.writeFileSync(
    path.join(directory, "small-squad", "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      people: roster.length + realPeople.length,
      realPeoplePreserved: realPeople.length,
      players: 13,
      phones: 13,
      events: events.length,
      mandatory: 10,
      optional: 2,
      start: today,
      through: day(56),
      status: "draft",
      automaticForms: false,
    }),
  );
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
