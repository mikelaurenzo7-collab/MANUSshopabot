/**
 * Migration 0007: Platform-agnostic column renames + social platform enum expansion
 *
 * Changes:
 * 1. products.shopifyProductId → products.platformProductId
 * 2. orders.shopifyOrderId → orders.platformOrderId
 * 3. social_posts.platform enum: add 'linkedin' and 'google_ads' as first-class values
 *    (they were previously mapped to 'facebook' as a fallback)
 */
import { createConnection } from "mysql2/promise";
import { config } from "dotenv";

config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await createConnection(url);

const migrations = [
  {
    name: "Rename products.shopifyProductId → platformProductId",
    sql: `ALTER TABLE \`products\` CHANGE COLUMN \`shopifyProductId\` \`platformProductId\` VARCHAR(100) NULL`,
  },
  {
    name: "Rename orders.shopifyOrderId → platformOrderId",
    sql: `ALTER TABLE \`orders\` CHANGE COLUMN \`shopifyOrderId\` \`platformOrderId\` VARCHAR(100) NULL`,
  },
  {
    name: "Expand social_posts.platform enum to include linkedin and google_ads",
    sql: `ALTER TABLE \`social_posts\` MODIFY COLUMN \`platform\` ENUM('tiktok','instagram','facebook','meta','twitter','pinterest','linkedin','google_ads') NOT NULL`,
  },
];

for (const { name, sql } of migrations) {
  try {
    await conn.execute(sql);
    console.log(`✅ ${name}`);
  } catch (err) {
    // Column already renamed or enum already updated — safe to skip
    if (
      err.code === "ER_BAD_FIELD_ERROR" ||
      err.message.includes("Unknown column") ||
      err.message.includes("Can't DROP")
    ) {
      console.log(`⏭️  Already applied, skipping: ${name}`);
    } else {
      console.error(`❌ Failed: ${name}`);
      console.error(`   SQL: ${sql}`);
      console.error(`   Error: ${err.message}`);
    }
  }
}

await conn.end();
console.log("\nMigration 0007 complete.");
