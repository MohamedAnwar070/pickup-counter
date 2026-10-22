import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { runMigrations } from '../common/database/migrate';
import { seedProducts } from './seed';

dotenv.config();

async function setup() {
  const adminClient = new Client({
    connectionString: 'postgres://postgres:postgres@localhost:5432/postgres',
  });

  await adminClient.connect();

  for (const dbName of ['pickup', 'pickup_test']) {
    const res = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (res.rows.length === 0) {
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✅ Created database: ${dbName}`);
    } else {
      console.log(`ℹ️ Database "${dbName}" already exists.`);
    }
  }

  await adminClient.end();

  // Run migrations and seed on pickup
  console.log('Running migrations on pickup...');
  await runMigrations('postgres://postgres:postgres@localhost:5432/pickup');
  await seedProducts('postgres://postgres:postgres@localhost:5432/pickup');

  // Run migrations on pickup_test
  console.log('Running migrations on pickup_test...');
  await runMigrations('postgres://postgres:postgres@localhost:5432/pickup_test');

  console.log('🎉 Setup complete!');
}

setup().catch((err) => {
  console.error('❌ Setup failed:', err);
  process.exit(1);
});
