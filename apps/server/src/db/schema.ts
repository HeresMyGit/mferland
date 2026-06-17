import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
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

export const inviteCodes = pgTable("invite_codes", {
  code: text("code").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  claimedWalletAddress: text("claimed_wallet_address").notNull().default(""),
  claimedAccountId: text("claimed_account_id").references(() => accounts.id, { onDelete: "set null" }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
}, (table) => [
  index("invite_codes_claimed_wallet_idx").on(table.claimedWalletAddress),
  index("invite_codes_claimed_at_idx").on(table.claimedAt),
]);

export const characters = pgTable("characters", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  avatarSeed: integer("avatar_seed").notNull(),
  nameLockedAt: timestamp("name_locked_at", { withTimezone: true }),
  appearanceTraits: jsonb("appearance_traits").$type<Record<string, string>>().notNull().default({}),
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
  chainTokenId: text("chain_token_id").notNull().default(""),
  chainTier: integer("chain_tier").notNull().default(1),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.characterId, table.itemId, table.chainTokenId] }),
]);

export const characterEquipment = pgTable("character_equipment", {
  characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  slot: text("slot").notNull(),
  itemId: text("item_id").notNull(),
  chainTokenId: text("chain_token_id").notNull().default(""),
  chainTier: integer("chain_tier").notNull().default(1),
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

export const characterBuffs = pgTable("character_buffs", {
  characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  buffId: text("buff_id").notNull(),
  startedAt: bigint("started_at", { mode: "number" }).notNull().default(0),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.characterId, table.buffId] }),
  index("character_buffs_expires_at_idx").on(table.expiresAt),
]);

export const seasonRewardEvents = pgTable("season_reward_events", {
  id: text("id").primaryKey(),
  seasonId: text("season_id").notNull(),
  characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  walletAddress: text("wallet_address").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  points: integer("points").notNull(),
  status: text("status").notNull().default("pending"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  distributedAt: timestamp("distributed_at", { withTimezone: true }),
}, (table) => [
  index("season_reward_events_wallet_idx").on(table.seasonId, table.walletAddress, table.createdAt),
  index("season_reward_events_status_idx").on(table.seasonId, table.status, table.createdAt),
]);

export const cryptoPurchaseEvents = pgTable("crypto_purchase_events", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  characterId: text("character_id").references(() => characters.id, { onDelete: "set null" }),
  source: text("source").notNull().default("chain"),
  chainId: integer("chain_id").notNull().default(0),
  contractAddress: text("contract_address").notNull().default(""),
  txHash: text("tx_hash").notNull().default(""),
  logIndex: integer("log_index").notNull().default(0),
  tokenId: text("token_id").notNull().default(""),
  paymentToken: text("payment_token").notNull().default(""),
  paymentAmountWei: text("payment_amount_wei").notNull().default("0"),
  status: text("status").notNull().default("pending"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  index("crypto_purchase_events_wallet_idx").on(table.walletAddress, table.productId, table.createdAt),
  index("crypto_purchase_events_status_idx").on(table.productId, table.status, table.createdAt),
]);

export const cryptoMarketQuotes = pgTable("crypto_market_quotes", {
  id: text("id").primaryKey(),
  tokenSymbol: text("token_symbol").notNull(),
  tokenAddress: text("token_address").notNull(),
  chainId: text("chain_id").notNull(),
  quoteSymbol: text("quote_symbol").notNull(),
  source: text("source").notNull().default("dexscreener"),
  dexId: text("dex_id").notNull().default(""),
  pairAddress: text("pair_address").notNull().default(""),
  pairUrl: text("pair_url").notNull().default(""),
  priceNative: text("price_native").notNull(),
  priceUsd: text("price_usd").notNull().default(""),
  liquidityUsd: text("liquidity_usd").notNull().default(""),
  volume24h: text("volume_24h").notNull().default(""),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  rawJson: text("raw_json").notNull().default("{}"),
}, (table) => [
  index("crypto_market_quotes_token_idx").on(table.chainId, table.tokenAddress, table.quoteSymbol),
  index("crypto_market_quotes_fetched_idx").on(table.fetchedAt),
]);

export const agentCommandUsage = pgTable("agent_command_usage", {
  walletAddress: text("wallet_address").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  usedSeconds: integer("used_seconds").notNull().default(0),
  reservedSeconds: integer("reserved_seconds").notNull().default(0),
  reservationExpiresAt: timestamp("reservation_expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("agent_command_usage_window_idx").on(table.windowStartedAt),
  index("agent_command_usage_reservation_expires_idx").on(table.reservationExpiresAt),
]);

export const analyticsEvents = pgTable("analytics_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  sessionId: text("session_id").notNull().default(""),
  characterId: text("character_id").references(() => characters.id, { onDelete: "set null" }),
  identityType: text("identity_type").notNull().default(""),
  walletHash: text("wallet_hash").notNull().default(""),
  properties: jsonb("properties").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("analytics_events_type_created_idx").on(table.eventType, table.createdAt),
  index("analytics_events_character_created_idx").on(table.characterId, table.createdAt),
  index("analytics_events_wallet_created_idx").on(table.walletHash, table.createdAt),
  index("analytics_events_session_created_idx").on(table.sessionId, table.createdAt),
]);
