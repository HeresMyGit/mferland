import { QUEST_IDS, getQuestObjectives, type CombatActionId, type ItemId, type QuestId, type TalentId } from "@mferland/shared";
import { delay, type MferlandAgentClient, type Point } from "./client.js";

const DAILY_BOSS_NPC_ID = "mfergpt-daily-boss";
const CENTRALIZER_NPC_ID = "static-baron-nox";
const RAID_OGRE_NPC_ID = "raid-ogre-mfer";
const DAILY_BOSS_ROUTE: Point[] = [
  { x: -18, z: 0 },
  { x: -52, z: 0 },
  { x: -52, z: -36 },
  { x: -58, z: -48 },
  { x: -69.4, z: -55.6 },
];
const DAILY_BOSS_RETURN_ROUTE: Point[] = [
  { x: -58, z: -48 },
  { x: -52, z: -36 },
  { x: -52, z: 0 },
  { x: -18, z: 0 },
  { x: 6.8, z: -5.2 },
];
const DAILY_BOSS_ROUTE_RANGE = 12;
const DAILY_BOSS_RETURN_RANGE = 8;
const FARM_ROUTE: Point[] = [
  { x: 0, z: 29 },
  { x: -31, z: 60 },
  { x: -64.5, z: 64.5 },
];
const FARM_FROM_EAST_PLAZA_ROUTE: Point[] = [
  { x: 32, z: 22 },
  ...FARM_ROUTE,
];
const FARM_FROM_WEST_PLAZA_ROUTE: Point[] = [
  { x: -32, z: 22 },
  ...FARM_ROUTE,
];
const FARMYARD_ROUTE: Point[] = [
  { x: -76, z: 78 },
  { x: -82, z: 92 },
];
const FARM_APPROACHES: Partial<Record<string, Point[]>> = {
  "farmhand-bran": [{ x: -72, z: 84 }],
  "farmhand-mae": [{ x: -83, z: 96 }],
  "field-mage-sol": [
    { x: -68, z: 94 },
    { x: -68, z: 100 },
  ],
  "farmhand-jo": [{ x: -90, z: 100 }],
  "field-mage-ren": [{ x: -80, z: 104 }],
};
const FIELD_CAMP_ROUTE: Point[] = [
  { x: -82, z: 92 },
  { x: -101, z: 116 },
  { x: -119.2, z: 132.4 },
];
const RIDGE_ROUTE: Point[] = [
  { x: -101, z: 116 },
  { x: -76, z: 78 },
  { x: -31, z: 60 },
  { x: 0, z: 29 },
  { x: 0, z: -34 },
  { x: 53, z: -11.5 },
  { x: 75, z: -22 },
  { x: 120, z: -62 },
  { x: 108.8, z: -92.8 },
];
const RIDGE_FROM_PLAZA_ROUTE: Point[] = [
  { x: 0, z: -34 },
  { x: 53, z: -11.5 },
  { x: 75, z: -22 },
  { x: 120, z: -62 },
  { x: 108.8, z: -92.8 },
];
const RIDGE_FIELD_ROUTE: Point[] = [
  { x: 124, z: -104 },
  { x: 145.5, z: -84.2 },
];
const RIDGE_APPROACHES: Partial<Record<string, Point[]>> = {
  "ridge-raider-loop": [{ x: 124, z: -104 }],
  "ridge-raider-vex": [{ x: 133, z: -99 }],
  "ridge-raider-pax": [{ x: 143, z: -103 }],
  "ridge-raider-spark": [{ x: 146, z: -90 }],
  "static-mage-ori": [{ x: 145.5, z: -84.2 }],
  [CENTRALIZER_NPC_ID]: [{ x: 145.5, z: -84.2 }],
  [RAID_OGRE_NPC_ID]: [{ x: 124, z: -104 }],
};
const HOG_NPC_IDS = [
  "wild-hog-rooter",
  "wild-hog-bristle",
  "wild-hog-snort",
  "wild-hog-mud",
  "wild-hog-runt",
  "wild-hog-tusk",
  "wild-hog-grub",
  "wild-hog-boar",
  "wild-hog-thistle",
  "wild-hog-burrow",
  "wild-hog-ridge",
  "wild-hog-camp",
];
const FARMER_NPC_IDS = ["farmhand-bran", "farmhand-mae", "field-mage-sol"];
const ROUTE_PATROL_NPC_IDS = [
  "wild-hog-camp",
  "wild-hog-burrow",
  "wild-hog-ridge",
  "farmhand-jo",
  "field-mage-ren",
  "wild-hog-thistle",
];
const RIDGE_SCRAP_NPC_IDS = [
  "ridge-raider-loop",
  "ridge-raider-vex",
  "ridge-raider-pax",
  "ridge-raider-spark",
  "static-mage-ori",
];
const STATIC_CREW_NPC_IDS = ["ridge-raider-vex", "ridge-raider-pax", "static-mage-ori"];
const COMBAT_ACTIONS: CombatActionId[] = ["taunt", "iceBlast", "fireblast", "signalShot", "shoot", "whirlwind", "multishot", "attack"];
const COMBAT_TALENT_PLAN: TalentId[] = [
  "brawler:street-tough",
  "brawler:heavy-hands",
  "brawler:heavy-hands",
  "brawler:street-tough",
  "brawler:snap-swing",
  "brawler:street-tough",
  "brawler:snap-swing",
  "brawler:whirlwind",
];
const PROGRESSION_REWARDS: ItemId[] = [
  "reply-lag-visor",
  "field-patched-hoodie",
  "ridge-runner-beanie",
  "baron-breaker-board",
];

