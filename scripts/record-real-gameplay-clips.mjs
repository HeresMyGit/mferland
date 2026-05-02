import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "colyseus.js";
import { chromium } from "playwright";
import { ROOM_NAME } from "@mferland/shared";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB_URL = process.env.REAL_CAPTURE_WEB_URL ?? "http://127.0.0.1:5173";
const SERVER_URL = process.env.REAL_CAPTURE_SERVER_URL ?? "ws://127.0.0.1:2567";
const SERVER_HEALTH_URL = SERVER_URL.replace(/^ws/, "http").replace(/\/$/, "") + "/health";
const CAPTURE_HUD = process.env.REAL_CAPTURE_HUD !== "0";
const CAPTURE_VARIANT = CAPTURE_HUD ? "hud" : "nohud";
const CAPTURE_SERIES = process.env.REAL_CAPTURE_SERIES?.trim() || "real-hq";
const PLAYER_NAME = process.env.REAL_CAPTURE_PLAYER_NAME?.trim() || "signal scout";
const OUTPUT_DIR = process.env.REAL_CAPTURE_OUTPUT_DIR
  ? path.resolve(process.env.REAL_CAPTURE_OUTPUT_DIR)
  : path.join(ROOT_DIR, "captures", `gameplay-clips-${CAPTURE_SERIES}-${CAPTURE_VARIANT}`);
const RAW_DIR = path.join(OUTPUT_DIR, "raw");
const MP4_DIR = path.join(OUTPUT_DIR, "mp4");
const THUMBNAIL_DIR = path.join(OUTPUT_DIR, "thumbnails");
const VIEWPORT = { width: 1280, height: 720 };
const OUTPUT_FPS = Number(process.env.REAL_CAPTURE_FPS ?? 30);
const WINDOW_POSITION = {
  x: Number(process.env.REAL_CAPTURE_WINDOW_X ?? 24),
  y: Number(process.env.REAL_CAPTURE_WINDOW_Y ?? 56),
};
const WINDOW_CHROME_TOP = Number(process.env.REAL_CAPTURE_CHROME_TOP ?? 32);
const WINDOW_SIZE = {
  width: Number(process.env.REAL_CAPTURE_WINDOW_WIDTH ?? VIEWPORT.width),
  height: Number(process.env.REAL_CAPTURE_WINDOW_HEIGHT ?? VIEWPORT.height + WINDOW_CHROME_TOP),
};
const CAPTURE_RECT = parseCaptureRect(process.env.REAL_CAPTURE_RECT) ?? {
  x: Number(process.env.REAL_CAPTURE_X ?? WINDOW_POSITION.x),
  y: Number(process.env.REAL_CAPTURE_Y ?? WINDOW_POSITION.y + WINDOW_CHROME_TOP),
  width: Number(process.env.REAL_CAPTURE_WIDTH ?? VIEWPORT.width),
  height: Number(process.env.REAL_CAPTURE_HEIGHT ?? VIEWPORT.height),
};
const SCREEN_DISPLAY = Number(process.env.REAL_CAPTURE_DISPLAY ?? 1);
const SCREEN_PREROLL_MS = Number(process.env.REAL_CAPTURE_PREROLL_MS ?? 900);
const CLIP_LIMIT = process.env.REAL_CAPTURE_CLIP_LIMIT ? Number(process.env.REAL_CAPTURE_CLIP_LIMIT) : 0;
const ENCODE_PRESET = process.env.REAL_CAPTURE_PRESET ?? "slow";
const ENCODE_CRF = process.env.REAL_CAPTURE_CRF ?? "16";
const ACTION_TARGET = (id) => ({ kind: "npc", id });
const yawTo = ([fromX, fromZ], [toX, toZ]) => Math.atan2(toX - fromX, toZ - fromZ);

