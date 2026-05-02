import { MapSchema, Schema, type } from "@colyseus/schema";
import {
  PLAYER,
  type AnimationState,
  type CombatActionId,
  type EmoteId,
  type EquipmentSlotId,
  type IdentityType,
  type ItemId,
  type NpcModel,
  type NpcRole,
  type QuestId,
  type QuestStatus,
  type TalentId,
  type TalentTreeId,
} from "@mferland/shared";

export class QuestState extends Schema {
  @type("string") id: QuestId = "feral-farmers";
  @type("string") status: QuestStatus = "active";
  @type("number") progress = 0;
  @type("number") required = 1;
  @type("string") flags = "";
  @type("number") completedAt = 0;
}

export class InventoryItemState extends Schema {
  @type("string") id: ItemId = "hog-liver";
  @type("string") chainTokenId = "";
  @type("number") count = 0;
}

export class LootItemState extends Schema {
  @type("string") id: ItemId = "hog-liver";
  @type("string") chainTokenId = "";
  @type("number") count = 0;
}

export class EquipmentSlotState extends Schema {
  @type("string") slot: EquipmentSlotId = "mainHand";
  @type("string") itemId: ItemId | "" = "";
  @type("string") chainTokenId = "";
}

export class TalentState extends Schema {
  @type("string") id: TalentId = "brawler:street-tough";
  @type("string") tree: TalentTreeId = "brawler";
  @type("string") nodeId = "street-tough";
  @type("number") rank = 0;
}

export class PlayerState extends Schema {
  @type("string") name = "";
  @type("string") identityType: IdentityType = "guest";
  @type("string") walletAddress = "";
  @type("number") avatarSeed = 0;
  @type("number") level = 1;
  @type("number") xp = 0;
  @type("number") talentPoints = 0;
  @type("number") health = PLAYER.maxHealth;
  @type("number") maxHealth = PLAYER.maxHealth;
  @type("number") healthRegenPer5 = PLAYER.healthRegenPer5;
  @type("number") mana = PLAYER.maxMana;
  @type("number") maxMana = PLAYER.maxMana;
  @type("number") manaRegenPer5 = PLAYER.manaRegenPer5;
  @type("number") walkSpeed = PLAYER.walkSpeed;
  @type("number") runSpeed = PLAYER.runSpeed;
  @type("number") strength = PLAYER.strength;
  @type("number") dexterity = PLAYER.dexterity;
  @type("number") magic = PLAYER.magic;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") yaw = 0;
  @type("number") verticalVelocity = 0;
  @type("string") animation: AnimationState = "idle";
  @type("string") emote: EmoteId | "" = "";
  @type("number") emoteStartedAt = 0;
  @type("number") emoteEndsAt = 0;
  @type("number") lastSeq = 0;
  @type("number") attackReadyAt = 0;
  @type("number") shootReadyAt = 0;
  @type("number") signalShotReadyAt = 0;
  @type("number") fireblastReadyAt = 0;
  @type("number") frostNovaReadyAt = 0;
  @type("number") healReadyAt = 0;
  @type("number") tauntReadyAt = 0;
  @type("number") whirlwindReadyAt = 0;
  @type("number") multishotReadyAt = 0;
  @type("number") iceBlastReadyAt = 0;
  @type("string") castingAction: CombatActionId | "" = "";
  @type("number") castStartedAt = 0;
  @type("number") castEndsAt = 0;
  @type("number") lastCastAt = 0;
  @type("number") lastDamagedAt = 0;
  @type("string") castTargetKind = "";
  @type("string") castTargetId = "";
  @type({ map: QuestState }) quests = new MapSchema<QuestState>();
  @type({ map: InventoryItemState }) inventory = new MapSchema<InventoryItemState>();
  @type({ map: EquipmentSlotState }) equipment = new MapSchema<EquipmentSlotState>();
  @type({ map: TalentState }) talents = new MapSchema<TalentState>();
}

export class NpcState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") role: NpcRole = "wanderer";
  @type("string") model: NpcModel = "mfer";
  @type("string") portraitImage = "";
  @type("number") avatarSeed = 0;
  @type("number") health = 100;
  @type("number") maxHealth = 100;
  @type("boolean") isImmortal = false;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") yaw = 0;
  @type("string") animation: AnimationState = "idle";
  @type("string") dialogue = "";
  @type("string") questId = "";
  @type("number") homeX = 0;
  @type("number") homeZ = 0;
  @type("number") targetX = 0;
  @type("number") targetZ = 0;
  @type("number") leashRadius = 0;
  @type("number") nextDecisionAt = 0;
  @type("number") defeatedAt = 0;
  @type("number") despawnAt = 0;
  @type("number") respawnAt = 0;
  @type("number") frozenUntil = 0;
  @type("number") slowedUntil = 0;
  @type("string") aggroTargetId = "";
  @type("number") attackReadyAt = 0;
  @type("string") combatStyle = "";
  @type("boolean") hasLoot = false;
  @type({ map: LootItemState }) loot = new MapSchema<LootItemState>();
}

export class TownState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: NpcState }) npcs = new MapSchema<NpcState>();
}
