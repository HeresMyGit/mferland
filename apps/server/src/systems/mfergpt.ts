import { type MapSchema } from "@colyseus/schema";
import {
  MFERGPT,
  QUESTS,
  QUEST_IDS,
  getNpcDisposition,
  getQuestTurnInNpcId,
  stableHash,
  type QuestId,
} from "@mferland/shared";
import { type NpcState, type PlayerState } from "../state.js";
import { requestCodexCliLlm } from "./codexCliLlm.js";
import { spawnNpcFromSpec } from "./npcs.js";
import { isQuestAvailable } from "./quests.js";

export type MferGptCommand = "chat" | "event" | "hint" | "inspect" | "spawn";

export type MferGptTemporaryNpc = {
  id: string;
  expiresAt: number;
};

export type MferGptResult = {
  command: MferGptCommand;
  responseText: string;
  temporaryNpcs: MferGptTemporaryNpc[];
};

type MferGptContext = {
  sessionId: string;
  player: PlayerState;
  players: MapSchema<PlayerState>;
  npcs: MapSchema<NpcState>;
  prompt: string;
  now: number;
};

type ToolOutcome = {
  fallback: string;
  summary: string;
  temporaryNpcs?: MferGptTemporaryNpc[];
};

export function getMferGptPrompt(text: string) {
  const mentionIndex = text.toLowerCase().indexOf(MFERGPT.mention);
  if (mentionIndex < 0) return null;

  const prompt = `${text.slice(0, mentionIndex)} ${text.slice(mentionIndex + MFERGPT.mention.length)}`
    .replace(/\s+/g, " ")
    .trim();
  return prompt || "help";
}

export async function handleMferGptPrompt(context: MferGptContext): Promise<MferGptResult> {
  const command = getMferGptCommand(context.prompt);
  const outcome = runMferGptTool(command, context);
  const safeState = describeSafePublicState(context);
  const responseText = await narrateMferGptResponse({
    command,
    fallback: outcome.fallback,
    playerName: context.player.name,
    prompt: context.prompt,
    safeState,
    toolSummary: outcome.summary,
  });

  return {
    command,
    responseText,
    temporaryNpcs: outcome.temporaryNpcs ?? [],
  };
}

function getMferGptCommand(prompt: string): MferGptCommand {
  const normalized = prompt.toLowerCase();
  if (/\b(spawn|summon|arena|bad guy|bad guys|test fight|training fight)\b/.test(normalized)) return "spawn";
  if (/\b(hint|quest|objective|stuck|what now|where next)\b/.test(normalized)) return "hint";
  if (/\b(event|town event|signal|party|pulse)\b/.test(normalized)) return "event";
  if (/\b(inspect|state|status|scan|who is here|where am i|where are we)\b/.test(normalized)) return "inspect";
  return "chat";
}

function runMferGptTool(command: MferGptCommand, context: MferGptContext): ToolOutcome {
  if (command === "spawn") return spawnArenaEnemies(context);
  if (command === "hint") return getQuestHint(context);
  if (command === "event") return triggerTownEvent(context);
  if (command === "inspect") return inspectPublicState(context);

  return {
    fallback: `gm ${context.player.name}. i do hints, room scans, and small arena trouble.`,
    summary: "No special tool was invoked; reply as an in-world town assistant.",
  };
}

function spawnArenaEnemies({ sessionId, npcs, now }: MferGptContext): ToolOutcome {
  const activeArenaEnemies = countNpcsWithPrefix(npcs, MFERGPT.temporaryEnemyPrefix);
  const available = MFERGPT.maxTemporaryEnemies - activeArenaEnemies;
  if (available <= 0) {
    return {
      fallback: "Arena already has enough temporary trouble. Clear those echoes first.",
      summary: "Spawn request rejected because the arena temporary enemy cap is active.",
    };
  }

  const count = Math.min(MFERGPT.temporaryEnemyCount, available);
  const expiresAt = now + MFERGPT.temporaryEnemyLifetimeMs;
  const temporaryNpcs: MferGptTemporaryNpc[] = [];
  const badGuyNames = ["dummy trouble", "glitched farmhand", "loop-burnt echo", "static brawler"];

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + (now % 6280) / 1000;
    const radius = MFERGPT.arenaRadius * (0.72 + index * 0.12);
    const id = `${MFERGPT.temporaryEnemyPrefix}${now.toString(36)}-${index}`;
    const name = badGuyNames[(stableHash(id) + index) % badGuyNames.length] ?? "Arena echo";
    const npc = spawnNpcFromSpec(npcs, {
      id,
      name,
      role: "farmer",
      model: "mfer",
      x: MFERGPT.arenaCenter.x + Math.cos(angle) * radius,
      z: MFERGPT.arenaCenter.z + Math.sin(angle) * radius,
      yaw: angle + Math.PI,
      leashRadius: 6.8,
      health: 46,
      maxHealth: 46,
      combatStyle: "melee",
      dialogue: "temporary trouble. clean dummy check.",
    }, now);
    npc.aggroTargetId = sessionId;
    npc.attackReadyAt = now + 1200;
    temporaryNpcs.push({ id, expiresAt });
  }

  return {
    fallback: `spawned ${temporaryNpcs.length} small arena problems by the bonk dummies. they fade soon.`,
    summary: `Spawned ${temporaryNpcs.length} temporary arena enemies with controlled expiry.`,
    temporaryNpcs,
  };
}