export type PlaytestScope = "core" | "all";

export type PlaytestResult = {
  agents: Array<{
    name: string;
    walletAddress: string;
    level: number;
    xp: number;
    completedQuests: QuestId[];
  }>;
  defeatedDailyBoss: boolean;
  defeatedCentralizer?: boolean;
  defeatedRaidOgre?: boolean;
  completedAllQuestIds?: QuestId[];
};

export async function runLocalAgentPlaytest(
  agents: MferlandAgentClient[],
  options: { scope?: PlaytestScope } = {},
): Promise<PlaytestResult> {
  logStage("starting intro questline");
  for (const agent of agents) {
    await runIntroQuestline(agent);
    await runMferGptQuestSetup(agent);
  }

  logStage("accepting daily boss quest");
  await Promise.all(agents.map(async (agent) => {
    await agent.acceptQuest("mfergpt-daily-signal", "mfergpt");
  }));

  const needsBossFight = agents.some((agent) => {
    const quest = agent.getQuest("mfergpt-daily-signal");
    return quest?.status === "active" && quest.progress < quest.required;
  });

  if (needsBossFight) {
    logStage("moving team to daily boss camp");
    await Promise.all(agents.map(async (agent) => {
      await agent.moveAlong(DAILY_BOSS_ROUTE, { range: DAILY_BOSS_ROUTE_RANGE, timeoutMs: 60_000 });
    }));

    logStage("fighting daily boss");
    await Promise.all(agents.map((agent) => agent.fightNpc(DAILY_BOSS_NPC_ID, {
      timeoutMs: 120_000,
      preferredActions: ["shoot", "attack"],
    })));
  }

  await delay(1000);
  const defeatedDailyBoss = !needsBossFight || agents.some((agent) => {
    const boss = agent.getNpc(DAILY_BOSS_NPC_ID);
    return !boss || boss.health <= 0 || boss.defeatedAt > 0;
  });

  for (const agent of agents) {
    if (!agent.hasCompletedQuest("mfergpt-daily-signal")) {
      logStage(`${agent.walletAddress.slice(0, 6)} returning daily quest`);
      await agent.moveAlong(DAILY_BOSS_RETURN_ROUTE, { range: DAILY_BOSS_RETURN_RANGE, timeoutMs: 60_000 });
      await agent.completeQuest("mfergpt-daily-signal", "mfergpt");
    }
  }

  let defeatedCentralizer = false;
  let defeatedRaidOgre = false;
  if (options.scope === "all") {
    const result = await runAllQuestline(agents);
    defeatedCentralizer = result.defeatedCentralizer;
    defeatedRaidOgre = result.defeatedRaidOgre;
  }

  const leadCompleted = agents[0]?.getSelf()?.quests
    .filter((quest) => quest.status === "completed")
    .map((quest) => quest.id) ?? [];

  return {
    agents: agents.map((agent) => {
      const self = agent.getSelf();
      return {
        name: self?.name ?? "",
        walletAddress: agent.walletAddress,
        level: self?.level ?? 0,
        xp: self?.xp ?? 0,
        completedQuests: self?.quests
          .filter((quest) => quest.status === "completed")
          .map((quest) => quest.id) ?? [],
      };
    }),
    defeatedDailyBoss,
    defeatedCentralizer: options.scope === "all" ? defeatedCentralizer : undefined,
    defeatedRaidOgre: options.scope === "all" ? defeatedRaidOgre : undefined,
    completedAllQuestIds: options.scope === "all" ? QUEST_IDS.filter((questId) => leadCompleted.includes(questId)) : undefined,
  };
}

