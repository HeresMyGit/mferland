# mferGPT Daily Quest API Spec

Date: 2026-05-02
Status: Draft

## Summary

Let a separate digester system read recent mferland quest history plus outside social context, propose the next daily mferGPT quest, and submit it to the game server through a small authenticated API.

The game server stays authoritative. The digester can propose content, but it cannot directly control rewards, arbitrary coordinates, raw code, live economy state, or unchecked model assets.

The first version should support one land, `main`, while shaping tables and API paths around `land_id` so future user-created lands do not require a redesign.

## Current Repo Constraints

- The server already has plain HTTP handling beside Colyseus in `apps/server/src/index.ts`, currently used for `/health` and `/debug-placement-map`.
- Static quests live in `packages/shared/src/quests.ts`, and `QuestId` is derived from that object in `packages/shared/src/types.ts`.
- Wallet quest persistence in `character_quests` stores `quest_id`, `status`, `progress`, `required`, `flags`, and `completed_at`, then filters loaded rows to known static `QUEST_IDS`.
- `mferGPT` already has a bounded server-side tool pattern in `apps/server/src/systems/mfergpt.ts`: inspect safe public state, hints, limited events, and temporary NPC spawns.
- NPC models are currently a fixed union: `mfer`, `mfergpt`, `rabbit`, `deer`, `hog`, and `training-dummy`.
- Runtime model assets are loaded from `apps/web/public/models`, so generated 3D model support needs a reviewed asset pipeline before it becomes live content.

## Goals

- Let an external digester read safe quest/event history and allowed game knobs.
- Let the digester submit a draft daily quest for a land.
- Validate, normalize, store, publish, and archive daily quests server-side.
- Surface the active daily through mferGPT in-game.
- Spawn a daily boss/MOB using approved model presets and server-owned combat profiles.
- Record enough history that tomorrow's digester can avoid repeating yesterday's joke, boss, objective, or source theme.
- Add `land_id` from day one so future user lands can each have their own generated content stream.

## Non-Goals

- No live code generation.
- No digester-provided JavaScript, SQL, item definitions, talent effects, or combat formulas.
- No arbitrary XP, item, or currency rewards from the digester.
- No arbitrary model URLs or GLB uploads in v1.
- No direct scraping of Twitter/X from the game server in v1. The digester owns source ingestion and summarization.
- No onchain writes. Generated daily content is regular DB-backed content.
- No open public UGC without moderation and asset validation.

## Actors

| Actor | Responsibility |
| --- | --- |
| Game server | Owns validation, storage, publication, runtime spawning, quest progress, rewards, and logs. |
| Digester worker | Reads outside sources, reads safe game context, proposes daily quest content. |
| mferGPT NPC | In-game interface that tells players about the active daily and starts the event. |
| Project admin | Owns API keys, publish policy, source allowlist, and manual overrides. |
| Future land owner | Owns generated content for one land through scoped keys and server validation. |

## Version 1 Architecture

Use a runtime daily content table plus one static bridge quest.

The bridge quest keeps the current static quest system stable while allowing the text, boss, and theme to change daily. A static quest id such as `mfergpt-daily-signal` can exist in `QUESTS`; its content is overridden from the active daily quest row when mferGPT offers it.

Recommended v1 flow:

1. Digester calls `GET /api/v1/lands/main/daily-quest/context`.
2. Digester generates strict JSON from safe game history plus external social digest.
3. Digester calls `POST /api/v1/lands/main/daily-quest/drafts`.
4. Server validates and stores a draft.
5. Digester or admin calls `POST /api/v1/lands/main/daily-quest/drafts/:draftId/publish`.
6. Server marks one daily quest as published for that land/date.
7. mferGPT offers the active daily in-game.
8. Server spawns the approved boss variant and tracks completion.
9. Completion stats feed the next context response.

This avoids making every existing `QuestId` helper dynamic immediately.

## Future Architecture

After v1 works, promote quests into a runtime registry:

- Static quest definitions stay available for authored story quests.
- Runtime quest definitions come from DB and are keyed by stable dynamic IDs.
- Shared/client/server types stop assuming every quest id is `keyof QUESTS`.
- Player progress can reference either authored or generated quest definitions.

That is the better long-term model for user-created lands, but it is a wider refactor than the first digester API needs.

## API Authentication

V1 can use one server env key:

- `MFERLAND_DIGESTER_API_KEY`
- Client sends `Authorization: Bearer <key>`.
- Server compares with constant-time equality.
- Server never logs the raw key.
- Admin endpoints should not use permissive browser CORS.

