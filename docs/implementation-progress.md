# Roomie — Implementation Progress

Tracks what is implemented and what remains. Read together with [`AGENTS.md`](../AGENTS.md).
Git history and the codebase are the source of truth; this file is a summary and may go stale.

_Last verified against Git: branch `dev`, HEAD `6c5e85d`._

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
| Migration 3 – LU4 | Map search rating integration | Committed, pending user review | `6c5e85d` | Committed locally on `dev`; not pushed. |

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

## 4. Current Development State

- **Branch:** `dev`
- **Latest verified commit:** `6c5e85d` (LU4), one commit ahead of `origin/dev` (`0e3bcbb`). Not pushed.
- **Current Migration / LU:** Migration 3 – LU4 (committed, awaiting user review).
- **Uncommitted changes:** `AGENTS.md` (untracked) and this file, `docs/implementation-progress.md`. No application source changes pending.
- **Last verified tests/build (before the LU4 commit, same code):** `npm test` in `be/` passed (7 files, 62 tests; `properties.service.spec.ts` 11 tests) and `npm run build` succeeded. Not re-run after committing or for this documentation change.
- **Done:** Migrations 1–2, Migration 3 LU1–LU3, LU4 code and commit.
- **Waiting on review/approval:** LU4 acceptance, push, and committing the documentation files.

## 5. Pending Tasks

### Required before completion
- User review and acceptance of LU4.
- User approval to push `dev` and to commit `AGENTS.md` and this file.

### Operational follow-up
- Confirm and run the rating backfill (`npm run backfill:ratings`) on the target database, only with explicit approval. Execution is Unverified; without it, older Properties lack correct cached ratings and `minRating` filtering will exclude them.
- Verify behavior against a real MongoDB (current tests use mocked models), including map query performance.

### Future improvements
- Benchmark map search with `minRating` before considering a compound index.
- Frontend integration of rating display and filter ("Chưa có đánh giá" for `reviewCount = 0`) — Unverified.
- Next Migration/LU is not decided; do not start one without user direction.

## 6. Important Decisions

- MongoDB/Mongoose replaces Prisma/PostgreSQL; do not reintroduce without approved architecture change.
- Soft deletion is used; historical reviews are preserved when users or RentalUnits are deleted.
- Ratings are cached on Property and RentalUnit (`averageRating`, `reviewCount`), updated after Review mutations (eventual consistency) and repaired by a daily reconciliation cron.
- Map search uses the cached Property rating only; no Review aggregation.
- Backfill is a manual script and never runs at application startup.
- No automatic commit or push; one approved LU at a time.

## 7. How to Resume Development

1. Read `AGENTS.md`.
2. Read `docs/implementation-progress.md`.
3. Inspect Git branch, `git status` and recent commits.
4. Verify the current LU against the codebase.
5. Preserve uncommitted changes.
6. Continue only the task explicitly approved by the user.
7. Update this file after each approved LU completion.