async function runAllQuestline(agents: MferlandAgentClient[]) {
  const lead = agents[0];
  if (!lead) throw new Error("full playthrough needs at least one agent");

  logStage("spending talent points after core quests");
  await investTeamTalents(agents);
  await equipProgressionRewards(agents);

  logStage("completing plaza social quest");
  await completeSocialQuest(lead);

  logStage("accepting farm handoff");
  await acceptQuestAt(lead, "farm-road-handoff", "wearables-mfer");

  logStage("moving to loop farm");
  await moveTeamToFarm(agents);
  await completeQuestAt(lead, "farm-road-handoff", "hogwatch-mfer");

  logStage("clearing claim pile hogs");
  await acceptQuestAt(lead, "boar-bristle-cull", "hogwatch-mfer");
  await moveTeamAlong(agents, FARMYARD_ROUTE, { range: 12, timeoutMs: 60_000 });
  await completeDefeatQuestWithTeam(lead, agents, "boar-bristle-cull", HOG_NPC_IDS, 16);
  await completeQuestAt(lead, "boar-bristle-cull", "hogwatch-mfer");

  logStage("dropping feral farmers");
  await acceptQuestAt(lead, "feral-farmers", "hogwatch-mfer");
  await completeNamedDefeatQuestWithTeam(lead, agents, "feral-farmers", FARMER_NPC_IDS, 4, 120_000);
  await completeQuestAt(lead, "feral-farmers", "hogwatch-mfer");
  await investTeamTalents(agents);

  logStage("collecting hog livers");
  await acceptQuestAt(lead, "hog-livers", "hogwatch-mfer");
  await collectQuestItems(lead, agents, "hog-livers", HOG_NPC_IDS, 40);
  await completeQuestAt(lead, "hog-livers", "hogwatch-mfer");

  logStage("delivering to route post");
  await moveTeamAlong(agents, FIELD_CAMP_ROUTE, { range: 9, timeoutMs: 90_000 });
  await completeAutoQuest(lead, "field-camp-delivery", "hogwatch-mfer", "field-guide-mfer");
  await equipProgressionRewards(agents);

  logStage("clearing route patrol");
  await acceptQuestAt(lead, "route-patrol-daily", "field-guide-mfer");
  await completeDefeatQuestWithTeam(lead, agents, "route-patrol-daily", ROUTE_PATROL_NPC_IDS, 12);
  await completeQuestAt(lead, "route-patrol-daily", "field-guide-mfer");

  logStage("clearing hog loop");
  await acceptQuestAt(lead, "hog-loop", "pen-keeper-mfer");
  await completeDefeatQuestWithTeam(lead, agents, "hog-loop", HOG_NPC_IDS, 12);
  await completeQuestAt(lead, "hog-loop", "pen-keeper-mfer");
  await investTeamTalents(agents);

  logStage("moving to Signal Ridge");
  await moveTeamAlong(agents, RIDGE_ROUTE, { range: 11, timeoutMs: 140_000 });
  await completeAutoQuest(lead, "ridge-dispatch", "field-guide-mfer", "ridge-guide-mfer");

  logStage("collecting signal scraps");
  await acceptQuestAt(lead, "signal-scraps", "ridge-guide-mfer");
  await moveTeamAlong(agents, RIDGE_FIELD_ROUTE, { range: 12, timeoutMs: 60_000 });
  await collectQuestItems(lead, agents, "signal-scraps", RIDGE_SCRAP_NPC_IDS, 35);
  await completeQuestAt(lead, "signal-scraps", "ridge-guide-mfer");
  await equipProgressionRewards(agents);

  logStage("cutting static crew");
  await acceptQuestAt(lead, "cut-the-static", "beacon-keeper-mfer");
  await completeNamedDefeatQuestWithTeam(lead, agents, "cut-the-static", STATIC_CREW_NPC_IDS, 4, 140_000);
  await completeQuestAt(lead, "cut-the-static", "beacon-keeper-mfer");
  await investTeamTalents(agents);

  logStage("fighting The Centralizer");
  await acceptQuestAt(lead, "baron-of-static", "beacon-keeper-mfer");
  await fightNpcWithTeam(agents, CENTRALIZER_NPC_ID, 180_000);
  const defeatedCentralizer = isNpcDefeated(lead, CENTRALIZER_NPC_ID);
  await completeQuestAt(lead, "baron-of-static", "beacon-keeper-mfer");
  await equipProgressionRewards(agents);

  logStage("calling and fighting bear market mfer");
  await acceptQuestAt(lead, "ogre-raid-daily", "beacon-keeper-mfer");
  await interactWithNpcAt(lead, "beacon-keeper-mfer");
  await fightNpcWithTeam(agents, RAID_OGRE_NPC_ID, 300_000);
  const defeatedRaidOgre = isNpcDefeated(lead, RAID_OGRE_NPC_ID);
  await completeQuestAt(lead, "ogre-raid-daily", "beacon-keeper-mfer");

  return { defeatedCentralizer, defeatedRaidOgre };
}

