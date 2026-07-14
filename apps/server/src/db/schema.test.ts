import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { fishingPondCatches } from "./schema.js";

test("Mint Club redemption transaction hashes have a case-insensitive partial unique index", () => {
  const config = getTableConfig(fishingPondCatches);
  const index = config.indexes.find((candidate) => (
    candidate.config.name === "fishing_pond_catches_mint_club_tx_hash_unique_idx"
  ));
  assert.ok(index);
  assert.equal(index.config.unique, true);
  assert.equal(index.config.columns.length, 2);
  assert.ok(index.config.where);
});

test("pond claim transaction hashes have a case-insensitive partial unique index", () => {
  const config = getTableConfig(fishingPondCatches);
  const index = config.indexes.find((candidate) => (
    candidate.config.name === "fishing_pond_catches_tx_hash_unique_idx"
  ));
  assert.ok(index);
  assert.equal(index.config.unique, true);
  assert.ok(index.config.where);
});

test("Mint Club uniqueness migration quarantines existing duplicates before creating the index", async () => {
  const migrationUrl = new URL("../../drizzle/0019_mint_club_redemption_tx_hash_uniqueness.sql", import.meta.url);
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /SET mint_club_redemption_error = CASE/);
  assert.match(migration, /SET error = CASE status/);
  assert.doesNotMatch(migration, /rpc_url|provider_key/i);
  assert.match(migration, /lower\(trim\(mint_club_redemption_tx_hash\)\)/);
  assert.match(migration, /row_number\(\) OVER/);
  assert.match(migration, /duplicate Mint Club redemption transaction hash/);
  assert.match(migration, /CREATE UNIQUE INDEX fishing_pond_catches_mint_club_tx_hash_unique_idx/);
  assert.match(migration, /CREATE UNIQUE INDEX fishing_pond_catches_tx_hash_unique_idx/);
  assert.match(migration, /WHERE mint_club_redemption_tx_hash <> ''/);
});
