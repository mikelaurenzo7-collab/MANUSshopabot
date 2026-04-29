import { getDb } from './server/db.ts';

const db = await getDb();
if (!db) {
  console.error('Failed to connect to database');
  process.exit(1);
}

// Import the stores table
import { stores } from './drizzle/schema.ts';

try {
  // Delete all stores
  const result = await db.delete(stores);
  console.log('✓ All store connections cleared from database');
} catch (err) {
  console.error('Error:', err.message);
}