async function runIntroQuestline(agent: MferlandAgentClient) {
  logStage(`${agent.walletAddress.slice(0, 6)} intro questline`);
  await completeAutoQuest(agent, "mfer-beginnings", "og-mfer", "dao-mfer");
  await agent.completeTraitQuest();
  await completeAutoQuest(agent, "dao-tour", "dao-mfer", "fountain-mfer");
  await completeAutoQuest(agent, "fountain-vibes", "fountain-mfer", "og-mfer");
  await completeAutoQuest(agent, "sealed-note", "og-mfer", "wearables-mfer");
  await agent.completeChatQuest("ask-mfergpt", "@mfergpt lore check from local agent", "wearables-mfer");
}

async function runMferGptQuestSetup(agent: MferlandAgentClient) {
  logStage(`${agent.walletAddress.slice(0, 6)} mferGPT setup`);
  await agent.completeChatQuest("mfergpt-checkin", "@mfergpt gm from local agent", "mfergpt");
}

async function completeSocialQuest(agent: MferlandAgentClient) {
  if (agent.hasCompletedQuest("tweet-town-link")) return;
  await acceptQuestAt(agent, "tweet-town-link", "mfergpt");
  agent.shareQuestLink("tweet-town-link");
  await delay(500);
  await completeQuestAt(agent, "tweet-town-link", "mfergpt");
}

async function completeAutoQuest(
  agent: MferlandAgentClient,
  questId: QuestId,
  giverNpcId: string,
  turnInNpcId: string,
) {
  if (agent.hasCompletedQuest(questId)) return;
  await acceptQuestAt(agent, questId, giverNpcId);
  await completeQuestAt(agent, questId, turnInNpcId);
}

async function acceptQuestAt(agent: MferlandAgentClient, questId: QuestId, npcId: string) {
  await routeAgentNearNpcArea(agent, npcId);
  await agent.acceptQuest(questId, npcId);
}

async function completeQuestAt(agent: MferlandAgentClient, questId: QuestId, npcId: string) {
  await routeAgentNearNpcArea(agent, npcId);
  await agent.completeQuest(questId, npcId);
}

async function interactWithNpcAt(agent: MferlandAgentClient, npcId: string) {
  await routeAgentNearNpcArea(agent, npcId);
  await agent.interactWithNpc(npcId);
}

async function completeDefeatQuestWithTeam(
  lead: MferlandAgentClient,
  agents: MferlandAgentClient[],
  questId: QuestId,
  npcIds: string[],
  maxFights: number,
) {
  for (let count = 0; count < maxFights && !isQuestReadyOrCompleted(lead, questId); count += 1) {
    const npcId = await waitForAliveNpc(lead, npcIds, 30_000);
    const quest = lead.getQuest(questId);
    logStage(`${questId} fighting ${npcId} (${quest?.progress ?? 0}/${quest?.required ?? "?"})`);
    try {
      await fightNpcWithTeam(agents, npcId, 120_000);
    } catch (error) {
      logStage(`${questId} retrying after ${error instanceof Error ? error.message : String(error)}`);
    }
    await delay(500);
  }
  if (!isQuestReadyOrCompleted(lead, questId)) throw new Error(`quest ${questId} did not become ready`);
}

