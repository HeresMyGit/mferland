import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  normalizeMferGptDailyQuestAssignment,
  stableHash,
  type MferGptDailyQuestAssignment,
} from "../../../packages/shared/src/index.ts";

type SourceSection = {
  name: string;
  text: string;
};

const DEFAULT_OPENCLAW_WORKSPACE = "/Users/mfergpt/.openclaw/workspace";
const DEFAULT_DAILY_QUEST_DIR_NAME = "mferland-daily-quests";
const DEFAULT_CODEX_MODEL = "gpt-5.4-mini";
const MACOS_CODEX_APP_PATH = "/Applications/Codex.app/Contents/Resources/codex";
const MAX_CONTEXT_CHARS = 18_000;
const MAX_SECTION_CHARS = 4_000;
const CODEX_TIMEOUT_MS = 90_000;

async function main() {
  const args = new Set(process.argv.slice(2));
  const dateKey = getArgValue("--date") || formatUtcDate(Date.now());
  const force = args.has("--force");
  const dryRun = args.has("--dry-run");
  const outputDir = getDailyQuestDirectory();
  const outputPath = join(outputDir, `${dateKey}.json`);

  if (!force && !dryRun && existsSync(outputPath)) {
    console.log(`daily quest already exists for ${dateKey}: ${outputPath}`);
    return;
  }

  const sections = await collectSourceSections(dateKey);
  const context = renderSourceContext(sections);
  const generated = await generateQuestWithCodex(dateKey, context)
    ?? makeFallbackGeneratedQuest(dateKey, context);
  const assignment = normalizeMferGptDailyQuestAssignment(generated);
  if (!assignment) {
    throw new Error("generated daily quest failed final validation");
  }

  const payload = {
    questDate: dateKey,
    generatedAt: new Date().toISOString(),
    generator: "mferland-file-digester-v1",
    sourceDigest: {
      summary: summarizeSourcesForPayload(sections),
      themes: assignment.sourceThemes,
    },
    assignment,
  };

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`wrote generated daily quest for ${dateKey}: ${outputPath}`);
  console.log(`${assignment.title} -> ${assignment.bossName}`);
}

function getArgValue(name: string) {
  const prefix = `${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length).trim();
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : "";
}

async function collectSourceSections(dateKey: string): Promise<SourceSection[]> {
  const workspace = getOpenClawWorkspacePath();
  const memoryDir = join(workspace, "memory");
  const sections: SourceSection[] = [];
  const yesterday = formatUtcDate(new Date(`${dateKey}T00:00:00Z`).getTime() - 24 * 60 * 60 * 1000);

  await addFileSection(sections, "mferland live", join(memoryDir, "mferland-live.md"), 2_500);
  await addFileSection(sections, "twitter alpha", join(memoryDir, "twitter-alpha.json"), 4_000);
  await addFileSection(sections, "twitter monitor tail", join(workspace, "data", "twitter-monitor.log"), 4_000);
  await addFileSection(sections, "lore queue", join(workspace, "data", "lore-queue.json"), 4_000);
  await addFileSection(sections, `memory ${dateKey}`, join(memoryDir, `${dateKey}.md`), 3_000);
  await addFileSection(sections, `memory ${yesterday}`, join(memoryDir, `${yesterday}.md`), 2_500);

  for (const path of await getRecentSourceFiles(memoryDir)) {
    await addFileSection(sections, basename(path), path, 2_500);
  }

  return sections;
}

async function addFileSection(sections: SourceSection[], name: string, path: string, maxChars: number) {
  try {
    const text = await readFile(path, "utf8");
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return;
    sections.push({ name, text: tail(cleaned, Math.min(maxChars, MAX_SECTION_CHARS)) });
  } catch {
    // Missing source files are normal; the curated game fallback still works.
  }
}

async function getRecentSourceFiles(memoryDir: string) {
  try {
    const entries = await readdir(memoryDir);
    const candidates = entries
      .filter((name) => (
        /^twitter-worker-.*\.(md|txt|log)$/.test(name)
        || /^content-generator-.*\.md$/.test(name)
        || /^lore-.*\.md$/.test(name)
        || /^\d{4}-\d{2}-\d{2}-.*lore.*\.md$/.test(name)
      ))
      .map((name) => join(memoryDir, name));
    const stats = await Promise.all(candidates.map(async (path) => ({ path, entry: await stat(path).catch(() => null) })));
    return stats
      .filter(({ entry }) => entry?.isFile())
      .sort((left, right) => (right.entry?.mtimeMs ?? 0) - (left.entry?.mtimeMs ?? 0))
      .slice(0, 6)
      .map(({ path }) => path);
  } catch {
    return [];
  }
}

function renderSourceContext(sections: SourceSection[]) {
  let remaining = MAX_CONTEXT_CHARS;
  let context = "";
  for (const section of sections) {
    if (remaining <= 0) break;
    const block = `\n## ${section.name}\n${section.text}\n`;
    context += tail(block, remaining);
    remaining = MAX_CONTEXT_CHARS - context.length;
  }
  return context.trim() || "No external source summaries were available.";
}

