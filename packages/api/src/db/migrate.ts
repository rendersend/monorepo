/**
 * Migration runner for SQLite and Postgres.
 *
 * Migration files live in migrations/sqlite/ and migrations/postgres/.
 * Files are named NNNN_description.sql and applied in lexicographic order.
 * Applied migrations are recorded in schema_migrations and never re-run.
 *
 * Rule: every schema change goes in a new migration file. Never edit an
 * existing migration once it has been applied to any environment.
 */
import { readdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import type postgres from "postgres";

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");

export function migrateSqlite(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT    PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const dir = resolve(MIGRATIONS_DIR, "sqlite");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set(
    (db.prepare("SELECT name FROM schema_migrations").all() as { name: string }[]).map((r) => r.name),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    db.exec(readFileSync(resolve(dir, file), "utf-8"));
    db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(file, Date.now());
    console.log(`[migrate] sqlite: applied ${file}`);
  }
}

export async function migratePostgres(sql: postgres.Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT   PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )
  `;

  const dir = resolve(MIGRATIONS_DIR, "postgres");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set(
    (await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map((r) => r.name),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    await sql.unsafe(await readFile(resolve(dir, file), "utf-8"));
    await sql`INSERT INTO schema_migrations (name, applied_at) VALUES (${file}, ${Date.now()})`;
    console.log(`[migrate] postgres: applied ${file}`);
  }
}
