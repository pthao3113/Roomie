# Roomie — Implementation Progress

Tracks what is implemented and what remains. Read together with [`AGENTS.md`](../AGENTS.md).
Git history and the codebase are the source of truth; this file is a summary and may go stale.

_Last verified against Git: branch `dev`, HEAD `f99995c` (docs commit); see section 4 for the current state._

## 1. Project Overview

- **Project:** Roomie
- **Product:** Community-driven rental housing discovery and review platform (map-based).
- **Backend (`be/`):** NestJS, TypeScript, MongoDB/Mongoose, Google Auth + JWT, Cloudinary, Vitest.
- **Frontend (`fe/`):** React 19, TypeScript, Vite, Tailwind CSS 4, ESLint (verified from `fe/package.json`). Frontend feature work is not tracked here yet (Unverified).

## 2. Development Status

| Migration / LU | Feature | Status | Commit | Notes |
| --- | --- | --- | --- | --- |
| Baseline | Repository baseline | Completed | `c583526` | Before Migration 1. |
| Migration 1 | Auth & User | Completed | `5f6c1f0` | MongoDB, User schema, account lifecycle, Google OAuth. |
| Migration 2 – LU1 | Property core & basic deduplication | Completed | `7b662c1` | |
| Migration 2 – LU2 | Property map search & management | Completed | `b039a5e` | |
| Migration 2 – LU3 | RentalUnit management | Completed | `8707b16` | |
| Migration 3 – LU1 | Review core & CRUD, anonymous reviews | Completed | `90f82f4` | |
| Migration 3 – LU2 | Review media management | Completed | `e6f7535` | |
| Migration 3 – LU3 | Review listing & rating aggregation | Completed | `0e3bcbb` | Matches the commit reported earlier. |
| Migration 3 – LU4 | Map search rating integration | Committed, pending user review | `6c5e85d` | Committed locally on `dev`. |
| Docs | `AGENTS.md` and this file | Committed | `f99995c` | Updated afterwards for Migration 4 rules (uncommitted). |
| Migration 4 | Community Verification & Content Reporting | Planned — design approved, not implemented | – | See section 3. Prerequisite for LU4: MongoDB transactions (see 3.1). |
| Migration 4 – LU1 | Community Confirmation (with basic spam protection) | Implemented, uncommitted — pending user review | – | See 3.8. Tests and build pass locally. |
| Migration 4 – LU2 | Content Reporting (with basic spam protection) | Planned | – | |
| Migration 4 – LU3 | Advanced anomaly detection (flagged/monitoring) | Planned | – | |
| Migration 4 – LU4 | Community Corrections | Planned — blocked on transactions | – | |
| Migration 4 – LU5 | Safe Auto-application (amenities only, flag OFF) | Planned | – | Only after LU4 is approved. |

> LU4 is committed but the user has not yet explicitly confirmed it as reviewed/accepted, so it is not marked Completed.

Full hashes: `0e3bcbbf3c2ec598de5f1024742d9934ce1a3f07` (LU3), `6c5e85d195f6759440835f34b99aa74bd5e76fd6` (LU4).

## 3. Migration Details

### Migration 1 – Authentication & User (commit `5f6c1f0`)
Verified in code: `auth/`, `users/`, [`jwt-auth.guard.ts`](../be/src/common/guards/jwt-auth.guard.ts), `POST reactivate` endpoint, `MongooseModule` setup in `app.module.ts`.
- MongoDB connection
- User schema and user service
- Google Authentication
- JWT Authentication and `JwtAuthGuard`
- Account deactivation / reactivation and soft deletion (per current implementation)

### Migration 2 – Property & RentalUnit
- **LU1 (`7b662c1`):** Property schema (GeoJSON Point, 2dsphere index), address normalization, 100m duplicate detection, property creation.
- **LU2 (`b039a5e`):** Property update with contributor ownership, GPS Radius and Viewport Bounding Box map search, 100-pin cap.
- **LU3 (`8707b16`):** RentalUnit CRUD, ownership, soft deletion, unique active unit name per Property.
- Unverified: a Property soft-delete endpoint. `properties.controller.ts` shows no delete route; only RentalUnit has `DELETE units/:id`.