async function collectQuestItems(
  lead: MferlandAgentClient,
  agents: MferlandAgentClient[],
  questId: QuestId,
  npcIds: string[],
  maxFights: number,
) {
  for (let count = 0; count < maxFights && !isQuestReadyOrCompleted(lead, questId); count += 1) {
    const npcId = await waitForAliveNpc(lead, npcIds, 30_000);
    const quest = lead.getQuest(questId);
    logStage(`${questId} farming ${npcId} (${quest?.progress ?? 0}/${quest?.required ?? "?"})`);
    await routeAgentNearNpcArea(lead, npcId);
    try {
      await fightNpcWithTeam(agents, npcId, 140_000, {
        lead,
        supportActions: ["taunt", "attack"],
        supportStopDamageBelowHealth: 18,
      });
    } catch (error) {
      logStage(`${questId} retrying after ${error instanceof Error ? error.message : String(error)}`);
      await delay(1500);
      continue;
    }
    await lead.lootNpc(npcId);
    await delay(700);
  }
  if (!isQuestReadyOrCompleted(lead, questId)) throw new Error(`quest ${questId} did not collect enough items`);
}

async function completeNamedDefeatQuestWithTeam(
  lead: MferlandAgentClient,
  agents: MferlandAgentClient[],
  questId: QuestId,
  npcIds: string[],
  maxPasses: number,
  timeoutMs: number,
) {
  for (let pass = 0; pass < maxPasses && !isQuestReadyOrCompleted(lead, questId); pass += 1) {
    for (const npcId of getMissingObjectiveNpcIds(lead, questId, npcIds)) {
      logStage(`${questId} fighting ${npcId}`);
      await waitForAliveNpc(lead, [npcId], 210_000);
      await fightNpcWithTeam(agents, npcId, timeoutMs);
      await delay(900);
    }
  }
  if (!isQuestReadyOrCompleted(lead, questId)) throw new Error(`quest ${questId} did not complete named objectives`);
}

async function fightNpcWithTeam(
  agents: MferlandAgentClient[],
  npcId: string,
  timeoutMs: number,
  options: { lead?: MferlandAgentClient; supportActions?: CombatActionId[]; supportStopDamageBelowHealth?: number } = {},
) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await moveTeamToNpc(agents, npcId);
    const results = await Promise.allSettled(agents.map((agent) => agent.fightNpc(npcId, {
      timeoutMs,
      preferredActions: options.lead && agent !== options.lead ? options.supportActions ?? COMBAT_ACTIONS : COMBAT_ACTIONS,
      stopDamageBelowHealth: options.lead && agent !== options.lead ? options.supportStopDamageBelowHealth : undefined,
      healAllySessionId: options.lead && agent !== options.lead ? options.lead.sessionId : undefined,
      healNearbyAllies: true,
      abortOnRespawn: true,
    })));
    if (agents.some((agent) => isNpcDefeated(agent, npcId))) return;

    lastError = results.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason
      ?? new Error(`${npcId} survived team fight attempt ${attempt}`);
    logStage(`${npcId} team fight attempt ${attempt} did not finish; regrouping`);
    await delay(1200);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? `team could not defeat ${npcId}`));
}

async function moveTeamAlong(agents: MferlandAgentClient[], points: Point[], options: { range: number; timeoutMs: number }) {
  await Promise.all(agents.map((agent) => agent.moveAlong(points, options)));
}

async function moveTeamToFarm(agents: MferlandAgentClient[]) {
  await Promise.all(agents.map((agent) => moveAgentToFarm(agent)));
}

async function moveAgentToFarm(agent: MferlandAgentClient) {
  const self = agent.getSelf();
  const route = self && self.x > 8
    ? FARM_FROM_EAST_PLAZA_ROUTE
    : self && self.x < -8
      ? FARM_FROM_WEST_PLAZA_ROUTE
      : FARM_ROUTE;
  await agent.moveAlong(route, { range: 9, timeoutMs: 120_000 });
}

async function moveTeamToNpc(agents: MferlandAgentClient[], npcId: string) {
  await Promise.all(agents.map(async (agent) => {
    await routeAgentNearNpcArea(agent, npcId);
    await moveAgentToNpcApproach(agent, npcId);
    await agent.moveToNpc(npcId, { range: 8, timeoutMs: 90_000 });
  }));
}