Multi-land version should store hashed keys:

| Field | Notes |
| --- | --- |
| `id` | Key id. |
| `land_id` | Scope boundary. |
| `name` | Human label, e.g. `daily-digester-prod`. |
| `key_prefix` | First few chars for logs/debugging only. |
| `key_hash` | Hash of the secret key. |
| `scopes` | Comma-separated or JSON array, e.g. `quest:read`, `quest:write`, `quest:publish`. |
| `last_used_at` | Audit/debug. |
| `revoked_at` | Null means active. |
| `created_at` | Creation timestamp. |

API keys are enough for one trusted digester. User-created lands need scoped hashed keys, rate limits, audit logs, and moderation state.

## API Endpoints

All v1 endpoints are JSON over HTTPS in deployed environments.

### GET `/api/v1/lands/:landId/daily-quest/context`

Auth scope: `quest:read`

Purpose: give the digester enough safe state to create the next quest without exposing secrets or raw player private data.

Query params:

| Param | Default | Notes |
| --- | --- | --- |
| `limit` | `14` | Number of recent daily quests to include. Clamp to `1..30`. |
| `includeDrafts` | `false` | Only allow for keys with write scope. |

Response shape:

```json
{
  "landId": "main",
  "serverDate": "2026-05-02",
  "activeDaily": {
    "id": "dq_2026_05_02_main",
    "questDate": "2026-05-02",
    "title": "timeline smoke check",
    "bossName": "engagement bait mfer",
    "spawnZone": "signal-ridge",
    "status": "published",
    "completionCount": 12
  },
  "recentDailies": [
    {
      "questDate": "2026-05-01",
      "title": "airdrop reply guy",
      "bossName": "reply-loop mfer",
      "sourceThemes": ["airdrop", "timeline noise"],
      "completionCount": 9,
      "failedReason": ""
    }
  ],
  "allowed": {
    "spawnZones": ["arena", "farm-road", "signal-ridge"],
    "modelPresets": ["mfer", "mfergpt", "hog", "training-dummy"],
    "combatProfiles": ["solo-bruiser", "solo-caster", "small-group-raid"],
    "rewardProfiles": ["daily-standard", "daily-hard", "daily-raid"]
  }
}
```

Do not include raw wallet addresses, env vars, API keys, private chat logs, or full external social content.

### POST `/api/v1/lands/:landId/daily-quest/drafts`

Auth scope: `quest:write`

Purpose: submit a proposed daily quest. The server stores it as a draft after validation and normalization.

Request shape:

```json
{
  "questDate": "2026-05-03",
  "idempotencyKey": "mfergpt-daily-2026-05-03-v1",
  "sourceDigest": {
    "summary": "Mfer Twitter spent the day arguing about a fake airdrop screenshot and one cursed chart.",
    "themes": ["fake airdrop", "chart watching", "reply loops"],
    "refs": [
      {
        "title": "representative source title",
        "url": "https://x.com/example/status/123",
        "observedAt": "2026-05-03T14:15:00Z"
      }
    ]
  },
  "content": {
    "title": "fake airdrop cleanup",
    "description": "mferGPT caught a bad screenshot looping through town. go turn it off before everyone farms it.",
    "storyText": "the timeline coughed up a fake claim link and now the ridge relay is repeating it.",
    "objectiveLabel": "drop the fake airdrop mfer",
    "completionText": "mferGPT deletes the screenshot and everyone pretends they knew.",
    "boss": {
      "name": "fake airdrop mfer",
      "modelPreset": "mfer",
      "variant": {
        "palette": "red-eye",
        "scale": 1.18,
        "accessories": ["signal-crown"]
      },
      "spawnZone": "signal-ridge",
      "combatProfile": "solo-bruiser"
    },
    "difficulty": "solo",
    "rewardProfile": "daily-standard"
  }
}
```

Server response:

```json
{
  "ok": true,
  "draft": {
    "id": "dq_draft_01hx...",
    "landId": "main",
    "questDate": "2026-05-03",
    "status": "draft",
    "contentHash": "sha256:...",
    "normalizedContent": {
      "title": "fake airdrop cleanup",
      "bossName": "fake airdrop mfer",
      "spawnZone": "signal-ridge",
      "modelPreset": "mfer",
      "combatProfile": "solo-bruiser",
      "rewardProfile": "daily-standard"
    },
    "warnings": []
  }
}
```

The server ignores unsupported fields instead of trusting them.

### POST `/api/v1/lands/:landId/daily-quest/drafts/:draftId/publish`

Auth scope: `quest:publish`