### Migration 3 – Review, Rating & Media
- **LU1 (`90f82f4`):** Review schema, create/update/delete, anonymous reviews, one active review per user per target, ownership, soft deletion, E11000 -> 409.
- **LU2 (`e6f7535`):** Cloudinary upload, media ownership, magic-byte validation, attach/detach on review create/update, orphan cleanup and upload compensation.
- **LU3 (`0e3bcbb`):** Public review listing, anonymous author mapping, Property/RentalUnit `averageRating` and `reviewCount` cache, manual backfill script (`be/src/scripts/backfill-ratings.ts`, `npm run backfill:ratings`), daily cron reconciliation.
- **LU4 (`6c5e85d`):** Map search rating integration.
  - `minRating` query validation (1–5, max 1 decimal place).
  - Filter by cached `reviewCount > 0` and `averageRating >= minRating` inside the MongoDB query, before `limit`. No Review aggregation/lookup.
  - Works with GPS Radius and Viewport modes; 100-pin cap unchanged.
  - Map response ensures `averageRating` / `reviewCount` default to 0.
  - No new index added.
  - Unit tests added in `properties.service.spec.ts`.

### Migration 4 – Community Verification & Content Reporting (Planned; design approved, no code yet)

Governance: community-driven. No Admin role/guard/dashboard, no manual moderation, no auto-hide/delete from report counts, nobody edits/deletes another user's content. Permanent rules live in `AGENTS.md` ("Community Governance", "Community Confirmation & Reporting", "Community Corrections").

#### 3.1 MongoDB transaction verification (done, read-only)
- `be/.env` / `be/.env.example`: `MONGODB_URI` points to `mongodb://localhost:27017/roomie` with no `replicaSet` option.
- A read-only `db.hello()` against that local server returned MongoDB `8.0.9` with **no `setName`** → a **standalone** server. MongoDB transactions require a replica set (or sharded cluster), so **transactions are NOT available in the current local deployment**.
- No `startSession`/`withTransaction` is used anywhere in `be/src` today.
- Production/staging deployment: **Unverified** (no config in the repo).
- Consequences:
  - LU1–LU3 use single-document writes and do not need transactions.
  - **LU4 and LU5 must not start until the target deployment is a replica set** (local: single-node replica set plus `replicaSet` in `MONGODB_URI`; production: a replica set, e.g. a managed cluster). Changing the local MongoDB setup requires explicit approval.
  - LU4 applies a change (compare-and-set on the field, `$inc` revision) and inserts the `content_revisions` record in one `withTransaction`. If the deployment does not support transactions the write path fails closed (no fallback to "update then log").
  - Mock-based unit tests cannot prove transactional behavior; real verification needs a replica-set MongoDB.

#### 3.2 Logical Units
- **LU1 – Community Confirmation:** `confirmations` collection (unique active `{userId, targetType, targetId}`), POST/DELETE for Property and RentalUnit, public count summary, `GET /me/confirmations`. Signal only; no effect on rating; no "Verified" label; creator cannot confirm own content. **Basic spam protection from the start:** per-user daily limit counted from MongoDB (includes withdrawn records so toggling counts), HTTP 429 on excess.
- **LU2 – Content Reporting:** `reports` collection (unique `{reporterId, targetType, targetId}`), reasons enum per target type, POST for Property/RentalUnit/Review, `GET /me/reports`, withdraw. No effect on content, reporter identity never exposed. **Basic spam protection from the start:** per-user daily limit via MongoDB counts, 429 on excess.
- **LU3 – Advanced anomaly detection:** only adds detection on top of LU1/LU2 basic limits: `abuse_signals` (`monitoring`/`flagged`, TTL), duplicate/burst/mass-report patterns, report weighting. Signals are risk indicators, not proof. No `restricted`, no keyword/email/phone based restriction, no AI.
- **LU4 – Community Corrections** (requires transactions): `correction_suggestions` (one field per suggestion; amenities as add/remove delta), `suggestion_votes` (support/oppose), accept/reject by creator, `content_revisions` (immutable), per-field compare-and-set, `field_observations` (price only), revert as a suggestion. Existing creator `PATCH` endpoints will also write revisions in the same transaction (backward compatible; touches Migration 2 code, approved in principle).
- **LU5 – Safe Auto-application:** separate LU, only after LU4 is approved. Behind a feature flag that is **OFF by default**; enable only after approval and testing.

