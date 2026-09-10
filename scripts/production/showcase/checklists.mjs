/**
 * One checklist per tester — LAN-221, Part 3.
 *
 * Generated from the map (Part 1) with the plan's identifiers (Part 2) filled
 * in. Every list covers **every** workflow, as a list of "open this link — you
 * should see this — tick it, or write what you saw". Findings are written in
 * the document itself, under the item they belong to — Brian, this session:
 * each tester gets their own Drive file and the notes go in there, so there is
 * no form and no second place to look. Not booklets, not prose.
 *
 * Brian, this session: "I want three testers testing all the workflows … They're
 * not running separate parts of it." So the lists differ only in the rows they
 * point at. Five readings of each workflow is the point; the only thing that
 * must not be shared is the row each tester changes.
 *
 * Links are computed from the plan before anything is loaded, which is the
 * whole point of deterministic identifiers: the checklist Brian hands out on
 * Monday was written on Friday and resolves on the deployed build.
 */

import { MISSIONS, STATE_BY_KEY, TESTERS, WORKFLOWS, resolveRoute } from "./map.mjs";

const BOX = "- [ ]";

/**
 * Every row that could stand in for `key`, in plan order.
 *
 * Two sources, in this order: the rows the plan explicitly offered as examples
 * of `key`, then — when `key` is also the name of a state — every row tagged
 * with that state. The second is why this works at all without inventing data:
 * the map already requires ten registers and two committed prospects, and the
 * plan already tags every one of them. Only the *naming* was first-wins.
 */
function poolFor(key, plan) {
  const pool = [...(plan.candidates?.get(key) ?? [])];
  if (STATE_BY_KEY.has(key)) {
    for (const id of plan.states?.get(key) ?? []) if (!pool.includes(id)) pool.push(id);
  }
  if (pool.length === 0) {
    const only = plan.examples?.get(key);
    if (only !== undefined) pool.push(only);
  }
  return pool;
}

/**
 * Which seats reference each placeholder, in seat order.
 *
 * Up to five people are in the environment at once. Two seats pointed at one
 * membership means whoever activates it first takes the state away from the
 * other, and the second tester reports a defect that is really a collision. So
 * each seat that asks for a key is dealt a different row from the pool.
 */
function seatsByPlaceholder() {
  const order = Object.keys(TESTERS);
  const seats = new Map();
  for (const workflow of WORKFLOWS) {
    if (workflow.notAWorkflow) continue;
    for (const template of workflow.routes) {
      for (const [, key] of template.matchAll(/\{([^}]+)\}/g)) {
        if (!seats.has(key)) seats.set(key, order);
      }
    }
  }
  return seats;
}

/** The four checklists, keyed by tester, as Markdown. */
/**
 * The rows each seat is sent to, one per placeholder, and what it must share.
 *
 * A seat's index for a key is its position among the seats that ask for that
 * key, so the first seat gets the first row of the pool, the second the second,
 * and so on. When the pool is smaller than the number of seats asking, the
 * overflow seats fall back to the first row and `shared` records who else is
 * pointed at it — the checklist says so rather than letting two people quietly
 * contend over one membership.
 *
 * Exported so the suite can assert the property directly rather than by reading
 * it back out of rendered Markdown.
 */
export function seatViews(plan) {
  const seats = seatsByPlaceholder();
  const views = new Map();
  const order = Object.keys(TESTERS);
  // Which seat already holds a given row, across every placeholder. Keyed by
  // the resolved value rather than the placeholder, because two *different*
  // keys landing on one row is the same hazard as one key dealt twice — a
  // disputed fact and a superseded contact point can be facts about the same
  // person, and two testers each told to change something about them is
  // exactly the collision this exists to prevent.
  const heldBy = new Map();

  for (const testerKey of order) {
    const view = new Map(plan.examples ?? []);
    const shared = new Map();

    for (const [key, using] of seats) {
      if (!using.includes(testerKey)) continue;

      // The administration workflows deactivate, rehome and reinstate an
      // operator record. Brian creates five accounts and no throwaway sixth, so
      // each seat is dealt a *different* seat's record — a shift of two rather
      // than a reversal, because reversing an odd-length list leaves the middle
      // seat pointed at its own account, the one record it must not deactivate.
      //
      // LAN-254, item 5: the shift is a starting point, not the answer. A load
      // where a seat carries no `authUserId` — every local rehearsal, which
      // creates two review logins rather than five, and any hosted load where
      // Brian has not finished creating the accounts — has no operator record
      // for that seat, and the shift used to stop there. Four checklist rows
      // per affected seat then read "no example row for `operator.other-seat`
      // in this load; skip and report", and Deactivate, Restore, Assign or end
      // a role, the audit evidence and the whole activated-operator email
      // rehome went untested. Walk on round the seats instead and take the
      // first account that is not this seat's own: with five accounts every
      // seat still gets the shift-of-two record and nothing changes, and with
      // two it gets a real one instead of a hole.
      if (key === "operator.other-seat") {
        const start = order.indexOf(testerKey);
        let dealt;
        for (let step = 2; step < 2 + order.length; step += 1) {
          const mine = order[(start + step) % order.length];
          if (mine === testerKey) continue;
          const account = plan.examples?.get(`operator.${mine}`);
          if (account !== undefined) {
            dealt = account;
            break;
          }
        }
        if (dealt !== undefined) {
          view.set(key, dealt);
          continue;
        }
      }

      const pool = poolFor(key, plan);
      if (pool.length === 0) continue;

      // The first row nobody else already holds. Falling back to this seat's
      // own index keeps the deal deterministic when every candidate is taken.
      const free = pool.find((value) => (heldBy.get(value) ?? testerKey) === testerKey);
      const value = free ?? pool[using.indexOf(testerKey) % pool.length];
      view.set(key, value);
      if (!heldBy.has(value)) heldBy.set(value, testerKey);
      shared.set(key, heldBy.get(value));
    }

    views.set(testerKey, { view, shared });
  }

  // Second pass, once every seat has been dealt: a row is shared when more than
  // one seat ended up on it, and *both* sides are told. Telling only the seat
  // that arrived second would leave the first believing the row is theirs
  // alone, which is the half of the problem that produces the false report.
  const usedBy = new Map();
  for (const [testerKey, { view, shared }] of views) {
    for (const key of shared.keys()) {
      const value = view.get(key);
      if (value === undefined) continue;
      if (!usedBy.has(value)) usedBy.set(value, new Set());
      usedBy.get(value).add(testerKey);
    }
  }
  for (const [testerKey, { view, shared }] of views) {
    for (const key of [...shared.keys()]) {
      const others = [...(usedBy.get(view.get(key)) ?? [])].filter((seat) => seat !== testerKey);
      if (others.length === 0) shared.delete(key);
      else
        shared.set(
          key,
          order.filter((seat) => others.includes(seat)).map((seat) => TESTERS[seat].name),
        );
    }
  }
  return views;
}

