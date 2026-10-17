# AGENTS.md — Roomie

Persistent working conventions, architecture and Business Rules for AI coding agents.
Read this file and inspect the current codebase before making any change.

## 1. Project Overview

- Roomie is a community-driven platform for finding and reviewing boarding houses / rental rooms on a map.
- It is an MVP designed to be extensible and commercially viable with many real users.
- The repository contains:
  - `be/` — backend
  - `fe/` — frontend

## 2. Tech Stack

### Backend (`be/`)
- NestJS + TypeScript
- MongoDB + Mongoose
- Google Authentication + JWT
- Cloudinary for Review Media
- Vitest for unit tests

Do NOT use Prisma/PostgreSQL for the backend. The project migrated from a PostgreSQL/Prisma design to MongoDB/Mongoose. Reintroducing them requires explicit approval of an architecture change.

### Frontend (`fe/`)
Verified from `fe/package.json`:
- React 19 + TypeScript
- Vite
- Tailwind CSS 4 (via `@tailwindcss/vite`)
- ESLint

## 3. Development Workflow

- Inspect existing code before making changes.
- Treat repository files and Git history as the source of truth.
- Follow the existing project structure and conventions.
- Work incrementally using Migrations and Logical Units (LUs).
- Implement only the approved LU.
- Never automatically proceed to the next LU.
- When asked for architecture analysis, analyze only; do not write code.
- Never commit, push, merge, or rebase without explicit approval.
- Never run destructive database operations or production backfills without approval.
- Do not overwrite uncommitted work.
- Avoid unnecessary refactoring and scope expansion.
- Prefer maintainable MVP solutions over unnecessary abstractions or infrastructure.
- Avoid adding dependencies unless justified.
- Preserve backward compatibility unless a change is approved.
- Ask for clarification when requirements conflict or are ambiguous.

## 4. Architecture & Code Quality

- Follow NestJS module / controller / service / DTO / schema separation.
- Use Mongoose schemas and appropriate MongoDB indexes.
- Validate request input using the project's existing validation approach (class-validator DTOs).
- Enforce authentication and ownership for protected mutations.
- Use consistent HTTP errors and handle database uniqueness conflicts (E11000 -> 409 Conflict).
- Avoid exposing sensitive database fields in public responses.
- Use explicit response mapping where privacy or API contracts require it.
- Maintain soft-delete semantics.
- Write or update tests for affected business logic.
- Run relevant tests and build (`npm test`, `npm run build` in `be/`) before reporting completion.
- Do not claim tests passed unless the commands actually succeeded.
- When a content change must be recorded in revision history, update the document and write the history record in ONE MongoDB transaction. Never update first and merely log if the history write fails. If the deployment does not support transactions, those write paths must fail closed (no silent fallback).

## 5. Core Business Rules

### User & Authentication
- Google login and JWT-based authentication.
- Support account deactivation, reactivation and soft deletion according to the current implementation.
- Preserve historical community content when a user account is deactivated or deleted, according to existing business rules.

### Property
- A Property represents a rental location/building.
- Coordinates are stored as a GeoJSON Point in `[longitude, latitude]` order.
- Use a 2dsphere index for geographic search.
- Normalize addresses.
- Detect possible duplicates within the existing 100m rule.
- Preserve contributor ownership restrictions.
- Support GPS Radius and Viewport Bounding Box search (exactly one mode per request).
- Limit map results to a maximum of 100 pins.

### RentalUnit
- A RentalUnit belongs to a Property.
- Enforce unique active normalized unit names within each Property.
- Preserve ownership and soft-delete rules.
- Do not cascade-delete community reviews without an approved policy.

### Review
- Rating is an integer from 1 to 5.
- A user may have only one active review per target.
- Reviews can target a Property or a RentalUnit.
- Support anonymous reviews while retaining real ownership internally.
- Soft-deleted reviews are excluded from public listings and rating calculations.
- Reviews from deactivated/deleted users remain part of historical community ratings.
- Reviews attached to soft-deleted RentalUnits remain included in their parent Property's rating.
- Public anonymous responses must not expose `userId`, email or identifying author metadata.
- Public review media must not expose Cloudinary `publicId`.

### Rating Aggregation
- Property rating aggregates all active reviews belonging to the Property, including RentalUnit reviews.
- RentalUnit rating aggregates only active reviews targeting that RentalUnit.
- `averageRating` is rounded to one decimal place.
- `reviewCount` counts active reviews.
- A Property with no reviews must be shown as unrated in the UI, not as a zero-star rating.
- The rating cache is updated after relevant Review mutations.
- Periodic reconciliation repairs possible cache drift.
- Backfill scripts must not run automatically at application startup.

