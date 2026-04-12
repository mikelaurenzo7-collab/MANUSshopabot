/**
 * Apply migration 0006: bot_config new columns
 * - lowStockThreshold int DEFAULT 5
 * - approvalRequired boolean DEFAULT false NOT NULL
 * - autonomyLevel default changed to 'fully_autonomous'
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { config } from "dotenv";

config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Parse mysql2 connection URL
const conn = await createConnection(url);

const statements = [
  `ALTER TABLE \`bot_config\` MODIFY COLUMN \`autonomyLevel\` enum('fully_autonomous','supervised','manual') NOT NULL DEFAULT 'fully_autonomous'`,
  `ALTER TABLE \`bot_config\` ADD COLUMN IF NOT EXISTS \`lowStockThreshold\` int DEFAULT 5`,
  `ALTER TABLE \`bot_config\` ADD COLUMN IF NOT EXISTS \`approvalRequired\` boolean DEFAULT false NOT NULL`,
];

for (const sql of statements) {
  try {
    await conn.execute(sql);
    console.log("✅ Applied:", sql.slice(0, 80));
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME") {
      console.log("⏭️  Column already exists, skipping:", sql.slice(0, 80));
    } else {
      console.error("❌ Failed:", err.message);
      console.error("SQL:", sql);
    }
  }
}

await conn.end();
console.log("Migration 0006 complete.");