Purpose: make a validated draft the active daily quest for its land/date.

Request shape:

```json
{
  "expectedContentHash": "sha256:...",
  "replaceExisting": false
}
```

Rules:

- Only one published daily can exist for a `land_id + quest_date`.
- `replaceExisting: true` should require a stronger scope later, e.g. `quest:replace`.
- Publishing should write an audit event.
- Publishing should not spawn the boss immediately unless the game room integration explicitly chooses global daily spawns.

### GET `/api/v1/lands/:landId/daily-quest/active`

Auth scope: optional for server-internal use, public-safe if exposed.

Purpose: return the active daily quest for display, debugging, or a separate launcher UI.

Do not expose raw source refs if this becomes public.

### POST `/api/v1/lands/:landId/daily-quest/:dailyQuestId/archive`

Auth scope: `quest:publish`

Purpose: manually archive or disable a problematic daily.

This should despawn any active daily boss in live rooms or mark it for cleanup on the next room tick.

## Validation Rules

Server validation owns all clamps.

| Field | Rule |
| --- | --- |
| `landId` | Must exist and be active. V1 only allows `main`. |
| `questDate` | ISO date. Unique per land for published quests. |
| `title` | 3-48 chars after trim. |
| `description` | 20-280 chars. |
| `storyText` | 20-360 chars. |
| `objectiveLabel` | 5-80 chars. |
| `completionText` | 5-220 chars. |
| `boss.name` | 3-48 chars, sanitized with the same spirit as player/NPC names. |
| `boss.modelPreset` | Must be in server allowlist. |
| `boss.spawnZone` | Must be in server allowlist. Server maps zones to coordinates. |
| `boss.combatProfile` | Must be in server allowlist. Server maps profile to health/damage/leash. |
| `boss.variant.scale` | Clamp, e.g. `0.85..1.35` for solo bosses. |
| `rewardProfile` | Must be in server allowlist. Server maps profile to XP/items. |
| `sourceDigest.refs` | Max 12 refs. Store titles/URLs, but server does not fetch in v1. |
| Request body | Hard cap, e.g. 32 KB. |

Reject content that fails required fields. Normalize content that is acceptable but messy.

## Database Tables

Recommended new tables:

### `lands`

V1 can seed one row for `main`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text primary key | `main` for current land. |
| `slug` | text unique | Human URL/name slug. |
| `display_name` | text | User-facing name. |
| `owner_account_id` | text nullable | Future owner link. |
| `status` | text | `active`, `paused`, `archived`. |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

### `land_api_keys`

Needed when more than one trusted system or land exists.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text primary key |  |
| `land_id` | text references `lands(id)` |  |
| `name` | text |  |
| `key_prefix` | text | For logs only. |
| `key_hash` | text | Never store the raw key. |
| `scopes` | text | CSV or JSON string until there is a helper type. |
| `last_used_at` | timestamptz nullable |  |
| `revoked_at` | timestamptz nullable |  |
| `created_at` | timestamptz |  |

### `daily_quests`

Stores generated daily quest definitions.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text primary key | Stable generated id. |
| `land_id` | text references `lands(id)` |  |
| `quest_date` | date/text | Date the daily is for. |
| `status` | text | `draft`, `published`, `archived`, `rejected`. |
| `title` | text | Normalized title. |
| `description` | text | Offer description. |
| `story_text` | text | mferGPT story text. |
| `objective_label` | text | UI objective. |
| `completion_text` | text | Turn-in/completion copy. |
| `boss_id` | text | Stable runtime boss id suffix. |
| `boss_name` | text | Display name. |
| `model_preset` | text | Allowlisted model preset. |
| `variant_json` | jsonb/text | Server-normalized visual variant. |
| `spawn_zone` | text | Allowlisted zone. |
| `combat_profile` | text | Allowlisted profile. |
| `reward_profile` | text | Allowlisted reward profile. |
| `source_summary` | text | Short digest summary. |
| `source_refs_json` | jsonb/text | Redacted refs. |
| `content_hash` | text | Used by publish calls. |
| `validation_warnings` | text | Optional warning list. |
| `created_by_key_id` | text nullable | API key id when available. |
| `published_at` | timestamptz nullable |  |
| `expires_at` | timestamptz nullable | Server-derived expiry. |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

Add a unique index on `(land_id, quest_date)` for `status = published`, or enforce this in app logic if partial indexes are avoided initially.

### `character_daily_quest_progress`

Keeps generated daily progress separate from the static `character_quests` table.

