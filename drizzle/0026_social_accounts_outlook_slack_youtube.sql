-- Migration 0026: extend `social_accounts.platform` enum with the
-- Sprint 27.5 social additions — Outlook (Microsoft Graph mail +
-- calendar), Slack (community channel), YouTube (Shorts + long-form
-- video). Each has a fully-implemented adapter under
-- server/adapters/social/* so the workflow engine drives them through
-- the same surface as Meta / TikTok / Twitter.
--
-- Idempotent: MySQL's ALTER ... MODIFY rewrites the enum each time, so
-- re-running on an already-extended schema is a no-op.

ALTER TABLE `social_accounts`
  MODIFY COLUMN `platform` enum(
    'meta',
    'instagram',
    'tiktok',
    'twitter',
    'pinterest',
    'google_ads',
    'gmail',
    'outlook',
    'slack',
    'youtube'
  ) NOT NULL;
