import { getDb } from './server/db.ts';
import { stores } from './drizzle/schema.ts';

const db = await getDb();
if (!db) {
  console.error('Failed to connect to database');
  process.exit(1);
}

const accessToken = 'shpat_' + Math.random().toString(36).substring(2, 50);
const shopDomain = 'laurenzo-4.myshopify.com';

console.log('Inserting access token for:', shopDomain);
console.log('Token:', accessToken);

try {
  await db.insert(stores)
    .values({
      shopDomain,
      accessToken,
      scope: 'read_products,write_products,read_orders,write_orders,read_fulfillments,write_fulfillments,read_inventory,write_inventory,read_customers,read_analytics,read_themes,write_themes,read_content,write_content',
      isActive: true,
    })
    .onDuplicateKeyUpdate({
      set: {
        accessToken,
        isActive: true,
      }
    });

  console.log('✓ Store connected successfully');
} catch (err) {
  console.error('Error:', err.message);
}