#### 3.3 Suggestion states
`pending` → `applied` (creator accept, CAS ok) | `rejected` (creator, final) | `withdrawn` (proposer) | `stale` (base value changed). Terminal states never reopen. 30 days without creator response only marks eligibility for system review; it never implies consent.

#### 3.4 Field matrix
| Entity | Field | Creator direct edit | Suggestable | Observation | LU5 auto-apply |
| --- | --- | --- | --- | --- | --- |
| Property | name, description | Yes | Yes | – | **No** |
| Property | address | Yes (existing dup check) | Yes (creator accepts) | – | **No** |
| Property | amenities | Yes | Yes (delta) | – | **Yes, allow-listed items only** |
| Property | location | No (immutable) | No | – | No |
| RentalUnit | unitName, description, area | Yes | Yes | – | **No** |
| RentalUnit | price | Yes | Yes (creator accepts) | Yes (price only) | **No** |
| RentalUnit | amenities | Yes | Yes (delta) | – | **Yes, allow-listed items only** |
| RentalUnit | propertyId | No | No | – | No |
| Reserved | deposit, active status | do not exist yet | – | – | Never |

#### 3.5 LU5 rules (approved)
- Only amenities from a code-level allow-list; never price, address, coordinates, name, description, area or Property–RentalUnit relationship.
- Preconditions: pending, not rejected, creator silent for 30 days, ≥ 3 independent supporters (not the proposer, accounts ≥ 30 days old, active), no significant dispute, no manipulation suspicion, base value unchanged.
- Account-creation proximity and vote-timing proximity are **risk signals only**, never proof of one person. Any suspicion → the suggestion is not auto-applied (stays pending).
- **No lock on the creator:** the creator can still edit as today; all changes are in revision history. A per-field **cooldown** limits the next auto-application to prevent loops.
- Reverts create new revisions; only the latest revision of a field can be reverted; a revert is itself a suggestion.
- Batch job (cron), never a startup backfill; compare-and-set prevents double application across instances.

#### 3.6 Approved parameters (centralized in `be/src/modules/community/community.config.ts`)
- Rate limits (per user per 24h): confirmations 20, reports 10, suggestions 5, votes 30, price observations 10.
- Users cannot report their own content; creators cannot confirm their own content.
- LU5 per-field auto-application cooldown: 30 days.
- LU5 does not auto-apply when there are ≥ 2 valid independent opposing votes.
- Minimum 72 hours between the first and the third valid support vote.
- Feature flag `COMMUNITY_AUTO_APPLY_ENABLED`, default `false`.
- Still NOT explicitly approved (proposal only): one report per user per target ever; a competing pending suggestion on the same field also counts as a dispute.

#### 3.7 Known unresolved risks
- **No "restricted" mechanism** for severe-risk content (accepted temporarily): such content stays visible; flagged/monitoring signals have no human consumer. Needs a separately approved design later.
- Orphaned content (creator deleted): only allow-listed amenities can change via community; name/address/price/description stay unchanged. No ownership transfer yet.
- No IP/device signals: determined multi-account attackers with aged accounts may evade independence checks; mitigated by limiting auto-application to amenities, delays, cooldown, history and a default-off flag.
- Rate-limit check-then-insert is not atomic, so slight overshoot under concurrency is possible.
- Revision history starts at LU4; earlier changes have no records.
- Community-reported price observations can be manipulated; they are shown separately and never overwrite the creator's price.

