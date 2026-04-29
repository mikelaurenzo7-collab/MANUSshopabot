-- Migration 0026: extend `stores.platform` enum with 7 new ecommerce surfaces.
--
-- Sprint 27 expansion: Depop, BigCommerce, Square, Faire, Bonanza,
-- StockX, Reverb. Each has a fully-implemented adapter under
-- server/adapters/ecommerce/* so the workflow engine can drive them
-- through the same surface as Shopify/Etsy/etc.
--
-- Idempotent re-application: MySQL's `ALTER COLUMN ... MODIFY` rewrites
-- the enum definition each time, so re-running the migration on an
-- already-extended schema is a no-op.

ALTER TABLE `stores`
  MODIFY COLUMN `platform` enum(
    'shopify',
    'woocommerce',
    'amazon',
    'etsy',
    'ebay',
    'tiktok_shop',
    'walmart',
    'depop',
    'bigcommerce',
    'square',
    'faire',
    'bonanza',
    'stockx',
    'reverb'
  ) NOT NULL DEFAULT 'shopify';