### Review Media
- Maximum 5 images and 1 video per review.
- Validate file type using actual file signatures (magic bytes).
- Enforce the upload size limits defined in the backend.
- Verify media ownership before attaching.
- Prevent reuse of already attached or detached uploads according to existing logic.
- Handle orphan uploads and failed-upload cleanup.

### Community Governance
- Roomie is community-driven. There is NO Admin role, AdminGuard, Admin Dashboard or manual moderation workflow. Do not add `User.role` or equivalent privileges.
- No identity verification of owners is used to grant privileges.
- Users must never edit or delete another user's Property, RentalUnit or Review. Other users may only submit suggestions; the creator of a Property/RentalUnit may accept or reject them.
- Reports, confirmations and votes are signals only. Report counts must never auto-delete or auto-hide content.
- Do not auto-restrict content based only on keywords, emails or phone numbers. Handling of severe-risk content (a "restricted" mechanism) is a known unresolved gap and requires a separately approved design.
- Reporter identity must never be exposed. Anonymous review author identity must not be exposed by any new response.
- Suspected manipulation is a risk signal, never proof. Account-creation proximity or vote-timing proximity must not be treated as certain evidence of one person. When manipulation is suspected, the system must not auto-apply a suggestion.

### Community Confirmation & Reporting
- Community confirmation of a Property/RentalUnit is a signal, not proof of tenancy.
- Confirmations must not affect `averageRating` or `reviewCount` and must not produce a "Verified" label.
- Duplicate confirmations and duplicate reports are prevented by unique indexes (E11000 -> 409).
- Basic spam protection (per-user rate limits via MongoDB counts, 429 on excess) ships together with confirmation and reporting; it is not deferred. No new infrastructure is introduced for it.
- The creator of a Property/RentalUnit cannot confirm their own content.

### Community Corrections
- Suggestions are stored separately and never change original data directly. Each suggestion targets one field (amenities use add/remove deltas).
- `location` and the Property–RentalUnit relationship are immutable and cannot be suggested.
- Not responding is not consent. After 30 days without a creator decision a suggestion only becomes eligible for system review; vote count alone never applies a change.
- A creator-rejected suggestion is final and never auto-applied.
- Every content change (including creator direct edits) is written to immutable revision history; reverts create new revisions and are never destructive.
- Concurrency is optimistic: a change applies only if the current value still equals the suggestion's base value.
- The creator keeps all existing edit rights after any community auto-application (no lock). A cooldown limits repeated auto-application of the same field to prevent loops.
- Community votes must never auto-update coordinates, address, price, deposit, active status, name, description, area or the Property–RentalUnit relationship.
- Initial safe auto-application (separate LU, requires explicit approval) covers only allow-listed `amenities`. It must be behind a feature flag that is OFF by default, may only be enabled after approval and testing, and must never run automatically at application startup beyond reading that flag.
- For important fields (e.g. rental price), the community contributes observations shown alongside the original value, never overwriting it.

## 6. API & Security Principles

- Public GET endpoints must not accidentally require JWT.
- Protected mutation endpoints must enforce JWT and ownership.
- Do not return raw sensitive Mongoose documents.
- Validate MongoDB ObjectIds and resource relationships.
- Respect existing pagination and query limits.
- Apply database filters before pagination/limit.
- Avoid expensive Review aggregation during map searches; use cached Property ratings.

## 7. Git Rules

- Use the existing `dev` branch workflow.
- Inspect `git status` before making changes.
- Do not discard existing uncommitted changes.
- Do not stage unrelated files.
- Do not commit or push without approval.
- Use descriptive conventional commit messages when requested.
- Never commit `.env`, secrets, credentials or generated sensitive files.

## 8. Reporting Format

After each implementation task, report:
1. What was implemented.
2. Files created or modified.
3. Business Rules covered.
4. Test and build results.
5. Git branch and working tree status.
6. Remaining risks or unresolved issues.

Then stop and wait for review.

## 9. Source of Truth

- Actual code and Git history take precedence over historical chat summaries.
- This file defines persistent working conventions and approved architectural rules.
- If an implementation conflicts with this file, report it before changing either.
- Update this file only when an architectural decision or permanent rule changes, and only with approval.