async function routeAgentNearNpcArea(agent: MferlandAgentClient, npcId: string) {
  const self = agent.getSelf();
  const npc = agent.getNpc(npcId);
  if (!self || !npc || distance(self, npc) < 48) return;

  if (npc.x < -100 && npc.z > 110) {
    if (self.x < -55 && self.z > 45) {
      await agent.moveAlong(FIELD_CAMP_ROUTE, { range: 12, timeoutMs: 180_000 });
      return;
    }
    await moveAgentToFarm(agent);
    await agent.moveAlong([...FARMYARD_ROUTE, ...FIELD_CAMP_ROUTE], { range: 12, timeoutMs: 180_000 });
    return;
  }

  if (npc.x < -55 && npc.z > 45) {
    const route = self.x < -90 && self.z > 105
      ? [
        { x: -101, z: 116 },
        { x: -82, z: 92 },
        { x: -76, z: 78 },
        { x: -64.5, z: 64.5 },
      ]
      : null;
    if (route) {
      await agent.moveAlong(route, { range: 12, timeoutMs: 140_000 });
    } else {
      await moveAgentToFarm(agent);
      await agent.moveAlong(FARMYARD_ROUTE, { range: 12, timeoutMs: 80_000 });
    }
    return;
  }

  if (npc.x > 80 && npc.z < -45) {
    const route = self.x < -55 && self.z > 45 ? RIDGE_ROUTE : RIDGE_FROM_PLAZA_ROUTE;
    await agent.moveAlong(route, { range: 12, timeoutMs: 180_000 });
    return;
  }

  if (npc.x < -45 && npc.z < -35) {
    await agent.moveAlong(DAILY_BOSS_ROUTE, { range: 12, timeoutMs: 90_000 });
  }
}

async function moveAgentToNpcApproach(agent: MferlandAgentClient, npcId: string) {
  const route = FARM_APPROACHES[npcId] ?? RIDGE_APPROACHES[npcId];
  if (!route) return;

  const npc = agent.getNpc(npcId);
  const finalPoint = route.at(-1);
  if (!npc || !finalPoint || distance(finalPoint, npc) > 16) return;

  const self = agent.getSelf();
  if (self && distance(self, npc) <= 8) return;

  await agent.moveAlong(route, { range: 5, timeoutMs: 45_000 });
}

async function waitForAliveNpc(agent: MferlandAgentClient, npcIds: string[], timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const npcId = npcIds.find((id) => {
      const npc = agent.getNpc(id);
      return npc && npc.health > 0 && npc.defeatedAt <= 0;
    });
    if (npcId) return npcId;
    await delay(500);
  }
  throw new Error(`no alive NPC found in ${npcIds.join(", ")}`);
}

async function investTeamTalents(agents: MferlandAgentClient[]) {
  for (const agent of agents) {
    for (const talentId of COMBAT_TALENT_PLAN) {
      agent.selectTalent(talentId);
      await delay(60);
    }
  }
}

async function equipProgressionRewards(agents: MferlandAgentClient[]) {
  for (const agent of agents) {
    for (const itemId of PROGRESSION_REWARDS) {
      agent.equipItem(itemId);
      await delay(40);
    }
  }
}

function isQuestReadyOrCompleted(agent: MferlandAgentClient, questId: QuestId) {
  const quest = agent.getQuest(questId);
  return quest?.status === "ready" || quest?.status === "completed";
}

function getMissingObjectiveNpcIds(agent: MferlandAgentClient, questId: QuestId, fallbackNpcIds: string[]) {
  const quest = agent.getQuest(questId);
  if (!quest) return fallbackNpcIds;
  const completed = new Set(quest.flags.split(",").filter(Boolean));
  const objectiveIds = getQuestObjectives(questId).map((objective) => objective.id);
  const missing = objectiveIds.filter((id) => !completed.has(id));
  return missing.length > 0 ? missing : fallbackNpcIds;
}

function isNpcDefeated(agent: MferlandAgentClient, npcId: string) {
  const npc = agent.getNpc(npcId);
  return !npc || npc.health <= 0 || npc.defeatedAt > 0;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function logStage(message: string) {
  console.log(`[playtest] ${message}`);
}
