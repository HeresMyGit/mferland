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
const obs = new OBSWebSocket();

const OBS_WS = process.env.OBS_WS || "ws://localhost:4455";
const OBS_PASSWORD = process.env.OBS_PASSWORD || "";
const SCENE_NAME = process.env.MFERLAND_OBS_SCENE || "mferGPT Mferland Stream";
const STREAM_URL = process.env.MFERLAND_STREAM_URL || makeDefaultStreamUrl();

function makeDefaultStreamUrl() {
  const port = process.env.MFERLAND_STREAM_PORT || "5173";
  const params = new URLSearchParams();
  params.set("cycle", process.env.MFERLAND_STREAM_CYCLE || "45");
  if (process.env.MFERLAND_STREAM_INVITE) params.set("invite", process.env.MFERLAND_STREAM_INVITE);
  return `http://127.0.0.1:${port}/stream/overlay?${params.toString()}`;
}

async function setup() {
  try {
    await obs.connect(OBS_WS, OBS_PASSWORD || undefined);
    console.log(`Connected to OBS WebSocket: ${OBS_WS}`);
  } catch (error) {
    console.error("Failed to connect to OBS.");
    console.error("Open OBS and enable Tools -> WebSocket Server Settings -> Enable WebSocket server.");
    console.error(error.message || error);
    process.exit(1);
  }

  await ensureScene(SCENE_NAME);
  await obs.call("SetCurrentProgramScene", { sceneName: SCENE_NAME });

  await ensureInput(SCENE_NAME, "Mferland Stream Overlay", "browser_source", {
    url: STREAM_URL,
    width: 1280,
    height: 720,
    fps: 24,
    reroute_audio: true,
    restart_when_active: true,
    shutdown: false,
  });

  await setSceneItemTransform(SCENE_NAME, "Mferland Stream Overlay", {
    positionX: 0,
    positionY: 0,
    boundsType: "OBS_BOUNDS_STRETCH",
    boundsWidth: 1920,
    boundsHeight: 1080,
    boundsAlignment: 0,
  });

  await setInputVolume("Mferland Stream Overlay", 1);
  await setInputAudioMonitorType("Mferland Stream Overlay", "OBS_MONITORING_TYPE_NONE");

  try {
    await ensureInput(SCENE_NAME, "Mferland Desktop Audio", "coreaudio_output_capture", {});
    await setInputVolume("Mferland Desktop Audio", 0.75);
    await setInputAudioMonitorType("Mferland Desktop Audio", "OBS_MONITORING_TYPE_NONE");
  } catch (error) {
    console.log(`Desktop audio source note: ${error.message || error}`);
  }

  console.log("\n=== OBS stream scene ready ===");
  console.log(`Scene: ${SCENE_NAME}`);
  console.log(`Overlay source: ${STREAM_URL}`);
  console.log("Audio: browser source audio is routed to OBS; desktop audio capture is present as a backup.");

  await obs.disconnect();
}

async function ensureScene(sceneName) {
  try {
    await obs.call("CreateScene", { sceneName });
    console.log(`Created scene: ${sceneName}`);
  } catch (error) {
    if ((error.message || "").includes("already exists") || error.code === 601) {
      console.log(`Scene exists: ${sceneName}`);
      return;
    }
    throw error;
  }
}

async function ensureInput(sceneName, inputName, inputKind, inputSettings) {
  try {
    await obs.call("CreateInput", { sceneName, inputName, inputKind, inputSettings });
    console.log(`Added: ${inputName}`);
  } catch (error) {
    if ((error.message || "").includes("already exists") || error.code === 601) {
      await obs.call("SetInputSettings", { inputName, inputSettings, overlay: true });
      await ensureInputInScene(sceneName, inputName);
      console.log(`Updated: ${inputName}`);
      return;
    }
    throw error;
  }
}

async function ensureInputInScene(sceneName, sourceName) {
  if (await getSceneItemId(sceneName, sourceName) !== null) return;
  await obs.call("CreateSceneItem", { sceneName, sourceName });
}

async function getSceneItemId(sceneName, sourceName) {
  const { sceneItems } = await obs.call("GetSceneItemList", { sceneName });
  const item = sceneItems.find((sceneItem) => sceneItem.sourceName === sourceName);
  return item ? item.sceneItemId : null;
}

async function setSceneItemTransform(sceneName, sourceName, sceneItemTransform) {
  const sceneItemId = await getSceneItemId(sceneName, sourceName);
  if (sceneItemId === null) {
    console.log(`Could not position missing source: ${sourceName}`);
    return;
  }

  await obs.call("SetSceneItemTransform", {
    sceneName,
    sceneItemId,
    sceneItemTransform,
  });
}

async function setInputVolume(inputName, inputVolumeMul) {
  try {
    await obs.call("SetInputVolume", { inputName, inputVolumeMul });
  } catch (error) {
    console.log(`Volume note for ${inputName}: ${error.message || error}`);
  }
}

async function setInputAudioMonitorType(inputName, monitorType) {
  try {
    await obs.call("SetInputAudioMonitorType", { inputName, monitorType });
  } catch (error) {
    console.log(`Audio monitor note for ${inputName}: ${error.message || error}`);
  }
}

setup().catch(async (error) => {
  console.error("OBS setup failed:", error.stack || error.message || error);
  try {
    await obs.disconnect();
  } catch {}
  process.exit(1);
});
