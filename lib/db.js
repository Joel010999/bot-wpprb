// Evitamos el import estático para que Turbopack en Windows no explote con "junction point"
// import { createClient } from "@libsql/client";

let db = null;
let migrationsRan = false;
let isPg = false;

export function getDb() {
  if (!db) {
    const dbUrl = process.env.DATABASE_URL;
    
    // Detección de PostgreSQL
    if (dbUrl && dbUrl.startsWith("postgres://")) {
      isPg = true;
      const { Pool } = require("pg");
      const pool = new Pool({ connectionString: dbUrl });
      
      db = {
        isPostgres: true,
        execute: async (queryOrSql) => {
          let sql = typeof queryOrSql === "string" ? queryOrSql : queryOrSql.sql;
          let args = typeof queryOrSql === "string" ? [] : (queryOrSql.args || []);
          
          // Convertir placeholders ? a $1, $2, etc. (Estilo Postgres)
          let argIndex = 1;
          sql = sql.replace(/\?/g, () => `$${argIndex++}`);
          
          const res = await pool.query(sql, args);
          return { rows: res.rows };
        },
        executeMultiple: async (sqlStr) => {
          await pool.query(sqlStr);
        }
      };
    } else {
      // Fallback a SQLite (libsql) local o Turso
      const { createClient } = require("@libsql/client");
      const libDb = createClient({
        url: process.env.TURSO_DATABASE_URL || "file:local.db",
        authToken: process.env.TURSO_AUTH_TOKEN || undefined,
      });
      
      db = {
        isPostgres: false,
        execute: async (queryOrSql) => {
          const res = await libDb.execute(queryOrSql);
          return { rows: res.rows };
        },
        executeMultiple: async (sqlStr) => {
          await libDb.executeMultiple(sqlStr);
        }
      };
    }

    // Auto-ejecutar migraciones críticas en el primer getDb()
    if (!migrationsRan) {
      migrationsRan = true;
      const criticalMigrations = [
        "ALTER TABLE campaigns ADD COLUMN status_message TEXT",
        "ALTER TABLE campaigns ADD COLUMN search_keyword TEXT",
        isPg ? "ALTER TABLE prospects ADD COLUMN last_checked_at TIMESTAMP" : "ALTER TABLE prospects ADD COLUMN last_checked_at DATETIME",
        isPg ? "ALTER TABLE prospects ADD COLUMN last_message_at TIMESTAMP" : "ALTER TABLE prospects ADD COLUMN last_message_at DATETIME",
        "ALTER TABLE prospects ADD COLUMN status VARCHAR(50) DEFAULT 'pendiente'",
      ];
      for (const sql of criticalMigrations) {
        db.execute(sql).catch(() => { /* ya existe o error silencioso */ });
      }
    }
  }
  return db;
}