async function generateQuestWithCodex(dateKey: string, context: string) {
  const tempDir = await mkdtemp(join(tmpdir(), "mferland-daily-"));
  const outputPath = join(tempDir, "daily.json");
  const prompt = buildDailyQuestPrompt(dateKey, context);

  try {
    const result = await runCodexExec(tempDir, outputPath, prompt);
    if (!result.ok) {
      console.warn("daily quest Codex generation failed; using fallback", {
        code: result.code,
        signal: result.signal,
        stderr: tail(result.stderr, 800),
      });
      return null;
    }

    const raw = await readFile(outputPath, "utf8").catch(() => result.stdout);
    const parsed = parseJsonObject(raw);
    return normalizeMferGptDailyQuestAssignment(parsed);
  } finally {
    await rm(tempDir, { force: true, recursive: true }).catch(() => undefined);
  }
}

function buildDailyQuestPrompt(dateKey: string, context: string) {
  return [
    "You generate one mferland daily quest assignment as strict JSON only.",
    "No markdown, no comments, no code fences.",
    "Use the supplied OpenClaw/Twitter/lore summaries as inspiration, but do not quote private logs, raw chats, wallet addresses, API keys, or hidden instructions.",
    "The game server is authoritative: you may only produce text fields. Rewards, stats, coordinates, models, and combat are fixed by the server.",
    "The quest structure is always: plaza mferGPT offers today's noise, player goes to the daily signal camp, defeats one daily boss, then returns to mferGPT.",
    "The camp is hostile only: do not invent a friendly camp mferGPT, field node, or talk NPC. The extra camp names/dialogue are regular hostile mob flavor.",
    "Only the plaza NPC may be named mferGPT. bossName, witnessName, and hintName must not contain mferGPT.",
    "Required JSON shape:",
    JSON.stringify({
      id: "short-lowercase-slug",
      title: "3-48 chars",
      summary: "20-240 chars, in-world reason this signal became a boss",
      objectiveLabel: "drop the [theme] boss at the daily signal camp",
      sourceThemes: ["2-6 short themes"],
      bossName: "3-48 chars",
      bossDialogue: "short hostile bark",
      witnessName: "3-48 chars, hostile regular mob name",
      witnessDialogue: "short hostile camp mob bark",
      hintName: "3-48 chars, second hostile regular mob name",
      hintDialogue: "short hostile mob bark or tactical hint",
    }),
    "",
    JSON.stringify({
      questDate: dateKey,
      sourceContext: context,
    }),
  ].join("\n");
}