function triggerTownEvent({ npcs, now }: MferGptContext): ToolOutcome {
  if (countNpcsWithPrefix(npcs, MFERGPT.temporaryEventPrefix) > 0) {
    return {
      fallback: "The town signal is already running. Let this one fade before starting another.",
      summary: "Town event request rejected because a temporary event is already active.",
    };
  }

  const expiresAt = now + MFERGPT.townEventLifetimeMs;
  const temporaryNpcs: MferGptTemporaryNpc[] = [];
  const eventNpcs = [
    { name: "signal mfer", x: -5.8, z: -3.7, yaw: 1.2 },
    { name: "town ping mfer", x: -2.4, z: -6.2, yaw: -0.4 },
  ];

  for (let index = 0; index < eventNpcs.length; index += 1) {
    const eventNpc = eventNpcs[index];
    const id = `${MFERGPT.temporaryEventPrefix}${now.toString(36)}-${index}`;
    spawnNpcFromSpec(npcs, {
      id,
      name: eventNpc.name,
      role: "wanderer",
      model: "mfer",
      x: eventNpc.x,
      z: eventNpc.z,
      yaw: eventNpc.yaw,
      leashRadius: 4.4,
      isImmortal: true,
      dialogue: "mferGPT's town signal is live for a minute.",
    }, now);
    temporaryNpcs.push({ id, expiresAt });
  }

  return {
    fallback: "town signal is live. couple signal mfers are circling the fountain for a minute.",
    summary: "Triggered a limited town signal event with temporary friendly NPCs.",
    temporaryNpcs,
  };
}

function getQuestHint({ player, npcs, now }: MferGptContext): ToolOutcome {
  const activeQuest = getCurrentQuest(player);
  if (activeQuest) {
    const hint = getActiveQuestHint(activeQuest.id, activeQuest.status, activeQuest.progress, activeQuest.required, activeQuest.flags, npcs);
    return {
      fallback: hint,
      summary: `Generated quest hint for ${activeQuest.id}.`,
    };
  }

  const availableQuestId = QUEST_IDS.find((questId) => isQuestAvailable(player, questId, now));
  if (availableQuestId) {
    const quest = QUESTS[availableQuestId];
    return {
      fallback: `pick up ${quest.title} from ${getNpcName(npcs, quest.giverNpcId)}.`,
      summary: `Found available quest ${availableQuestId}.`,
    };
  }

  return {
    fallback: "no urgent errand is open. check the route board dailies later or ask for a room scan.",
    summary: "No active, ready, or currently available quest found.",
  };
}

function inspectPublicState(context: MferGptContext): ToolOutcome {
  return {
    fallback: describeSafePublicState(context),
    summary: "Inspected safe public room state only.",
  };
}

function getCurrentQuest(player: PlayerState) {
  const quests: Array<{
    id: QuestId;
    status: string;
    progress: number;
    required: number;
    flags: string;
  }> = [];

  player.quests.forEach((quest, id) => {
    if (quest.status === "completed") return;
    quests.push({
      id: (quest.id || id) as QuestId,
      status: quest.status,
      progress: quest.progress,
      required: quest.required,
      flags: quest.flags,
    });
  });

  return quests.sort((left, right) => {
    if (left.status === "ready" && right.status !== "ready") return -1;
    if (right.status === "ready" && left.status !== "ready") return 1;
    return left.id.localeCompare(right.id);
  })[0] ?? null;
}