const CLIPS = [
  {
    id: "ridge_real_hud_static_baron",
    title: "real HUD Signal Ridge static baron",
    durationMs: 12000,
    targetId: "static-baron-nox",
    setup: async ({ page, localSessionId, bots }) => {
      await setupPartyAt(page, bots, {
        local: [139.8, -126.5, yawTo([139.8, -126.5], [146.2, -121.8])],
        bots: [
          [143.2, -124.2, yawTo([143.2, -124.2], [146.2, -121.8])],
          [137.1, -121.3, yawTo([137.1, -121.3], [146.2, -121.8])],
          [147.5, -128.8, yawTo([147.5, -128.8], [146.2, -121.8])],
        ],
      });
      await setupNpc(page, {
        npcId: "static-baron-nox",
        name: "static baron mfer",
        x: 146.2,
        z: -121.8,
        yaw: 2.8,
        health: 980,
        maxHealth: 980,
        leashRadius: 24,
        combatStyle: "melee",
        aggroTargetId: localSessionId,
      });
      await page.evaluate((target) => window.__MFERLAND_REAL_GAME_CAPTURE.selectTarget(target), ACTION_TARGET("static-baron-nox"));
    },
    play: async ({ page, bots }) => {
      await sendChat(page, "ridge pull. hud on.");
      const botLoops = [
        startBotOrbit(bots[0], { center: [146.2, -121.8], radius: 4.6, actionId: "taunt", targetId: "static-baron-nox" }),
        startBotOrbit(bots[1], { center: [146.2, -121.8], radius: 9.2, actionId: "signalShot", targetId: "static-baron-nox", phase: 1.8 }),
        startBotOrbit(bots[2], { center: [146.2, -121.8], radius: 10.5, actionId: "multishot", targetId: "static-baron-nox", phase: 3.1 }),
      ];
      await localCombat(page, "static-baron-nox", [
        [500, "signalShot"],
        [1900, "shoot"],
        [3400, "fireblast"],
        [7700, "frostNova"],
        [9300, "whirlwind"],
      ]);
      stopLoops(botLoops);
    },
  },
  {
    id: "farm_real_hud_hog_charge",
    title: "real HUD Red-Eye Farm hog charge",
    durationMs: 10500,
    targetId: "wild-hog-boar",
    setup: async ({ page, localSessionId, bots }) => {
      await setupPartyAt(page, bots, {
        local: [-82.6, 87.8, yawTo([-82.6, 87.8], [-74.8, 95.4])],
        bots: [
          [-86.0, 90.3, yawTo([-86.0, 90.3], [-74.8, 95.4])],
          [-76.2, 90.8, yawTo([-76.2, 90.8], [-74.8, 95.4])],
          [-84.2, 98.0, yawTo([-84.2, 98.0], [-74.8, 95.4])],
        ],
      });
      await setupNpc(page, {
        npcId: "wild-hog-boar",
        name: "old boar",
        role: "beast",
        model: "hog",
        x: -70.8,
        z: 97.8,
        yaw: -2.4,
        health: 160,
        maxHealth: 160,
        leashRadius: 28,
        aggroTargetId: localSessionId,
      });
      for (const [npcId, x, z] of [
        ["wild-hog-tusk", -73.3, 94.4],
        ["wild-hog-bristle", -83.8, 94.2],
        ["wild-hog-snort", -88.4, 90.6],
      ]) {
        await setupNpc(page, {
          npcId,
          name: "wild hog",
          role: "beast",
          model: "hog",
          x,
          z,
          yaw: -1.2,
          health: 70,
          maxHealth: 70,
          leashRadius: 24,
          aggroTargetId: localSessionId,
        });
      }
      await page.evaluate((target) => window.__MFERLAND_REAL_GAME_CAPTURE.selectTarget(target), ACTION_TARGET("wild-hog-boar"));
    },
    play: async ({ page, bots }) => {
      await sendChat(page, "farm pull, hogs loose");
      const botLoops = [
        startBotOrbit(bots[0], { center: [-76.8, 94.2], radius: 5.6, actionId: "taunt", targetId: "wild-hog-boar" }),
        startBotOrbit(bots[1], { center: [-76.8, 94.2], radius: 8.4, actionId: "multishot", targetId: "wild-hog-tusk", phase: 1.2 }),
        startBotOrbit(bots[2], { center: [-76.8, 94.2], radius: 7.8, actionId: "heal", targetId: bots[0].sessionId, targetKind: "player", phase: 2.4 }),
      ];
      await holdKeys(page, ["Shift", "w"], 1700);
      await localCombat(page, "wild-hog-boar", [
        [400, "attack"],
        [1800, "whirlwind"],
        [4200, "frostNova"],
        [6500, "signalShot"],
      ]);
      stopLoops(botLoops);
    },
  },
  {
    id: "plaza_real_hud_training_combo",
    title: "real HUD plaza training combo",
    durationMs: 9500,
    targetId: "training-dummy-left",
    setup: async ({ page, bots }) => {
      await setupPartyAt(page, bots, {
        local: [-4.8, -8.8, yawTo([-4.8, -8.8], [-9.1, -12.4])],
        bots: [
          [-7.0, -8.5, yawTo([-7.0, -8.5], [-9.1, -12.4])],
          [-3.0, -12.2, yawTo([-3.0, -12.2], [-9.1, -12.4])],
          [-10.8, -14.8, yawTo([-10.8, -14.8], [-9.1, -12.4])],
        ],
      });
      await setupNpc(page, {
        npcId: "training-dummy-left",
        name: "bonk dummy",
        role: "enemy",
        model: "training-dummy",
        x: -10.5,
        z: -11.5,
        yaw: 2.5,
        health: 220,
        maxHealth: 220,
        isImmortal: true,
        leashRadius: 0,
      });
      await setupNpc(page, {
        npcId: "training-dummy-right",
        name: "ranged dummy",
        role: "enemy",
        model: "training-dummy",
        x: -7.8,
        z: -13.8,
        yaw: 2.2,
        health: 220,
        maxHealth: 220,
        isImmortal: true,
        leashRadius: 0,
      });
      await page.evaluate((target) => window.__MFERLAND_REAL_GAME_CAPTURE.selectTarget(target), ACTION_TARGET("training-dummy-left"));
    },
    play: async ({ page, bots }) => {
      const botLoops = [
        startBotOrbit(bots[0], { center: [-9.1, -12.4], radius: 3.2, actionId: "taunt", targetId: "training-dummy-left" }),
        startBotOrbit(bots[1], { center: [-9.1, -12.4], radius: 5.2, actionId: "fireblast", targetId: "training-dummy-right", phase: 1.4 }),
        startBotOrbit(bots[2], { center: [-9.1, -12.4], radius: 4.5, actionId: "heal", targetId: bots[0].sessionId, targetKind: "player", phase: 2.8 }),
      ];
      await holdKeys(page, ["w"], 900);
      await holdKeys(page, [" "], 240);
      await localCombat(page, "training-dummy-left", [
        [200, "attack"],
        [1300, "whirlwind"],
        [3100, "signalShot"],
        [5200, "fireblast"],
      ]);
      stopLoops(botLoops);
    },
  },
  {
    id: "ridge_real_hud_ogre_raid",
    title: "real HUD huge mfer ogre raid",
    durationMs: 12000,
    targetId: "raid-ogre-mfer",
    setup: async ({ page, localSessionId, bots }) => {
      await setupPartyAt(page, bots, {
        local: [138.5, -121.0, yawTo([138.5, -121.0], [146.4, -116.2])],
        bots: [
          [145.3, -119.7, yawTo([145.3, -119.7], [146.4, -116.2])],
          [136.8, -114.9, yawTo([136.8, -114.9], [146.4, -116.2])],
          [149.2, -115.2, yawTo([149.2, -115.2], [146.4, -116.2])],
        ],
      });
      await setupNpc(page, {
        npcId: "raid-ogre-mfer",
        name: "Huge mfer ogre",
        role: "farmer",
        model: "mfer",
        x: 146.4,
        z: -116.2,
        yaw: -2.6,
        health: 2400,
        maxHealth: 2400,
        leashRadius: 30,
        combatStyle: "melee",
        aggroTargetId: localSessionId,
      });
      await page.evaluate((target) => window.__MFERLAND_REAL_GAME_CAPTURE.selectTarget(target), ACTION_TARGET("raid-ogre-mfer"));
    },
    play: async ({ page, bots }) => {
      await sendChat(page, "ogre at relay. stack up.");
      const botLoops = [
        startBotOrbit(bots[0], { center: [146.4, -116.2], radius: 5.2, actionId: "taunt", targetId: "raid-ogre-mfer" }),
        startBotOrbit(bots[1], { center: [146.4, -116.2], radius: 10.5, actionId: "iceBlast", targetId: "raid-ogre-mfer", phase: 1.6 }),
        startBotOrbit(bots[2], { center: [146.4, -116.2], radius: 9.4, actionId: "heal", targetId: bots[0].sessionId, targetKind: "player", phase: 2.7 }),
      ];
      await localCombat(page, "raid-ogre-mfer", [
        [600, "signalShot"],
        [2100, "shoot"],
        [4300, "frostNova"],
        [7000, "iceBlast"],
        [9300, "fireblast"],
      ]);
      stopLoops(botLoops);
    },
  },
  {
    id: "ridge_real_hud_mfergpt_duel",
    title: "real HUD signal-fried mferGPT duel",
    durationMs: 10000,
    targetId: "static-mage-ori",
    setup: async ({ page, localSessionId, bots }) => {
      await setupPartyAt(page, bots, {
        local: [143.0, -107.8, yawTo([143.0, -107.8], [150.2, -113.4])],
        bots: [
          [139.8, -106.6, yawTo([139.8, -106.6], [150.2, -113.4])],
          [149.4, -109.2, yawTo([149.4, -109.2], [150.2, -113.4])],
          [143.2, -102.3, yawTo([143.2, -102.3], [150.2, -113.4])],
        ],
      });
      await setupNpc(page, {
        npcId: "static-mage-ori",
        name: "signal-fried mferGPT",
        role: "farmer",
        model: "mfergpt",
        x: 150.2,
        z: -113.4,
        yaw: -0.2,
        health: 420,
        maxHealth: 420,
        leashRadius: 22,
        combatStyle: "caster",
        aggroTargetId: localSessionId,
      });
      await page.evaluate((target) => window.__MFERLAND_REAL_GAME_CAPTURE.selectTarget(target), ACTION_TARGET("static-mage-ori"));
    },
    play: async ({ page, bots }) => {
      await sendChat(page, "@mfergpt room scan");
      const botLoops = [
        startBotOrbit(bots[0], { center: [150.2, -113.4], radius: 4.6, actionId: "taunt", targetId: "static-mage-ori" }),
        startBotOrbit(bots[1], { center: [150.2, -113.4], radius: 9.2, actionId: "signalShot", targetId: "static-mage-ori", phase: 1.2 }),
        startBotOrbit(bots[2], { center: [150.2, -113.4], radius: 8.5, actionId: "heal", targetId: bots[0].sessionId, targetKind: "player", phase: 2.4 }),
      ];
      await localCombat(page, "static-mage-ori", [
        [500, "shoot"],
        [2200, "fireblast"],
        [5700, "frostNova"],
        [7600, "iceBlast"],
      ]);
      stopLoops(botLoops);
    },
  },
];