| Column | Type | Notes |
| --- | --- | --- |
| `character_id` | text references `characters(id)` |  |
| `daily_quest_id` | text references `daily_quests(id)` |  |
| `status` | text | `active`, `ready`, `completed`. |
| `progress` | integer |  |
| `required` | integer | Usually `1`. |
| `flags` | text | Named objective flags if needed. |
| `completed_at` | bigint | Match current quest progress style. |
| `updated_at` | timestamptz |  |

Primary key: `(character_id, daily_quest_id)`.

### `daily_quest_events`

Audit and metrics events.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text primary key |  |
| `land_id` | text |  |
| `daily_quest_id` | text nullable |  |
| `event_type` | text | `draft_created`, `published`, `accepted`, `boss_spawned`, `boss_defeated`, `completed`, `archived`, `rejected`. |
| `actor_type` | text | `api_key`, `server`, `player`, `admin`. |
| `actor_id` | text nullable | Key id, character id, or session id. |
| `details_json` | jsonb/text | Redacted details. |
| `created_at` | timestamptz |  |

This table is what makes "read what you've done lately" useful for the digester.

## Runtime Integration

### mferGPT

Add a daily command path:

- `@mfergpt daily`
- `@mfergpt what is today's signal`
- `@mfergpt summon today's problem`

Behavior:

- If no active daily exists, reply with a fallback.
- If active daily exists and player has not accepted it, offer the daily quest.
- If accepted and boss is alive, point player to the spawn zone.
- If accepted and boss is defeated/ready, tell player to turn it in.
- If completed, summarize completion and mention tomorrow.

### Quest UI

V1 can reuse the existing quest offer/turn-in UI by mapping the active daily into the same payload shape. Keep the static bridge quest hidden from the user; show the generated title/objective/copy.

### Boss Spawn

Recommended v1: spawn the daily boss when the first eligible player accepts or starts the daily. Keep one room-global boss per active daily.

Runtime boss rules:

- Boss id: `daily:<dailyQuestId>:boss`.
- Model: approved `modelPreset`.
- Spawn: server maps `spawnZone` to position and yaw.
- Stats: server maps `combatProfile` and current balancing constants.
- Variant: visual-only and clamped.
- Quest credit: use existing damage tagging style so eligible players who helped get completion.
- Despawn: on daily archive, expiry, room cleanup, or after a completed boss window.

### Rewards

The digester only selects `rewardProfile`.

Server maps reward profile to concrete rewards:

| Reward Profile | Server Meaning |
| --- | --- |
| `daily-standard` | Normal daily XP, maybe common consumable/gear chance. |
| `daily-hard` | Higher XP, tuned for a tougher solo/small-group boss. |
| `daily-raid` | Group daily reward, no rare/onchain item authority. |

Do not let generated content pick raw item ids until there is a curated allowlist and moderation path.

## Multi-Land Plan

Design for this early:

- Every generated content row has `land_id`.
- Every API key belongs to one land unless explicitly scoped broader.
- Every context response is land-scoped.
- Runtime room loading eventually takes `landId`.
- User lands cannot publish directly to `main`.
- User lands start with draft-only publish or manual review until moderation exists.

Future land ownership needs:

- Land creation flow.
- Owner account mapping.
- Scoped API key creation/revocation.
- Per-land content quotas.
- Moderation state for public discovery.
- Asset licensing and attribution fields.

The hard part of user lands is not the API key. It is validating content, assets, rewards, spawn layout, moderation, and abuse limits per land.

## Generated 3D Model Path

V1 should not accept generated GLBs.

V1 visual variety:

- Model preset from current runtime models.
- Palette/material variant.
- Scale clamp.
- Name/title.
- Existing accessories where safe.
- Optional generated portrait or icon only after image validation.

V2 asset path:

1. Digester or asset worker submits an asset draft, not a live model.
2. Server stores metadata and quarantines the file.
3. Validation checks file size, mesh count, material count, texture count, bounds, orientation, animation count, external references, and license metadata.
4. Admin preview or automated render check approves it.
5. Approved asset becomes available as a future `modelPreset`.

Suggested hard gates for generated GLB approval:

- Max file size.
- Max texture size/count.
- No remote external buffers/textures.
- Known orientation and scale.
- Simple collision proxy or server-owned collision bounds.
- No scripts.
- Attribution/license captured.
- Browser render smoke test before publication.