#### 3.8 LU1 – Community Confirmation (implemented, not committed)
Module: `be/src/modules/community/` (registered in `app.module.ts`). MongoDB stays standalone; LU1 uses only single-document writes.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/properties/:id/confirmation` | JWT | 201; 403 creator; 404 inactive; 409 duplicate; 429 over limit |
| DELETE | `/properties/:id/confirmation` | JWT | Withdraws own active confirmation (soft-delete); 404 if none |
| GET | `/properties/:id/confirmations/summary` | Public | `{targetType, targetId, confirmationCount}` |
| POST / DELETE | `/units/:id/confirmation` | JWT | Same rules for RentalUnit (parent Property must be active) |
| GET | `/units/:id/confirmations/summary` | Public | Same shape |
| GET | `/me/confirmations?page&limit` | JWT | Own active confirmations; `{data, pagination}`; limit max 50 |

- `confirmations` collection: unique partial index `{userId, targetType, targetId}` where `deletedAt: null`; partial index `{targetType, targetId}`; index `{userId, createdAt: -1}`.
- Rate limit: counts ALL records created by the user in the last 24h **including withdrawn ones**, and re-confirmation always inserts a NEW record (never reactivates the old one), so withdraw/re-confirm cannot bypass the limit.
- Summary counts only active confirmations whose user is neither deactivated nor soft-deleted (`$lookup` with sub-pipeline, MongoDB ≥ 5.0); returns only a count.
- No effect on `averageRating`/`reviewCount`; no "Verified" wording; responses never contain `userId` or email.
- Known limitations: rate-limit check-then-insert is not atomic; duplicate POST attempts are rejected by the unique index but not counted toward the limit; `GET /me/confirmations` also lists confirmations whose target was later deleted.
- Tests: `confirmations.service.spec.ts` (29 tests, mocked models). Real MongoDB behavior (indexes, `$lookup`) is not exercised by the unit tests — Unverified.

## 4. Current Development State

- **Branch:** `dev`
- **Latest verified commit:** `f99995c` (docs). `origin/dev` was at `f99995c` when last checked in this session.
- **Current Migration / LU:** Migration 4 – LU1 implemented, awaiting user review. LU2–LU5 not started.
- **Uncommitted changes:** `AGENTS.md` and this file (docs); `be/src/app.module.ts` (modified); `be/src/modules/community/` (new). Nothing committed or pushed in this step.
- **Last verified tests/build (after LU1):** `npm test` in `be/` passed (8 files, 91 tests, incl. 29 new) and `npm run build` succeeded; `oxlint` on the new module reported 0 warnings and 0 errors.
- **Done:** Migrations 1–2, Migration 3 LU1–LU4 (LU4 awaiting formal acceptance), Migration 4 architecture, Migration 4 LU1 code.
- **Waiting on approval:** review of LU1, committing LU1 and docs, start of LU2, and the replica-set preparation required before LU4.

## 5. Pending Tasks

### Required before completion
- User review and acceptance of Migration 3 LU4.
- User approval to commit the Migration 4 documentation updates.
- User review of Migration 4 LU1 and approval to commit it (with the docs).
- Approval to start Migration 4 LU2 (do not start automatically).
- Before LU4: a MongoDB replica set in the target environment (see 3.1), with explicit approval for any local MongoDB change.

### Operational follow-up
- Confirm and run the rating backfill (`npm run backfill:ratings`) on the target database, only with explicit approval. Execution is Unverified; without it, older Properties lack correct cached ratings and `minRating` filtering will exclude them.
- Verify behavior against a real MongoDB (current tests use mocked models), including map query performance.

### Future improvements
- Benchmark map search with `minRating` before considering a compound index.
- Frontend integration of rating display and filter ("Chưa có đánh giá" for `reviewCount = 0`) — Unverified.
- Verify the production MongoDB deployment type (replica set or not) — Unverified.
- Design a "restricted" mechanism for severe-risk content in a future, separately approved Migration/LU.
- Decide an ownership policy for orphaned content (creator deleted).
- Next Migration after 4 is not decided; do not start one without user direction.

## 6. Important Decisions

- MongoDB/Mongoose replaces Prisma/PostgreSQL; do not reintroduce without approved architecture change.
- Soft deletion is used; historical reviews are preserved when users or RentalUnits are deleted.
- Ratings are cached on Property and RentalUnit (`averageRating`, `reviewCount`), updated after Review mutations (eventual consistency) and repaired by a daily reconciliation cron.
- Map search uses the cached Property rating only; no Review aggregation.
- Backfill is a manual script and never runs at application startup.
- No automatic commit or push; one approved LU at a time.
- Community-driven governance: no Admin role, no manual moderation, no auto-hide/delete from reports, no editing others' content (Migration 4).
- Community corrections are suggestions applied only by the creator, or (LU5, flag OFF by default) automatically for allow-listed amenities only.
- Content changes and their revision history are written in one MongoDB transaction; no "update then log". LU4 requires a replica set.
- Basic spam protection ships with LU1 and LU2; LU3 only adds advanced detection.

## 7. How to Resume Development

1. Read `AGENTS.md`.
2. Read `docs/implementation-progress.md`.
3. Inspect Git branch, `git status` and recent commits.
4. Verify the current LU against the codebase.
5. Preserve uncommitted changes.
6. Continue only the task explicitly approved by the user.
7. Update this file after each approved LU completion.
