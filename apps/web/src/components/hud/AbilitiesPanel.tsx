import { type PointerEvent, useState } from "react";
import { BadgePlus } from "lucide-react";
import {
  COMBAT,
  TALENTS,
  TALENT_IDS,
  TALENT_TREES,
  TALENT_TREE_IDS,
  getCombatActionUnlockTalent,
  getCombatActionUnlockLevel,
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
import { AbilityIcon, TalentIcon, TalentTreeIcon } from "./GameIcon";
import { type ActionSlot } from "./types";
import { formatTooltipLabel } from "./utils";

const BASELINE_ABILITY_IDS: ActionId[] = ["interact", "attack", "shoot", "signalShot", "fireblast", "iceBlast", "heal", "taunt"];
const TALENT_ABILITY_IDS: CombatActionId[] = ["whirlwind", "multishot", "frostNova"];
const SPELLBOOK_ABILITY_IDS: ActionId[] = [...BASELINE_ABILITY_IDS, ...TALENT_ABILITY_IDS];

export function AbilitiesPanel({
  player,
  actionSlots,
  onBeginDrag,
  onPointerMove,
  onPointerEnd,
  onSelectTalent,
  debugUnlockAllMoves,
}: {
  player: PlayerSnapshot | null;
  actionSlots: ActionSlot[];
  onBeginDrag: (slot: NonNullable<ActionSlot>, event: PointerEvent<HTMLElement>, fromIndex?: number) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerEnd: (event: PointerEvent<HTMLElement>) => void;
  onSelectTalent: (message: ClientSelectTalent) => void;
  debugUnlockAllMoves: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"spellbook" | "talents">("spellbook");
  const talentPointCount = player?.talentPoints ?? 0;

  return (
    <div className="abilities-layout">
      <div className="menu-tabs" role="tablist" aria-label="moves tabs">
        <button
          type="button"
          className={activeTab === "spellbook" ? "active" : ""}
          onClick={() => setActiveTab("spellbook")}
        >
          moves
        </button>
        <button
          type="button"
          className={activeTab === "talents" ? "active" : ""}
          onClick={() => setActiveTab("talents")}
        >
          points
          {talentPointCount > 0 && <em className="tab-badge">{talentPointCount}</em>}
        </button>
      </div>

      {activeTab === "spellbook" ? (
        <section className="spellbook-tab">
          <div className="menu-section-header">
            <strong>moves</strong>
            <span>drag unlocked moves</span>
          </div>
          <div className="menu-tile-grid spellbook-grid">
            {SPELLBOOK_ABILITY_IDS.map((actionId) => (
              <AbilityBookTile
                key={actionId}
                actionId={actionId}
                player={player}
                actionSlots={actionSlots}
                debugUnlockAllMoves={debugUnlockAllMoves}
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
  debugUnlockAllMoves,
  onBeginDrag,
  onPointerMove,
  onPointerEnd,
}: {
  actionId: ActionId;
  player: PlayerSnapshot | null;
  actionSlots: ActionSlot[];
  debugUnlockAllMoves: boolean;
  onBeginDrag: (slot: NonNullable<ActionSlot>, event: PointerEvent<HTMLElement>, fromIndex?: number) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerEnd: (event: PointerEvent<HTMLElement>) => void;
}) {
  const meta = getActionMeta(actionId);
  if (!meta) return null;

  const isCombat = actionId !== "interact";
  const locked = isCombat && (!player || !isCombatActionUnlocked(actionId, player.level, player.talents, debugUnlockAllMoves));
  const unlockLevel = isCombat ? getCombatActionUnlockLevel(actionId) : 1;
  const assignedIndex = actionSlots.findIndex((slot) => slot === actionId);
  const title = getAbilityTitle(actionId, unlockLevel, assignedIndex, locked);

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
    </div>
  );
}

function getAbilityTitle(actionId: ActionId, unlockLevel: number, assignedIndex: number, locked: boolean) {
  const meta = getActionMeta(actionId);
  const state = locked ? "Locked" : assignedIndex >= 0 ? "Assigned" : "Ready";
  return [
    meta?.label ?? "Ability",
    getAbilityDescription(actionId),
    state,
    locked ? getAbilityUnlockText(actionId, unlockLevel) : "",
  ].filter(Boolean).join("\n");
}

function getAbilityUnlockText(actionId: ActionId, unlockLevel: number) {
  if (actionId === "interact") return "";
  if (Number.isFinite(unlockLevel)) return `Unlocks at level ${unlockLevel}`;

  const talentId = getCombatActionUnlockTalent(actionId);
  if (!talentId) return "Unlocks from talents";

  const talent = TALENTS[talentId];
  return `Unlocks from ${TALENT_TREES[talent.tree].label} final talent`;
}

function getAbilityDescription(actionId: ActionId) {
  if (actionId === "interact") return "talk, loot, and use nearby objects.";
  const action = COMBAT.actions[actionId];
  const range = action.maxRange > 0
    ? action.minRange > 0 ? `${action.minRange}-${action.maxRange}m` : `${action.maxRange}m`
    : "self";
  const mana = action.manaCost > 0 ? ` / ${action.manaCost} MP` : "";
  const detail = `${action.damage > 0 ? `${action.damage} base` : actionId === "heal" ? `${COMBAT.actions.heal.healing} heal` : "Utility"} / ${range}${mana}`;
  return `${action.description} / ${detail}`;
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
          <strong>points</strong>
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
      <TalentIcon talentId={talentId} />
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
