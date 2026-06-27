ALTER TABLE fishing_pond_catches
  DROP CONSTRAINT IF EXISTS fishing_pond_catches_status_check;

ALTER TABLE fishing_pond_catches
  ADD CONSTRAINT fishing_pond_catches_status_check
  CHECK (status IN ('pending', 'voucher_issued', 'tx_submitted', 'confirmed', 'expired', 'failed', 'abandoned'));
