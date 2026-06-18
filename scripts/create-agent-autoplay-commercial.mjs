import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "colyseus.js";
import { chromium } from "playwright";
import { INPUT_SEND_RATE, ROOM_NAME } from "@mferland/shared";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_ROOT = path.join(ROOT_DIR, "captures", "agent-autoplay-commercial");
const RAW_DIR = path.join(OUTPUT_ROOT, "raw");
const SEGMENT_DIR = path.join(OUTPUT_ROOT, "segments");
const TEXT_DIR = path.join(OUTPUT_ROOT, "text");
const THUMBNAIL_DIR = path.join(OUTPUT_ROOT, "thumbnails");
const SAVED_ASSET_DIR = path.join(ROOT_DIR, "captures", "agent-autoplay-commercial-saved");
const SAVED_BLOCKED_MODEL_CLIP = path.join(SAVED_ASSET_DIR, "02_agent_model_closeup-blocked-saved.mp4");
const SERVER_PORT = Number(process.env.AGENT_COMMERCIAL_SERVER_PORT ?? 2571);
const WEB_PORT = Number(process.env.AGENT_COMMERCIAL_WEB_PORT ?? 5174);
const SERVER_URL = `ws://127.0.0.1:${SERVER_PORT}`;
const SERVER_HTTP = `http://127.0.0.1:${SERVER_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const DATABASE_URL = process.env.AGENT_COMMERCIAL_DATABASE_URL?.trim()
  || "postgresql://localhost:55433/mferland_agent_commercial";
const DB_URL = new URL(DATABASE_URL);
const DB_DIR = path.join(ROOT_DIR, ".tmp", "agent-commercial-pg");
const DB_PORT = Number(DB_URL.port || 55433);
const DB_NAME = DB_URL.pathname.replace(/^\/+/, "") || "mferland_agent_commercial";
const VIEWPORT = { width: 1280, height: 720 };
const FPS = 30;
const CAPTURE_INPUT_INTERVAL_MS = Math.round(1000 / INPUT_SEND_RATE);
const GAMEPLAY_EXTRA_TRIM_SEC = Number(process.env.AGENT_COMMERCIAL_EXTRA_TRIM_SEC ?? 2);
const FONT = "/System/Library/Fonts/HelveticaNeue.ttc";
const TITLE_FONT = "/System/Library/Fonts/Menlo.ttc";
const BRAND_NAME = "mfertown";
const GAME_URL = "https://game.mfergpt.lol";
const RECORD = process.argv.includes("--record");
const RESET_OUTPUT = process.argv.includes("--reset-output");
const SELECTED_SCENE_IDS = new Set(process.argv
  .filter((arg) => arg.startsWith("--scene="))
  .flatMap((arg) => arg.slice("--scene=".length).split(",").map((id) => id.trim()).filter(Boolean)));
const INCLUDE_HUD_PROOF = process.env.AGENT_COMMERCIAL_INCLUDE_HUD === "1";

const CAMERA_AGENT = {
  key: "camera",
  name: "cinema scout",
  avatarSeed: 74101,
  role: "camera playable agent",
  tier: "25m",
  sessionMax: 900,
  dailyTotal: 3600,
};

const SUPPORT_AGENTS = [
  {
    key: "solo",
    name: "solo scout",
    wallet: makeWallet(0x202),
    avatarSeed: 74102,
    role: "lone wolf quester",
    tier: "base",
    sessionMax: 300,
    dailyTotal: 1200,
  },
  {
    key: "tank",
    name: "promo tank",
    wallet: makeWallet(0x203),
    avatarSeed: 74103,
    role: "tank",
    tier: "500m",
    sessionMax: 1800,
    dailyTotal: 21600,
  },
  {
    key: "healer",
    name: "promo healer",
    wallet: makeWallet(0x204),
    avatarSeed: 74104,
    role: "healer",
    tier: "100m",
    sessionMax: 1800,
    dailyTotal: 10800,
  },
  {
    key: "dps",
    name: "promo dps",
    wallet: makeWallet(0x205),
    avatarSeed: 74105,
    role: "dps",
    tier: "25m",
    sessionMax: 900,
    dailyTotal: 3600,
  },
  {
    key: "grouper",
    name: "promo grouper",
    wallet: makeWallet(0x206),
    avatarSeed: 74106,
    role: "grouper",
    tier: "25m",
    sessionMax: 900,
    dailyTotal: 3600,
  },
];

const BASE_SCENES = [
  {
    id: "01_clean_solo_farm",
    title: "Solo Autoplay",
    durationMs: 9000,
    trimOffsetSec: 0.8,
    hud: false,
    camera: {
      fixed: {
        position: [-77.8, 5.2, 84.6],
        target: [-84.8, 1.15, 92.6],
        fov: 44,
      },
    },
    headline: "SOLO AGENTS CAN JUST PLAY",
    subhead: "Give it a command. It farms, loots, quests, and reports back.",
    setup: async (ctx) => {
      await localBoost(ctx.page, 10);
      await localTeleport(ctx.page, -86.4, 90.2, yawTo([-86.4, 90.2], [-81.4, 93.4]));
      await setLocalAgentStatus(ctx.page, {
        action: "farm_hogs",
        thought: "Clearing claim pile hogs and checking nearby claim-burnt farmers before questing.",
        objective: "farm hogs for 2 minutes, then continue questing",
        quest: "custom command: hog farm -> quest",
        used: 42,
        dailyUsed: 245,
      });
      await setupNpc(ctx.page, {
        npcId: "promo-claim-hog-alpha",
        name: "claim pile hog",
        role: "beast",
        model: "hog",
        x: -81.4,
        z: 93.4,
        yaw: -1.2,
        health: 220,
        maxHealth: 220,
        leashRadius: 18,
        isImmortal: true,
        combatStyle: "melee",
      });
      await setupNpc(ctx.page, {
        npcId: "promo-claim-farmer-alpha",
        name: "claim-burnt farmer",
        role: "farmer",
        model: "mfer",
        x: -88.6,
        z: 96.2,
        yaw: 0.8,
        health: 260,
        maxHealth: 260,
        leashRadius: 18,
        isImmortal: true,
        combatStyle: "melee",
      });
      await localChat(ctx.page, "clearing hogs, then back to quests.");
    },
    play: async (ctx) => startLocalCombatLoop(ctx.page, {
      center: [-84.8, 92.6],
      radius: 4.2,
      targetId: "promo-claim-hog-alpha",
      actionIds: ["attack", "signalShot", "whirlwind"],
      phase: 0.2,
    }),
  },
  {
    id: "02_agent_model_closeup",
    title: "mferGPT Agent Model Closeup",
    durationMs: 7000,
    preRecordMs: 6800,
    trimOffsetSec: 0.6,
    hud: false,
    cleanAgentModel: true,
    camera: {
      localCloseup: {
        distance: 4.25,
        height: 2.28,
        targetHeight: 1.66,
        yawOffset: 0,
        fov: 34,
      },
    },
    headline: "THE MFERGPT MODEL IS ALIVE",
    subhead: "Base agent body, black headphones, and the flashing bot light.",
    setup: async (ctx) => {
      await localBoost(ctx.page, 10);
      await localTeleport(ctx.page, -38.5, -44.2, 2.25);
      await moveSupportAgents(ctx, [
        ["solo", -82, -86, 2.0],
        ["tank", -86, -90, 2.9],
        ["healer", -90, -84, -2.1],
        ["dps", -94, -88, 1.1],
        ["grouper", -98, -82, 1.3],
      ]);
      await setLocalAgentStatus(ctx.page, {
        action: "model_showcase",
        thought: "Holding still for a close-up so the repaired mferGPT light and model details are visible.",
        objective: "show repaired agent model",
        quest: "cinematic: agent model closeup",
        used: 68,
        dailyUsed: 310,
      });
      await localChat(ctx.page, "mfergpt light check: live.");
    },
    play: async (ctx) => startLocalShowcase(ctx.page, {
      baseYaw: 2.55,
      sweep: 0.36,
      turnSpeed: 0.58,
    }),
  },
  {
    id: "02_party_roles_nohud",
    title: "Party Schemes",
    durationMs: 10500,
    trimOffsetSec: 2.2,
    hud: false,
    headline: "SCHEMES BECOME PARTY BEHAVIOR",
    subhead: "Tank, healer, DPS, grouper, and lone wolf all read the same world.",
    setup: async (ctx) => {
      await stageParty(ctx, {
        center: [-8.8, -12.2],
        targetId: "promo-claim-burnt-captain",
        targetName: "claim-burnt captain",
        model: "mfer",
        role: "farmer",
        health: 1300,
      });
      await setLocalAgentStatus(ctx.page, {
        action: "support_party",
        thought: "Following the group while tank, healer, and DPS execute their roles.",
        objective: "group autoplay scheme",
        quest: "scheme: grouped autoplay practice",
        used: 190,
        dailyUsed: 620,
      });
      setSupportStatus(ctx.agents.tank, "tank claim-burnt captain", "tank role: hold threat and face target");
      setSupportStatus(ctx.agents.healer, "heal party", "healer role: keep the tank alive");
      setSupportStatus(ctx.agents.dps, "burn marked target", "dps role: burst from range");
      setSupportStatus(ctx.agents.grouper, "coordinate group", "grouper role: keep nearby agents together");
    },
    play: async (ctx) => startPartyCombat(ctx, {
      center: [-8.8, -12.2],
      targetId: "promo-claim-burnt-captain",
      tankRadius: 3.3,
      rangedRadius: 7.8,
    }),
  },
  {
    id: "03_daily_boss_nohud",
    title: "Boss Awareness",
    durationMs: 11500,
    trimOffsetSec: 2.0,
    hud: false,
    headline: "BOSSES ARE NOT SOLO GRINDS",
    subhead: "Daily and raid labels tell agents to group, gear up, or wait.",
    setup: async (ctx) => {
      await stageParty(ctx, {
        center: [146.4, -118.2],
        targetId: "mfergpt-daily-boss",
        targetName: "daily boss mfer",
        model: "mfer",
        role: "farmer",
        health: 2800,
      });
      await setLocalAgentStatus(ctx.page, {
        action: "assist_daily_boss_group",
        thought: "Daily boss detected. The party is grouping instead of blind soloing.",
        objective: "attempt group boss only",
        quest: "daily boss | suggested group | level 10+",
        used: 330,
        dailyUsed: 880,
      });
      setSupportStatus(ctx.agents.tank, "tank daily boss", "tank role: daily boss pull");
      setSupportStatus(ctx.agents.healer, "heal daily boss group", "healer role: keep boss group alive");
      setSupportStatus(ctx.agents.dps, "burn daily boss", "dps role: boss damage");
      await supportChat(ctx.agents.grouper, "daily boss up. grouping at signal ridge.");
      await sleep(1250);
      await supportChat(ctx.agents.healer, "ready. no solo hero stuff.");
    },
    play: async (ctx) => startPartyCombat(ctx, {
      center: [146.4, -118.2],
      targetId: "mfergpt-daily-boss",
      tankRadius: 4.8,
      rangedRadius: 10.8,
    }),
  },
  {
    id: "04_agent_play_ui_hud",
    title: "Agent Play UI",
    durationMs: 10000,
    trimOffsetSec: 1.0,
    hud: true,
    camera: {
      fixed: {
        position: [5.2, 4.8, 18.8],
        target: [-1.8, 1.35, 26.2],
        fov: 48,
      },
    },
    headline: "THE PLAY UI SHOWS THE DEAL",
    subhead: "Live HUD: limits, chat, Season 0 gate, and swap path.",
    calloutTitle: "AUTOPLAY LIMITS",
    calloutLines: [
      "0 MFERGPT: 5m commands / 20m daily",
      "25M: 15m commands / 60m daily + Season 0",
      "500M: 30m commands / 360m daily",
      "Swap from the viewer or in-game menu",
    ],
    setup: async (ctx) => {
      await localBoost(ctx.page, 10);
      await localTeleport(ctx.page, -2, 25, yawTo([-2, 25], [0, 28]));
      await moveSupportAgents(ctx, [
        ["solo", -10, 32, -0.4],
        ["tank", -6, 31, 0.2],
        ["healer", 4, 32, -0.1],
        ["dps", 8, 29, -0.5],
        ["grouper", 1, 35, -0.2],
      ]);
      await setLocalAgentStatus(ctx.page, {
        action: "play_for",
        thought: "Showing the actual playable HUD while the agent runs with a bounded command budget.",
        objective: "play for 10 minutes",
        quest: "agent UI: playtime, Season 0, swap",
        used: 184,
        dailyUsed: 970,
        tier: "base",
        sessionMax: 300,
        dailyTotal: 1200,
      });
      await localChat(ctx.page, "free tier has 20 rolling daily minutes. 25M mfergpt enables season points.");
      await sleep(1250);
      await supportChat(ctx.agents.grouper, "recap will include nearby agents, players, and chat.");
    },
    play: async (ctx) => startLocalShowcase(ctx.page, {
      baseYaw: yawTo([-2, 25], [0, 28]),
      sweep: 0.28,
      turnSpeed: 0.35,
    }),
  },
];

const HUD_PROOF_SCENE = {
  id: "05_actual_game_hud_proof",
  title: "Actual Game HUD Proof",
  durationMs: 6500,
  trimOffsetSec: 0.8,
  hud: true,
  headline: "OPTIONAL HUD PROOF",
  subhead: "Actual game page, not stream viewer. Use sparingly in the final edit.",
  setup: async (ctx) => {
    await localBoost(ctx.page, 10);
    await localTeleport(ctx.page, 0, 24, 0);
    await setLocalAgentStatus(ctx.page, {
      action: "show_playtime_context",
      thought: "Short HUD proof shot only; most trailer footage stays no-HUD.",
      objective: "show actual playable client",
      quest: "proof: real game renderer",
      used: 260,
      dailyUsed: 1040,
    });
    await localChat(ctx.page, "actual game page proof shot. no streamer view.");
  },
  play: async (ctx) => startLocalPatrol(ctx.page, [[0, 24, 0], [-4, 29, -0.4], [5, 30, 0.4], [0, 24, 0]]),
};

const SCENES = (INCLUDE_HUD_PROOF ? [...BASE_SCENES, HUD_PROOF_SCENE] : BASE_SCENES)
  .filter((scene) => SELECTED_SCENE_IDS.size === 0 || SELECTED_SCENE_IDS.has(scene.id))
  .map((scene, index) => ({
    ...scene,
    cameraWallet: makeWallet(0x280 + index),
    cameraName: `${CAMERA_AGENT.name} ${index + 1}`,
  }));

const startedProcesses = [];
let startedPostgres = false;
let browser = null;
let cleanupStarted = false;

await writeStoryboard();

if (!RECORD) {
  console.log(`Storyboard written to ${path.join(OUTPUT_ROOT, "STORYBOARD.md")}`);
  console.log("No capture was run. Use:");
  console.log("  node scripts/create-agent-autoplay-commercial.mjs --record");
  console.log("Optional:");
  console.log("  AGENT_COMMERCIAL_INCLUDE_HUD=1 node scripts/create-agent-autoplay-commercial.mjs --record");
  process.exit(0);
}

process.once("SIGINT", () => {
  void cleanup().finally(() => process.exit(130));
});
process.once("SIGTERM", () => {
  void cleanup().finally(() => process.exit(143));
});

try {
  await preserveExistingBlockedModelClip();
  if (RESET_OUTPUT) await rm(OUTPUT_ROOT, { recursive: true, force: true });
  await prepareOutputDirs();
  await restoreSavedBlockedModelClip();
  if (RESET_OUTPUT) await writeStoryboard();
  await ensureLocalDatabase();
  await runMigrations();
  await ensureDevServers();

  const client = new Client(SERVER_URL);
  const agents = await joinSupportAgents(client);
  const ctxBase = { agents };

  browser = await chromium.launch({
    headless: false,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--force-device-scale-factor=1",
    ],
  });

  const rawClips = [];
  for (const scene of SCENES) {
    console.log(`recording ${scene.id}`);
    rawClips.push(await recordScene(scene, ctxBase));
  }

  const segments = [];
  const modelClip = rawClips.find((clip) => clip.id === "02_agent_model_closeup") ?? rawClips[0];
  segments.push(await makeVideoTitleCard(
    "00_title",
    "AGENTS ARE PLAYERS NOW",
    "wallet agents playing the real mfertown client",
    3.8,
    modelClip?.rawPath ?? SAVED_BLOCKED_MODEL_CLIP,
    {
      startSec: modelClip?.trimStartSec ?? 0,
      overlay: "#030507@0.34",
      blur: false,
      footer: GAME_URL,
    },
  ));
  for (const clip of rawClips) segments.push(await renderGameplaySegment(clip));
  segments.push(await makeVideoTitleCard("06_feature_burst", "ONE HARNESS. ANY AGENT.", "Codex, Bankr, local models, regular agents. Wallet-safe by default.", 4.2, SAVED_BLOCKED_MODEL_CLIP));
  segments.push(await makeTitleCard("07_end_card", "PLAY NOW", "Bounded commands. Wallet-safe actions. World-aware recaps.", 4.2, GAME_URL));

  const silentVideo = path.join(OUTPUT_ROOT, "mfertown-agent-autoplay-commercial-silent.mp4");
  await concatSegments(segments, silentVideo);
  const duration = await ffprobeDuration(silentVideo);
  const music = path.join(OUTPUT_ROOT, "generated-cinematic-music.m4a");
  await makeMusic(music, duration);
  const finalVideo = path.join(OUTPUT_ROOT, "mfertown-agent-autoplay-commercial.mp4");
  runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", silentVideo,
    "-i", music,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    finalVideo,
  ]);

  const poster = path.join(THUMBNAIL_DIR, "poster.png");
  runFfmpeg(["-hide_banner", "-loglevel", "error", "-y", "-ss", "00:00:07", "-i", finalVideo, "-frames:v", "1", poster]);
  await writeManifest({ clips: rawClips, segments, finalVideo, silentVideo, music, poster, duration });
  console.log(`final video: ${finalVideo}`);
} finally {
  await cleanup();
}

async function prepareOutputDirs() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(SEGMENT_DIR, { recursive: true });
  await mkdir(TEXT_DIR, { recursive: true });
  await mkdir(THUMBNAIL_DIR, { recursive: true });
}

async function preserveExistingBlockedModelClip() {
  await mkdir(SAVED_ASSET_DIR, { recursive: true });
  const savedSegment = path.join(SEGMENT_DIR, "02_agent_model_closeup-blocked-saved.mp4");
  if (existsSync(savedSegment)) {
    await copyFile(savedSegment, SAVED_BLOCKED_MODEL_CLIP);
    return;
  }
  const currentSegment = path.join(SEGMENT_DIR, "02_agent_model_closeup.mp4");
  if (!existsSync(SAVED_BLOCKED_MODEL_CLIP) && existsSync(currentSegment)) {
    await copyFile(currentSegment, SAVED_BLOCKED_MODEL_CLIP);
  }
}

async function restoreSavedBlockedModelClip() {
  if (!existsSync(SAVED_BLOCKED_MODEL_CLIP)) return;
  await copyFile(SAVED_BLOCKED_MODEL_CLIP, path.join(SEGMENT_DIR, "02_agent_model_closeup-blocked-saved.mp4"));
}

async function ensureLocalDatabase() {
  if (await canConnectDatabase()) return;
  await mkdir(path.dirname(DB_DIR), { recursive: true });
  if (!existsSync(DB_DIR)) {
    const init = spawnSync("initdb", ["-D", DB_DIR], { cwd: ROOT_DIR, stdio: "inherit" });
    if (init.status !== 0) throw new Error(`initdb failed with status ${init.status}`);
  }
  if (!await canConnectPostgresServer()) {
    const logFile = path.join(ROOT_DIR, ".tmp", "agent-commercial-pg.log");
    const start = spawnSync("pg_ctl", [
      "-D", DB_DIR,
      "-o", `-p ${DB_PORT} -k ${path.join(ROOT_DIR, ".tmp")}`,
      "-l", logFile,
      "start",
    ], { cwd: ROOT_DIR, stdio: "inherit" });
    if (start.status !== 0) throw new Error(`pg_ctl start failed with status ${start.status}`);
    startedPostgres = true;
    await waitFor(async () => canConnectPostgresServer(), "local postgres server", 30000);
  }
  spawnSync("createdb", ["-h", "localhost", "-p", String(DB_PORT), DB_NAME], { cwd: ROOT_DIR, stdio: "ignore" });
  await waitFor(async () => canConnectDatabase(), "local postgres database", 30000);
}

async function canConnectPostgresServer() {
  const adminUrl = new URL(DATABASE_URL);
  adminUrl.pathname = "/postgres";
  return spawnSync("psql", [adminUrl.toString(), "-c", "select 1"], { cwd: ROOT_DIR, stdio: "ignore" }).status === 0;
}

async function canConnectDatabase() {
  return spawnSync("psql", [DATABASE_URL, "-c", "select 1"], { cwd: ROOT_DIR, stdio: "ignore" }).status === 0;
}

async function runMigrations() {
  const result = spawnSync("node", ["apps/server/scripts/migrate.mjs"], {
    cwd: ROOT_DIR,
    env: { ...process.env, DATABASE_URL, MFERLAND_LOCAL_ONLY: "1" },
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`migration failed with status ${result.status}`);
}

async function ensureDevServers() {
  const shared = spawnSync("npm", ["run", "build", "-w", "@mferland/shared"], { cwd: ROOT_DIR, stdio: "inherit" });
  if (shared.status !== 0) throw new Error(`shared build failed with status ${shared.status}`);

  if (!await isHttpReady(`${SERVER_HTTP}/health`)) {
    startedProcesses.push(startProcess("server", ["run", "dev", "-w", "@mferland/server"], {
      NODE_ENV: "development",
      DATABASE_URL,
      MFERLAND_LOCAL_ONLY: "1",
      MFERLAND_ENABLE_INVITE_GATE: "0",
      MFERLAND_ENABLE_DEBUG_MESSAGES: "1",
      MFERLAND_AGENTS_ENABLED: "1",
      MFERLAND_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI: "0",
      HOST: "127.0.0.1",
      PORT: String(SERVER_PORT),
    }));
  }
  await waitFor(async () => isHttpReady(`${SERVER_HTTP}/health`), "server", 90000);
  const health = await readJson(`${SERVER_HTTP}/health`);
  if (health?.debugMessagesEnabled !== true) throw new Error("server is running without debug messages enabled");

  if (!await isHttpReady(WEB_URL)) {
    startedProcesses.push(startProcess("web", ["run", "dev", "-w", "@mferland/web", "--", "--host", "127.0.0.1", "--port", String(WEB_PORT)], {
      VITE_SERVER_URL: SERVER_URL,
      VITE_ENABLE_REAL_CAPTURE: "1",
    }));
  }
  await waitFor(async () => isHttpReady(WEB_URL), "web", 90000);
}

function startProcess(label, args, env) {
  const child = spawn("npm", args, {
    cwd: ROOT_DIR,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  return child;
}

async function joinSupportAgents(client) {
  const entries = await Promise.all(SUPPORT_AGENTS.map(async (spec) => {
    const room = await retry(() => client.joinOrCreate(ROOM_NAME, {
      name: spec.name,
      identityType: "wallet",
      walletAddress: spec.wallet,
      avatarSeed: spec.avatarSeed,
      createCharacter: true,
      agentClient: true,
    }), 40, 800);
    const agent = { ...spec, room, sessionId: room.sessionId, seq: 0, players: new Map(), npcs: new Map() };
    wireRoom(agent);
    room.send("debugBoostPlayer", { level: 10, maxTalents: true });
    return [spec.key, agent];
  }));
  return Object.fromEntries(entries);
}

function wireRoom(agent) {
  const { room } = agent;
  room.onStateChange((state) => {
    const players = new Map();
    state.players?.forEach((player, sessionId) => {
      players.set(sessionId, {
        sessionId,
        x: Number(player.x) || 0,
        z: Number(player.z) || 0,
        yaw: Number(player.yaw) || 0,
        health: Number(player.health) || 0,
        maxHealth: Number(player.maxHealth) || 0,
      });
    });
    agent.players = players;

    const npcs = new Map();
    state.npcs?.forEach((npc, id) => {
      npcs.set(id, {
        id,
        x: Number(npc.x) || 0,
        z: Number(npc.z) || 0,
        yaw: Number(npc.yaw) || 0,
        health: Number(npc.health) || 0,
        maxHealth: Number(npc.maxHealth) || 0,
      });
    });
    agent.npcs = npcs;
  });
  for (const type of ["chat", "combatEvent", "experienceEvent", "questOffer", "questTurnIn", "questStatus", "lootWindow", "persistenceStatus"]) {
    room.onMessage(type, () => {});
  }
}

async function recordScene(scene, ctxBase) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: RAW_DIR, size: VIEWPORT },
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`[page:${scene.id}] ${message.text()}`);
  });
  page.on("pageerror", (error) => console.error(`[page:${scene.id}] ${error.message}`));

  const openedAt = Date.now();
  let startedAt = openedAt;
  let stop = null;
  let video = null;
  let trimOffsetSec = getSceneTrimOffsetSec(scene);
  try {
    await page.goto(realCaptureUrl(scene), { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForCaptureBridge(page);
    await scene.setup({ ...ctxBase, page });
    await frameCamera(page, scene);
    await page.waitForTimeout(scene.preRecordMs ?? 1600);
    startedAt = Date.now();
    trimOffsetSec = getSceneTrimOffsetSec(scene);
    stop = normalizeSceneStopper(await scene.play({ ...ctxBase, page }));
    await page.waitForTimeout(scene.durationMs + Math.ceil(trimOffsetSec * 1000) + 500);
    stop();
    stop = null;
    await page.waitForTimeout(300);
    video = page.video();
  } finally {
    if (stop) stop();
    await page.close({ runBeforeUnload: false }).catch(() => {});
    await context.close();
  }
  return {
    id: scene.id,
    rawPath: await video.path(),
    headline: scene.headline,
    subhead: scene.subhead,
    hud: Boolean(scene.hud),
    calloutTitle: scene.calloutTitle ?? "",
    calloutLines: scene.calloutLines ?? [],
    durationMs: scene.durationMs,
    trimStartSec: Math.max(0, (startedAt - openedAt) / 1000 + trimOffsetSec),
  };
}

function getSceneTrimOffsetSec(scene) {
  return Math.max(0, Number(scene.trimOffsetSec ?? 0) + Number(scene.extraTrimSec ?? GAMEPLAY_EXTRA_TRIM_SEC));
}

function normalizeSceneStopper(stop) {
  if (typeof stop === "function") return stop;
  if (Array.isArray(stop)) return () => stopLoops(stop);
  return () => {};
}

function realCaptureUrl(scene) {
  const params = new URLSearchParams();
  params.set("realCapture", "1");
  params.set("realCaptureAgent", "1");
  params.set("realCaptureHud", scene.hud ? "1" : "0");
  if (scene.cleanAgentModel) params.set("realCaptureCleanAgentModel", "1");
  params.set("realCaptureWallet", scene.cameraWallet);
  params.set("realCaptureAvatarSeed", String(CAMERA_AGENT.avatarSeed));
  params.set("name", scene.cameraName);
  return `${WEB_URL}/?${params.toString()}`;
}

async function waitForCaptureBridge(page) {
  await page.waitForFunction(
    () => {
      const bridge = window.__MFERLAND_REAL_GAME_CAPTURE;
      if (bridge?.status !== "connected" || !bridge.sessionId) return false;
      const snapshot = bridge.snapshot();
      return snapshot.players.some((player) => player.sessionId === bridge.sessionId);
    },
    null,
    { timeout: 90000 },
  );
}

async function frameCamera(page, scene) {
  const camera = scene.camera ?? {};
  if (camera.localCloseup) {
    await setLocalCaptureCamera(page, camera.localCloseup);
    return;
  }
  if (camera.fixed) {
    await setCaptureCamera(page, camera.fixed);
    return;
  }
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  await page.mouse.wheel(0, camera.wheel ?? (scene.id.includes("boss") ? 260 : 160));
  await page.mouse.down({ button: "right" });
  await page.mouse.move(
    VIEWPORT.width / 2 + (camera.dragX ?? 105),
    VIEWPORT.height / 2 + (camera.dragY ?? -48),
    { steps: 12 },
  );
  await page.mouse.up({ button: "right" });
}

async function stageParty(ctx, { center, targetId, targetName, model, role, health }) {
  const [cx, cz] = center;
  const target = [cx + 1.2, cz - 1.2];
  const localStart = [cx + 4.5, cz + 7.5];
  await localBoost(ctx.page, 10);
  await localTeleport(ctx.page, localStart[0], localStart[1], yawTo(localStart, target));
  await moveSupportAgents(ctx, [
    ["tank", cx - 2.9, cz - 0.5, yawTo([cx - 2.9, cz - 0.5], target)],
    ["healer", cx - 9.5, cz + 6.4, yawTo([cx - 9.5, cz + 6.4], target)],
    ["dps", cx + 7.8, cz + 6.2, yawTo([cx + 7.8, cz + 6.2], target)],
    ["grouper", cx + 10.8, cz - 2.2, yawTo([cx + 10.8, cz - 2.2], target)],
    ["solo", cx - 12.0, cz - 6.0, yawTo([cx - 12.0, cz - 6.0], target)],
  ]);
  const localSessionId = await getLocalSessionId(ctx.page);
  await setupNpc(ctx.page, {
    npcId: targetId,
    name: targetName,
    role,
    model,
    x: target[0],
    z: target[1],
    yaw: 2.2,
    health,
    maxHealth: health,
    leashRadius: 30,
    isImmortal: true,
    combatStyle: "melee",
    aggroTargetId: localSessionId,
  });
}

async function moveSupportAgents(ctx, rows) {
  for (const [key, x, z, yaw] of rows) {
    const agent = ctx.agents[key];
    if (!agent) continue;
    agent.room.send("debugTeleport", { x, z, yaw });
    agent.room.send("debugBoostPlayer", { level: 10, maxTalents: true });
  }
  await sleep(500);
}

function startPartyCombat(ctx, { center, targetId, tankRadius, rangedRadius }) {
  const loops = [
    startLocalCombatLoop(ctx.page, { center, radius: tankRadius, targetId, actionIds: ["taunt", "attack", "whirlwind"], phase: 0.2 }),
    startAgentCombatLoop(ctx.agents.healer, { center, radius: rangedRadius, targetId: getAgentSessionId(ctx.agents.tank) || getAgentSessionId(ctx.agents.healer), targetKind: "player", actionId: "heal", phase: 2.6 }),
    startAgentCombatLoop(ctx.agents.dps, { center, radius: rangedRadius + 1.4, targetId, actionId: "iceBlast", phase: 1.3 }),
    startAgentCombatLoop(ctx.agents.grouper, { center, radius: rangedRadius + 2.1, targetId, actionId: "multishot", phase: 3.8 }),
  ];
  return () => stopLoops(loops);
}

function startLocalCombatLoop(page, { center, radius, targetId, actionIds, phase = 0 }) {
  const startedAt = Date.now();
  let tick = 0;
  let pausedUntil = 0;
  const motionTimer = setInterval(() => {
    tick += 1;
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    const t = elapsedSeconds * 0.58 + phase;
    if (Date.now() < pausedUntil) {
      void localFaceTarget(page, targetId).catch(() => undefined);
      return;
    }
    const targetPoint = [
      center[0] + Math.sin(t) * radius,
      center[1] + Math.cos(t) * radius,
    ];
    void localMoveToward(page, targetPoint, { sprint: true, jump: tick % 41 === 0 }).catch(() => undefined);
  }, CAPTURE_INPUT_INTERVAL_MS);
  let actionIndex = 0;
  const actionTimer = setInterval(() => {
    pausedUntil = Date.now() + 580;
    const actionId = actionIds[actionIndex % actionIds.length];
    actionIndex += 1;
    void localStopAndFace(page, targetId, actionId).catch(() => undefined);
  }, 1500);
  return [motionTimer, actionTimer];
}

function startLocalShowcase(page, { baseYaw, sweep, turnSpeed }) {
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    const yaw = baseYaw + Math.sin(elapsedSeconds * turnSpeed) * sweep;
    void localInput(page, 0, 0, yaw, false, false);
  }, CAPTURE_INPUT_INTERVAL_MS);
  return [timer];
}

async function localStopAndFace(page, targetId, actionId) {
  await page.evaluate(({ targetId: id, actionId: nextActionId }) => {
    const bridge = window.__MFERLAND_REAL_GAME_CAPTURE;
    const snapshot = bridge?.snapshot();
    const player = snapshot?.players.find((entry) => entry.sessionId === bridge.sessionId);
    const target = snapshot?.npcs.find((entry) => entry.id === id);
    if (!bridge || !player || !target) return false;
    bridge.input(0, 0, Math.atan2(target.x - player.x, target.z - player.z), false, false);
    bridge.selectTarget({ kind: "npc", id });
    setTimeout(() => bridge.combatAction(nextActionId, { kind: "npc", id }), 120);
    return true;
  }, { targetId, actionId });
}

function startAgentCombatLoop(agent, { center, radius, targetId, actionId, phase = 0, targetKind = "npc" }) {
  const startedAt = Date.now();
  let tick = 0;
  let pausedUntil = 0;
  let lastYaw = phase;
  const motionTimer = setInterval(() => {
    tick += 1;
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    const t = elapsedSeconds * 0.44 + phase;
    const px = center[0] + Math.sin(t) * radius;
    const pz = center[1] + Math.cos(t) * radius;
    const self = getAgentSelf(agent);
    const faceTarget = targetKind === "npc" ? agent.npcs.get(targetId) : agent.players.get(targetId);
    lastYaw = faceTarget && self ? yawTo([self.x, self.z], [faceTarget.x, faceTarget.z]) : lastYaw;
    if (Date.now() < pausedUntil) {
      sendAgentInput(agent, 0, 0, lastYaw, false, false);
      return;
    }
    sendAgentToward(agent, [px, pz], { sprint: true, jump: tick % 37 === 0 });
  }, CAPTURE_INPUT_INTERVAL_MS);
  const actionTimer = setInterval(() => {
    pausedUntil = Date.now() + 620;
    const self = getAgentSelf(agent);
    const faceTarget = targetKind === "npc" ? agent.npcs.get(targetId) : agent.players.get(targetId);
    if (self && faceTarget) lastYaw = yawTo([self.x, self.z], [faceTarget.x, faceTarget.z]);
    sendAgentInput(agent, 0, 0, lastYaw, false, false);
    setTimeout(() => agent.room.send("combatAction", { actionId, target: { kind: targetKind, id: targetId } }), 160);
  }, actionId === "heal" || actionId === "iceBlast" ? 2400 : 1500);
  return [motionTimer, actionTimer];
}

function startLocalPatrol(page, points) {
  let index = 0;
  const timer = setInterval(() => {
    const [x, z] = points[index % points.length];
    void localMoveToward(page, [x, z], { sprint: false }).then((result) => {
      if (result?.distance !== undefined && result.distance < 1.25) index += 1;
    }).catch(() => undefined);
  }, CAPTURE_INPUT_INTERVAL_MS);
  return [timer];
}

function startAgentPatrol(agent, points) {
  let index = 0;
  const timer = setInterval(() => {
    const [x, z] = points[index % points.length];
    const distance = sendAgentToward(agent, [x, z], { sprint: false });
    if (distance !== null && distance < 1.25) index += 1;
  }, CAPTURE_INPUT_INTERVAL_MS);
  return [timer];
}

function sendAgentInput(agent, x, z, yaw, sprint, jump) {
  agent.room.send("input", { seq: ++agent.seq, x, z, yaw, sprint, jump });
}

function sendAgentToward(agent, [targetX, targetZ], { sprint = true, jump = false } = {}) {
  const self = getAgentSelf(agent);
  if (!self) {
    sendAgentInput(agent, 0, 0, 0, false, false);
    return null;
  }
  const dx = targetX - self.x;
  const dz = targetZ - self.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.2) {
    sendAgentInput(agent, 0, 0, self.yaw, false, false);
    return distance;
  }
  const x = dx / distance;
  const z = dz / distance;
  sendAgentInput(agent, x, z, Math.atan2(x, z), sprint, jump);
  return distance;
}

function getAgentSelf(agent) {
  return agent?.players?.get(agent.sessionId) ?? null;
}

async function localBoost(page, level) {
  await page.evaluate((nextLevel) => window.__MFERLAND_REAL_GAME_CAPTURE?.boost(nextLevel), level);
}

async function localTeleport(page, x, z, yaw) {
  await page.evaluate((args) => window.__MFERLAND_REAL_GAME_CAPTURE?.teleport(args.x, args.z, args.yaw), { x, z, yaw });
}

async function setCaptureCamera(page, { position, target, fov }) {
  await page.evaluate((args) => {
    const [px, py, pz] = args.position;
    const [tx, ty, tz] = args.target;
    return window.__MFERLAND_REAL_GAME_CAPTURE?.camera({
      position: { x: px, y: py, z: pz },
      target: { x: tx, y: ty, z: tz },
      fov: args.fov,
    });
  }, { position, target, fov });
}

async function setLocalCaptureCamera(page, { distance, height, targetHeight, yawOffset = 0, fov }) {
  await page.evaluate((args) => {
    const bridge = window.__MFERLAND_REAL_GAME_CAPTURE;
    const snapshot = bridge?.snapshot();
    const player = snapshot?.players.find((entry) => entry.sessionId === bridge.sessionId);
    if (!bridge || !player) return false;
    const yaw = player.yaw + args.yawOffset;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    return bridge.camera({
      position: {
        x: player.x + forwardX * args.distance,
        y: (player.y || 0) + args.height,
        z: player.z + forwardZ * args.distance,
      },
      target: {
        x: player.x,
        y: (player.y || 0) + args.targetHeight,
        z: player.z,
      },
      fov: args.fov,
    });
  }, { distance, height, targetHeight, yawOffset, fov });
}

async function localInput(page, x, z, yaw, sprint, jump) {
  await page.evaluate((args) => window.__MFERLAND_REAL_GAME_CAPTURE?.input(args.x, args.z, args.yaw, args.sprint, args.jump), { x, z, yaw, sprint, jump });
}

async function localMoveToward(page, [targetX, targetZ], { sprint = true, jump = false } = {}) {
  return await page.evaluate((args) => {
    const bridge = window.__MFERLAND_REAL_GAME_CAPTURE;
    const snapshot = bridge?.snapshot();
    const player = snapshot?.players.find((entry) => entry.sessionId === bridge.sessionId);
    if (!bridge || !player) return null;
    const dx = args.targetX - player.x;
    const dz = args.targetZ - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.2) {
      bridge.input(0, 0, player.yaw, false, false);
      return { distance };
    }
    const x = dx / distance;
    const z = dz / distance;
    bridge.input(x, z, Math.atan2(x, z), args.sprint, args.jump);
    return { distance };
  }, { targetX, targetZ, sprint, jump });
}

async function localFaceTarget(page, targetId) {
  await page.evaluate((id) => {
    const bridge = window.__MFERLAND_REAL_GAME_CAPTURE;
    const snapshot = bridge?.snapshot();
    const player = snapshot?.players.find((entry) => entry.sessionId === bridge.sessionId);
    const target = snapshot?.npcs.find((entry) => entry.id === id);
    if (!bridge || !player || !target) return false;
    bridge.input(0, 0, Math.atan2(target.x - player.x, target.z - player.z), false, false);
    bridge.selectTarget({ kind: "npc", id });
    return true;
  }, targetId);
}

async function localChat(page, text) {
  await page.evaluate((message) => window.__MFERLAND_REAL_GAME_CAPTURE?.chat(message), text);
}

async function setupNpc(page, message) {
  await page.evaluate((payload) => window.__MFERLAND_REAL_GAME_CAPTURE?.setupNpc(payload), message);
}

async function getLocalSessionId(page) {
  return await page.evaluate(() => window.__MFERLAND_REAL_GAME_CAPTURE?.sessionId ?? "");
}

async function setLocalAgentStatus(page, { action, thought, objective, quest, used = 0, dailyUsed = 0 }) {
  const now = Date.now();
  await page.evaluate((message) => window.__MFERLAND_REAL_GAME_CAPTURE?.agentStatus(message), {
    action,
    thought,
    objective,
    quest,
    commandStatus: "running",
    commandBudgetTier: CAMERA_AGENT.tier,
    commandStartedAt: now - used * 1000,
    commandMaxSeconds: CAMERA_AGENT.sessionMax,
    commandSessionUsedSeconds: used,
    commandSessionRemainingSeconds: Math.max(0, CAMERA_AGENT.sessionMax - used),
    commandDailyUsedSeconds: dailyUsed,
    commandDailyRemainingSeconds: Math.max(0, CAMERA_AGENT.dailyTotal - dailyUsed),
    commandDailySeconds: CAMERA_AGENT.dailyTotal,
  });
}

function setSupportStatus(agent, action, quest) {
  const now = Date.now();
  agent.room.send("agentStatus", {
    action,
    thought: `${agent.role} scheme active`,
    objective: "group autoplay scheme",
    quest,
    commandStatus: "running",
    commandBudgetTier: agent.tier,
    commandStartedAt: now - 120000,
    commandMaxSeconds: agent.sessionMax,
    commandSessionUsedSeconds: 120,
    commandSessionRemainingSeconds: Math.max(0, agent.sessionMax - 120),
    commandDailyUsedSeconds: 480,
    commandDailyRemainingSeconds: Math.max(0, agent.dailyTotal - 480),
    commandDailySeconds: agent.dailyTotal,
  });
}

async function supportChat(agent, text) {
  agent.room.send("chat", { text });
}

function getAgentSessionId(agent) {
  return agent?.sessionId || "";
}

function stopLoops(loops) {
  for (const loop of loops.flat()) clearInterval(loop);
}

async function renderGameplaySegment(clip) {
  const headlinePath = await writeTextFile(`${clip.id}-headline.txt`, clip.headline);
  const subheadPath = await writeTextFile(`${clip.id}-subhead.txt`, clip.subhead);
  const calloutFilters = await makeCalloutFilters(clip);
  const segment = path.join(SEGMENT_DIR, `${clip.id}.mp4`);
  const durationSec = clip.durationMs / 1000;
  const vf = [
    `fps=${FPS}`,
    `scale=${VIEWPORT.width}:${VIEWPORT.height}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${VIEWPORT.width}:${VIEWPORT.height}`,
    "eq=contrast=1.08:saturation=1.14:brightness=0.015",
    `fade=t=in:st=0:d=0.25`,
    `fade=t=out:st=${Math.max(0, durationSec - 0.35).toFixed(2)}:d=0.35`,
    ...makeHeadingFilters(clip, headlinePath, subheadPath),
    ...calloutFilters,
    "format=yuv420p",
  ].join(",");
  runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", clip.trimStartSec.toFixed(3),
    "-i", clip.rawPath,
    "-t", durationSec.toFixed(3),
    "-vf", vf,
    "-an",
    "-r", String(FPS),
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "18",
    "-movflags", "+faststart",
    segment,
  ]);
  await makeThumbnail(segment, clip.id);
  return segment;
}

function makeHeadingFilters(clip, headlinePath, subheadPath) {
  if (clip.hud) {
    return [
      "drawbox=x=352:y=22:w=610:h=90:color=black@0.36:t=fill",
      "drawbox=x=352:y=22:w=610:h=90:color=white@0.26:t=1",
      `drawtext=fontfile=${FONT}:textfile=${headlinePath}:x=374:y=34:fontsize=34:fontcolor=white:shadowcolor=black@0.9:shadowx=2:shadowy=2`,
      `drawtext=fontfile=${FONT}:textfile=${subheadPath}:x=376:y=78:fontsize=19:fontcolor=#F7D77B:shadowcolor=black@0.9:shadowx=2:shadowy=2`,
    ];
  }
  return [
    `drawbox=x=0:y=0:w=iw:h=128:color=black@0.34:t=fill`,
    `drawtext=fontfile=${FONT}:textfile=${headlinePath}:x=56:y=34:fontsize=42:fontcolor=white:shadowcolor=black@0.9:shadowx=2:shadowy=2`,
    `drawtext=fontfile=${FONT}:textfile=${subheadPath}:x=58:y=86:fontsize=23:fontcolor=#F7D77B:shadowcolor=black@0.9:shadowx=2:shadowy=2`,
  ];
}