await mkdir(RAW_DIR, { recursive: true });
await mkdir(MP4_DIR, { recursive: true });
await mkdir(THUMBNAIL_DIR, { recursive: true });

const startedProcesses = [];
await ensureDevServers();

const botClient = new Client(SERVER_URL);
const bots = await Promise.all([
  makeBot(botClient, "gate guard", 4441),
  makeBot(botClient, "rune caster", 4442),
  makeBot(botClient, "field medic", 4443),
]);

const captureUrl = `${WEB_URL}/?realCapture=1&realCaptureHud=${CAPTURE_HUD ? "1" : "0"}&name=${encodeURIComponent(PLAYER_NAME)}`;
const profileDir = await mkdtemp(path.join(tmpdir(), "mferland-real-capture-"));
const browser = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  args: [
    `--app=${captureUrl}`,
    `--window-position=${WINDOW_POSITION.x},${WINDOW_POSITION.y}`,
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--force-device-scale-factor=1",
    `--window-size=${WINDOW_SIZE.width},${WINDOW_SIZE.height}`,
  ],
});
const page = browser.pages()[0] ?? await browser.newPage();
page.on("console", (message) => {
  if (message.type() === "error") console.error(`[page] ${message.text()}`);
});
page.on("pageerror", (error) => console.error(`[page] ${error.message}`));