export function renderChecklists({ plan, baseUrl, logins = {} }) {
  const out = new Map();
  const views = seatViews(plan);

  for (const [testerKey, tester] of Object.entries(TESTERS)) {
    const { view, shared } = views.get(testerKey);
    const lines = [];
    lines.push(`# Tester week — ${tester.name}`);
    lines.push("");
    lines.push(
      `**This seat needs:** ${tester.needs}. **Sign in at:** ${baseUrl}/login${logins[testerKey] ? ` as ${logins[testerKey]}` : ""}.`,
    );
    lines.push("");
    lines.push(
      "**Write what you find in this document**, under the item it belongs to: what you expected, what you actually saw, and whether it stopped you. This file is yours — nobody else is editing it, and the links in it are yours alone.",
    );
    lines.push("");
    lines.push(
      "Work down the list. Open the link, check what you see against the line, and tick it. If it is wrong, missing, confusing or slow, write that underneath instead of ticking. Everything is safe to press except sending WhatsApp, which is switched off.",
    );
    lines.push("");
    let n = 0;
    for (const mission of MISSIONS) {
      const mine = WORKFLOWS.filter(
        (workflow) => !workflow.notAWorkflow && workflow.mission === mission.id,
      );
      if (mine.length === 0) continue;
      lines.push(`## ${mission.title}`);
      lines.push("");
      for (const workflow of mine) {
        n += 1;
        const later = workflow.arrivesWith
          ? ` _(part of this arrives with ${workflow.arrivesWith}; check what is there today)_`
          : "";
        lines.push(`### ${n}. ${workflow.name}${later}`);
        lines.push("");
        if (workflow.routes.length === 0)
          lines.push(`${BOX} No page of its own. ${workflow.expect}`);
        for (const template of workflow.routes) {
          const { route, missing } = resolveRoute(template, view);
          if (missing.length > 0) {
            lines.push(
              `${BOX} Open \`${template}\` — no example row for \`${missing.join("`, `")}\` in this load; skip and report if you expected one.`,
            );
            continue;
          }
          const contended = [...template.matchAll(/\{([^}]+)\}/g)]
            .map(([, key]) => shared.get(key))
            .filter(Boolean)
            .flat();
          // These four workflows end another seat's access. Everybody has to put
          // it back, or the tester whose account it was cannot finish their own
          // list.
          const reinstate = template.includes("{operator.other-seat}")
            ? " — **this is another tester's login. Reinstate it before you move on.**"
            : "";
          const note =
            contended.length > 0
              ? ` — **shared with ${[...new Set(contended)].join(" and ")}.** If it is not in the state below, write that down, but expect they got there first.`
              : "";
          lines.push(`${BOX} Open ${baseUrl}${route}${reinstate}${note}`);
        }
        lines.push(`${BOX} You should see: ${workflow.expect}`);
        lines.push("");
      }
    }
    lines.push("---");
    lines.push("");
    lines.push(
      `${n} items. Generated by \`showcase checklists\` for the ${plan.context.anchor} load; every link above resolves to a row that load created.`,
    );
    lines.push("");
    out.set(testerKey, lines.join("\n"));
  }
  return out;
}

/** Which workflows each tester covers, and which nobody does — for the coverage test. */
export function coverage() {
  const covered = new Map(Object.keys(TESTERS).map((key) => [key, []]));
  const uncovered = [];
  for (const workflow of WORKFLOWS) {
    if (workflow.notAWorkflow) continue;
    if (workflow.tester && covered.has(workflow.tester))
      covered.get(workflow.tester).push(workflow.id);
    else uncovered.push(workflow.id);
  }
  return { covered, uncovered };
}
