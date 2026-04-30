import {
  getNpcDisposition,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";

export function TargetFrame({ kind, unit }: { kind: TargetSelection["kind"]; unit: PlayerSnapshot | NpcSnapshot }) {
  const isNpc = kind === "npc";
  const npc = isNpc ? (unit as NpcSnapshot) : null;
  const player = isNpc ? null : (unit as PlayerSnapshot);
  const disposition = npc ? getNpcDisposition(npc) : "friendly";
  const isHostile = disposition === "hostile";
  const maxHealth = npc?.maxHealth ?? player?.maxHealth ?? 100;
  const health = npc?.health ?? player?.health ?? 100;
  const healthPercent = Math.max(0, Math.min(100, (health / maxHealth) * 100));
  const label = npc ? roleLabel(npc) : playerLabel(unit as PlayerSnapshot);
  const healthText = npc?.isImmortal ? "∞" : `${Math.round(health)}/${Math.round(maxHealth)}`;

  return (
    <section className={`target-frame ${disposition}`}>
      <div className="target-portrait">
        <span>{isHostile ? "!" : "mf"}</span>
      </div>
      <div className="target-vitals">
        <strong>{unit.name}</strong>
        <em>{label}</em>
        <div className="target-health">
          <span style={{ width: `${healthPercent}%` }} />
          {healthText}
        </div>
      </div>
    </section>
  );
}

function roleLabel(npc: NpcSnapshot) {
  if (npc.id === "og-mfer") return "old head";
  if (npc.id === "dao-mfer") return "board";
  if (npc.id === "wearables-mfer") return "drip";
  if (npc.id === "gate-guard") return "watch";
  if (npc.id === "fountain-mfer") return "plaza";
  if (npc.id === "hogwatch-mfer") return "hogwatch";
  if (npc.id === "field-guide-mfer") return "route post";
  if (npc.id === "pen-keeper-mfer") return "hog loop";
  if (npc.id === "ridge-guide-mfer") return "ridge post";
  if (npc.id === "beacon-keeper-mfer") return "beacon";
  if (npc.role === "merchant") return "stash";
  if (npc.role === "quest_giver" || npc.role === "guard" || npc.role === "wanderer") return "local";
  if (npc.role === "enemy") return "bonk test";
  if (npc.role === "farmer") return "red eye";
  if (npc.role === "beast") return "wild";
  if (npc.role === "critter") return "critter";
  return "local";
}

function playerLabel(player: PlayerSnapshot) {
  if (player.identityType === "agent") return "agent mfer";
  if (player.identityType === "wallet") return "verified mfer";
  return "anon mfer";
}
