import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  await conn.execute(`ALTER TABLE bot_config ADD COLUMN autonomyLevel enum('fully_autonomous','supervised','manual') NOT NULL DEFAULT 'supervised'`);
  console.log("✅ Added autonomyLevel column to bot_config");
} catch (e) {
  if (e.code === "ER_DUP_FIELDNAME") {
    console.log("⚠️ autonomyLevel column already exists");
  } else {
    throw e;
  }
}

await conn.end();
