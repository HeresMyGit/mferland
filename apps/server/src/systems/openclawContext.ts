import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

type OpenClawContextFile = {
  name: string;
  path: string;
  maxChars: number;
};

type OpenClawContextCache = {
  fingerprint: string;
  text: string;
};

const DEFAULT_OPENCLAW_WORKSPACE = "/Users/mfergpt/.openclaw/workspace";
const DEFAULT_CONTEXT_MAX_CHARS = 12_000;
const RECENT_MEMORY_MAX_CHARS = 1_200;
const MEMORY_MAX_CHARS = 6_000;

let cachedContext: OpenClawContextCache | null = null;

export async function getOpenClawContext(now = new Date()) {
  if (!isOpenClawContextEnabled()) return "";

  const workspace = getOpenClawWorkspacePath();
  const files = getOpenClawContextFiles(workspace, now);
  const fingerprint = await getFilesFingerprint(files);
  if (cachedContext?.fingerprint === fingerprint) return cachedContext.text;

  const maxChars = getOpenClawContextMaxChars();
  let remaining = maxChars;
  let text = "";

  for (const file of files) {
    if (remaining <= 0) break;
    const fileText = await readContextFile(file);
    if (!fileText) continue;

    const section = `\n## ${file.name}\n\n${truncateText(fileText, Math.min(file.maxChars, remaining))}\n`;
    if (section.length > remaining) {
      text += truncateText(section, remaining);
      remaining = 0;
    } else {
      text += section;
      remaining -= section.length;
    }
  }

  cachedContext = {
    fingerprint,
    text: text.trim(),
  };
  return cachedContext.text;
}

export function getOpenClawWorkspacePath() {
  return process.env.MFERLAND_OPENCLAW_WORKSPACE?.trim() || DEFAULT_OPENCLAW_WORKSPACE;
}

function isOpenClawContextEnabled() {
  const configured = process.env.MFERLAND_OPENCLAW_CONTEXT?.trim().toLowerCase();
  return configured !== "0" && configured !== "false" && configured !== "off" && configured !== "disabled";
}

function getOpenClawContextMaxChars() {
  const configured = Number(process.env.MFERLAND_OPENCLAW_CONTEXT_MAX_CHARS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_CONTEXT_MAX_CHARS;
}

function getOpenClawContextFiles(workspace: string, now: Date): OpenClawContextFile[] {
  const today = toDateKey(now);
  const yesterday = toDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  return [
    { name: "SOUL", path: join(workspace, "SOUL.md"), maxChars: 2_000 },
    { name: "IDENTITY", path: join(workspace, "IDENTITY.md"), maxChars: 3_000 },
    { name: "USER", path: join(workspace, "USER.md"), maxChars: 1_200 },
    { name: "LONG-TERM MEMORY", path: join(workspace, "MEMORY.md"), maxChars: MEMORY_MAX_CHARS },
    { name: `RECENT MEMORY ${today}`, path: join(workspace, "memory", `${today}.md`), maxChars: RECENT_MEMORY_MAX_CHARS },
    { name: `RECENT MEMORY ${yesterday}`, path: join(workspace, "memory", `${yesterday}.md`), maxChars: RECENT_MEMORY_MAX_CHARS },
  ];
}

async function getFilesFingerprint(files: OpenClawContextFile[]) {
  const parts = await Promise.all(files.map(async (file) => {
    const entry = await stat(file.path).catch(() => null);
    if (!entry?.isFile()) return `${file.path}:missing`;
    return `${file.path}:${entry.mtimeMs}:${entry.size}`;
  }));
  return parts.join("|");
}

async function readContextFile(file: OpenClawContextFile) {
  try {
    const text = await readFile(file.path, "utf8");
    return text.trim();
  } catch {
    return "";
  }
}

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  if (maxChars <= 32) return text.slice(0, maxChars);
  return `...${text.slice(text.length - maxChars + 3)}`;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
