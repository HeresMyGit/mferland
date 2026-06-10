#!/usr/bin/env node
import { readFileSync } from "node:fs";

const [, , logPathArg, bossIdArg = "raid-ogre-mfer"] = process.argv;

if (!logPathArg) {
  console.error("Usage: npm run summarize:combat -w @mferland/agent -- <combat-events.jsonl> [bossId]");
  process.exit(1);
}

const eventsById = new Map();
for (const line of readFileSync(logPathArg, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  if (row.event?.id) eventsById.set(row.event.id, row);
}

const events = [...eventsById.values()].sort((left, right) => {
  return (left.event.sentAt ?? 0) - (right.event.sentAt ?? 0);
});

const sessionNames = new Map();
for (const row of events) {
  const event = row.event;
  if (event.target?.id && event.targetName && event.targetName !== "bear market mfer") {
    sessionNames.set(event.target.id, event.targetName);
  }
}
for (const row of events) {
  const event = row.event;
  if (row.sessionId && row.agentName && !sessionNames.has(row.sessionId)) {
    sessionNames.set(row.sessionId, row.agentName);
  }
  if (event.sourceId && row.agentName && event.sourceId === row.sessionId && !sessionNames.has(event.sourceId)) {
    sessionNames.set(event.sourceId, row.agentName);
  }
}

function nameOf(id, fallback = "") {
  if (id === bossIdArg) return bossIdArg;
  return sessionNames.get(id) || fallback || id;
}

const damageToBoss = {};
const damageTaken = {};
const healsBySource = {};
const healsByTarget = {};
const deaths = [];
const killEvents = [];
let heals = 0;
let selfHeals = 0;
let firstBossDamageAt = null;
let lastBossDamageAt = null;

for (const row of events) {
  const event = row.event;
  const source = nameOf(event.sourceId, row.agentName);
  const target = nameOf(event.target?.id, event.targetName);

  if (event.target?.id === bossIdArg && event.amount > 0) {
    damageToBoss[source] = (damageToBoss[source] ?? 0) + event.amount;
    firstBossDamageAt ??= event.sentAt;
    lastBossDamageAt = event.sentAt;
  }
  if (event.sourceId === bossIdArg && event.target?.kind === "player" && event.amount > 0) {
    damageTaken[target] = (damageTaken[target] ?? 0) + event.amount;
  }
  if (event.actionId === "heal") {
    heals += 1;
    healsBySource[source] = (healsBySource[source] ?? 0) + 1;
    healsByTarget[target] = (healsByTarget[target] ?? 0) + 1;
    if (event.sourceId === event.target?.id) selfHeals += 1;
  }
  if (event.defeated) {
    const death = {
      at: event.sentAt,
      source,
      action: event.actionId,
      target,
      amount: event.amount,
    };
    deaths.push(death);
    if (event.target?.id === bossIdArg) killEvents.push(death);
  }
}

const summary = {
  logPath: logPathArg,
  bossId: bossIdArg,
  outcome: killEvents.length > 0 ? "kill" : "no_kill",
  uniqueEvents: events.length,
  fightDurationSeconds: firstBossDamageAt && lastBossDamageAt
    ? Number(((lastBossDamageAt - firstBossDamageAt) / 1000).toFixed(1))
    : null,
  heals,
  selfHeals,
  healsBySource,
  healsByTarget,
  damageToBoss,
  totalDamageToBoss: Object.values(damageToBoss).reduce((total, amount) => total + amount, 0),
  damageTaken,
  deaths,
  killEvents,
};

console.log(JSON.stringify(summary, null, 2));
