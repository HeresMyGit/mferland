import { useMemo } from "react";
import {
  getNpcDisposition,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";
import { generateMferTraitsForActor } from "../../game/mferTraits";
import { ActorModelPortrait } from "../ActorModelPortrait";
import { MferPortrait } from "../MferPortrait";

export function TargetFrame({ kind, unit }: { kind: TargetSelection["kind"]; unit: PlayerSnapshot | NpcSnapshot }) {
  const isNpc = kind === "npc";
  const npc = isNpc ? (unit as NpcSnapshot) : null;
  const player = isNpc ? null : (unit as PlayerSnapshot);
  const disposition = npc ? getNpcDisposition(npc) : "friendly";
  const maxHealth = npc?.maxHealth ?? player?.maxHealth ?? 100;
  const health = npc?.health ?? player?.health ?? 100;
  const healthPercent = Math.max(0, Math.min(100, (health / maxHealth) * 100));
  const label = npc ? roleLabel(npc) : playerLabel(unit as PlayerSnapshot);
  const healthText = npc?.isImmortal ? "∞" : `${Math.round(health)}/${Math.round(maxHealth)}`;
  const showMferPortrait = !npc || npc.model === "mfer";
  const portraitImage = npc?.portraitImage;
  const portraitTraits = useMemo(
    () => generateMferTraitsForActor(unit.avatarSeed, showMferPortrait && npc ? npc : null),
    [npc?.id, npc?.role, showMferPortrait, unit.avatarSeed],
  );

  return (
    <section className={`target-frame ${disposition}`}>
      <div className="target-portrait">
        {portraitImage ? (
          <img className="npc-portrait-image" src={portraitImage} alt={`${unit.name} portrait`} draggable={false} />
        ) : showMferPortrait ? (
          <MferPortrait traits={portraitTraits} title={`${unit.name} mfer portrait`} />
        ) : (
          <ActorModelPortrait npc={npc} />
        )}
      </div>
      <div className="target-vitals">
        <strong>{unit.name}</strong>
        <em>{label}</em>
        <div className="target-health">
          <span style={{ width: `${healthPercent}%` }} />
          <em>{healthText}</em>
        </div>
      </div>
    </section>
  );
}

function roleLabel(npc: NpcSnapshot) {
  if (npc.id === "mfergpt") return "agent";
  if (npc.id === "og-mfer") return "OG";
  if (npc.id === "dao-mfer") return "board";
  if (npc.id === "wearables-mfer") return "drip";
  if (npc.id === "gate-guard") return "watch";
  if (npc.id === "fountain-mfer") return "plaza";
  if (npc.id === "crypto-mfer") return "crypto";
  if (npc.id === "hogwatch-mfer") return "hogwatch";
  if (npc.id === "field-guide-mfer") return "route board";
  if (npc.id === "pen-keeper-mfer") return "loop booth";
  if (npc.id === "ridge-guide-mfer") return "ridge post";
  if (npc.id === "beacon-keeper-mfer") return "relay shack";
  if (npc.role === "merchant") return "stash";
  if (npc.role === "quest_giver" || npc.role === "guard" || npc.role === "wanderer") return "local";
  if (npc.role === "enemy") return "bonk test";
  if (npc.role === "farmer") return "loop-burnt";
  if (npc.role === "beast") return "wild";
  if (npc.role === "critter") return "critter";
  return "local";
}

function playerLabel(player: PlayerSnapshot) {
  if (player.identityType === "agent") return "agent mfer";
  if (player.identityType === "wallet") return "verified mfer";
  return "anon mfer";
}
