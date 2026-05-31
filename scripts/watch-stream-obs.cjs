#!/usr/bin/env node

function loadObsWebSocket() {
  const candidates = [
    "obs-websocket-js",
    "/Users/mfergpt/dev/gpt-play-pokemon-firered-codex-clean/streamer/node_modules/obs-websocket-js",
    "/Users/mfergpt/dev/gpt-play-pokemon-firered/streamer/node_modules/obs-websocket-js",
  ];

  for (const candidate of candidates) {
    try {
      const module = require(candidate);
      return module.default || module;
    } catch {}
  }

  throw new Error("obs-websocket-js was not found. Install it or keep the pokemon streamer node_modules available.");
}

const OBSWebSocket = loadObsWebSocket();
const DEFAULT_STREAM_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

const OBS_WS = process.env.OBS_WS || "ws://localhost:4455";
const OBS_PASSWORD = process.env.OBS_PASSWORD || "";
const STREAM_SOURCE_NAME = process.env.MFERLAND_OBS_STREAM_SOURCE || "Mferland Stream Overlay";
const STREAM_URL = process.env.MFERLAND_STREAM_URL || makeDefaultStreamUrl();
const STREAM_HEALTH_URL = process.env.MFERLAND_STREAM_HEALTH_URL || STREAM_URL;
const STREAM_REFRESH_INTERVAL_MS = getRefreshIntervalMs();
const STREAM_HEALTH_TIMEOUT_MS = readPositiveIntegerEnv("MFERLAND_STREAM_HEALTH_TIMEOUT_MS", 5000);
const RUN_ONCE = process.env.MFERLAND_STREAM_REFRESH_ONCE === "1";

let stopped = false;

function makeDefaultStreamUrl() {
  const port = process.env.MFERLAND_STREAM_PORT || "5173";
  const params = new URLSearchParams();
  params.set("cycle", process.env.MFERLAND_STREAM_CYCLE || "45");
  if (process.env.MFERLAND_STREAM_INVITE) params.set("invite", process.env.MFERLAND_STREAM_INVITE);
  return `http://127.0.0.1:${port}/stream/overlay?${params.toString()}`;
}

async function main() {
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log("=== OBS stream watchdog ===");
  console.log(`OBS WebSocket: ${OBS_WS}`);
  console.log(`Browser source: ${STREAM_SOURCE_NAME}`);
  console.log(`Health URL: ${STREAM_HEALTH_URL}`);

  if (RUN_ONCE) {
    await refreshStreamSource("manual");
    return;
  }

  console.log(`Refresh interval: ${formatDuration(STREAM_REFRESH_INTERVAL_MS)}`);
  await refreshStreamSource("startup");

  while (!stopped) {
    await sleep(STREAM_REFRESH_INTERVAL_MS);
    if (!stopped) await refreshStreamSource("scheduled");
  }
}

async function refreshStreamSource(reason) {
  const startedAt = new Date();
  const reachable = await isStreamReachable(STREAM_HEALTH_URL);
  if (!reachable) {
    console.warn(`[${startedAt.toISOString()}] Skipping ${reason} refresh; stream URL is not reachable.`);
    return;
  }

  const obs = new OBSWebSocket();
  try {
    await obs.connect(OBS_WS, OBS_PASSWORD || undefined);
    const currentSettings = await getInputSettings(obs, STREAM_SOURCE_NAME);
    const currentUrl = typeof currentSettings.url === "string" && currentSettings.url.trim()
      ? currentSettings.url
      : STREAM_URL;
    const nextUrl = withWatchdogRefreshParam(currentUrl);

    await obs.call("SetInputSettings", {
      inputName: STREAM_SOURCE_NAME,
      inputSettings: {
        url: nextUrl,
        restart_when_active: true,
        shutdown: false,
      },
      overlay: true,
    });

    await pressRefreshButtonIfAvailable(obs, STREAM_SOURCE_NAME);
    console.log(`[${startedAt.toISOString()}] Refreshed ${STREAM_SOURCE_NAME} (${reason}).`);
  } catch (error) {
    console.error(`[${startedAt.toISOString()}] OBS refresh failed: ${error.message || error}`);
  } finally {
    try {
      await obs.disconnect();
    } catch {}
  }
}

async function getInputSettings(obs, inputName) {
  const response = await obs.call("GetInputSettings", { inputName });
  return response.inputSettings && typeof response.inputSettings === "object"
    ? response.inputSettings
    : {};
}

async function pressRefreshButtonIfAvailable(obs, inputName) {
  try {
    await obs.call("PressInputPropertiesButton", { inputName, propertyName: "refreshnocache" });
  } catch {
    try {
      await obs.call("PressInputPropertiesButton", { inputName, propertyName: "refresh" });
    } catch {}
  }
}

async function isStreamReachable(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STREAM_HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      method: "HEAD",
      signal: controller.signal,
    });
    if (response.ok) return true;
    if (response.status !== 405) return false;
  } catch (error) {
    if (error?.name === "AbortError") return false;
    return false;
  } finally {
    clearTimeout(timeout);
  }

  const getController = new AbortController();
  const getTimeout = setTimeout(() => getController.abort(), STREAM_HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      method: "GET",
      signal: getController.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(getTimeout);
  }
}

function withWatchdogRefreshParam(value) {
  try {
    const url = new URL(value);
    url.searchParams.set("obsWatchdog", String(Date.now()));
    return url.toString();
  } catch {
    const separator = value.includes("?") ? "&" : "?";
    return `${value}${separator}obsWatchdog=${Date.now()}`;
  }
}

function getRefreshIntervalMs() {
  if (process.env.MFERLAND_STREAM_REFRESH_INTERVAL_MS) {
    return readPositiveIntegerEnv("MFERLAND_STREAM_REFRESH_INTERVAL_MS", DEFAULT_STREAM_REFRESH_INTERVAL_MS);
  }

  const minutes = Number.parseFloat(process.env.MFERLAND_STREAM_REFRESH_MINUTES || "");
  if (Number.isFinite(minutes) && minutes > 0) return Math.round(minutes * 60 * 1000);
  return DEFAULT_STREAM_REFRESH_INTERVAL_MS;
}

function readPositiveIntegerEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stop() {
  stopped = true;
  console.log("\nStopping OBS stream watchdog.");
}

main().catch((error) => {
  console.error("OBS stream watchdog failed:", error.stack || error.message || error);
  process.exit(1);
});
