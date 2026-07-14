UPDATE fishing_pond_catches
SET mint_club_redemption_error = CASE mint_club_redemption_status
  WHEN 'failed' THEN 'Mint Club redemption confirmation failed; refresh before retrying'
  WHEN 'tx_submitted' THEN 'Mint Club redemption confirmation pending; retry with the same transaction hash'
  ELSE ''
END
WHERE mint_club_redemption_error <> '';

UPDATE fishing_pond_catches
SET error = CASE status
  WHEN 'failed' THEN 'pond claim confirmation failed; refresh before retrying'
  WHEN 'abandoned' THEN 'claim offer forfeited'
  ELSE ''
END
WHERE error <> '';

UPDATE fishing_pond_catches
SET tx_hash = lower(trim(tx_hash))
WHERE tx_hash <> '';

WITH ranked_claims AS (
  SELECT
    catch_id,
    tx_hash,
    row_number() OVER (
      PARTITION BY chain_id, lower(tx_hash)
      ORDER BY
        CASE status
          WHEN 'confirmed' THEN 0
          WHEN 'tx_submitted' THEN 1
          ELSE 2
        END,
        confirmed_at NULLS LAST,
        tx_submitted_at NULLS LAST,
        created_at,
        catch_id
    ) AS duplicate_rank
  FROM fishing_pond_catches
  WHERE tx_hash <> ''
), duplicate_claims AS (
  SELECT catch_id, tx_hash
  FROM ranked_claims
  WHERE duplicate_rank > 1
)
UPDATE fishing_pond_catches AS catches
SET
  status = 'failed',
  tx_hash = '',
  error = 'duplicate pond claim transaction hash; requires manual reconciliation',
  tx_submitted_at = NULL,
  confirmed_at = NULL,
  updated_at = now()
FROM duplicate_claims AS duplicates
WHERE catches.catch_id = duplicates.catch_id;

DROP INDEX IF EXISTS fishing_pond_catches_tx_hash_idx;

CREATE UNIQUE INDEX fishing_pond_catches_tx_hash_unique_idx
  ON fishing_pond_catches (chain_id, lower(tx_hash))
  WHERE tx_hash <> '';

UPDATE fishing_pond_catches
SET mint_club_redemption_tx_hash = lower(trim(mint_club_redemption_tx_hash))
WHERE mint_club_redemption_tx_hash <> '';

WITH ranked AS (
  SELECT
    catch_id,
    mint_club_redemption_tx_hash,
    row_number() OVER (
      PARTITION BY chain_id, lower(mint_club_redemption_tx_hash)
      ORDER BY
        CASE mint_club_redemption_status
          WHEN 'confirmed' THEN 0
          WHEN 'tx_submitted' THEN 1
          ELSE 2
        END,
        mint_club_redemption_confirmed_at NULLS LAST,
        mint_club_redemption_submitted_at NULLS LAST,
        created_at,
        catch_id
    ) AS duplicate_rank
  FROM fishing_pond_catches
  WHERE mint_club_redemption_tx_hash <> ''
), duplicate_assignments AS (
  SELECT catch_id, mint_club_redemption_tx_hash
  FROM ranked
  WHERE duplicate_rank > 1
)
UPDATE fishing_pond_catches AS catches
SET
  mint_club_redemption_status = 'failed',
  mint_club_redemption_tx_hash = '',
  mint_club_redemption_error = concat(
    'duplicate Mint Club redemption transaction hash ',
    duplicates.mint_club_redemption_tx_hash,
    '; requires manual reconciliation'
  ),
  mint_club_redemption_submitted_at = NULL,
  mint_club_redemption_confirmed_at = NULL,
  updated_at = now()
FROM duplicate_assignments AS duplicates
WHERE catches.catch_id = duplicates.catch_id;

DROP INDEX IF EXISTS fishing_pond_catches_mint_club_tx_hash_idx;

CREATE UNIQUE INDEX fishing_pond_catches_mint_club_tx_hash_unique_idx
  ON fishing_pond_catches (chain_id, lower(mint_club_redemption_tx_hash))
  WHERE mint_club_redemption_tx_hash <> '';