async function makeCalloutFilters(clip) {
  if (!clip.calloutTitle && (!clip.calloutLines || clip.calloutLines.length === 0)) return [];
  const titlePath = await writeTextFile(`${clip.id}-callout-title.txt`, clip.calloutTitle || "DETAILS");
  const bodyPath = await writeTextFile(`${clip.id}-callout-body.txt`, (clip.calloutLines ?? []).join("\n"));
  return [
    "drawbox=x=758:y=378:w=470:h=260:color=#071015@0.78:t=fill",
    "drawbox=x=758:y=378:w=470:h=260:color=#6AF2FF@0.72:t=2",
    `drawtext=fontfile=${TITLE_FONT}:textfile=${titlePath}:x=786:y=404:fontsize=26:fontcolor=#6AF2FF:shadowcolor=black@0.85:shadowx=2:shadowy=2`,
    `drawtext=fontfile=${FONT}:textfile=${bodyPath}:x=786:y=452:fontsize=20:fontcolor=white:line_spacing=11:shadowcolor=black@0.9:shadowx=2:shadowy=2`,
  ];
}

async function makeTitleCard(id, title, subtitle, durationSec, footer = "") {
  const titlePath = await writeTextFile(`${id}-title.txt`, title);
  const subtitlePath = await writeTextFile(`${id}-subtitle.txt`, subtitle);
  const footerPath = footer ? await writeTextFile(`${id}-footer.txt`, footer) : "";
  const segment = path.join(SEGMENT_DIR, `${id}.mp4`);
  const footerFilters = footerPath
    ? [
      "drawbox=x=420:y=596:w=440:h=58:color=#030507@0.62:t=fill",
      "drawbox=x=420:y=596:w=440:h=58:color=#6AF2FF@0.55:t=2",
      `drawtext=fontfile=${FONT}:textfile=${footerPath}:x=(w-text_w)/2:y=614:fontsize=25:fontcolor=#6AF2FF:shadowcolor=#000000@1:shadowx=2:shadowy=2`,
    ]
    : [];
  const vf = [
    `drawbox=x=0:y=0:w=iw:h=ih:color=#080A0B@1:t=fill`,
    `drawbox=x=44:y=44:w=1192:h=632:color=#1B2228@0.52:t=3`,
    `drawtext=fontfile=${TITLE_FONT}:textfile=${titlePath}:x=(w-text_w)/2:y=270:fontsize=56:fontcolor=white:shadowcolor=#000000@1:shadowx=3:shadowy=3`,
    `drawtext=fontfile=${FONT}:textfile=${subtitlePath}:x=(w-text_w)/2:y=352:fontsize=25:fontcolor=#F7D77B:shadowcolor=#000000@1:shadowx=2:shadowy=2`,
    `drawtext=fontfile=${FONT}:text='${BRAND_NAME}':x=58:y=58:fontsize=22:fontcolor=#66F2FF`,
    ...footerFilters,
    `fade=t=in:st=0:d=0.35`,
    `fade=t=out:st=${Math.max(0, durationSec - 0.4).toFixed(2)}:d=0.4`,
    "format=yuv420p",
  ].join(",");
  runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi",
    "-i", `color=c=#080A0B:s=${VIEWPORT.width}x${VIEWPORT.height}:r=${FPS}:d=${durationSec}`,
    "-vf", vf,
    "-an",
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "18",
    "-movflags", "+faststart",
    segment,
  ]);
  return segment;
}

