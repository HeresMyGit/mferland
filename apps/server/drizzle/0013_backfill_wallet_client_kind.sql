UPDATE account_wallets aw
SET registered_client_kind = 'agent',
    wallet_type = CASE WHEN aw.wallet_type = 'external' THEN 'agent' ELSE aw.wallet_type END
FROM accounts a
LEFT JOIN LATERAL (
  SELECT c.name
  FROM characters c
  WHERE c.account_id = a.id
  ORDER BY c.updated_at DESC
  LIMIT 1
) character ON true
WHERE aw.account_id = a.id
  AND aw.registered_client_kind = ''
  AND (
    aw.wallet_type = 'agent'
    OR lower(a.display_name) LIKE '%agent%'
    OR lower(a.display_name) LIKE '%bankr%'
    OR lower(a.display_name) LIKE '%bridge%'
    OR lower(a.display_name) LIKE '%codex%'
    OR lower(a.display_name) LIKE '%mfergpt%'
    OR lower(a.display_name) LIKE '%qwen%'
    OR lower(a.display_name) LIKE '%smoke%'
    OR lower(character.name) LIKE '%agent%'
    OR lower(character.name) LIKE '%bankr%'
    OR lower(character.name) LIKE '%bridge%'
    OR lower(character.name) LIKE '%codex%'
    OR lower(character.name) LIKE '%mfergpt%'
    OR lower(character.name) LIKE '%qwen%'
    OR lower(character.name) LIKE '%smoke%'
  );

UPDATE account_wallets
SET registered_client_kind = 'human'
WHERE registered_client_kind = '';
