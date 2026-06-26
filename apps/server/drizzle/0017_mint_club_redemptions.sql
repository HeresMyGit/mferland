ALTER TABLE "fishing_pond_catches" ADD COLUMN "mint_club_redemption_status" text DEFAULT '' NOT NULL;
ALTER TABLE "fishing_pond_catches" ADD COLUMN "mint_club_redemption_tx_hash" text DEFAULT '' NOT NULL;
ALTER TABLE "fishing_pond_catches" ADD COLUMN "mint_club_redemption_error" text DEFAULT '' NOT NULL;
ALTER TABLE "fishing_pond_catches" ADD COLUMN "mint_club_redemption_submitted_at" timestamp with time zone;
ALTER TABLE "fishing_pond_catches" ADD COLUMN "mint_club_redemption_confirmed_at" timestamp with time zone;
CREATE INDEX "fishing_pond_catches_mint_club_tx_hash_idx" ON "fishing_pond_catches" USING btree ("chain_id","mint_club_redemption_tx_hash");
