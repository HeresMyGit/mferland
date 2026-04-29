import { type PointerEvent, useState } from "react";
import { BadgePlus } from "lucide-react";
import {
  COMBAT,
  TALENTS,
  TALENT_IDS,
  TALENT_TREES,
  TALENT_TREE_IDS,
  getCombatActionUnlockTalent,
  getTalentPointsSpent,
  getTalentRank,
  getTalentRankStatus,
  isCombatActionUnlocked,
  type ActionId,
  type ClientSelectTalent,
  type CombatActionId,
  type PlayerSnapshot,
  type TalentId,
} from "@mferland/shared";
import { getActionMeta } from "./ActionSlotButton";
import { AbilityIcon, TalentTreeIcon } from "./GameIcon";
import { type ActionSlot } from "./types";
import { formatTooltipLabel } from "./utils";

const BASELINE_ABILITY_IDS: ActionId[] = ["interact", "attack", "shoot", "signalShot", "fireblast", "frostNova", "heal", "taunt"];
const TALENT_ABILITY_IDS: CombatActionId[] = ["whirlwind", "multishot", "iceBlast"];
const SPELLBOOK_ABILITY_IDS: ActionId[] = [...BASELINE_ABILITY_IDS, ...TALENT_ABILITY_IDS];

export function AbilitiesPanel({
  player,
  actionSlots,
  onBeginDrag,
  onPointerMove,
  onPointerEnd,
  onSelectTalent,
}: {
  player: PlayerSnapshot | null;
  actionSlots: ActionSlot[];
  onBeginDrag: (slot: NonNullable<ActionSlot>, event: PointerEvent<HTMLElement>, fromIndex?: number) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerEnd: (event: PointerEvent<HTMLElement>) => void;
  onSelectTalent: (message: ClientSelectTalent) => void;
}) {
  const [activeTab, setActiveTab] = useState<"spellbook" | "talents">("spellbook");

  return (
    <div className="abilities-layout">
      <div className="menu-tabs" role="tablist" aria-label="Abilities tabs">
        <button
          type="button"
          className={activeTab === "spellbook" ? "active" : ""}
          onClick={() => setActiveTab("spellbook")}
        >
          Spellbook
        </button>
        <button
          type="button"
          className={activeTab === "talents" ? "active" : ""}
          onClick={() => setActiveTab("talents")}
        >
          Talents
        </button>
      </div>

      {activeTab === "spellbook" ? (
        <section className="spellbook-tab">
          <div className="menu-section-header">
            <strong>Spellbook</strong>
            <span>Drag unlocked abilities</span>
          </div>
          <div className="menu-tile-grid spellbook-grid">
            {SPELLBOOK_ABILITY_IDS.map((actionId) => (
              <AbilityBookTile
                key={actionId}
                actionId={actionId}
                player={player}
                actionSlots={actionSlots}
                onBeginDrag={onBeginDrag}
                onPointerMove={onPointerMove}
                onPointerEnd={onPointerEnd}
              />
            ))}
          </div>
        </section>
      ) : (
        <TalentTreePanel player={player} onSelectTalent={onSelectTalent} />
      )}
    </div>
  );
}

function AbilityBookTile({
  actionId,
  player,
  actionSlots,
  onBeginDrag,
  onPointerMove,
  onPointerEnd,
}: {
  actionId: ActionId;
  player: PlayerSnapshot | null;
  actionSlots: ActionSlot[];
  onBeginDrag: (slot: NonNullable<ActionSlot>, event: PointerEvent<HTMLElement>, fromIndex?: number) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerEnd: (event: PointerEvent<HTMLElement>) => void;
}) {
  const meta = getActionMeta(actionId);
  if (!meta) return null;

  const isCombat = actionId !== "interact";
  const locked = isCombat && (!player || !isCombatActionUnlocked(actionId, player.talents));
  const unlockTalentId = isCombat ? getCombatActionUnlockTalent(actionId) : null;
  const assignedIndex = actionSlots.findIndex((slot) => slot === actionId);
  const title = getAbilityTitle(actionId, unlockTalentId, assignedIndex, locked);

  return (
    <div
      className={locked ? "menu-tile ability-book-tile locked" : assignedIndex >= 0 ? "menu-tile ability-book-tile assigned" : "menu-tile ability-book-tile"}
      data-tooltip={title}
      aria-label={formatTooltipLabel(title)}
      onPointerDown={locked ? undefined : (event) => onBeginDrag(actionId, event)}
      onPointerMove={locked ? undefined : onPointerMove}
      onPointerUp={locked ? undefined : onPointerEnd}
      onPointerCancel={locked ? undefined : onPointerEnd}
    >
      <AbilityIcon actionId={actionId} />
      <strong>{meta.label}</strong>
      {assignedIndex >= 0 && <span className="tile-state">{assignedIndex + 1}</span>}
      {locked && <span className="tile-state">Lock</span>}
    </div>
  );
}

