import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrationsDirectory = fileURLToPath(new URL('../../prisma/migrations/', import.meta.url));
const migrationTable = '_prisma_migrations';
const quote = (identifier) => '"' + identifier.replaceAll('"', '""') + '"';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

class RestoreError extends Error {}

function requireCondition(condition, message) {
  if (!condition) throw new RestoreError(message);
}

async function readBackup(path, expectedChecksum) {
  requireCondition(/^[a-f\d]{64}$/i.test(expectedChecksum ?? ''), 'Supply the expected SHA-256 of the backup.');
  const bytes = await readFile(path);
  const checksum = sha256(bytes);
  requireCondition(checksum === expectedChecksum.toLowerCase(), 'Backup SHA-256 mismatch.');
  const backup = JSON.parse(bytes);
  requireCondition(
    Array.isArray(backup.applied) && Array.isArray(backup.tables) && Number.isFinite(Date.parse(backup.createdAt)),
    'Unrecognized backup format.',
  );
  const names = new Set();
  for (const table of backup.tables) {
    requireCondition(
      /^[a-z_][a-z_\d]*$/i.test(table.name) && !names.has(table.name) && Array.isArray(table.rows) &&
      Array.isArray(table.columns) && table.columns.length > 0 &&
      table.columns.every((column) => /^[a-z_][a-z_\d]*$/i.test(column)) &&
      new Set(table.columns).size === table.columns.length,
      'Invalid table metadata in the backup.',
    );
    names.add(table.name);
  }
  return { ...backup, checksum, bytes: bytes.length };
}

async function getHistoricalMigrations(backup) {
  const metadata = backup.tables.find((table) => table.name === migrationTable);
  requireCondition(metadata, 'Backup has no Prisma migration metadata.');
  const completed = metadata.rows.filter((row) => row.finished_at && !row.rolled_back_at);
  const applied = [...backup.applied].sort();
  const local = (await readdir(migrationsDirectory)).filter((name) => /^\d/.test(name)).sort();
  requireCondition(
    applied.length > 0 && JSON.stringify(applied) === JSON.stringify(local.slice(0, applied.length)) &&
    JSON.stringify(applied) === JSON.stringify(completed.map((row) => row.migration_name).sort()),
    'Backup migration history does not match the local migration sequence.',
  );
  return Promise.all(applied.map(async (name) => {
    const sql = await readFile(join(migrationsDirectory, name, 'migration.sql'), 'utf8');
    const checksum = completed.find((row) => row.migration_name === name).checksum;
    requireCondition(
      [sql, sql.replaceAll('\r\n', '\n'), sql.replace(/\r?\n/g, '\r\n')].some((form) => sha256(form) === checksum),
      `Migration checksum mismatch for ${name}.`,
    );
    // The restore transaction owns the historical DDL and data together.
    return { name, sql: sql.trim().replace(/^BEGIN;\s+([\s\S]*?)\s+COMMIT;$/i, '$1') };
  }));
}

async function publicTables(client) {
  const result = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return result.rows.map((row) => row.table_name).sort();
}

async function restoreTable(client, { name, columns, rows }) {
  const result = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1 AND is_generated = 'NEVER'
  `, [name]);
  const actualColumns = result.rows.map((row) => row.column_name).sort();
  requireCondition(
    JSON.stringify(actualColumns) === JSON.stringify([...columns].sort()),
    `Backup columns do not match the historical schema for ${name}.`,
  );

  const target = `public.${quote(name)}`;
  const fields = columns.map(quote).join(', ');
  // Import large raw batches one row at a time. A single statement retains self-references among event rows.
  const size = name === 'CollectionBatch' ? 1 : name === 'IntelligenceEvent' ? Math.max(rows.length, 1) : 500;
  try {
    for (let offset = 0; offset < rows.length; offset += size) {
      await client.query(`
        INSERT INTO ${target} (${fields})
        SELECT ${fields} FROM json_populate_recordset(NULL::${target}, $1::json)
      `, [JSON.stringify(rows.slice(offset, offset + size))]);
    }
    const count = Number((await client.query(`SELECT count(*) FROM ${target}`)).rows[0].count);
    requireCondition(count === rows.length, `Table count mismatch for ${name}.`);
    return { name, rows: count };
  } catch (error) {
    if (error instanceof RestoreError) throw error;
    throw new RestoreError(`Import failed for ${name} (${error.code ?? error.name}).`);
  }
}

async function restore(backup, migrations) {
  const url = new URL(process.env.DATABASE_URL ?? 'invalid:');
  requireCondition(
    ['postgresql:', 'postgres:'].includes(url.protocol) && url.hostname === '127.0.0.1' &&
    url.port === '5432' && url.pathname === '/statecraft' && url.username === 'statecraft' && !url.search && !url.hash,
    'Restore requires the loopback statecraft application database.',
  );
  const client = new pg.Client({ connectionString: url.href, application_name: 'statecraft_archive_restore' });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('statecraft_archive_restore', 0))");
    requireCondition((await publicTables(client)).length === 0, 'Refusing to restore into an initialized database.');
    for (const { name, sql } of migrations) {
      try {
        await client.query(sql);
      } catch (error) {
        throw new RestoreError(`Historical DDL failed for ${name} (${error.code ?? error.name}).`);
      }
    }
    await client.query(`
      CREATE TABLE public._prisma_migrations (
        id varchar(36) PRIMARY KEY NOT NULL,
        checksum varchar(64) NOT NULL,
        finished_at timestamptz,
        migration_name varchar(255) NOT NULL,
        logs text,
        rolled_back_at timestamptz,
        started_at timestamptz NOT NULL DEFAULT now(),
        applied_steps_count integer NOT NULL DEFAULT 0
      )
    `);
    requireCondition(
      JSON.stringify(await publicTables(client)) === JSON.stringify(backup.tables.map((table) => table.name).sort()),
      'Backup tables do not match the historical schema.',
    );
    const restored = [];
    for (const table of backup.tables) restored.push(await restoreTable(client, table));
    await client.query('COMMIT');
    return restored;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

try {
  const [path, expectedChecksum, reportPath] = process.argv.slice(2);
  requireCondition(path && expectedChecksum, 'Usage: node scripts/local/restore-backup.mjs <database.json> <sha256> [report.json]');
  const backup = await readBackup(path, expectedChecksum);
  const migrations = await getHistoricalMigrations(backup);
  const restored = await restore(backup, migrations);
  const report = JSON.stringify({
    sourceCreatedAt: backup.createdAt,
    restoredAt: new Date().toISOString(),
    bytes: backup.bytes,
    sha256: backup.checksum,
    restored,
  }, null, 2);
  console.log(report);
  if (reportPath) await writeFile(reportPath, report + '\n', { flag: 'wx' });
} catch (error) {
  console.error(error instanceof RestoreError ? error.message : `Restore failed (${error.code ?? error.name}).`);
  process.exitCode = 1;
}
