import fs from "node:fs";
import path from "node:path";
import { runtime } from "./runtime.mjs";
import { connectLocal } from "../lib/local-db.mjs";
import { clockSql } from "./sql-clock.mjs";

export function viewClockSql(row, definition) {
  if (
    !row.options?.includes("security_invoker=true") ||
    row.options.some(
      (option) =>
        !/^(security_invoker|security_barrier)=(true|false)$|^check_option=(local|cascaded)$/.test(
          option,
        ),
    )
  )
    throw new Error("Clock instrumentation requires the view's original invoker security options.");
  return `create or replace view public.${quote(row.name)} with (${row.options.join(", ")}) as ${definition}`;
}
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
/** Reversible local instrumentation; no shared migration or stored rows change. */
export async function prepareDatabaseClock() {
  const active = await runtime();
  const db = await connectLocal(active.databaseUrl);
  const directory = path.resolve(".lancers-runtime");
  const file = path.join(directory, "clock-schema.json");
  try {
    await db.query("begin");
    await db.query("set local lock_timeout = '5s'");
    const defaults = (
      await db.query(`select c.relname as table_name,a.attname as column_name,
      pg_get_expr(d.adbin,d.adrelid) as expression
      from pg_attrdef d join pg_class c on c.oid=d.adrelid
      join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attnum=d.adnum
      where n.nspname='public'`)
    ).rows;
    const functions = (
      await db.query(`select p.oid::regprocedure::text as signature,
      p.prosrc as body,pg_get_functiondef(p.oid) as definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      join pg_language l on l.oid=p.prolang
      where n.nspname='public' and p.prokind='f' and l.lanname in ('sql','plpgsql')`)
    ).rows;
    let manifest;
    if (fs.existsSync(file)) {
      manifest = JSON.parse(fs.readFileSync(file, "utf8"));
      if (manifest.databasePort !== active.lease.ports.db)
        throw new Error("Clock instrumentation belongs to a different test database.");
    } else {
      manifest = { version: 1, databasePort: active.lease.ports.db, defaults: [], functions: [] };
      for (const row of defaults) {
        const replacement = clockSql(row.expression);
        if (replacement !== row.expression) manifest.defaults.push({ ...row, replacement });
      }
      for (const row of functions) {
        const replacementBody = clockSql(row.body);
        if (replacementBody === row.body) continue;
        const at = row.definition.indexOf(row.body);
        if (at === -1 || row.definition.indexOf(row.body, at + row.body.length) !== -1)
          throw new Error("A local clock function could not be instrumented unambiguously.");
        manifest.functions.push({
          ...row,
          replacement:
            row.definition.slice(0, at) +
            replacementBody +
            row.definition.slice(at + row.body.length),
        });
      }
      fs.writeFileSync(file, JSON.stringify(manifest), { mode: 0o600, flag: "wx" });
    }
    const views = (
      await db.query(
        "select c.relname as name,c.reloptions as options,pg_get_viewdef(c.oid,true) as definition from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'",
      )
    ).rows;
    if (!manifest.views)
      manifest.views = views
        .map((row) => ({ ...row, replacement: clockSql(row.definition) }))
        .filter((row) => row.definition !== row.replacement);
    for (const row of manifest.views) {
      const found = views.find((v) => v.name === row.name);
      if (
        !found ||
        ![row.definition, row.installedDefinition, row.replacement].includes(found.definition)
      )
        throw new Error("Local view drift prevents clock installation.");
      await db.query(viewClockSql(row, row.replacement));
      row.installedDefinition = (
        await db.query("select pg_get_viewdef($1::regclass,true) as definition", [
          "public." + quote(row.name),
        ])
      ).rows[0].definition;
    }
    for (const row of manifest.defaults) {
      const found = defaults.find(
        (d) => d.table_name === row.table_name && d.column_name === row.column_name,
      );
      // pg_get_expr canonicalizes formatting, so remember its exact installed form below.
      if (
        !found ||
        ![row.expression, row.installedExpression, row.replacement].includes(found.expression)
      )
        throw new Error(
          "Local schema changed since clock setup. Restore the clock before migrating.",
        );
      await db.query(
        `alter table public.${quote(row.table_name)} alter column ${quote(row.column_name)} set default ${row.replacement}`,
      );
      const current = await db.query(
        `select pg_get_expr(d.adbin,d.adrelid) as expression from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=d.adnum where n.nspname='public' and c.relname=$1 and a.attname=$2`,
        [row.table_name, row.column_name],
      );
      row.installedExpression = current.rows[0].expression;
    }
    for (const row of manifest.functions) {
      const found = functions.find((f) => f.signature === row.signature);
      if (!found || ![row.definition, row.replacement].includes(found.definition))
        throw new Error(
          "Local functions changed since clock setup. Restore the clock before migrating.",
        );
      await db.query(row.replacement);
    }
    // Save the canonical definitions before commit, so interruption is recoverable.
    const temporary = file + ".next";
    fs.writeFileSync(temporary, JSON.stringify(manifest), { mode: 0o600 });
    fs.renameSync(temporary, file);
    await db.query("commit");
    return { defaults: manifest.defaults.length, functions: manifest.functions.length };
  } catch (error) {
    await db.query("rollback").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

export async function setSharedTime(time) {
  if (!Number.isFinite(Date.parse(time))) throw new Error("Invalid shared test time.");
  const active = await runtime();
  const db = await connectLocal(active.databaseUrl);
  const { readPanelState, writePanelState } = await import("./panel-state.mjs");
  try {
    await db.query("begin");
    await db.query("set local lock_timeout='10s'");
    await db.query("select pg_advisory_xact_lock(2220910)");
    const directory = path.resolve(".lancers-runtime");
    const state = readPanelState(directory);
    if (state.clock && Date.parse(time) < Date.parse(state.clock))
      throw new Error(
        "The shared test clock cannot move backwards. Reset the test database for a new run.",
      );
    state.clock = new Date(time).toISOString();
    writePanelState(directory, state);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

/** Restore original local defaults before schema verification or a new test run. */
export async function restoreDatabaseClock() {
  const active = await runtime();
  const file = path.resolve(".lancers-runtime/clock-schema.json");
  if (!fs.existsSync(file)) return;
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  if (manifest.databasePort !== active.lease.ports.db)
    throw new Error("Clock metadata belongs to another local database.");
  const db = await connectLocal(active.databaseUrl);
  try {
    await db.query("begin");
    await db.query("set local lock_timeout='5s'");
    for (const row of manifest.defaults) {
      const current = await db.query(
        `select pg_get_expr(d.adbin,d.adrelid) as expression from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=d.adnum where n.nspname='public' and c.relname=$1 and a.attname=$2`,
        [row.table_name, row.column_name],
      );
      if (![row.expression, row.installedExpression].includes(current.rows[0]?.expression))
        throw new Error("Local schema drift prevents automatic clock restoration.");
      await db.query(
        `alter table public.${quote(row.table_name)} alter column ${quote(row.column_name)} set default ${row.expression}`,
      );
    }
    for (const row of manifest.functions) {
      const current = await db.query("select pg_get_functiondef($1::regprocedure) as definition", [
        row.signature,
      ]);
      if (![row.definition, row.replacement].includes(current.rows[0]?.definition))
        throw new Error("Local function drift prevents automatic clock restoration.");
      await db.query(row.definition);
    }
    for (const row of manifest.views ?? []) {
      const found = (
        await db.query("select pg_get_viewdef($1::regclass,true) as definition", [
          "public." + quote(row.name),
        ])
      ).rows[0];
      if (![row.definition, row.installedDefinition].includes(found?.definition))
        throw new Error("Local view drift prevents clock restoration.");
      await db.query(viewClockSql(row, row.definition));
    }
    await db.query("commit");
    fs.unlinkSync(file);
  } catch (error) {
    await db.query("rollback").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}
