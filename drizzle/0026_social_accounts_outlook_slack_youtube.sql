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

-- social_posts also gets Slack + YouTube as first-class platforms so
-- the Social bot can persist Slack drops + YouTube Shorts uploads
-- through the standard social-post pipeline. Outlook sends ride
-- through the outbound delivery layer (sendgridWebhooks.ts equivalent
-- for Microsoft Graph) and don't write to social_posts.
ALTER TABLE `social_posts`
  MODIFY COLUMN `platform` enum(
    'tiktok',
    'instagram',
    'facebook',
    'meta',
    'twitter',
    'pinterest',
    'google_ads',
    'slack',
    'youtube'
  ) NOT NULL;

-- ad_campaigns also gets the new channels so the LLM generateAdCopy
-- output can persist a draft entry per Outlook / Slack / YouTube
-- variant alongside the existing platforms.
ALTER TABLE `ad_campaigns`
  MODIFY COLUMN `platform` enum(
    'tiktok',
    'meta',
    'instagram',
    'twitter',
    'pinterest',
    'google_ads',
    'email',
    'sms',
    'gmail',
    'outlook',
    'slack',
    'youtube'
  ) NOT NULL DEFAULT 'meta';