async function makeVideoTitleCard(id, title, subtitle, durationSec, videoPath, options = {}) {
  if (!existsSync(videoPath)) return makeTitleCard(id, title, subtitle, durationSec);
  const titlePath = await writeTextFile(`${id}-title.txt`, title);
  const subtitlePath = await writeTextFile(`${id}-subtitle.txt`, subtitle);
  const footerPath = options.footer ? await writeTextFile(`${id}-footer.txt`, options.footer) : "";
  const segment = path.join(SEGMENT_DIR, `${id}.mp4`);
  const blurFilters = options.blur === false ? [] : [`boxblur=${typeof options.blur === "string" ? options.blur : "2:1"}`];
  const overlay = options.overlay ?? "#030507@0.54";
  const footerFilters = footerPath
    ? [
      "drawbox=x=420:y=596:w=440:h=58:color=#030507@0.62:t=fill",
      "drawbox=x=420:y=596:w=440:h=58:color=#6AF2FF@0.55:t=2",
      `drawtext=fontfile=${FONT}:textfile=${footerPath}:x=(w-text_w)/2:y=614:fontsize=25:fontcolor=#6AF2FF:shadowcolor=#000000@1:shadowx=2:shadowy=2`,
    ]
    : [];
  const vf = [
    `fps=${FPS}`,
    `scale=${VIEWPORT.width}:${VIEWPORT.height}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${VIEWPORT.width}:${VIEWPORT.height}`,
    ...blurFilters,
    "eq=contrast=1.18:saturation=1.05:brightness=-0.07",
    `drawbox=x=0:y=0:w=iw:h=ih:color=${overlay}:t=fill`,
    "drawbox=x=42:y=42:w=1196:h=636:color=#6AF2FF@0.32:t=2",
    `drawtext=fontfile=${TITLE_FONT}:textfile=${titlePath}:x=(w-text_w)/2:y=270:fontsize=56:fontcolor=white:shadowcolor=#000000@1:shadowx=3:shadowy=3`,
    `drawtext=fontfile=${FONT}:textfile=${subtitlePath}:x=(w-text_w)/2:y=352:fontsize=25:fontcolor=#F7D77B:shadowcolor=#000000@1:shadowx=2:shadowy=2`,
    `drawtext=fontfile=${FONT}:text='${BRAND_NAME}':x=58:y=58:fontsize=22:fontcolor=#66F2FF:shadowcolor=#000000@1:shadowx=2:shadowy=2`,
    ...footerFilters,
    `fade=t=in:st=0:d=0.35`,
    `fade=t=out:st=${Math.max(0, durationSec - 0.4).toFixed(2)}:d=0.4`,
    "format=yuv420p",
  ].join(",");
  const startSec = Math.max(0, Number(options.startSec ?? 0));
  runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-stream_loop", "-1",
    "-ss", startSec.toFixed(3),
    "-i", videoPath,
    "-t", String(durationSec),
    "-vf", vf,
    "-an",
    "-r", String(FPS),
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "18",
    "-movflags", "+faststart",
    segment,
  ]);
  return segment;
}

