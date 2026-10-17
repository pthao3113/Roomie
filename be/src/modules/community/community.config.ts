const HOUR_MS = 60 * 60 * 1000;

/**
 * Centralized, approved parameters for Migration 4 (Community Verification & Content Reporting).
 * Do not hardcode these values elsewhere.
 *
 * LU1 only consumes `rateLimit.windowMs` and `rateLimit.confirmationsPerWindow`.
 * The remaining values are reserved for later approved LUs (LU2, LU4, LU5).
 */
export const COMMUNITY_CONFIG = {
  rateLimit: {
    /** Sliding window used for all per-user creation limits (24 hours). */
    windowMs: 24 * HOUR_MS,
    confirmationsPerWindow: 20,
    reportsPerWindow: 10,
    suggestionsPerWindow: 5,
    votesPerWindow: 30,
    priceObservationsPerWindow: 10,
  },
  corrections: {
    creatorResponseDays: 30,
    autoApplyFieldCooldownDays: 30,
    minIndependentSupporters: 3,
    minSupporterAccountAgeDays: 30,
    /** Auto-application is blocked at this many valid independent opposing votes. */
    disputeOpposeThreshold: 2,
    minSpreadFirstToThirdSupportHours: 72,
  },
  autoApply: {
    /** Feature flag env var for LU5. Must default to OFF. */
    enabledEnvVar: 'COMMUNITY_AUTO_APPLY_ENABLED',
    defaultEnabled: false,
  },
  pagination: {
    defaultLimit: 10,
    maxLimit: 50,
  },
} as const;