function getActiveQuestHint(
  questId: QuestId,
  status: string,
  progress: number,
  required: number,
  flags: string,
  npcs: MapSchema<NpcState>,
) {
  const quest = QUESTS[questId];
  const turnInNpcName = getNpcName(npcs, getQuestTurnInNpcId(questId));
  const questHint = MFERGPT_QUEST_HINTS[questId];

  if (status === "ready") {
    return `${quest.title} is ready. turn it in to ${turnInNpcName}.`;
  }

  if (questId === "feral-farmers" && "objectives" in quest) {
    const completed = new Set(flags.split(",").filter(Boolean));
    const missing = quest.objectives
      .filter((objective) => !completed.has(objective.id))
      .map((objective) => objective.label.replace("Defeat ", ""));
    return missing.length > 0
      ? `for ${quest.title}, head to red-eye farm and handle ${missing.join(", ")}.`
      : `${quest.title} is basically done. check back with ${turnInNpcName}.`;
  }

  if (questId === "hog-livers") {
    return `for ${quest.title}, keep clearing wild hogs near the loop. you have ${progress}/${required} hog livers.`;
  }

  if (questId === "boar-bristle-cull") {
    return `for ${quest.title}, kill wild boars around red-eye farm. progress is ${progress}/${required}.`;
  }

  if (questId === "farmhand-bandanas") {
    return `for ${quest.title}, kill red-eye farmhands near the busted farm. progress is ${progress}/${required}.`;
  }

  if (questId === "mfergpt-checkin") {
    return `for ${quest.title}, put @mfergpt anywhere in chat. that's enough.`;
  }

  if (questId === "tweet-town-link") {
    return `for ${quest.title}, use the quest button to open the tweet composer. don't click tweet unless you mean it.`;
  }

  if (questId === "field-camp-delivery") {
    return `follow the dirt route past red-eye farm to route post, then talk to ${turnInNpcName}.`;
  }

  if (questId === "ridge-dispatch") {
    return `take the east cut, follow 0.069 mile and 4:20 turn, then talk to ${turnInNpcName}.`;
  }

  if (questId === "route-patrol-daily") {
    return `for ${quest.title}, clear hogs or red-eyes along the road. progress is ${progress}/${required}.`;
  }

  if (questId === "hog-loop") {
    return `for ${quest.title}, sweep wild hogs around red-eye farm and route post. progress is ${progress}/${required}.`;
  }

  if (questHint) {
    return questHint;
  }

  if ("requiredItemId" in quest) {
    return `for ${quest.title}, collect ${progress}/${required} ${String(quest.requiredItemId).replace(/-/g, " ")}.`;
  }

  return `for ${quest.title}, handle: ${quest.objectiveLabel}. progress is ${progress}/${required}.`;
}

const MFERGPT_QUEST_HINTS: Partial<Record<QuestId, string>> = {
  "mfer-beginnings": "pick up one honest lap from OG porch mfer, then head to board mfer by the corkboard.",
  "dao-tour": "board mfer sends you fountain-side. find fountain rail mfer; the board's done enough.",
  "fountain-vibes": "do the plaza loop, then take it back to OG porch mfer.",
  "sealed-note": "carry the folded offchain note to drip desk mfer. don't open it just because you can.",
  "ask-mfergpt": "hog farm first if you haven't. ask me where next, then check in with me and start with drip desk mfer's reply-loop rag job.",
  "farmhand-bandanas": "loop-burnt farm mfers drop reply-loop rags. bring back 2.",
  "feral-farmers": "head into the farm and take out loop-burnt bran, loop-burnt mae, and reply-loop sol.",
  "hog-livers": "wild hogs around the farm and loop drop hog loop livers. you need 5.",
  "field-camp-delivery": "take hogwatch's update north to route board mfer at the post.",
  "route-patrol-daily": "clear 6 hogs or farm trouble along the road, then check back at route board mfer.",
  "hog-loop": "loop booth mfer pays for 5 more hogs. ugly work, fast reset.",
  "ridge-dispatch": "follow the dirt cut east, hit the 0.069-mile stretch, take the 4:20 turn, and talk to ridge post mfer.",
  "signal-scraps": "signal-jacked ridge crew drop fried relay scraps. bring back 4.",
  "cut-the-static": "drop runner vex, off-route pax, and the broken mferGPT shell.",
  "baron-of-static": "bring people. the Static Baron is one big body made out of bad feed.",
  "ogre-raid-daily": "once the relay is charged, drop too much signal and go tell relay shack mfer.",
};

