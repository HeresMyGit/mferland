import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  privyUserId: text("privy_user_id").unique(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountWallets = pgTable("account_wallets", {
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  walletAddress: text("wallet_address").primaryKey(),
  walletType: text("wallet_type").notNull().default("external"),
  primaryWallet: boolean("primary_wallet").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("account_wallets_account_id_idx").on(table.accountId),
]);

export const characters = pgTable("characters", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  avatarSeed: integer("avatar_seed").notNull(),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  talentPoints: integer("talent_points").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("characters_account_id_idx").on(table.accountId),
]);

export const characterQuests = pgTable("character_quests", {
  characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  questId: text("quest_id").notNull(),
  status: text("status").notNull(),
  progress: integer("progress").notNull().default(0),
  required: integer("required").notNull().default(1),
  flags: text("flags").notNull().default(""),
  completedAt: bigint("completed_at", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.characterId, table.questId] }),
]);

export const characterInventory = pgTable("character_inventory", {
  characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.characterId, table.itemId] }),
]);

export const characterEquipment = pgTable("character_equipment", {
  characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  slot: text("slot").notNull(),
  itemId: text("item_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.characterId, table.slot] }),
]);

export const characterTalents = pgTable("character_talents", {
  characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  tree: text("tree").notNull(),
  nodeId: text("node_id").notNull(),
  rank: integer("rank").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.characterId, table.tree, table.nodeId] }),
]);