const manifest = {
  createdAt: new Date().toISOString(),
  captureMode: "real-game-window-native-screencapture",
  webUrl: WEB_URL,
  serverUrl: SERVER_URL,
  outputDir: OUTPUT_DIR,
  mp4Dir: MP4_DIR,
  thumbnailDir: THUMBNAIL_DIR,
  variant: CAPTURE_VARIANT,
  hud: CAPTURE_HUD,
  playerName: PLAYER_NAME,
  viewport: VIEWPORT,
  outputFps: OUTPUT_FPS,
  series: CAPTURE_SERIES,
  encodePreset: ENCODE_PRESET,
  encodeCrf: ENCODE_CRF,
  windowPosition: WINDOW_POSITION,
  windowSize: WINDOW_SIZE,
  screenDisplay: SCREEN_DISPLAY,
  captureRect: CAPTURE_RECT,
  noOpticalFlowInterpolation: true,
  clips: [],
};

try {
  const selectedClips = CLIP_LIMIT > 0 ? CLIPS.slice(0, CLIP_LIMIT) : CLIPS;
  for (let index = 0; index < selectedClips.length; index += 1) {
    const clip = selectedClips[index];
    const variantClipId = makeVariantClipId(clip.id);
    const stem = `${String(index + 1).padStart(2, "0")}-${variantClipId}`;
    console.log(`recording ${stem}`);

    await page.goto(captureUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.bringToFront();
    await activateChromium();
    try {
      await page.waitForFunction(() => window.__MFERLAND_REAL_GAME_CAPTURE?.status === "connected" && window.__MFERLAND_REAL_GAME_CAPTURE?.sessionId, null, { timeout: 90000 });
    } catch {
      throw new Error("Real capture bridge was unavailable. Stop the existing web dev server or restart it with VITE_ENABLE_REAL_CAPTURE=1; this script sets that flag when it starts Vite itself.");
    }
    await page.evaluate(() => window.__MFERLAND_REAL_GAME_CAPTURE.boost(14));
    for (const bot of bots) bot.room.send("debugBoostPlayer", { level: 14, maxTalents: true });
    await page.waitForTimeout(9000);

    const localSessionId = await page.evaluate(() => window.__MFERLAND_REAL_GAME_CAPTURE.sessionId);
    await clip.setup({ page, localSessionId, bots });
    await page.mouse.click(VIEWPORT.width / 2, VIEWPORT.height / 2);
    await setPlayableCamera(page);
    await page.waitForTimeout(1800);

    const rawMovie = path.join(RAW_DIR, `${stem}.mov`);
    await rm(rawMovie, { force: true });
    const recorder = startNativeScreenRecording(rawMovie, clip.durationMs + SCREEN_PREROLL_MS);
    const recordingDone = recorder.done.catch((error) => error);
    await page.waitForTimeout(SCREEN_PREROLL_MS);
    const clipStartedAt = Date.now();
    await clip.play({ page, localSessionId, bots });
    await page.waitForTimeout(Math.max(0, clip.durationMs - (Date.now() - clipStartedAt)));
    const recordingResult = await recordingDone;
    if (recordingResult instanceof Error) throw recordingResult;

    if (!existsSync(rawMovie)) {
      throw new Error(`No native screen recording was written for ${clip.id}. Check macOS Screen Recording permission for Codex.`);
    }
    const mp4File = path.join(MP4_DIR, `${stem}.mp4`);
    const thumbnail = path.join(THUMBNAIL_DIR, `${stem}.png`);
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
      ENCODE_PRESET,
      "-crf",
      ENCODE_CRF,
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
      "00:00:04",
      "-i",
      mp4File,
      "-frames:v",
      "1",
      thumbnail,
    ]);

    manifest.clips.push({
      id: variantClipId,
      title: makeVariantTitle(clip.title),
      file: mp4File,
      thumbnail,
      durationMs: clip.durationMs,
      targetId: clip.targetId,
    });
  }
} finally {
  await browser.close().catch(() => {});
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  for (const bot of bots) {
    void bot.room.leave().catch(() => {});
  }
  stopStartedProcesses();
}

