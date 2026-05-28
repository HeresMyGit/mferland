import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MAX_PLAYERS, type QuestId } from "@mferland/shared";
import { getActiveMferGptDailyQuestAssignment } from "./generatedDailyQuests.js";
import { getOpenClawWorkspacePath } from "./openclawContext.js";
import { type MferGptCommand } from "./mfergpt.js";

type MferlandLiveEvent = {
  at: number;
  text: string;
};

type MferlandLiveStatus = {
  roomId: string;
  playerCount: number;
  temporaryNpcCount: number;
  hostileNpcCount: number;
};

type MferlandLiveState = {
  startedAt: number;
  updatedAt: number;
  roomId: string;
  playerCount: number;
  maxPlayers: number;
  temporaryNpcCount: number;
  hostileNpcCount: number;
  commandCounts: Partial<Record<MferGptCommand, number>>;
  lastMferGptCommand: string;
  events: MferlandLiveEvent[];
};

const MAX_EVENTS = 14;
const WRITE_THROTTLE_MS = 30_000;
const LIVE_FILE_NAME = "mferland-live.md";

const liveState: MferlandLiveState = {
  startedAt: Date.now(),
  updatedAt: 0,
  roomId: "",
  playerCount: 0,
  maxPlayers: MAX_PLAYERS,
  temporaryNpcCount: 0,
  hostileNpcCount: 0,
  commandCounts: {},
  lastMferGptCommand: "none yet",
  events: [],
};

let writeTimer: NodeJS.Timeout | null = null;
let writeInFlight = false;
let writeQueued = false;
let lastWriteAt = 0;
let hasWarnedWriteFailure = false;

export function recordMferlandServerStarted(roomId: string, maxPlayers = MAX_PLAYERS) {
  liveState.roomId = roomId;
  liveState.maxPlayers = maxPlayers;
  addLiveEvent(`mferland room ${roomId} started`);
}

export function updateMferlandLiveStatus(status: MferlandLiveStatus) {
  liveState.roomId = status.roomId;
  liveState.playerCount = clampCount(status.playerCount);
  liveState.temporaryNpcCount = clampCount(status.temporaryNpcCount);
  liveState.hostileNpcCount = clampCount(status.hostileNpcCount);
  scheduleLiveMemoryWrite();
}

export function recordMferlandMferGptCommand({
  command,
  status,
  temporaryNpcCount,
}: {
  command: MferGptCommand;
  status: "ok" | "cooldown" | "error";
  temporaryNpcCount: number;
}) {
  liveState.commandCounts[command] = (liveState.commandCounts[command] ?? 0) + 1;
  liveState.lastMferGptCommand = `${command} (${status})`;

  if (command === "daily" || command === "event" || command === "spawn" || status !== "ok") {
    const detail = temporaryNpcCount > 0 ? `, ${temporaryNpcCount} temporary npcs` : "";
    addLiveEvent(`mferGPT ${command} command ${status}${detail}`);
    return;
  }

  scheduleLiveMemoryWrite();
}

export function recordMferlandQuestCompleted({
  questId,
  questTitle,
  level,
  nextQuestId,
  nextQuestTitle,
}: {
  questId: QuestId;
  questTitle: string;
  level: number;
  nextQuestId?: QuestId | null;
  nextQuestTitle?: string;
}) {
  const next = nextQuestId && nextQuestTitle ? ` next: ${nextQuestTitle}` : "";
  addLiveEvent(`quest completed: ${questTitle} (${questId}) at level ${level}.${next}`);
}

export function recordMferlandNpcDefeated({
  npcName,
  label,
  creditedPlayers,
}: {
  npcName: string;
  label: "boss" | "temporary npc";
  creditedPlayers: number;
}) {
  addLiveEvent(`${label} defeated: ${sanitizeLiveText(npcName)} by ${clampCount(creditedPlayers)} credited player(s)`);
}

function addLiveEvent(text: string) {
  liveState.events.unshift({
    at: Date.now(),
    text: sanitizeLiveText(text),
  });
  liveState.events = liveState.events.slice(0, MAX_EVENTS);
  scheduleLiveMemoryWrite();
}

function scheduleLiveMemoryWrite() {
  if (!isMferlandLiveMemoryEnabled()) return;
  liveState.updatedAt = Date.now();

  if (writeInFlight) {
    writeQueued = true;
    return;
  }

  const waitMs = Math.max(0, WRITE_THROTTLE_MS - (Date.now() - lastWriteAt));
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void writeLiveMemoryNow();
  }, waitMs);
  writeTimer.unref?.();
}

async function writeLiveMemoryNow() {
  if (!isMferlandLiveMemoryEnabled()) return;
  writeInFlight = true;
  writeQueued = false;

  try {
    const workspace = getOpenClawWorkspacePath();
    const workspaceStat = await stat(workspace).catch(() => null);
    if (!workspaceStat?.isDirectory()) return;

    const memoryDir = join(workspace, "memory");
    const livePath = join(memoryDir, LIVE_FILE_NAME);
    const tempPath = join(memoryDir, `.${LIVE_FILE_NAME}.${process.pid}.tmp`);
    await mkdir(memoryDir, { recursive: true });
    await writeFile(tempPath, `${renderLiveMemoryMarkdown()}\n`, "utf8");
    await rename(tempPath, livePath);
    lastWriteAt = Date.now();
    hasWarnedWriteFailure = false;
  } catch (error) {
    if (!hasWarnedWriteFailure) {
      hasWarnedWriteFailure = true;
      console.warn("mferland.live_memory_write_failed", error);
    }
  } finally {
    writeInFlight = false;
    if (writeQueued) scheduleLiveMemoryWrite();
  }
}

function renderLiveMemoryMarkdown() {
  const now = Date.now();
  const daily = getActiveMferGptDailyQuestAssignment(now);
  const commandSummary = Object.entries(liveState.commandCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([command, count]) => `- ${command}: ${count}`)
    .join("\n") || "- none yet";
  const eventSummary = liveState.events
    .map((event) => `- ${new Date(event.at).toISOString()}: ${event.text}`)
    .join("\n") || "- no notable events recorded yet";
  const shouldKnow = liveState.events[0]?.text
    ? liveState.events[0].text
    : "mferland is live; no major gameplay milestone has been recorded yet.";

  return [
    "# mferland live status",
    "",
    `Last updated: ${new Date(now).toISOString()}`,
    `Room: ${liveState.roomId || "town"}`,
    `Uptime: ${formatDuration(now - liveState.startedAt)}`,
    "",
    "## Current Game",
    `- Players online: ${liveState.playerCount}/${liveState.maxPlayers}`,
    `- Hostile NPCs active: ${liveState.hostileNpcCount}`,
    `- Temporary mferGPT NPCs: ${liveState.temporaryNpcCount}`,
    `- Active daily signal: ${daily.title}`,
    `- Daily objective: ${daily.objectiveLabel}`,
    `- Last mferGPT command: ${liveState.lastMferGptCommand}`,
    "",
    "## mferGPT Commands",
    commandSummary,
    "",
    "## Recent Notable Events",
    eventSummary,
    "",
    "## What Main mferGPT Should Know",
    `- ${shouldKnow}`,
  ].join("\n");
}

function isMferlandLiveMemoryEnabled() {
  const configured = process.env.MFERLAND_LIVE_MEMORY?.trim().toLowerCase();
  return configured !== "0" && configured !== "false" && configured !== "off" && configured !== "disabled";
}

function sanitizeLiveText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/0x[a-fA-F0-9]{40}/g, "0x...redacted")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "email-redacted")
    .trim()
    .slice(0, 220);
}

function clampCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
