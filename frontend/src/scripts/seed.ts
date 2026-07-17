// src/scripts/seed.ts
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { readdir, readFile } from 'fs/promises';
import { extname, join } from 'path';
import { Pool } from 'pg';

const SEED_DIR = __dirname;

interface SeedResult {
  filename: string;
  imported: boolean;
  skipped: boolean;
  rowCount?: number;
  error?: Error;
}

async function checkTableExists(
  db: NodePgDatabase<Record<string, never>>,
  tableName: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = ${tableName}
    );
  `);
  return Boolean(result.rows[0]?.exists);
}

async function getTableCount(
  db: NodePgDatabase<Record<string, never>>,
  tableName: string,
): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*) as count FROM ${sql.raw(tableName)};
  `);
  return parseInt(String(result.rows[0]?.count || '0'), 10);
}

async function importSqlFile(
  db: NodePgDatabase<Record<string, never>>,
  filePath: string,
): Promise<number> {
  const sqlContent = await readFile(filePath, 'utf-8');

  const statements = sqlContent
    .split('\n')
    .filter((line) => !line.trim().startsWith('--') && line.trim() !== '')
    .join('\n')
    .split(';')
    .filter((stmt) => stmt.trim() !== '');

  let totalRows = 0;

  for (const statement of statements) {
    const result = await db.execute(sql.raw(statement + ';'));
    if (result.rowCount !== undefined) {
      totalRows += result.rowCount || 0;
    }
  }

  return totalRows;
}

async function seedFile(
  db: NodePgDatabase<Record<string, never>>,
  filename: string,
): Promise<SeedResult> {
  const filePath = join(SEED_DIR, filename);
  const tableName = filename.replace('.sql', '');

  console.log(`Processing: ${filename}`);

  const tableExists = await checkTableExists(db, tableName);
  if (!tableExists) {
    console.log(`Table '${tableName}' doesn't exist. Skipping.`);
    return { filename, imported: false, skipped: true, rowCount: 0 };
  }

  const count = await getTableCount(db, tableName);
  if (count > 0) {
    console.log(`${tableName} already has ${count} records. Skipping.`);
    return { filename, imported: false, skipped: true, rowCount: count };
  }

  console.log(`Importing ${filename}...`);
  const importedRows = await importSqlFile(db, filePath);
  const finalCount = await getTableCount(db, tableName);

  console.log(`Imported ${finalCount} records into ${tableName}.`);
  return { filename, imported: true, skipped: false, rowCount: finalCount };
}

async function main() {
  console.log('Starting seed...\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

  const db = drizzle(pool);

  try {
    const allFiles = await readdir(SEED_DIR);
    const files = allFiles.filter((file) => extname(file) === '.sql');

    if (files.length === 0) {
      console.log('No SQL files found.');
      await pool.end();
      return;
    }

    console.log(`Found ${files.length} file(s): ${files.join(', ')}\n`);

    const results: SeedResult[] = [];
    for (const file of files) {
      const result = await seedFile(db, file);
      results.push(result);
      if (result.error) break;
    }

    console.log('\nSummary:');
    const imported = results.filter((r) => r.imported);
    const skipped = results.filter((r) => r.skipped);
    const failed = results.filter((r) => r.error);

    if (imported.length) {
      console.log(`Imported: ${imported.length} file(s)`);
      imported.forEach((r) => console.log(`  - ${r.filename}: ${r.rowCount} records`));
    }
    if (skipped.length) {
      console.log(`Skipped: ${skipped.length} file(s)`);
      skipped.forEach((r) => console.log(`  - ${r.filename}: already has ${r.rowCount} records`));
    }
    if (failed.length) {
      console.log(`Failed: ${failed.length} file(s)`);
      failed.forEach((r) => console.log(`  - ${r.filename}: ${r.error?.message}`));
      throw new Error('Seed failed');
    }

    console.log('\nSeed completed!');
  } catch (error) {
    console.error('\nSeed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