const contactSheet = path.join(THUMBNAIL_DIR, "contact-sheet.png");
makeContactSheet(manifest.clips.map((clip) => clip.thumbnail), contactSheet);
manifest.contactSheet = contactSheet;
await writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(OUTPUT_DIR, "HANDOFF.md"), makeHandoff(manifest));
await rm(RAW_DIR, { recursive: true, force: true });
console.log(`wrote ${manifest.clips.length} real-game clips to ${OUTPUT_DIR}`);

async function ensureDevServers() {
  const buildResult = spawnSync("npm", ["run", "build", "-w", "@mferland/shared"], {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });
  if (buildResult.status !== 0) throw new Error(`shared build failed with status ${buildResult.status}`);
  await sleep(2500);

  if (!(await isHttpReady(SERVER_HEALTH_URL))) {
    startedProcesses.push(startProcess("server", ["run", "dev:server"], {
      NODE_ENV: "development",
      MFERLAND_ENABLE_DEBUG_MESSAGES: "1",
      HOST: "127.0.0.1",
      PORT: "2567",
    }));
  }
  await waitForHttp(SERVER_HEALTH_URL, "server");
  await assertServerDebugMessagesEnabled();

  if (!(await isHttpReady(WEB_URL))) {
    startedProcesses.push(startProcess("web", ["run", "dev", "-w", "@mferland/web", "--", "--host", "127.0.0.1", "--port", "5173"], {
      VITE_SERVER_URL: SERVER_URL,
      VITE_ENABLE_REAL_CAPTURE: "1",
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

async function assertServerDebugMessagesEnabled() {
  const health = await readJson(SERVER_HEALTH_URL);
  if (health && health.debugMessagesEnabled === true) return;
  throw new Error("The server is running without capture debug messages. Stop the existing server or restart it with NODE_ENV=development and MFERLAND_ENABLE_DEBUG_MESSAGES=1.");
}

async function readJson(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function stopStartedProcesses() {
  for (const child of startedProcesses) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

async function makeBot(client, name, avatarSeed) {
  const room = await retry(async () => client.joinOrCreate(ROOM_NAME, {
    name,
    identityType: "agent",
    avatarSeed,
  }), 30, 1000);
  for (const type of ["chat", "combatEvent", "experienceEvent", "questOffer", "questTurnIn", "questStatus", "lootWindow", "closeLootWindow", "debugPlacementMap"]) {
    room.onMessage(type, () => {});
  }
  return {
    name,
    avatarSeed,
    room,
    sessionId: room.sessionId,
    seq: 0,
  };
}

async function retry(fn, attempts, delayMs) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await sleep(delayMs);
    }
  }
  throw lastError;
}

async function setupPartyAt(page, bots, positions) {
  await page.evaluate(([x, z, yaw]) => window.__MFERLAND_REAL_GAME_CAPTURE.teleport(x, z, yaw), positions.local);
  positions.bots.forEach(([x, z, yaw], index) => {
    bots[index].room.send("debugTeleport", { x, z, yaw });
  });
  await page.waitForTimeout(500);
}

async function setupNpc(page, message) {
  await page.evaluate((payload) => window.__MFERLAND_REAL_GAME_CAPTURE.setupNpc(payload), message);
}

async function sendChat(page, text) {
  await page.evaluate((message) => window.__MFERLAND_REAL_GAME_CAPTURE.chat(message), text);
}

async function setPlayableCamera(page) {
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2 - 72, { steps: 12 });
  await page.mouse.up({ button: "right" });
  await page.mouse.wheel(0, 110);
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
    throw new Error("REAL_CAPTURE_RECT must be formatted as x,y,width,height");
  }
  const [x, y, width, height] = parts;
  return { x, y, width, height };
}

function startBotOrbit(bot, {
  center,
  radius,
  actionId,
  targetId,
  targetKind = "npc",
  phase = 0,
}) {
  let tick = 0;
  let pausedUntil = 0;
  let lastFacingYaw = phase;
  let lastTargetFacingYaw = phase;
  const motionTimer = setInterval(() => {
    tick += 1;
    const t = tick / 12 + phase;
    const orbitX = center[0] + Math.sin(t) * radius;
    const orbitZ = center[1] + Math.cos(t) * radius;
    const faceTargetYaw = Math.atan2(center[0] - orbitX, center[1] - orbitZ);
    lastTargetFacingYaw = faceTargetYaw;
    if (Date.now() < pausedUntil) {
      bot.room.send("input", {
        seq: ++bot.seq,
        x: 0,
        z: 0,
        yaw: faceTargetYaw,
        sprint: false,
        jump: false,
      });
      lastFacingYaw = faceTargetYaw;
      return;
    }
    const x = Math.sin(t) * 0.62;
    const z = Math.cos(t) * 0.62;
    const yaw = Math.atan2(x, z);
    lastFacingYaw = yaw;
    bot.room.send("input", {
      seq: ++bot.seq,
      x,
      z,
      yaw,
      sprint: true,
      jump: tick % 41 === 0,
    });
  }, 80);

  const actionTimer = setInterval(() => {
    pausedUntil = Date.now() + 560;
    bot.room.send("input", {
      seq: ++bot.seq,
      x: 0,
      z: 0,
      yaw: lastTargetFacingYaw,
      sprint: false,
      jump: false,
    });
    lastFacingYaw = lastTargetFacingYaw;
    setTimeout(() => {
      bot.room.send("combatAction", {
        actionId,
        target: { kind: targetKind, id: targetId },
      });
    }, 180);
  }, actionId === "heal" || actionId === "fireblast" || actionId === "iceBlast" ? 2400 : 1500);

  return [motionTimer, actionTimer];
}

function stopLoops(loops) {
  for (const loop of loops.flat()) clearInterval(loop);
}

async function localCombat(page, targetId, schedule) {
  const start = Date.now();
  for (const [atMs, actionId] of schedule) {
    const waitMs = start + atMs - Date.now();
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    await faceLocalTarget(page, targetId);
    await page.waitForTimeout(120);
    await page.evaluate(({ actionId: nextActionId, target }) => {
      window.__MFERLAND_REAL_GAME_CAPTURE.combatAction(nextActionId, target);
    }, {
      actionId,
      target: ACTION_TARGET(targetId),
    });
  }
}

async function faceLocalTarget(page, targetId) {
  await page.evaluate((id) => {
    const bridge = window.__MFERLAND_REAL_GAME_CAPTURE;
    const snapshot = bridge?.snapshot();
    const player = snapshot?.players.find((entry) => entry.sessionId === bridge.sessionId);
    const target = snapshot?.npcs.find((entry) => entry.id === id);
    if (!bridge || !player || !target) return false;
    bridge.teleport(player.x, player.z, Math.atan2(target.x - player.x, target.z - player.z));
    bridge.selectTarget({ kind: "npc", id });
    return true;
  }, targetId);
}

async function holdKeys(page, keys, durationMs) {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(durationMs);
  for (const key of [...keys].reverse()) await page.keyboard.up(key);
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`ffmpeg failed with status ${result.status}`);
}

function makeContactSheet(thumbnails, output) {
  if (thumbnails.length === 0) return;
  if (thumbnails.length === 1) {
    runFfmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      thumbnails[0],
      "-vf",
      "scale=426:240",
      "-frames:v",
      "1",
      output,
    ]);
    return;
  }
  const columns = Math.min(3, thumbnails.length);
  const rows = Math.ceil(thumbnails.length / columns);
  const layout = thumbnails.map((_, index) => {
    const x = (index % columns) * 426;
    const y = Math.floor(index / columns) * 240;
    return `${x}_${y}`;
  }).join("|");
  runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...thumbnails.flatMap((thumbnail) => ["-i", thumbnail]),
    "-filter_complex",
    `${thumbnails.map((_, index) => `[${index}:v]scale=426:240[v${index}]`).join(";")};${thumbnails.map((_, index) => `[v${index}]`).join("")}xstack=inputs=${thumbnails.length}:layout=${layout}:fill=black[out]`,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    output,
  ]);
  void rows;
}