## Error Codes

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `unauthorized` | Missing/invalid bearer token. |
| 403 | `forbidden_scope` | Key is valid but lacks required scope. |
| 404 | `land_not_found` | Unknown or unavailable land. |
| 409 | `daily_already_published` | Land/date already has a published daily. |
| 413 | `body_too_large` | JSON body exceeded cap. |
| 422 | `validation_failed` | Content failed schema or allowlist validation. |
| 429 | `rate_limited` | Too many requests for key/IP. |
| 500 | `server_error` | Unexpected server error. |

Error response shape:

```json
{
  "ok": false,
  "error": {
    "code": "validation_failed",
    "message": "boss.modelPreset is not allowlisted",
    "fields": ["content.boss.modelPreset"]
  }
}
```

## Security Checklist

- Keep API secrets in env or hashed DB rows only.
- Never commit API keys or generated secrets.
- Use constant-time comparison for single env-key v1.
- Do not set permissive CORS headers on admin write endpoints.
- Enforce JSON body size caps.
- Validate every field with a schema.
- Clamp all gameplay-impacting values server-side.
- Treat external source text as untrusted prompt/content input.
- Log key prefix/id, not key value.
- Rate-limit writes by key and IP.
- Add idempotency keys for draft creation.
- Keep generated content out of code paths that can execute.
- Keep rare/onchain rewards out of generated daily authority.
- Add manual archive/disable path before opening this to user lands.

## Implementation Phases

### Phase 1: Admin API and Storage

- Add DB migration for `lands`, `daily_quests`, `daily_quest_events`, and optionally `land_api_keys`.
- Seed `lands.id = "main"`.
- Add server-side JSON route helpers in `apps/server/src/index.ts` or a small `api/` module.
- Add bearer auth helper.
- Add validation helpers for daily quest drafts.
- Implement context, draft create, publish, active, and archive endpoints.
- No runtime game integration yet.

Acceptance criteria:

- Invalid/missing API key is rejected.
- Draft with invalid model/spawn/reward is rejected.
- Valid draft is stored.
- Published daily is returned by active/context endpoints.
- Duplicate published daily for the same land/date is rejected.

### Phase 2: mferGPT Runtime Daily

- Add static bridge quest id or separate daily quest state helper.
- Load active daily into `TownRoom`.
- Add mferGPT daily command path.
- Offer the daily through existing quest UI payloads.
- Spawn one server-owned daily boss from the active daily definition.
- Award credit/reward through server-owned profiles.
- Persist per-character daily progress.

Acceptance criteria:

- Player can ask mferGPT for the daily.
- Player can accept, fight, complete, and turn in the daily.
- Wallet player progress survives refresh/reconnect.
- If DB is unavailable, game falls back without crashing.

### Phase 3: History and Digester Feedback

- Record accepted/completed/boss defeated events.
- Add completion counts and recent themes to context endpoint.
- Include failed/archived dailies in digester context.
- Add admin-readable audit output.

Acceptance criteria:

- Tomorrow's context response contains enough history to avoid repetition.
- Events never include secrets, raw API keys, or private wallet data.

### Phase 4: Multi-Land Keys

- Add `land_api_keys` with hashed keys and scopes.
- Add key creation/revocation admin tooling.
- Scope all endpoints by key land.
- Keep `main` protected from user-land keys.

Acceptance criteria:

- A key for land A cannot read/write land B.
- Revoked keys stop working immediately.
- Logs identify key prefix/id and land.

### Phase 5: Reviewed Generated Assets

- Add asset draft table and upload/metadata endpoint.
- Validate generated files out of band.
- Add preview/render QA path.
- Promote approved assets to allowlisted model presets.

Acceptance criteria:

- No submitted asset can become live without validation.
- Approved generated model can be used by a future daily quest as a normal preset.

## Test Plan

- Unit test auth helper: missing, malformed, wrong, correct.
- Unit test validation: bad model, bad spawn zone, huge text, duplicate quest date.
- API smoke test: create draft, publish, fetch active, archive.
- DB migration test against local/test Neon branch.
- Server runtime test: room starts with no daily, with draft only, with published daily.
- Gameplay test: accept daily, defeat boss, completion persists for wallet character.
- Regression test: existing static quests still work.
- Secret scan before any commit involving API auth or env docs.

## Open Questions

- Should the daily reset use UTC, America/Los_Angeles, or a per-land timezone?
- Should publish be automatic from the digester key, or should v1 create drafts only until trust is proven?
- Should the active daily boss be one global room boss or per-player/per-party spawn?
- Which social sources are allowed in the digester: X/Twitter only, Farcaster, Discord summaries, manual notes?
- How edgy can generated text be before moderation/review is required?
- Which reward profile is safe for the first tester build?
- Should user-created lands be invite-only until moderation and quotas exist?