function describeSafePublicState({ player, players, npcs }: MferGptContext) {
  let playerCount = 0;
  let alivePlayers = 0;
  let hostileNpcs = 0;
  let temporaryNpcs = 0;

  players.forEach((visiblePlayer) => {
    playerCount += 1;
    if (visiblePlayer.health > 0) alivePlayers += 1;
  });

  npcs.forEach((npc) => {
    if (!npc.isImmortal && npc.health <= 0) return;
    const disposition = getNpcDisposition(npc);
    if (disposition === "hostile") hostileNpcs += 1;
    if (npc.id.startsWith(MFERGPT.temporaryEnemyPrefix) || npc.id.startsWith(MFERGPT.temporaryEventPrefix)) {
      temporaryNpcs += 1;
    }
  });

  const currentQuest = getCurrentQuest(player);
  const questText = currentQuest
    ? `${QUESTS[currentQuest.id].title} (${currentQuest.status}, ${Math.min(currentQuest.progress, currentQuest.required)}/${currentQuest.required})`
    : "none tracked";

  return `room scan: ${alivePlayers}/${playerCount} mfers standing, ${hostileNpcs} hostiles active, ${temporaryNpcs} temporary mferGPT npcs, your level ${player.level}, HP ${Math.ceil(player.health)}/${player.maxHealth}, current errand ${questText}.`;
}

function countNpcsWithPrefix(npcs: MapSchema<NpcState>, prefix: string) {
  let count = 0;
  npcs.forEach((npc, id) => {
    if (id.startsWith(prefix) && (npc.isImmortal || npc.health > 0 || npc.hasLoot)) count += 1;
  });
  return count;
}

function getNpcName(npcs: MapSchema<NpcState>, npcId: string) {
  return npcs.get(npcId)?.name ?? npcId.replace(/-/g, " ");
}

async function narrateMferGptResponse(input: {
  command: MferGptCommand;
  fallback: string;
  playerName: string;
  prompt: string;
  safeState: string;
  toolSummary: string;
}) {
  const llmResponse = await requestCodexLlm(input);
  return cleanResponse(llmResponse ?? input.fallback);
}

async function requestCodexLlm(input: {
  command: MferGptCommand;
  fallback: string;
  playerName: string;
  prompt: string;
  safeState: string;
  toolSummary: string;
}) {
  const provider = getCodexLlmProvider();
  if (provider === "off") return null;
  if (provider === "codex-cli") return requestCodexCliLlm(input, MFERGPT.llmTimeoutMs);

  const endpoint = process.env.CODEX_LLM_ENDPOINT?.trim();
  if (!endpoint) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MFERGPT.llmTimeoutMs);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...getCodexAuthHeaders(),
    };
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: process.env.CODEX_LLM_MODEL?.trim() || "codex-auth",
        messages: [
          {
            role: "system",
            content: [
              "You are mferGPT, an in-world MMO NPC assistant.",
              "Use only the supplied public game state and tool result.",
              "Never mention environment variables, secrets, wallets beyond public display text, or server internals.",
              "Keep replies under two short sentences.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              `Player: ${input.playerName}`,
              `Command: ${input.command}`,
              `Player prompt: ${input.prompt}`,
              `Tool result: ${input.toolSummary}`,
              `Public state: ${input.safeState}`,
              `Fallback if unsure: ${input.fallback}`,
            ].join("\n"),
          },
        ],
        max_tokens: 90,
        temperature: 0.35,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const payload = await response.json() as unknown;
    return extractLlmText(payload);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return null;
    console.warn("mfergpt.llm_request_failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getCodexLlmProvider() {
  const configured = process.env.CODEX_LLM_PROVIDER?.trim().toLowerCase();
  if (configured === "off" || configured === "none" || configured === "disabled") return "off";
  if (configured === "http" || configured === "endpoint") return "http";
  if (configured === "codex-cli" || configured === "codex" || configured === "cli") return "codex-cli";
  return process.env.CODEX_LLM_ENDPOINT?.trim() ? "http" : "codex-cli";
}

function getCodexAuthHeaders(): Record<string, string> {
  const bearer = process.env.CODEX_LLM_BEARER?.trim();
  return bearer ? { authorization: `Bearer ${bearer}` } : {};
}

function extractLlmText(payload: unknown): string | null {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return null;

  const data = payload as Record<string, unknown>;
  if (typeof data.output_text === "string") return data.output_text;
  if (typeof data.text === "string") return data.text;
  if (typeof data.content === "string") return data.content;

  const choices = Array.isArray(data.choices) ? data.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as Record<string, unknown>).message;
    if (message && typeof message === "object") {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === "string") return content;
    }
    const text = (choice as Record<string, unknown>).text;
    if (typeof text === "string") return text;
  }

  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") return text;
    }
  }

  return null;
}

function cleanResponse(text: string) {
  const cleaned = text
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "signal ate that one. try again in a sec.";
  return cleaned.slice(0, MFERGPT.responseMaxLength);
}
