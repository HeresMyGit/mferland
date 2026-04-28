import {
  getNpcDisposition,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";

export function TargetFrame({ kind, unit }: { kind: TargetSelection["kind"]; unit: PlayerSnapshot | NpcSnapshot }) {
  const isNpc = kind === "npc";
  const npc = isNpc ? (unit as NpcSnapshot) : null;
  const disposition = npc ? getNpcDisposition(npc) : "friendly";
  const isHostile = disposition === "hostile";
  const maxHealth = npc?.maxHealth || 100;
  const health = npc?.health ?? 100;
  const healthPercent = Math.max(0, Math.min(100, (health / maxHealth) * 100));
  const label = npc ? roleLabel(npc.role) : playerLabel(unit as PlayerSnapshot);
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

function roleLabel(role: NpcSnapshot["role"]) {
  if (role === "quest_giver") return "Quest giver";
  if (role === "merchant") return "Merchant";
  if (role === "guard") return "Guard";
  if (role === "enemy") return "Training";
  if (role === "critter") return "Critter";
  if (role === "beast") return "Beast";
  if (role === "farmer") return "Hostile farmer";
  return "Town NPC";
}

function playerLabel(player: PlayerSnapshot) {
  if (player.identityType === "agent") return "Agent";
  if (player.identityType === "wallet") return "Wallet player";
  return "Player";
}
