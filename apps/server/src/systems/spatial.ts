import type { NpcState, PlayerState } from "../state.js";

export function distanceToNpc(player: PlayerState, npc: NpcState) {
  return Math.hypot(player.x - npc.x, player.z - npc.z);
}