function makeVariantClipId(id) {
  if (CAPTURE_HUD) return id;
  return id.replace("_real_hud_", "_real_nohud_");
}

function makeVariantTitle(title) {
  if (CAPTURE_HUD) return title;
  return title.replace("real HUD", "real no-HUD");
}

function makeHandoff(data) {
  const rows = data.clips
    .map((clip, index) => `| ${String(index + 1).padStart(2, "0")} | ${clip.title} | \`${path.relative(data.outputDir, clip.file)}\` |`)
    .join("\n");
  return `# Real Gameplay ${data.hud ? "HUD" : "No-HUD"} Clip Handoff

These clips are recorded from the actual mferland game window with native macOS screen capture: real \`App\`, \`TownScene\`, Colyseus room state, bot clients, and combat feedback. ${data.hud ? "The HUD capture includes the target frame, minimap, hotbar, chat, and player panels." : "The no-HUD capture hides the HUD, nameplates, and chat bubbles for clean graphics footage."} No optical-flow interpolation is used.

| # | Clip | MP4 |
| --- | --- | --- |
${rows}

Supporting files:

- \`manifest.json\`: machine-readable clip descriptions and absolute paths.
- \`thumbnails/contact-sheet.png\`: quick visual scan of the real ${data.hud ? "HUD" : "no-HUD"} clips.
- \`thumbnails/*.png\`: still frame from each clip at roughly four seconds.

Re-run command:

\`\`\`sh
${data.hud ? "" : "REAL_CAPTURE_HUD=0 "}node scripts/record-real-gameplay-clips.mjs
\`\`\`

Useful knobs:

- \`REAL_CAPTURE_CLIP_LIMIT=1\`: record only the first clip for a proof pass.
- \`REAL_CAPTURE_HUD=0\`: record clean no-HUD footage.
- \`REAL_CAPTURE_PLAYER_NAME="${data.playerName}"\`: override the local player name.
- \`REAL_CAPTURE_RECT=x,y,width,height\`: crop the native screen recording region.
- \`REAL_CAPTURE_DISPLAY=1\`: choose the display passed to \`screencapture -D\`.
`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
