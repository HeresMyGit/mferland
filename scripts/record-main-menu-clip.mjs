import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB_URL = process.env.MAIN_MENU_CAPTURE_WEB_URL ?? "http://127.0.0.1:5173";
const SERVER_URL = process.env.MAIN_MENU_CAPTURE_SERVER_URL ?? "ws://127.0.0.1:2567";
const SERVER_HEALTH_URL = SERVER_URL.replace(/^ws/, "http").replace(/\/$/, "") + "/health";
const OUTPUT_DIR = process.env.MAIN_MENU_CAPTURE_OUTPUT_DIR
  ? path.resolve(process.env.MAIN_MENU_CAPTURE_OUTPUT_DIR)
  : path.join(ROOT_DIR, "captures", "main-menu-5s");
const RAW_DIR = path.join(OUTPUT_DIR, "raw");
const MP4_DIR = path.join(OUTPUT_DIR, "mp4");
const THUMBNAIL_DIR = path.join(OUTPUT_DIR, "thumbnails");
const VIEWPORT = { width: 1280, height: 720 };
const OUTPUT_FPS = Number(process.env.MAIN_MENU_CAPTURE_FPS ?? 30);
const DURATION_MS = Number(process.env.MAIN_MENU_CAPTURE_DURATION_MS ?? 5000);
const WARMUP_MS = Number(process.env.MAIN_MENU_CAPTURE_WARMUP_MS ?? 4200);
const WINDOW_POSITION = {
  x: Number(process.env.MAIN_MENU_CAPTURE_WINDOW_X ?? 24),
  y: Number(process.env.MAIN_MENU_CAPTURE_WINDOW_Y ?? 56),
};
const WINDOW_CHROME_TOP = Number(process.env.MAIN_MENU_CAPTURE_CHROME_TOP ?? 32);
const WINDOW_SIZE = {
  width: Number(process.env.MAIN_MENU_CAPTURE_WINDOW_WIDTH ?? VIEWPORT.width),
  height: Number(process.env.MAIN_MENU_CAPTURE_WINDOW_HEIGHT ?? VIEWPORT.height + WINDOW_CHROME_TOP),
};
const CAPTURE_RECT = parseCaptureRect(process.env.MAIN_MENU_CAPTURE_RECT) ?? {
  x: Number(process.env.MAIN_MENU_CAPTURE_X ?? WINDOW_POSITION.x),
  y: Number(process.env.MAIN_MENU_CAPTURE_Y ?? WINDOW_POSITION.y + WINDOW_CHROME_TOP),
  width: Number(process.env.MAIN_MENU_CAPTURE_WIDTH ?? VIEWPORT.width),
  height: Number(process.env.MAIN_MENU_CAPTURE_HEIGHT ?? VIEWPORT.height),
};
const SCREEN_DISPLAY = Number(process.env.MAIN_MENU_CAPTURE_DISPLAY ?? 1);

await mkdir(RAW_DIR, { recursive: true });
await mkdir(MP4_DIR, { recursive: true });
await mkdir(THUMBNAIL_DIR, { recursive: true });

const startedProcesses = [];
await ensureDevServers();

const profileDir = await mkdtemp(path.join(tmpdir(), "mferland-main-menu-capture-"));
const browser = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  args: [
    `--app=${WEB_URL}`,
    `--window-position=${WINDOW_POSITION.x},${WINDOW_POSITION.y}`,
    `--window-size=${WINDOW_SIZE.width},${WINDOW_SIZE.height}`,
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--force-device-scale-factor=1",
  ],
});

