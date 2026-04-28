import type { NpcDisposition, NpcRole, NpcSnapshot } from "./types.js";

export function isAttackableNpcRole(role: NpcRole): boolean {
  return role === "enemy" || role === "critter" || role === "beast" || role === "farmer";
}

export function getNpcDisposition(npc: Pick<NpcSnapshot, "role" | "model" | "aggroTargetId">): NpcDisposition {
  if (!isAttackableNpcRole(npc.role)) return "friendly";
  if (npc.role === "farmer" || npc.aggroTargetId) return "hostile";
  return "neutral";
}