export async function initializeDatabase() {
  const client = getDb();

  const pgSchema = `
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      ig_handle VARCHAR(255) UNIQUE NOT NULL,
      followers_count INT,
      bio_data TEXT,
      status VARCHAR(50) DEFAULT 'cold',
      source_url TEXT,
      campaign_id TEXT,
      is_priority INT DEFAULT 0,
      manual_trigger INT DEFAULT 0,
      automation_paused INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bot_accounts (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      proxy_endpoint VARCHAR(255),
      daily_dm_count INT DEFAULT 0,
      daily_dm_limit INT DEFAULT 25,
      status VARCHAR(50) DEFAULT 'active',
      fingerprint_id TEXT,
      warmup_level INT DEFAULT 0,
      last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      lead_id TEXT,
      bot_account_id TEXT,
      content TEXT NOT NULL,
      role VARCHAR(50) NOT NULL,
      ai_enabled INT DEFAULT 1,
      sentiment VARCHAR(50),
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scrape_jobs (
      id SERIAL PRIMARY KEY,
      target_url TEXT NOT NULL,
      scrape_type VARCHAR(50) DEFAULT 'followers',
      status VARCHAR(50) DEFAULT 'pending',
      leads_found INT DEFAULT 0,
      filters TEXT,
      campaign_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prospects (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      full_name VARCHAR(255),
      biography TEXT,
      status VARCHAR(50) DEFAULT 'pendiente',
      campaign_id TEXT,
      last_checked_at TIMESTAMP,
      last_message_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bot_sessions (
      username VARCHAR(255) PRIMARY KEY,
      storage_state TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      niche VARCHAR(100),
      target_source TEXT,
      status VARCHAR(50) DEFAULT 'paused',
      status_message TEXT,
      daily_limit INT DEFAULT 20,
      leads_found INT DEFAULT 0,
      dms_sent INT DEFAULT 0,
      niche_context TEXT,
      search_keyword TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const sqliteSchema = `
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      ig_handle VARCHAR(255) UNIQUE NOT NULL,
      followers_count INT,
      bio_data TEXT,
      status VARCHAR(50) DEFAULT 'cold',
      source_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bot_accounts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      username VARCHAR(255) UNIQUE NOT NULL,
      proxy_endpoint VARCHAR(255),
      daily_dm_count INT DEFAULT 0,
      daily_dm_limit INT DEFAULT 25,
      status VARCHAR(50) DEFAULT 'active',
      fingerprint_id TEXT,
      warmup_level INT DEFAULT 0,
      last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      lead_id TEXT REFERENCES leads(id),
      bot_account_id TEXT REFERENCES bot_accounts(id),
      content TEXT NOT NULL,
      role VARCHAR(50) NOT NULL,
      ai_enabled INT DEFAULT 1,
      sentiment VARCHAR(50),
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scrape_jobs (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      target_url TEXT NOT NULL,
      scrape_type VARCHAR(50) DEFAULT 'followers',
      status VARCHAR(50) DEFAULT 'pending',
      leads_found INT DEFAULT 0,
      filters TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prospects (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      username VARCHAR(255) UNIQUE NOT NULL,
      full_name VARCHAR(255),
      biography TEXT,
      status VARCHAR(50) DEFAULT 'pendiente',
      campaign_id TEXT REFERENCES campaigns(id),
      last_checked_at TIMESTAMP,
      last_message_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bot_sessions (
      username VARCHAR(255) PRIMARY KEY,
      storage_state TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name VARCHAR(255) NOT NULL,
      niche VARCHAR(100),
      target_source TEXT,
      status VARCHAR(50) DEFAULT 'paused',
      status_message TEXT,
      daily_limit INT DEFAULT 20,
      leads_found INT DEFAULT 0,
      dms_sent INT DEFAULT 0,
      niche_context TEXT,
      search_keyword TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await client.executeMultiple(client.isPostgres ? pgSchema : sqliteSchema);

  // Migrations seguras — ignoran si ya existen
  const migrations = [
    `ALTER TABLE bot_accounts RENAME COLUMN proxy_endpoint TO proxy_endpoint_old`,
    `ALTER TABLE bot_accounts ADD COLUMN proxy_endpoint VARCHAR(255)`,
    `UPDATE bot_accounts SET proxy_endpoint = proxy_endpoint_old`,
    `ALTER TABLE leads ADD COLUMN campaign_id TEXT REFERENCES campaigns(id)`,
    `ALTER TABLE scrape_jobs ADD COLUMN campaign_id TEXT REFERENCES campaigns(id)`,
    `ALTER TABLE leads ADD COLUMN is_priority INT DEFAULT 0`,
    `ALTER TABLE leads ADD COLUMN manual_trigger INT DEFAULT 0`,
    `ALTER TABLE leads ADD COLUMN automation_paused INT DEFAULT 0`,
    `ALTER TABLE campaigns ADD COLUMN status_message TEXT`,
    `ALTER TABLE campaigns ADD COLUMN search_keyword TEXT`,
    `ALTER TABLE prospects ADD COLUMN last_checked_at TIMESTAMP`,
  ];

  for (const sql of migrations) {
    try { await client.execute(sql); } catch { /* ya migrado */ }
  }

  return { success: true };
}