try {
  const page = browser.pages()[0] ?? await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`[page] ${message.text()}`);
  });
  page.on("pageerror", (error) => console.error(`[page] ${error.message}`));

  await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.bringToFront();
  await activateChromium();
  await page.waitForTimeout(WARMUP_MS);

  const rawMovie = path.join(RAW_DIR, "main-menu-5s.mov");
  const mp4File = path.join(MP4_DIR, "main-menu-5s.mp4");
  const thumbnail = path.join(THUMBNAIL_DIR, "main-menu-5s.png");
  await rm(rawMovie, { force: true });

  const recorder = startNativeScreenRecording(rawMovie, DURATION_MS);
  await recorder.done;

  if (!existsSync(rawMovie)) {
    throw new Error("No native screen recording was written. Check macOS Screen Recording permission for Codex.");
  }

  runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    rawMovie,
    "-vf",
    `fps=${OUTPUT_FPS},scale=${VIEWPORT.width}:${VIEWPORT.height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${VIEWPORT.width}:${VIEWPORT.height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "16",
    "-movflags",
    "+faststart",
    mp4File,
  ]);
  runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    "00:00:02",
    "-i",
    mp4File,
    "-frames:v",
    "1",
    thumbnail,
  ]);

  await writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify({
    createdAt: new Date().toISOString(),
    captureMode: "main-menu-native-screencapture",
    webUrl: WEB_URL,
    outputDir: OUTPUT_DIR,
    file: mp4File,
    thumbnail,
    durationMs: DURATION_MS,
    viewport: VIEWPORT,
    outputFps: OUTPUT_FPS,
    windowPosition: WINDOW_POSITION,
    windowSize: WINDOW_SIZE,
    screenDisplay: SCREEN_DISPLAY,
    captureRect: CAPTURE_RECT,
    encodePreset: "slow",
    encodeCrf: "16",
  }, null, 2)}\n`);
  await writeFile(path.join(OUTPUT_DIR, "HANDOFF.md"), `# Main Menu Clip Handoff

Native recording of the actual mferland main menu/auth screen, left to idle for roughly 5 seconds.

| Clip | MP4 |
| --- | --- |
| main menu idle | \`mp4/main-menu-5s.mp4\` |

Supporting files:

- \`manifest.json\`: machine-readable capture details and absolute paths.
- \`thumbnails/main-menu-5s.png\`: still frame from roughly two seconds in.

Re-run command:

\`\`\`sh
node scripts/record-main-menu-clip.mjs
\`\`\`
`);
  await rm(RAW_DIR, { recursive: true, force: true });
  console.log(`wrote main menu clip to ${mp4File}`);
} finally {
  await browser.close().catch(() => {});
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  stopStartedProcesses();
}

async function ensureDevServers() {
  const buildResult = spawnSync("npm", ["run", "build", "-w", "@mferland/shared"], {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });
  if (buildResult.status !== 0) throw new Error(`shared build failed with status ${buildResult.status}`);
  await sleep(1500);

  if (!(await isHttpReady(SERVER_HEALTH_URL))) {
    startedProcesses.push(startProcess("server", ["run", "dev:server"], {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: "2567",
    }));
  }
  await waitForHttp(SERVER_HEALTH_URL, "server");

  if (!(await isHttpReady(WEB_URL))) {
    startedProcesses.push(startProcess("web", ["run", "dev", "-w", "@mferland/web", "--", "--host", "127.0.0.1", "--port", "5173"], {
      VITE_SERVER_URL: SERVER_URL,
    }));
  }
  await waitForHttp(WEB_URL, "web");
}

function startProcess(label, args, env = {}) {
  const child = spawn("npm", args, {
    cwd: ROOT_DIR,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) console.error(`[${label}] exited with code ${code}`);
  });
  return child;
}

async function isHttpReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForHttp(url, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90000) {
    if (await isHttpReady(url)) return;
    await sleep(600);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function stopStartedProcesses() {
  for (const child of startedProcesses) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

function startNativeScreenRecording(outputFile, durationMs) {
  const seconds = Math.max(1, Math.ceil(durationMs / 1000));
  const rectArg = `-R${Math.round(CAPTURE_RECT.x)},${Math.round(CAPTURE_RECT.y)},${Math.round(CAPTURE_RECT.width)},${Math.round(CAPTURE_RECT.height)}`;
  const child = spawn("screencapture", [
    "-x",
    "-v",
    "-V",
    String(seconds),
    "-D",
    String(SCREEN_DISPLAY),
    rectArg,
    outputFile,
  ], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return {
    done: waitForChild(child, seconds * 1000 + 15000).then(({ code, signal }) => {
      if (code === 0) return;
      const details = stderr.trim() ? `: ${stderr.trim()}` : signal ? `: ${signal}` : "";
      throw new Error(`screencapture failed${details}. Allow Codex Screen Recording access in macOS, then rerun.`);
    }),
  };
}

async function waitForChild(child, timeoutMs) {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Timed out waiting for ${child.spawnfile}`));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

async function activateChromium() {
  for (const appName of ["Chromium", "Google Chrome for Testing", "Google Chrome"]) {
    const result = spawnSync("osascript", ["-e", `tell application "${appName}" to activate`], {
      stdio: "ignore",
    });
    if (result.status === 0) {
      await sleep(350);
      return;
    }
  }
}

function parseCaptureRect(value) {
  if (!value) return null;
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error("MAIN_MENU_CAPTURE_RECT must be formatted as x,y,width,height");
  }
  const [x, y, width, height] = parts;
  return { x, y, width, height };
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`ffmpeg failed with status ${result.status}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
