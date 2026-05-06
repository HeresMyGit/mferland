import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import postgres from "postgres";

const DEFAULT_SEASON_ID = "season-0";
const DEFAULT_PRODUCT_ID = "season0-pass";
const VALID_PURCHASE_STATUSES = new Set(["pending", "confirmed", "rejected", "revoked"]);
const VALID_REWARD_STATUSES = new Set(["pending", "approved", "rejected", "distributed"]);

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    chain: { type: "string", default: "0" },
    contract: { type: "string" },
    help: { type: "boolean", short: "h" },
    id: { type: "string" },
    limit: { type: "string", default: "50" },
    "log-index": { type: "string", default: "0" },
    note: { type: "string", default: "" },
    "payment-amount": { type: "string", default: "0" },
    "payment-token": { type: "string", default: "" },
    pool: { type: "string", default: "" },
    "pool-wei": { type: "string", default: "" },
    product: { type: "string", default: DEFAULT_PRODUCT_ID },
    "minimum-points": { type: "string", default: "0" },
    "per-wallet-cap": { type: "string", default: "" },
    "per-wallet-cap-wei": { type: "string", default: "" },
    "require-product": { type: "string" },
    season: { type: "string", default: DEFAULT_SEASON_ID },
    status: { type: "string" },
    since: { type: "string", default: "7d" },
    "token-id": { type: "string", default: "" },
    tx: { type: "string" },
    wallet: { type: "string" },
  },
});

const command = positionals[0] ?? "";

