-- Migration 0030: extend `workspace_integrations.integrationType` with
-- ads (Google / Meta / TikTok), calendar (Google / Outlook), and Snapchat
-- so each per-store workspace can wire up its own ad accounts and calendars
-- alongside email / social / messaging / commerce integrations.
--
-- MySQL's ALTER ... MODIFY rewrites the enum definition each time, so
-- re-running on an already-extended schema is a no-op. We carry every
-- previous value forward explicitly so this migration doesn't silently
-- drop one we already had.

ALTER TABLE `workspace_integrations`
  MODIFY COLUMN `integrationType` enum(
    -- Email
    'gmail',
    'outlook',
    -- Social
    'twitter',
    'facebook',
    'instagram',
    'tiktok',
    'linkedin',
    'pinterest',
    'youtube',
    'snapchat',
    -- Messaging
    'slack',
    'discord',
    'telegram',
    'whatsapp',
    -- Commerce
    'shopify',
    'stripe',
    -- Marketing / lifecycle
    'mailchimp',
    'klaviyo',
    'zapier',
    -- Ads
    'google_ads',
    'meta_ads',
    'tiktok_ads',
    -- Calendar
    'google_calendar',
    'outlook_calendar'
  ) NOT NULL;
