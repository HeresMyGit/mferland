import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  getMferGptDailyQuestAssignment,
  makeMferGptDailyQuestFlagsForAssignment,
  normalizeMferGptDailyQuestAssignment,
  stableHash,
  type MferGptDailyQuestAssignment,
} from "@mferland/shared";
import { getOpenClawWorkspacePath } from "./openclawContext.js";

type GeneratedDailyQuestCache = {
  dateKey: string;
  path: string;
  fingerprint: string;
  assignment: MferGptDailyQuestAssignment | null;
};

const MAX_GENERATED_DAILY_BYTES = 32 * 1024;
const DEFAULT_DAILY_QUEST_DIR_NAME = "mferland-daily-quests";

let generatedDailyQuestCache: GeneratedDailyQuestCache | null = null;
let lastInvalidGeneratedDailyFingerprint = "";

export function getActiveMferGptDailyQuestAssignment(now = Date.now()) {
  return getGeneratedMferGptDailyQuestAssignment(now) ?? getMferGptDailyQuestAssignment(now);
}

export function makeActiveMferGptDailyQuestFlags(now = Date.now()) {
  return makeMferGptDailyQuestFlagsForAssignment(getActiveMferGptDailyQuestAssignment(now));
}

export function getGeneratedMferGptDailyQuestAssignment(now = Date.now()) {
  const dateKey = formatUtcDate(now);
  const path = getGeneratedDailyQuestPath(dateKey);
  const fingerprint = getGeneratedDailyQuestFingerprint(path);

  if (
    generatedDailyQuestCache?.dateKey === dateKey
    && generatedDailyQuestCache.path === path
    && generatedDailyQuestCache.fingerprint === fingerprint
  ) {
    return generatedDailyQuestCache.assignment;
  }

  const assignment = readGeneratedDailyQuest(path, dateKey, fingerprint);
  generatedDailyQuestCache = {
    dateKey,
    path,
    fingerprint,
    assignment,
  };
  return assignment;
}

export function getGeneratedDailyQuestDirectory() {
  const configured = process.env.MFERLAND_DAILY_QUEST_DIR?.trim();
  if (configured) return configured;
  return join(getOpenClawWorkspacePath(), "data", DEFAULT_DAILY_QUEST_DIR_NAME);
}

function getGeneratedDailyQuestPath(dateKey: string) {
  return join(getGeneratedDailyQuestDirectory(), `${dateKey}.json`);
}

function getGeneratedDailyQuestFingerprint(path: string) {
  try {
    const entry = statSync(path);
    if (!entry.isFile()) return "missing";
    return `${entry.mtimeMs}:${entry.size}`;
  } catch {
    return "missing";
  }
}

function readGeneratedDailyQuest(path: string, dateKey: string, fingerprint: string) {
  if (fingerprint === "missing" || !existsSync(path)) return null;

  try {
    const rawText = readFileSync(path, "utf8");
    if (Buffer.byteLength(rawText, "utf8") > MAX_GENERATED_DAILY_BYTES) {
      warnInvalidGeneratedDaily(fingerprint, "file too large");
      return null;
    }

    const parsed = JSON.parse(rawText) as unknown;
    const assignment = normalizeGeneratedDailyQuestFile(parsed, dateKey);
    if (!assignment) {
      warnInvalidGeneratedDaily(fingerprint, "schema validation failed");
      return null;
    }

    return assignment;
  } catch (error) {
    warnInvalidGeneratedDaily(fingerprint, error instanceof Error ? error.message : "read failed");
    return null;
  }
}

function normalizeGeneratedDailyQuestFile(input: unknown, dateKey: string) {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const questDate = typeof record.questDate === "string" ? record.questDate.trim() : "";
  if (questDate && questDate !== dateKey) return null;

  const rawAssignment = toAssignmentInput(record, dateKey);
  return normalizeMferGptDailyQuestAssignment(rawAssignment);
}

function toAssignmentInput(record: Record<string, unknown>, dateKey: string) {
  const assignment = asRecord(record.assignment);
  if (assignment) return assignment;

  const content = asRecord(record.content);
  if (content) {
    const boss = asRecord(content.boss);
    const sourceDigest = asRecord(record.sourceDigest);
    const themes = Array.isArray(sourceDigest?.themes) ? sourceDigest?.themes : record.sourceThemes;
    const summary = firstString(content.storyText, content.description, sourceDigest?.summary, record.summary);
    const title = firstString(content.title, record.title);
    const idBase = `${dateKey}:${title}:${summary}:${boss?.name ?? ""}`;
    return {
      id: firstString(record.id, `generated-${dateKey}-${stableHash(idBase).toString(36)}`),
      title,
      summary,
      objectiveLabel: firstString(content.objectiveLabel, record.objectiveLabel),
      sourceThemes: themes,
      bossName: firstString(boss?.name, record.bossName),
      bossDialogue: firstString(boss?.dialogue, record.bossDialogue, summary),
      witnessName: firstString(content.witnessName, record.witnessName),
      witnessDialogue: firstString(content.witnessDialogue, record.witnessDialogue, summary),
      hintName: firstString(content.hintName, record.hintName),
      hintDialogue: firstString(content.hintDialogue, record.hintDialogue),
    };
  }

  const title = firstString(record.title);
  const summary = firstString(record.summary);
  const idBase = `${dateKey}:${title}:${summary}:${record.bossName ?? ""}`;
  return {
    ...record,
    id: firstString(record.id, `generated-${dateKey}-${stableHash(idBase).toString(36)}`),
  };
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function warnInvalidGeneratedDaily(fingerprint: string, reason: string) {
  if (lastInvalidGeneratedDailyFingerprint === fingerprint) return;
  lastInvalidGeneratedDailyFingerprint = fingerprint;
  console.warn("mfergpt.generated_daily_quest_ignored", { reason });
}

function formatUtcDate(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}