if (values.help || !command) {
  printHelp();
  process.exit(values.help ? 0 : 1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

try {
  switch (command) {
    case "wallet":
      await printWallet(values.wallet);
      break;
    case "analytics-summary":
      await printAnalyticsSummary({
        limit: parseLimit(values.limit),
        since: values.since,
      });
      break;
    case "season-summary":
      await printSeasonSummary(values.season);
      break;
    case "season-list":
      await printSeasonList({
        limit: parseLimit(values.limit),
        seasonId: values.season,
        status: values.status,
        wallet: values.wallet,
      });
      break;
    case "season-export":
      await exportSeasonRewards({
        requiredProduct: values["require-product"] ? normalizeProduct(values["require-product"]) : "",
        seasonId: values.season,
        status: values.status ?? "approved",
      });
      break;
    case "season-payout-export":
      await exportSeasonPayouts({
        minimumPoints: parseNonNegativeInt(values["minimum-points"], "minimum-points"),
        perWalletCapWei: parseTokenAmountOption({
          decimalAmount: values["per-wallet-cap"],
          integerAmount: values["per-wallet-cap-wei"],
          label: "per-wallet-cap",
          required: false,
        }),
        poolWei: parseTokenAmountOption({
          decimalAmount: values.pool,
          integerAmount: values["pool-wei"],
          label: "pool",
          required: true,
        }),
        requiredProduct: values["require-product"] ? normalizeProduct(values["require-product"]) : DEFAULT_PRODUCT_ID,
        seasonId: values.season,
        status: values.status ?? "approved",
      });
      break;
    case "season-set-status":
      await setSeasonRewardStatus({
        id: values.id,
        note: values.note,
        status: values.status,
      });
      break;
    case "purchase-summary":
      await printPurchaseSummary({
        productId: normalizeProduct(values.product),
      });
      break;
    case "purchase-list":
      await printPurchaseList({
        limit: parseLimit(values.limit),
        productId: normalizeProduct(values.product),
        status: values.status,
        wallet: values.wallet,
      });
      break;
    case "purchase-export":
      await exportPurchases({
        productId: normalizeProduct(values.product),
        status: values.status ?? "confirmed",
      });
      break;
    case "purchase-record":
      await recordChainPurchase({
        chainId: parseChainId(values.chain),
        contract: values.contract,
        logIndex: parseNonNegativeInt(values["log-index"], "log-index"),
        note: values.note,
        paymentAmount: values["payment-amount"],
        paymentToken: values["payment-token"],
        productId: normalizeProduct(values.product),
        status: values.status ?? "pending",
        tokenId: values["token-id"],
        txHash: values.tx,
        wallet: values.wallet,
      });
      break;
    case "purchase-grant":
      await grantPurchase({
        note: values.note,
        productId: normalizeProduct(values.product),
        tokenId: values["token-id"],
        wallet: values.wallet,
      });
      break;
    case "purchase-revoke":
      await revokePurchase({
        id: values.id,
        note: values.note,
        productId: normalizeProduct(values.product),
        wallet: values.wallet,
      });
      break;
    case "purchase-set-status":
      await setPurchaseStatus({
        id: values.id,
        note: values.note,
        status: values.status,
      });
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}

async function printWallet(wallet) {
  const normalizedWallet = normalizeWallet(wallet);
  if (!normalizedWallet) fail("Pass --wallet 0x...");

  const [account] = await sql`
    SELECT
      aw.wallet_address,
      aw.account_id,
      a.display_name,
      c.id AS character_id,
      c.name AS character_name,
      c.level,
      c.xp,
      c.talent_points
    FROM account_wallets aw
    JOIN accounts a ON a.id = aw.account_id
    LEFT JOIN characters c ON c.account_id = a.id
    WHERE aw.wallet_address = ${normalizedWallet}
    LIMIT 1
  `;

  if (!account) {
    console.log(`No wallet account found for ${normalizedWallet}`);
    return;
  }

  const [inventory] = await sql`
    SELECT count(*)::int AS rows, coalesce(sum(count), 0)::int AS items
    FROM character_inventory
    WHERE character_id = ${account.character_id}
  `;
  const [equipment] = await sql`
    SELECT count(*)::int AS slots
    FROM character_equipment
    WHERE character_id = ${account.character_id}
  `;
  const [rewards] = await sql`
    SELECT
      coalesce(sum(points) FILTER (WHERE status = 'pending'), 0)::int AS pending,
      coalesce(sum(points) FILTER (WHERE status = 'approved'), 0)::int AS approved,
      coalesce(sum(points) FILTER (WHERE status = 'rejected'), 0)::int AS rejected,
      coalesce(sum(points) FILTER (WHERE status = 'distributed'), 0)::int AS distributed
    FROM season_reward_events
    WHERE wallet_address = ${normalizedWallet}
  `;
  const purchases = await sql`
    SELECT product_id, status, source, count(*)::int AS events
    FROM crypto_purchase_events
    WHERE wallet_address = ${normalizedWallet}
    GROUP BY product_id, status, source
    ORDER BY product_id, status, source
  `;

  console.log(JSON.stringify({
    wallet: account.wallet_address,
    accountId: account.account_id,
    displayName: account.display_name,
    character: {
      id: account.character_id,
      name: account.character_name,
      level: account.level,
      xp: account.xp,
      talentPoints: account.talent_points,
    },
    inventory,
    equipment,
    seasonRewards: rewards,
    cryptoPurchases: purchases,
  }, null, 2));
}

async function printAnalyticsSummary({ since, limit }) {
  const sinceDate = parseSince(since);
  const [totals] = await sql`
    SELECT
      count(*)::int AS events,
      count(DISTINCT NULLIF(session_id, ''))::int AS sessions,
      count(DISTINCT character_id)::int AS characters,
      count(DISTINCT NULLIF(wallet_hash, ''))::int AS wallets
    FROM analytics_events
    WHERE created_at >= ${sinceDate}
  `;
  const [sessions] = await sql`
    SELECT
      count(*) FILTER (WHERE event_type = 'session_joined')::int AS joins,
      count(*) FILTER (WHERE event_type = 'session_left')::int AS leaves,
      coalesce(
        round(avg((properties->>'durationMs')::numeric) FILTER (
          WHERE event_type = 'session_left'
            AND properties ? 'durationMs'
        )),
        0
      )::int AS avg_duration_ms
    FROM analytics_events
    WHERE created_at >= ${sinceDate}
  `;
  const byType = await sql`
    SELECT
      event_type,
      count(*)::int AS events,
      count(DISTINCT NULLIF(session_id, ''))::int AS sessions,
      count(DISTINCT character_id)::int AS characters
    FROM analytics_events
    WHERE created_at >= ${sinceDate}
    GROUP BY event_type
    ORDER BY events DESC, event_type ASC
    LIMIT ${limit}
  `;
  const questFunnel = await sql`
    SELECT
      properties->>'questId' AS quest_id,
      count(*) FILTER (WHERE event_type = 'quest_accepted')::int AS accepted,
      count(*) FILTER (WHERE event_type = 'quest_completed')::int AS completed
    FROM analytics_events
    WHERE created_at >= ${sinceDate}
      AND event_type IN ('quest_accepted', 'quest_completed')
      AND properties ? 'questId'
    GROUP BY properties->>'questId'
    ORDER BY accepted DESC, completed DESC, quest_id ASC
    LIMIT ${limit}
  `;
  const purchaseFunnel = await sql`
    SELECT
      coalesce(nullif(properties->>'product', ''), 'unknown') AS product,
      coalesce(nullif(properties->>'paymentToken', ''), 'unknown') AS payment_token,
      event_type,
      count(*)::int AS events,
      count(DISTINCT NULLIF(session_id, ''))::int AS sessions
    FROM analytics_events
    WHERE created_at >= ${sinceDate}
      AND event_type IN (
        'pass_purchase_started',
        'pass_purchase_confirmed',
        'pass_purchase_failed',
        'gear_purchase_started',
        'gear_purchase_confirmed',
        'gear_purchase_failed',
        'gold_grant_started',
        'gold_grant_confirmed',
        'gold_grant_failed',
        'gear_upgrade_started',
        'gear_upgrade_confirmed',
        'gear_upgrade_failed'
      )
    GROUP BY product, payment_token, event_type
    ORDER BY product ASC, payment_token ASC, event_type ASC
    LIMIT ${limit}
  `;
  const mferGpt = await sql`
    SELECT
      coalesce(nullif(properties->>'command', ''), 'unknown') AS command,
      coalesce(nullif(properties->>'status', ''), 'unknown') AS status,
      count(*)::int AS events,
      count(DISTINCT NULLIF(session_id, ''))::int AS sessions
    FROM analytics_events
    WHERE created_at >= ${sinceDate}
      AND event_type = 'mfergpt_command'
    GROUP BY command, status
    ORDER BY events DESC, command ASC, status ASC
    LIMIT ${limit}
  `;

  console.log(JSON.stringify({
    since: sinceDate.toISOString(),
    totals,
    sessions,
  }, null, 2));
  console.log("\nEvents by type");
  console.table(byType);
  console.log("\nQuest funnel");
  console.table(questFunnel);
  console.log("\nCrypto funnel");
  console.table(purchaseFunnel);
  console.log("\nmferGPT");
  console.table(mferGpt);
}

async function printSeasonSummary(seasonId) {
  const rows = await sql`
    SELECT
      status,
      count(*)::int AS events,
      coalesce(sum(points), 0)::int AS points,
      count(DISTINCT wallet_address)::int AS wallets
    FROM season_reward_events
    WHERE season_id = ${seasonId}
    GROUP BY status
    ORDER BY status
  `;
  console.table(rows);
}

async function printSeasonList({ limit, seasonId, status, wallet }) {
  const normalizedWallet = normalizeWallet(wallet);
  const rows = await sql`
    SELECT id, season_id, wallet_address, source_type, source_id, points, status, note, created_at
    FROM season_reward_events
    WHERE season_id = ${seasonId}
      AND (${status ?? ""} = '' OR status = ${status ?? ""})
      AND (${normalizedWallet ?? ""} = '' OR wallet_address = ${normalizedWallet ?? ""})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  console.table(rows);
}

async function exportSeasonRewards({ requiredProduct, seasonId, status }) {
  if (!VALID_REWARD_STATUSES.has(status)) fail(`Invalid status: ${status}`);
  const rows = await sql`
    SELECT wallet_address, sum(points)::int AS points
    FROM season_reward_events
    WHERE season_id = ${seasonId}
      AND status = ${status}
      AND (
        ${requiredProduct} = ''
        OR EXISTS (
          SELECT 1
          FROM crypto_purchase_events purchase
          WHERE purchase.wallet_address = season_reward_events.wallet_address
            AND purchase.product_id = ${requiredProduct}
            AND purchase.status = 'confirmed'
        )
      )
    GROUP BY wallet_address
    ORDER BY points DESC, wallet_address ASC
  `;

  console.log("wallet_address,points");
  for (const row of rows) {
    console.log(`${escapeCsv(row.wallet_address)},${row.points}`);
  }
}

async function exportSeasonPayouts({ minimumPoints, perWalletCapWei, poolWei, requiredProduct, seasonId, status }) {
  if (!VALID_REWARD_STATUSES.has(status)) fail(`Invalid status: ${status}`);
  if (poolWei <= 0n) fail("Pass --pool <tokens> or --pool-wei <wei> greater than zero");

  const rows = await sql`
    SELECT wallet_address, sum(points)::int AS points
    FROM season_reward_events
    WHERE season_id = ${seasonId}
      AND status = ${status}
      AND (
        ${requiredProduct} = ''
        OR EXISTS (
          SELECT 1
          FROM crypto_purchase_events purchase
          WHERE purchase.wallet_address = season_reward_events.wallet_address
            AND purchase.product_id = ${requiredProduct}
            AND purchase.status = 'confirmed'
        )
      )
    GROUP BY wallet_address
    HAVING sum(points)::int >= ${minimumPoints}
    ORDER BY points DESC, wallet_address ASC
  `;

  const allocations = allocatePayouts({
    rows: rows.map((row) => ({
      walletAddress: row.wallet_address,
      points: Number(row.points),
    })),
    poolWei,
    perWalletCapWei,
  });

  console.log("wallet_address,points,payout_wei,payout_mfergpt,capped,season_id,status,required_product,pool_wei,per_wallet_cap_wei,minimum_points");
  for (const allocation of allocations) {
    console.log([
      allocation.walletAddress,
      allocation.points,
      allocation.payoutWei.toString(),
      formatTokenAmount(allocation.payoutWei),
      allocation.capped ? "true" : "false",
      seasonId,
      status,
      requiredProduct,
      poolWei.toString(),
      perWalletCapWei.toString(),
      minimumPoints,
    ].map(escapeCsv).join(","));
  }
}

async function setSeasonRewardStatus({ id, note, status }) {
  if (!id) fail("Pass --id <reward_event_id>");
  if (!status || !VALID_REWARD_STATUSES.has(status)) fail("Pass --status pending|approved|rejected|distributed");

  const timestampColumn = status === "distributed" ? "distributed_at" : "reviewed_at";
  const [updated] = await sql`
    UPDATE season_reward_events
    SET
      status = ${status},
      note = CASE WHEN ${note ?? ""} = '' THEN note ELSE ${note ?? ""} END,
      reviewed_at = CASE WHEN ${timestampColumn} = 'reviewed_at' THEN now() ELSE reviewed_at END,
      distributed_at = CASE WHEN ${timestampColumn} = 'distributed_at' THEN now() ELSE distributed_at END
    WHERE id = ${id}
    RETURNING id, wallet_address, points, status, note
  `;

  if (!updated) fail(`No reward event found for id ${id}`);
  console.log(JSON.stringify(updated, null, 2));
}

async function printPurchaseSummary({ productId }) {
  const rows = await sql`
    SELECT
      status,
      source,
      count(*)::int AS events,
      count(DISTINCT wallet_address)::int AS wallets
    FROM crypto_purchase_events
    WHERE product_id = ${productId}
    GROUP BY status, source
    ORDER BY status, source
  `;
  console.table(rows);
}

async function printPurchaseList({ limit, productId, status, wallet }) {
  if (status && !VALID_PURCHASE_STATUSES.has(status)) fail("Pass --status pending|confirmed|rejected|revoked");
  const normalizedWallet = normalizeWallet(wallet);
  const rows = await sql`
    SELECT
      id,
      product_id,
      wallet_address,
      source,
      chain_id,
      contract_address,
      tx_hash,
      log_index,
      token_id,
      payment_token,
      payment_amount_wei,
      status,
      note,
      created_at,
      confirmed_at,
      revoked_at
    FROM crypto_purchase_events
    WHERE product_id = ${productId}
      AND (${status ?? ""} = '' OR status = ${status ?? ""})
      AND (${normalizedWallet ?? ""} = '' OR wallet_address = ${normalizedWallet ?? ""})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  console.table(rows);
}

async function exportPurchases({ productId, status }) {
  if (!VALID_PURCHASE_STATUSES.has(status)) fail("Pass --status pending|confirmed|rejected|revoked");
  const rows = await sql`
    SELECT
      wallet_address,
      product_id,
      token_id,
      source,
      chain_id,
      contract_address,
      tx_hash,
      log_index,
      payment_token,
      payment_amount_wei,
      confirmed_at
    FROM crypto_purchase_events
    WHERE product_id = ${productId}
      AND status = ${status}
    ORDER BY confirmed_at DESC NULLS LAST, created_at DESC
  `;

  console.log("wallet_address,product_id,token_id,source,chain_id,contract_address,tx_hash,log_index,payment_token,payment_amount_wei,confirmed_at");
  for (const row of rows) {
    console.log([
      row.wallet_address,
      row.product_id,
      row.token_id,
      row.source,
      row.chain_id,
      row.contract_address,
      row.tx_hash,
      row.log_index,
      row.payment_token,
      row.payment_amount_wei,
      row.confirmed_at?.toISOString?.() ?? row.confirmed_at ?? "",
    ].map(escapeCsv).join(","));
  }
}

async function recordChainPurchase({
  chainId,
  contract,
  logIndex,
  note,
  paymentAmount,
  paymentToken,
  productId,
  status,
  tokenId,
  txHash,
  wallet,
}) {
  if (!VALID_PURCHASE_STATUSES.has(status)) fail("Pass --status pending|confirmed|rejected|revoked");
  if (chainId <= 0) fail("Pass --chain <chain_id>");
  const normalizedWallet = normalizeWallet(wallet);
  if (!normalizedWallet) fail("Pass --wallet 0x...");
  const normalizedContract = normalizeAddress(contract);
  if (!normalizedContract) fail("Pass --contract 0x...");
  const normalizedTxHash = normalizeTxHash(txHash);
  if (!normalizedTxHash) fail("Pass --tx 0x...");
  const normalizedPaymentToken = normalizePaymentToken(paymentToken);
  if (!normalizedPaymentToken) fail("Pass --payment-token ETH|MFERGPT|...");
  const normalizedPaymentAmount = normalizePaymentAmount(paymentAmount);
  const normalizedTokenId = normalizeTokenId(tokenId);
  if (!normalizedTokenId) fail("Pass --token-id <token_or_receipt_id>");

  const walletAccount = await lookupWalletAccount(normalizedWallet);
  const timestamp = new Date();
  const existing = await findPurchaseByChainLog({ chainId, txHash: normalizedTxHash, logIndex });
  const values = {
    productId,
    walletAddress: normalizedWallet,
    characterId: walletAccount?.character_id ?? null,
    source: "chain",
    chainId,
    contractAddress: normalizedContract,
    txHash: normalizedTxHash,
    logIndex,
    tokenId: normalizedTokenId,
    paymentToken: normalizedPaymentToken,
    paymentAmountWei: normalizedPaymentAmount,
    status,
    note: note ?? "",
    confirmedAt: status === "confirmed" ? timestamp : null,
    revokedAt: status === "revoked" ? timestamp : null,
  };

  if (existing) {
    const [updated] = await sql`
      UPDATE crypto_purchase_events
      SET
        product_id = ${values.productId},
        wallet_address = ${values.walletAddress},
        character_id = ${values.characterId},
        source = ${values.source},
        contract_address = ${values.contractAddress},
        token_id = ${values.tokenId},
        payment_token = ${values.paymentToken},
        payment_amount_wei = ${values.paymentAmountWei},
        status = ${values.status},
        note = CASE WHEN ${values.note} = '' THEN note ELSE ${values.note} END,
        confirmed_at = CASE WHEN ${values.status} = 'confirmed' THEN ${values.confirmedAt} ELSE confirmed_at END,
        revoked_at = CASE WHEN ${values.status} = 'revoked' THEN ${values.revokedAt} ELSE revoked_at END
      WHERE id = ${existing.id}
      RETURNING *
    `;
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  const [inserted] = await sql`
    INSERT INTO crypto_purchase_events (
      id,
      product_id,
      wallet_address,
      character_id,
      source,
      chain_id,
      contract_address,
      tx_hash,
      log_index,
      token_id,
      payment_token,
      payment_amount_wei,
      status,
      note,
      confirmed_at,
      revoked_at
    )
    VALUES (
      ${randomUUID()},
      ${values.productId},
      ${values.walletAddress},
      ${values.characterId},
      ${values.source},
      ${values.chainId},
      ${values.contractAddress},
      ${values.txHash},
      ${values.logIndex},
      ${values.tokenId},
      ${values.paymentToken},
      ${values.paymentAmountWei},
      ${values.status},
      ${values.note},
      ${values.confirmedAt},
      ${values.revokedAt}
    )
    RETURNING *
  `;
  console.log(JSON.stringify(inserted, null, 2));
}

async function grantPurchase({ note, productId, tokenId, wallet }) {
  const normalizedWallet = normalizeWallet(wallet);
  if (!normalizedWallet) fail("Pass --wallet 0x...");
  const normalizedTokenId = normalizeTokenId(tokenId) || `manual:${randomUUID()}`;
  const walletAccount = await lookupWalletAccount(normalizedWallet);

  const [inserted] = await sql`
    INSERT INTO crypto_purchase_events (
      id,
      product_id,
      wallet_address,
      character_id,
      source,
      token_id,
      payment_token,
      payment_amount_wei,
      status,
      note,
      confirmed_at
    )
    VALUES (
      ${randomUUID()},
      ${productId},
      ${normalizedWallet},
      ${walletAccount?.character_id ?? null},
      'manual',
      ${normalizedTokenId},
      'MANUAL',
      '0',
      'confirmed',
      ${note ?? ""},
      now()
    )
    RETURNING *
  `;
  console.log(JSON.stringify(inserted, null, 2));
}

async function revokePurchase({ id, note, productId, wallet }) {
  if (id) {
    await setPurchaseStatus({ id, note, status: "revoked" });
    return;
  }

  const normalizedWallet = normalizeWallet(wallet);
  if (!normalizedWallet) fail("Pass --id <purchase_event_id> or --wallet 0x...");
  const rows = await sql`
    UPDATE crypto_purchase_events
    SET
      status = 'revoked',
      note = CASE WHEN ${note ?? ""} = '' THEN note ELSE ${note ?? ""} END,
      revoked_at = now()
    WHERE wallet_address = ${normalizedWallet}
      AND product_id = ${productId}
      AND status = 'confirmed'
    RETURNING id, wallet_address, product_id, token_id, source, status, note, revoked_at
  `;

  if (rows.length === 0) fail(`No active ${productId} purchase/grant found for ${normalizedWallet}`);
  console.table(rows);
}

async function setPurchaseStatus({ id, note, status }) {
  if (!id) fail("Pass --id <purchase_event_id>");
  if (!status || !VALID_PURCHASE_STATUSES.has(status)) fail("Pass --status pending|confirmed|rejected|revoked");

  const [updated] = await sql`
    UPDATE crypto_purchase_events
    SET
      status = ${status},
      note = CASE WHEN ${note ?? ""} = '' THEN note ELSE ${note ?? ""} END,
      confirmed_at = CASE WHEN ${status} = 'confirmed' THEN now() ELSE confirmed_at END,
      revoked_at = CASE WHEN ${status} = 'revoked' THEN now() ELSE revoked_at END
    WHERE id = ${id}
    RETURNING *
  `;

  if (!updated) fail(`No purchase event found for id ${id}`);
  console.log(JSON.stringify(updated, null, 2));
}

async function lookupWalletAccount(wallet) {
  const [account] = await sql`
    SELECT aw.account_id, c.id AS character_id
    FROM account_wallets aw
    LEFT JOIN characters c ON c.account_id = aw.account_id
    WHERE aw.wallet_address = ${wallet}
    LIMIT 1
  `;
  return account ?? null;
}

async function findPurchaseByChainLog({ chainId, txHash, logIndex }) {
  const [purchase] = await sql`
    SELECT id
    FROM crypto_purchase_events
    WHERE chain_id = ${chainId}
      AND tx_hash = ${txHash}
      AND log_index = ${logIndex}
    LIMIT 1
  `;
  return purchase ?? null;
}

function parseLimit(value) {
  const limit = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return 50;
  return limit;
}

function parseSince(value) {
  const normalized = String(value ?? "7d").trim().toLowerCase();
  const relative = normalized.match(/^([1-9][0-9]{0,3})(h|d|w)$/);
  if (relative) {
    const amount = Number.parseInt(relative[1], 10);
    const unit = relative[2];
    const hours = unit === "h" ? amount : unit === "d" ? amount * 24 : amount * 24 * 7;
    return new Date(Date.now() - hours * 60 * 60 * 1000);
  }

  const date = new Date(normalized);
  if (!Number.isNaN(date.getTime())) return date;
  fail("Pass --since like 24h, 7d, 4w, or an ISO date");
}

function parseChainId(value) {
  const chainId = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(chainId) || chainId < 0) return 0;
  return chainId;
}

function parseNonNegativeInt(value, label) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < 0) fail(`Pass --${label} as a non-negative integer`);
  return parsed;
}

function parseTokenAmountOption({ decimalAmount, integerAmount, label, required }) {
  const hasDecimal = String(decimalAmount ?? "").trim() !== "";
  const hasInteger = String(integerAmount ?? "").trim() !== "";
  if (hasDecimal && hasInteger) fail(`Pass either --${label} or --${label}-wei, not both`);
  if (hasInteger) return BigInt(normalizePaymentAmount(integerAmount));
  if (hasDecimal) return parseTokenAmount(decimalAmount, label);
  if (required) fail(`Pass --${label} <token_amount> or --${label}-wei <wei>`);
  return 0n;
}

function parseTokenAmount(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^[0-9]+(\.[0-9]{1,18})?$/.test(normalized)) {
    fail(`Pass --${label} as a positive decimal with up to 18 fractional digits`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}

function allocatePayouts({ rows, poolWei, perWalletCapWei }) {
  if (rows.length === 0) return [];

  const allocations = new Map(rows.map((row) => [row.walletAddress, 0n]));
  const cappedWallets = new Set();
  let remainingRows = [...rows];
  let remainingPool = poolWei;

  while (remainingRows.length > 0 && remainingPool > 0n) {
    const totalPoints = remainingRows.reduce((total, row) => total + BigInt(row.points), 0n);
    if (totalPoints <= 0n) break;

    const round = remainingRows.map((row) => ({
      ...row,
      payoutWei: remainingPool * BigInt(row.points) / totalPoints,
    }));
    const capped = perWalletCapWei > 0n
      ? round.filter((row) => (allocations.get(row.walletAddress) ?? 0n) + row.payoutWei > perWalletCapWei)
      : [];

    if (capped.length === 0) {
      for (const row of round) {
        allocations.set(row.walletAddress, (allocations.get(row.walletAddress) ?? 0n) + row.payoutWei);
      }
      break;
    }

    for (const row of capped) {
      const current = allocations.get(row.walletAddress) ?? 0n;
      const available = perWalletCapWei - current;
      if (available > 0n) {
        allocations.set(row.walletAddress, current + available);
        remainingPool -= available;
      }
      cappedWallets.add(row.walletAddress);
    }
    remainingRows = remainingRows.filter((row) => !cappedWallets.has(row.walletAddress));
  }

  const allocated = [...allocations.values()].reduce((total, value) => total + value, 0n);
  let dust = poolWei - allocated;
  for (const row of rows) {
    if (dust <= 0n) break;
    const current = allocations.get(row.walletAddress) ?? 0n;
    if (perWalletCapWei > 0n && current >= perWalletCapWei) continue;
    allocations.set(row.walletAddress, current + 1n);
    dust -= 1n;
  }

  return rows.map((row) => {
    const payoutWei = allocations.get(row.walletAddress) ?? 0n;
    return {
      ...row,
      payoutWei,
      capped: perWalletCapWei > 0n && payoutWei >= perWalletCapWei,
    };
  }).filter((row) => row.payoutWei > 0n);
}

function formatTokenAmount(value, decimals = 18) {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  if (fraction === 0n) return whole.toString();
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

function normalizeAddress(value) {
  if (!value) return "";
  const normalized = value.toLowerCase().trim();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

function normalizeTxHash(value) {
  if (!value) return "";
  const normalized = value.toLowerCase().trim();
  return /^0x[a-f0-9]{64}$/.test(normalized) ? normalized : "";
}

function normalizeProduct(value) {
  const normalized = String(value ?? "").toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9._:-]{0,63}$/.test(normalized)) fail("Pass --product like season0-pass");
  return normalized;
}

function normalizePaymentAmount(value) {
  const normalized = String(value ?? "0").trim();
  if (!/^[0-9]+$/.test(normalized)) fail("Pass --payment-amount in wei as digits only");
  return normalized;
}

function normalizePaymentToken(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9_$-]{1,32}$/.test(normalized) ? normalized : "";
}

function normalizeTokenId(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  if (normalized.length > 96) fail("--token-id is too long");
  return normalized;
}

function normalizeWallet(wallet) {
  if (!wallet) return "";
  const normalized = wallet.toLowerCase().trim();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printHelp() {
  console.log(`Usage:
  npm run support:admin -- wallet --wallet 0x...
  npm run support:admin -- analytics-summary [--since 7d] [--limit 50]
  npm run support:admin -- season-summary [--season season-0]
  npm run support:admin -- season-list [--status pending] [--wallet 0x...] [--limit 50]
  npm run support:admin -- season-export [--status approved] [--require-product season0-pass]
  npm run support:admin -- season-payout-export --pool 1000 [--status approved] [--require-product season0-pass] [--per-wallet-cap 100] [--minimum-points 1]
  npm run support:admin -- season-set-status --id <id> --status approved|rejected|distributed [--note "..."]
  npm run support:admin -- purchase-summary [--product season0-pass]
  npm run support:admin -- purchase-list [--product season0-pass] [--status confirmed] [--wallet 0x...] [--limit 50]
  npm run support:admin -- purchase-export [--product season0-pass] [--status confirmed]
  npm run support:admin -- purchase-record --wallet 0x... --chain 8453 --contract 0x... --tx 0x... --log-index 0 --token-id 1 --payment-token ETH --payment-amount <wei> [--status confirmed] [--note "..."]
  npm run support:admin -- purchase-grant --wallet 0x... [--product season0-pass] [--token-id manual-id] [--note "..."]
  npm run support:admin -- purchase-revoke --id <id> [--note "..."]
  npm run support:admin -- purchase-revoke --wallet 0x... [--product season0-pass] [--note "..."]
  npm run support:admin -- purchase-set-status --id <id> --status pending|confirmed|rejected|revoked [--note "..."]`);
}