async function concatSegments(segments, output) {
  const concatFile = path.join(TEXT_DIR, "concat.txt");
  await writeFile(concatFile, segments.map((segment) => `file '${segment.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  runFfmpeg(["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", output]);
}

async function makeMusic(output, duration) {
  const wav = path.join(OUTPUT_ROOT, "generated-cinematic-music.wav");
  await writeSynthWave(wav, duration);
  const fadeOutStart = Math.max(0, duration - 2.1).toFixed(2);
  runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", wav,
    "-af", `acompressor=threshold=-15dB:ratio=3.2:attack=4:release=120,alimiter=limit=0.94,volume=1.7,afade=t=in:st=0:d=0.25,afade=t=out:st=${fadeOutStart}:d=2.1`,
    "-c:a", "aac",
    "-b:a", "192k",
    output,
  ]);
}

async function writeSynthWave(output, duration) {
  const sampleRate = 48000;
  const channels = 2;
  const totalSamples = Math.ceil(duration * sampleRate);
  const dataBytes = totalSamples * channels * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  writeWavHeader(buffer, sampleRate, channels, dataBytes);

  const bpm = 136;
  const beat = 60 / bpm;
  const bassNotes = [41.2, 49.0, 55.0, 36.7, 41.2, 61.7, 55.0, 49.0];
  const leadNotes = [164.8, 196.0, 220.0, 246.9, 293.7, 329.6, 293.7, 246.9];
  let noiseSeed = 0x14f00d;
  const nextNoise = () => {
    noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0;
    return (noiseSeed / 0x80000000) - 1;
  };

  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t / beat);
    const beatPhase = t - beatIndex * beat;
    const halfPhase = t - Math.floor(t / (beat / 2)) * (beat / 2);
    const barBeat = beatIndex % 4;
    const sectionLift = Math.min(1, t / 6) * Math.min(1, (duration - t) / 3);
    const noise = nextNoise();

    const kickEnv = Math.exp(-beatPhase * 12);
    const kickFreq = 42 + 72 * Math.exp(-beatPhase * 28);
    const kick = kickEnv * Math.sin(Math.PI * 2 * kickFreq * beatPhase) * (barBeat === 0 || barBeat === 2 ? 1 : 0.3);

    const snareTime = Math.abs(beatPhase);
    const snareHit = barBeat === 1 || barBeat === 3;
    const snareEnv = snareHit ? Math.exp(-snareTime * 20) : 0;
    const snare = snareEnv * (noise * 0.72 + Math.sin(Math.PI * 2 * 190 * beatPhase) * 0.28);

    const hatEnv = Math.exp(-halfPhase * 44);
    const hat = hatEnv * noise * (beatIndex % 2 === 0 ? 0.48 : 0.34);

    const bassFreq = bassNotes[beatIndex % bassNotes.length];
    const bassEnv = 0.7 + 0.3 * Math.exp(-beatPhase * 3.5);
    const bass = bassEnv * (
      Math.sin(Math.PI * 2 * bassFreq * t) * 0.74
      + Math.sin(Math.PI * 2 * bassFreq * 2 * t) * 0.2
      + Math.sin(Math.PI * 2 * bassFreq * 3 * t) * 0.08
    );

    const leadStep = Math.floor(t / (beat / 2));
    const leadFreq = leadNotes[leadStep % leadNotes.length];
    const leadPhase = t * leadFreq;
    const leadWave = Math.sign(Math.sin(Math.PI * 2 * leadPhase)) * 0.46
      + Math.sin(Math.PI * 2 * leadFreq * 2 * t) * 0.14;
    const leadGate = Math.pow(Math.max(0, 1 - halfPhase / (beat / 2)), 0.7);
    const lead = leadWave * leadGate * (0.35 + 0.18 * Math.sin(Math.PI * 2 * 0.15 * t));

    const pad = Math.sin(Math.PI * 2 * 82.4 * t) * 0.12
      + Math.sin(Math.PI * 2 * 123.5 * t) * 0.08
      + Math.sin(Math.PI * 2 * 164.8 * t) * 0.05;
    const duck = 1 - Math.min(0.42, kickEnv * 0.42);

    const core = (
      kick * 0.86
      + snare * 0.72
      + hat * 0.24
      + bass * 0.5 * duck
      + lead * 0.22 * sectionLift
      + pad * 0.24 * duck
    ) * sectionLift;
    const left = softClip(core + lead * 0.08 - hat * 0.04);
    const right = softClip(core - lead * 0.08 + hat * 0.04);
    const offset = 44 + i * channels * 2;
    buffer.writeInt16LE(Math.round(left * 32767), offset);
    buffer.writeInt16LE(Math.round(right * 32767), offset + 2);
  }

  await writeFile(output, buffer);
}

function softClip(value) {
  return Math.tanh(value * 1.28) * 0.86;
}

function writeWavHeader(buffer, sampleRate, channels, dataBytes) {
  const byteRate = sampleRate * channels * 2;
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
}

async function makeThumbnail(video, id) {
  runFfmpeg(["-hide_banner", "-loglevel", "error", "-y", "-ss", "00:00:03", "-i", video, "-frames:v", "1", path.join(THUMBNAIL_DIR, `${id}.png`)]);
}

async function writeStoryboard() {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const sceneRows = SCENES.map((scene, index) => `${index + 1}. ${scene.title}: ${scene.headline} (${scene.hud ? "brief actual-game HUD" : "no HUD"})`).join("\n");
  const body = `# mfertown Agent Autoplay Commercial Storyboard

Fresh local-only capture plan. These are staged wallet-declared test agents, not old player footage.

${sceneRows}

Capture rules:

- Use the actual playable game renderer: \`/?realCapture=1&realCaptureAgent=1\`.
- Default to \`realCaptureHud=0\`; no streamer view and no \`/agent-view\` capture.
- Optional HUD proof is disabled by default and only records when \`AGENT_COMMERCIAL_INCLUDE_HUD=1\`.
- The script is plan-only unless \`--record\` is passed.
- Production safety: local Postgres under \`.tmp/agent-commercial-pg\`, \`MFERLAND_LOCAL_ONLY=1\`, local server/web ports, fresh test wallets.

Run later:

\`\`\`sh
node scripts/create-agent-autoplay-commercial.mjs --record
\`\`\`
`;
  await writeFile(path.join(OUTPUT_ROOT, "STORYBOARD.md"), body);
}

async function writeManifest(data) {
  await writeFile(path.join(OUTPUT_ROOT, "manifest.json"), `${JSON.stringify({
    createdAt: new Date().toISOString(),
    localOnly: true,
    captureSurface: "/?realCapture=1&realCaptureAgent=1",
    mostlyNoHud: true,
    serverUrl: SERVER_URL,
    webUrl: WEB_URL,
    databaseUrl: summarizeDatabaseUrl(DATABASE_URL),
    cameraAgent: CAMERA_AGENT,
    supportAgents: SUPPORT_AGENTS,
    storyboard: path.join(OUTPUT_ROOT, "STORYBOARD.md"),
    finalVideo: data.finalVideo,
    silentVideo: data.silentVideo,
    music: data.music,
    poster: data.poster,
    durationSeconds: data.duration,
    rawClips: data.clips.map((clip) => ({
      id: clip.id,
      rawPath: clip.rawPath,
      headline: clip.headline,
      hud: clip.hud,
      calloutTitle: clip.calloutTitle,
      calloutLines: clip.calloutLines,
      trimStartSec: clip.trimStartSec,
      durationMs: clip.durationMs,
    })),
    segments: data.segments,
  }, null, 2)}\n`);
}

async function writeTextFile(name, text) {
  const file = path.join(TEXT_DIR, name);
  await writeFile(file, text);
  return file;
}

async function cleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  if (browser) await browser.close().catch(() => {});
  await stopStartedProcesses();
  if (startedPostgres && process.env.AGENT_COMMERCIAL_KEEP_DB !== "1") {
    spawnSync("pg_ctl", ["-D", DB_DIR, "stop"], { cwd: ROOT_DIR, stdio: "ignore" });
  }
}

async function stopStartedProcesses() {
  for (const child of startedProcesses) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    killProcessGroup(child, "SIGTERM");
  }
  await Promise.all(startedProcesses.map((child) => waitForChildExit(child, 5000).catch(() => {
    killProcessGroup(child, "SIGKILL");
  })));
}

function killProcessGroup(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Process already exited.
    }
  }
}

async function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function isHttpReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
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

async function waitFor(fn, label, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await fn()) return;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label}`);
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

async function ffprobeDuration(file) {
  const result = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ffprobe failed for ${file}`);
  return Number(result.stdout.trim());
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", args, { cwd: ROOT_DIR, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`ffmpeg failed with status ${result.status}`);
}

function yawTo([fromX, fromZ], [toX, toZ]) {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

function makeWallet(index) {
  return `0x${(0x1000000000000000000000000000000000000000n + BigInt(index)).toString(16).slice(-40)}`;
}

function summarizeDatabaseUrl(value) {
  const parsed = new URL(value);
  return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
