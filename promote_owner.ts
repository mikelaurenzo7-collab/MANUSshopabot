/**
 * One-time script: promote mikelaurenzo7@gmail.com to "owner" in all org_members rows.
 * Run with: npx tsx promote_owner.ts
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import * as schema from "./drizzle/schema";
import "dotenv/config";

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(conn, { schema, mode: "default" });

  // Find all user IDs for this email
  const users = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "mikelaurenzo7@gmail.com"));

  console.log("Found users:", users.map(u => u.id));

  for (const user of users) {
    // Update org_members role to owner
    const result = await db
      .update(schema.orgMembers)
      .set({ role: "owner" })
      .where(eq(schema.orgMembers.userId, user.id));
    console.log(`Updated org_members for userId=${user.id}:`, result);
  }

  // Verify
  for (const user of users) {
    const memberships = await db
      .select()
      .from(schema.orgMembers)
      .where(eq(schema.orgMembers.userId, user.id));
    console.log(`Memberships for userId=${user.id}:`, memberships);
  }

  await conn.end();
  console.log("Done.");
}

main().catch(console.error);
