import type { QuestId } from "@mferland/shared";
import { delay, type MferlandAgentClient, type Point } from "./client.js";

const DAILY_BOSS_NPC_ID = "mfergpt-daily-boss";
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

export type PlaytestResult = {
  agents: Array<{
    name: string;
    walletAddress: string;
    level: number;
    xp: number;
    completedQuests: QuestId[];
  }>;
  defeatedDailyBoss: boolean;
};

export async function runLocalAgentPlaytest(agents: MferlandAgentClient[]): Promise<PlaytestResult> {
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
  };
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

async function completeAutoQuest(
  agent: MferlandAgentClient,
  questId: QuestId,
  giverNpcId: string,
  turnInNpcId: string,
) {
  if (agent.hasCompletedQuest(questId)) return;
  await agent.acceptQuest(questId, giverNpcId);
  await agent.completeQuest(questId, turnInNpcId);
}

function logStage(message: string) {
  console.log(`[playtest] ${message}`);
}
