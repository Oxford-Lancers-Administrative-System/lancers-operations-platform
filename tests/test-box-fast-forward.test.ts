// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { openLocalClient } from "./helpers/domain-fixture";
import { shiftSchedules } from "../scripts/test-box/fast-forward.mjs";

let db: Client;
let event: string;
let job: string;
beforeAll(async () => {
  db = await openLocalClient();
});
afterAll(async () => {
  await db?.end();
});
beforeEach(async () => {
  await db.query("begin");
  const result = await db.query(
    "select p.event_id from event_messaging_plans p join events e on e.id=p.event_id where e.status='approved' and not exists (select 1 from notification_jobs j where j.event_id=p.event_id and j.status='processing') limit 1",
  );
  event = result.rows[0].event_id;
  const inserted = await db.query(
    "insert into notification_jobs (idempotency_key,job_type,status,event_id,scheduled_for,next_attempt_at) values ('LAN222-shift-proof','other','pending',$1,now()+interval '2 days',now()+interval '3 days') returning id",
    [event],
  );
  job = inserted.rows[0].id;
});
afterEach(async () => {
  await db.query("rollback");
});

describe("LAN-222 fast-forward against local PostgreSQL", () => {
  it("moves pending times and frozen anchors but leaves deadlines, events and completed evidence intact", async () => {
    const original = (
      await db.query("select scheduled_for,next_attempt_at from notification_jobs where id=$1", [
        job,
      ])
    ).rows[0];
    const before = (
      await db.query(
        "select row_to_json(e)::text event, p.response_deadline_at, p.invitation_at from events e join event_messaging_plans p on p.event_id=e.id where e.id=$1",
        [event],
      )
    ).rows[0];
    const completed = (
      await db.query(
        "insert into notification_jobs (idempotency_key,job_type,status,event_id,scheduled_for) values ('LAN222-completed-proof','other','completed',$1,now()) returning id,scheduled_for",
        [event],
      )
    ).rows[0];
    const other = (
      await db.query(
        "select id,scheduled_for from notification_jobs where event_id<>$1 and scheduled_for is not null limit 1",
        [event],
      )
    ).rows[0];
    await shiftSchedules(db, { hours: 24, event });
    const shifted = (
      await db.query("select scheduled_for,next_attempt_at from notification_jobs where id=$1", [
        job,
      ])
    ).rows[0];
    expect(original.scheduled_for.getTime() - shifted.scheduled_for.getTime()).toBe(86400000);
    expect(original.next_attempt_at.getTime() - shifted.next_attempt_at.getTime()).toBe(86400000);
    const after = (
      await db.query(
        "select row_to_json(e)::text event, p.response_deadline_at, p.invitation_at from events e join event_messaging_plans p on p.event_id=e.id where e.id=$1",
        [event],
      )
    ).rows[0];
    expect(after.event).toBe(before.event);
    expect(after.response_deadline_at).toEqual(before.response_deadline_at);
    expect(before.invitation_at.getTime() - after.invitation_at.getTime()).toBe(86400000);
    expect(
      (await db.query("select scheduled_for from notification_jobs where id=$1", [completed.id]))
        .rows[0].scheduled_for,
    ).toEqual(completed.scheduled_for);
    expect(
      (await db.query("select scheduled_for from notification_jobs where id=$1", [other.id]))
        .rows[0].scheduled_for,
    ).toEqual(other.scheduled_for);
  });
  it("refuses a processing job without moving any queued time", async () => {
    const before = (
      await db.query("select scheduled_for from notification_jobs where id=$1", [job])
    ).rows[0];
    await db.query(
      "insert into notification_jobs (idempotency_key,job_type,status,event_id,claimed_at,claimed_by) values ('LAN222-processing-proof','other','processing',$1,now(),'LAN222-test')",
      [event],
    );
    await expect(shiftSchedules(db, { hours: 1, event })).rejects.toThrow("processing");
    expect(
      (await db.query("select scheduled_for from notification_jobs where id=$1", [job])).rows[0],
    ).toEqual(before);
  });
});
