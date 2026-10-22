import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

export async function runMigrations(customDatabaseUrl?: string): Promise<void> {
  const connectionString = customDatabaseUrl || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set for migrations');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const sqlPath = path.join(__dirname, '../../migrations/001_init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Running migration 001_init.sql...');
    await client.query(sql);
    console.log('✅ Migrations completed successfully.');
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
