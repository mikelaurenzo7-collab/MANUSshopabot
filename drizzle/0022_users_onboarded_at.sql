-- Migration 0022: server-side onboarding completion timestamp.
--
-- Replaces the localStorage flag the OnboardingGuard previously read,
-- so the onboarding redirect respects the actual server state and
-- can't be desynced across devices or bypassed by clearing storage.
ALTER TABLE `users` ADD COLUMN `onboardedAt` timestamp;
