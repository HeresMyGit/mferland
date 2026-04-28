import { type MapSchema } from "@colyseus/schema";
import { LOOT } from "@mferland/shared";
import type { NpcState, PlayerState } from "../state.js";
import { isNpcAlive } from "./combat.js";
import { npcHasLoot } from "./loot.js";
import { distanceToNpc } from "./spatial.js";

export function findInteractNpc(player: PlayerState, npcs: MapSchema<NpcState>, requestedNpcId?: string) {
  const requested = typeof requestedNpcId === "string" ? npcs.get(requestedNpcId) : undefined;
  if (requested && isInteractableNpc(requested) && distanceToNpc(player, requested) <= LOOT.interactRange) return requested;

  let nearest: NpcState | null = null;
  let nearestDistance = Infinity;
  npcs.forEach((npc) => {
    if (!isInteractableNpc(npc)) return;
    const distance = distanceToNpc(player, npc);
    if (distance < nearestDistance) {
      nearest = npc;
      nearestDistance = distance;
    }
  });

  return nearestDistance <= LOOT.interactRange ? nearest : null;
}

function isInteractableNpc(npc: NpcState) {
  return isNpcAlive(npc) || npcHasLoot(npc);
}
