import { useMemo } from "react";
import {
  type ActionId,
  type ActiveBuffSnapshot,
  POTION_SHOP_NPC_ID,
  RESPEC_MFER_NPC_ID,
  TRASH_VENDOR_NPC_ID,
  getNpcDisposition,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";
import { generateMferTraitsForActor, resolveMferTraitsForPlayer } from "../../game/mferTraits";
import { type RenderPerformanceProfile } from "../../game/performance";
import { ActorModelPortrait } from "../ActorModelPortrait";
import { MferPortrait } from "../MferPortrait";
import { AbilityIcon } from "./GameIcon";
import { ItemIcon } from "./ItemIcon";
import { formatTooltipLabel } from "./utils";

type TargetEffect = {
  id: string;
  kind: "buff" | "debuff";
  name: string;
  description: string;
  effectLabel: string;
  expiresAt: number;
  itemId?: ActiveBuffSnapshot["itemId"];
  actionId?: ActionId;
};

export function TargetFrame({
  kind,
  unit,
  now,
  renderProfile,
}: {
  kind: TargetSelection["kind"];
  unit: PlayerSnapshot | NpcSnapshot;
  now: number;
  renderProfile?: RenderPerformanceProfile;
}) {
  const isNpc = kind === "npc";
  const npc = isNpc ? (unit as NpcSnapshot) : null;
  const player = isNpc ? null : (unit as PlayerSnapshot);
  const disposition = npc ? getNpcDisposition(npc) : "friendly";
  const maxHealth = npc?.maxHealth ?? player?.maxHealth ?? 100;
  const health = npc?.health ?? player?.health ?? 100;
  const healthPercent = Math.max(0, Math.min(100, (health / maxHealth) * 100));
  const label = npc ? roleLabel(npc) : playerLabel(unit as PlayerSnapshot);
  const healthText = npc?.isImmortal ? "∞" : `${Math.round(health)}/${Math.round(maxHealth)}`;
  const showAgentModelPortrait = Boolean(player?.isAgent || player?.identityType === "agent");
  const showMferPortrait = !showAgentModelPortrait && (!npc || npc.model === "mfer");
  const showMferGptModelPortrait = npc?.model === "mfergpt" && disposition !== "friendly";
  const portraitImage = showMferGptModelPortrait ? "" : npc?.portraitImage;
  const targetEffects = getTargetEffects(unit, now);
  const portraitTraits = useMemo(
    () => npc
      ? generateMferTraitsForActor(unit.avatarSeed, showMferPortrait ? npc : null)
      : resolveMferTraitsForPlayer(unit.avatarSeed, player?.appearanceTraits),
    [npc, npc?.id, npc?.role, player?.appearanceTraits, showMferPortrait, unit.avatarSeed],
  );

  return (
    <section className={`target-frame ${disposition}`}>
      <div className="target-portrait">
        {portraitImage ? (
          <img className="npc-portrait-image" src={portraitImage} alt={`${unit.name} portrait`} draggable={false} />
        ) : showMferPortrait ? (
          <MferPortrait traits={portraitTraits} title={`${unit.name} mfer portrait`} />
        ) : showAgentModelPortrait && player ? (
          <ActorModelPortrait npc={makeAgentModelSnapshot(player)} renderProfile={renderProfile} variant="agent" />
        ) : npc ? (
          <ActorModelPortrait npc={npc} renderProfile={renderProfile} />
        ) : null}
      </div>
      <div className="target-vitals">
        <strong>{unit.name}</strong>
        <em>{label}</em>
        <div className="target-health">
          <span style={{ width: `${healthPercent}%` }} />
          <em>{healthText}</em>
        </div>
        <TargetEffectStrip effects={targetEffects} now={now} />
      </div>
    </section>
  );
}

function TargetEffectStrip({ effects, now }: { effects: TargetEffect[]; now: number }) {
  if (effects.length === 0) return null;

  return (
    <div className="target-effect-strip" aria-label="target status effects">
      {effects.map((effect) => {
        const remaining = formatTargetEffectRemaining(effect.expiresAt, now);
        const title = `${effect.name}\n${effect.description}\n${effect.effectLabel}\n${remaining} left`;
        return (
          <span
            key={effect.id}
            className={`target-effect ${effect.kind}`}
            data-tooltip={title}
            aria-label={formatTooltipLabel(title)}
            tabIndex={0}
          >
            {effect.itemId ? <ItemIcon itemId={effect.itemId} /> : <AbilityIcon actionId={effect.actionId ?? "frostNova"} />}
            <em>{remaining}</em>
          </span>
        );
      })}
    </div>
  );
}

function getTargetEffects(unit: PlayerSnapshot | NpcSnapshot, now: number) {
  const effects: TargetEffect[] = [];
  if (isPlayerSnapshot(unit)) {
    for (const buff of unit.activeBuffs) {
      if (buff.expiresAt <= now) continue;
      effects.push({
        id: `buff:${buff.id}`,
        kind: "buff",
        name: buff.name,
        description: buff.description,
        effectLabel: buff.effectLabel,
        expiresAt: buff.expiresAt,
        itemId: buff.itemId,
      });
    }
  }

  if (unit.frozenUntil > now) {
    effects.push({
      id: "debuff:frozen",
      kind: "debuff",
      name: "Frozen",
      description: "locked in place by frost.",
      effectLabel: "cannot move",
      expiresAt: unit.frozenUntil,
      actionId: "frostNova",
    });
  }

  if (isNpcSnapshot(unit) && unit.slowedUntil > now) {
    effects.push({
      id: "debuff:slowed",
      kind: "debuff",
      name: "Slowed",
      description: "movement speed is reduced.",
      effectLabel: "snared",
      expiresAt: unit.slowedUntil,
      actionId: "iceBlast",
    });
  }

  return effects.sort((left, right) => left.expiresAt - right.expiresAt || left.id.localeCompare(right.id));
}

function isPlayerSnapshot(unit: PlayerSnapshot | NpcSnapshot): unit is PlayerSnapshot {
  return "sessionId" in unit;
}

function isNpcSnapshot(unit: PlayerSnapshot | NpcSnapshot): unit is NpcSnapshot {
  return "id" in unit;
}

function formatTargetEffectRemaining(expiresAt: number, now: number) {
  const remainingMs = Math.max(0, expiresAt - now);
  if (remainingMs >= 60 * 60 * 1000) return "1h";
  if (remainingMs >= 60 * 1000) return `${Math.ceil(remainingMs / 60000)}m`;
  return `${Math.max(1, Math.ceil(remainingMs / 1000))}s`;
}

function roleLabel(npc: NpcSnapshot) {
  if (npc.id === "mfergpt") return "agent";
  if (npc.id === "og-mfer") return "OG";
  if (npc.id === "dao-mfer") return "oldhead";
  if (npc.id === "wearables-mfer") return "drip";
  if (npc.id === "traits-mfer") return "traits";
  if (npc.id === "gate-guard") return "watch";
  if (npc.id === "fountain-mfer") return "plaza";
  if (npc.id === "crypto-mfer") return "crypto";
  if (npc.id === "swap-mfer") return "swap";
  if (npc.id === POTION_SHOP_NPC_ID) return "potions";
  if (npc.id === TRASH_VENDOR_NPC_ID) return "trash";
  if (npc.id === RESPEC_MFER_NPC_ID) return "respec";
  if (npc.id === "hogwatch-mfer") return "claimwatch";
  if (npc.id === "field-guide-mfer") return "route post";
  if (npc.id === "pen-keeper-mfer") return "claim booth";
  if (npc.id === "ridge-guide-mfer") return "signal post";
  if (npc.id === "beacon-keeper-mfer") return "uplink shack";
  if (npc.role === "merchant") return "stash";
  if (npc.role === "quest_giver" || npc.role === "guard" || npc.role === "wanderer") return "local";
  if (npc.role === "enemy") return "bonk test";
  if (npc.role === "farmer") return "loop-burnt";
  if (npc.role === "beast") return "wild";
  if (npc.role === "critter") return "critter";
  return "local";
}

function playerLabel(player: PlayerSnapshot) {
  if (player.isAgent) return "Agent Player";
  if (player.identityType === "agent") return "Agent Player";
  if (player.identityType === "wallet") return "verified mfer";
  return "anon mfer";
}

function makeAgentModelSnapshot(player: PlayerSnapshot): NpcSnapshot {
  return {
    id: player.sessionId,
    name: player.name,
    role: "wanderer",
    model: "mfergpt",
    portraitImage: "",
    avatarSeed: player.avatarSeed,
    health: player.health,
    maxHealth: player.maxHealth,
    isImmortal: false,
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    animation: player.animation,
    dialogue: "",
    questId: "",
    defeatedAt: player.health <= 0 ? Date.now() : 0,
    despawnAt: 0,
    frozenUntil: player.frozenUntil,
    slowedUntil: 0,
    aggroTargetId: "",
    hasLoot: false,
  };
}