function getAbilityTitle(actionId: ActionId, unlockTalentId: TalentId | null, assignedIndex: number, locked: boolean) {
  const meta = getActionMeta(actionId);
  const state = locked ? "Locked" : assignedIndex >= 0 ? `Assigned to slot ${assignedIndex + 1}` : "Ready";
  return [
    meta?.label ?? "Ability",
    getAbilityDescription(actionId, unlockTalentId),
    state,
    locked && unlockTalentId ? `Requires ${TALENTS[unlockTalentId].name}` : "",
  ].filter(Boolean).join("\n");
}

function getAbilityDescription(actionId: ActionId, unlockTalentId: TalentId | null) {
  if (actionId === "interact") return "Talk, loot, and use nearby objects.";
  const action = COMBAT.actions[actionId];
  const range = action.maxRange > 0
    ? action.minRange > 0 ? `${action.minRange}-${action.maxRange}m` : `${action.maxRange}m`
    : "self";
  const mana = action.manaCost > 0 ? ` / ${action.manaCost} MP` : "";
  const detail = `${action.damage > 0 ? `${action.damage} base` : actionId === "heal" ? `${COMBAT.actions.heal.healing} heal` : "Utility"} / ${range}${mana}`;
  return unlockTalentId ? `Talent: ${TALENTS[unlockTalentId].name} / ${detail}` : detail;
}

function TalentTreePanel({
  player,
  onSelectTalent,
}: {
  player: PlayerSnapshot | null;
  onSelectTalent: (message: ClientSelectTalent) => void;
}) {
  const talents = player?.talents ?? [];
  const points = player?.talentPoints ?? 0;
  const spent = getTalentPointsSpent(talents);

  return (
    <section className="talent-panel">
      <div className="talent-panel-header">
        <span>
          <strong>Talents</strong>
          <em>{points} points / {spent} spent</em>
        </span>
      </div>

      <div className="talent-tree-grid">
        {TALENT_TREE_IDS.map((treeId) => {
          return (
            <section key={treeId} className={`talent-tree ${treeId}`}>
              <div className="talent-tree-heading">
                <TalentTreeIcon treeId={treeId} />
                <span>
                  <strong>{TALENT_TREES[treeId].label}</strong>
                  <em>{TALENT_TREES[treeId].description}</em>
                </span>
              </div>
              <div className="talent-node-list">
                {TALENT_IDS.filter((talentId) => TALENTS[talentId].tree === treeId).map((talentId) => (
                  <TalentNode
                    key={talentId}
                    talentId={talentId}
                    player={player}
                    onSelectTalent={onSelectTalent}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function TalentNode({
  talentId,
  player,
  onSelectTalent,
}: {
  talentId: TalentId;
  player: PlayerSnapshot | null;
  onSelectTalent: (message: ClientSelectTalent) => void;
}) {
  const definition = TALENTS[talentId];
  const talents = player?.talents ?? [];
  const status = getTalentRankStatus(talents, player?.level ?? 1, player?.talentPoints ?? 0, talentId);
  const rank = getTalentRank(talents, talentId);
  const title = getTalentTitle(talentId, rank, status.reason);
  const className = [
    "menu-tile",
    "talent-node",
    rank > 0 ? "learned" : "",
    status.canRank ? "available" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={className}
      aria-disabled={!status.canRank}
      data-tooltip={title}
      aria-label={formatTooltipLabel(title)}
      onClick={() => status.canRank && onSelectTalent({ talentId })}
    >
      <TalentTreeIcon treeId={definition.tree} />
      <strong>{definition.name}</strong>
      <span className="tile-rank">{rank}/{definition.maxRank}</span>
      {status.canRank && <BadgePlus className="tile-plus" size={12} />}
    </button>
  );
}

function getTalentTitle(talentId: TalentId, rank: number, reason: string) {
  const definition = TALENTS[talentId];
  return [
    definition.name,
    definition.effectText,
    definition.description,
    `Rank ${rank}/${definition.maxRank}`,
    reason,
  ].filter(Boolean).join("\n");
}