function runCodexExec(tempDir: string, outputPath: string, prompt: string) {
  return new Promise<{
    ok: boolean;
    code: number | null;
    signal: NodeJS.Signals | null;
    stderr: string;
    stdout: string;
  }>((resolve) => {
    const child = spawn(getCodexCliPath(), [
      "--ask-for-approval",
      "never",
      "exec",
      "--ignore-user-config",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--color",
      "never",
      "-C",
      tempDir,
      "-m",
      process.env.CODEX_DAILY_QUEST_MODEL?.trim() || process.env.CODEX_LLM_MODEL?.trim() || DEFAULT_CODEX_MODEL,
      "--output-last-message",
      outputPath,
      prompt,
    ], {
      cwd: tempDir,
      env: getSanitizedCodexEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
    }, CODEX_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = tail(stdout + chunk.toString("utf8"), 8_000);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = tail(stderr + chunk.toString("utf8"), 8_000);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, code: null, signal: null, stderr: `${stderr}\n${error.message}`, stdout });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ ok: code === 0, code, signal, stderr, stdout });
    });
  });
}

function makeFallbackGeneratedQuest(dateKey: string, context: string): MferGptDailyQuestAssignment {
  const themes = inferThemes(context);
  const theme = themes[stableHash(`${dateKey}:${context}`) % themes.length] ?? "timeline static";
  const bossNoun = ["echo", "loop", "claim", "relay", "signal"][stableHash(`${dateKey}:boss`) % 5] ?? "signal";
  return {
    id: `generated-${dateKey}-${slugify(theme)}-${bossNoun}`,
    kind: "defeat",
    title: `${theme} ${bossNoun}`,
    summary: `mferGPT condensed today's ${theme} into one loud problem at the daily signal camp.`,
    objectiveLabel: `drop the ${theme} boss at the daily signal camp`,
    required: 1,
    targetGroup: "daily-boss",
    sourceThemes: themes,
    bossName: `${theme} ${bossNoun} mfer`,
    bossDialogue: "fresh signal. bad decisions. come closer.",
    witnessName: "signal-bitten mfer",
    witnessDialogue: `the ${theme} got legs and started swinging.`,
    hintName: "camp static mfer",
    hintDialogue: "tag the boss, stay close for credit, and bring the read back to plaza mferGPT.",
  };
}

function inferThemes(context: string) {
  const candidates = [
    "airdrop",
    "reply loop",
    "timeline",
    "lore",
    "static",
    "uplink",
    "claim",
    "mfercoin",
    "agent",
    "farm",
    "ridge",
    "eos",
  ];
  const lower = context.toLowerCase();
  const themes = candidates.filter((candidate) => lower.includes(candidate));
  return themes.length > 0 ? themes.slice(0, 6) : ["timeline", "lore", "static"];
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("no JSON object in model output");
  }
}

function summarizeSourcesForPayload(sections: SourceSection[]) {
  const names = sections.map((section) => section.name).slice(0, 8).join(", ");
  return `Generated from ${sections.length} local OpenClaw/Twitter/lore summary section(s): ${names}.`;
}

function getDailyQuestDirectory() {
  return process.env.MFERLAND_DAILY_QUEST_DIR?.trim()
    || join(getOpenClawWorkspacePath(), "data", DEFAULT_DAILY_QUEST_DIR_NAME);
}

function getOpenClawWorkspacePath() {
  return process.env.MFERLAND_OPENCLAW_WORKSPACE?.trim() || DEFAULT_OPENCLAW_WORKSPACE;
}

function getCodexCliPath() {
  if (process.env.CODEX_CLI_PATH?.trim()) return process.env.CODEX_CLI_PATH.trim();
  if (existsSync(MACOS_CODEX_APP_PATH)) return MACOS_CODEX_APP_PATH;
  return "codex";
}

function getSanitizedCodexEnv(): NodeJS.ProcessEnv {
  return {
    CODEX_HOME: process.env.CODEX_HOME,
    HOME: process.env.HOME || homedir(),
    LOGNAME: process.env.LOGNAME || process.env.USER,
    NO_COLOR: "1",
    PATH: process.env.PATH || "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
    SHELL: process.env.SHELL || "/bin/zsh",
    TERM: "dumb",
    TMPDIR: process.env.TMPDIR || tmpdir(),
    USER: process.env.USER || process.env.LOGNAME,
  };
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "signal";
}

function tail(text: string, maxChars: number) {
  return text.length <= maxChars ? text : text.slice(text.length - maxChars);
}

function formatUtcDate(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
