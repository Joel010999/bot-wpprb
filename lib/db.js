// Evitamos el import estático para que Turbopack en Windows no explote con "junction point"
// import { createClient } from "@libsql/client";

let dbInstance = null;
let dbPromise = null;
let isPg = false;

export async function getDb() {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const dbUrl = process.env.DATABASE_URL;
    let db;
    
    // Detección de PostgreSQL
    if (dbUrl && (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://"))) {
      isPg = true;
      console.log("MODO DB: POSTGRESQL");
      const { Pool } = require("pg");
      const pool = new Pool({ connectionString: dbUrl });
      
      db = {
        isPostgres: true,
        execute: async (sqlOrObj, params = []) => {
          let sql = typeof sqlOrObj === "string" ? sqlOrObj : sqlOrObj.sql;
          let args = typeof sqlOrObj === "string" ? params : (sqlOrObj.args || []);
          
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

      // Inicialización automática para Postgres si es la primera vez
      await initializeDatabase(db);
      console.log("TABLAS VERIFICADAS/CREADAS");

    } else {
      // Fallback a SQLite (libsql) local o Turso
      console.log("MODO DB: SQLITE");
      const { createClient } = require("@libsql/client");
      const libDb = createClient({
        url: process.env.TURSO_DATABASE_URL || "file:local.db",
        authToken: process.env.TURSO_AUTH_TOKEN || undefined,
      });
      
      db = {
        isPostgres: false,
        execute: async (sqlOrObj, params = []) => {
          if (typeof sqlOrObj === "string") {
             const res = await libDb.execute(params.length > 0 ? { sql: sqlOrObj, args: params } : sqlOrObj);
             return { rows: res.rows };
          }
          const res = await libDb.execute(sqlOrObj);
          return { rows: res.rows };
        },
        executeMultiple: async (sqlStr) => {
          await libDb.executeMultiple(sqlStr);
        }
      };

      // Para SQLite, corremos solo las migraciones críticas rápidas
      const criticalMigrations = [
        "ALTER TABLE campaigns ADD COLUMN status_message TEXT",
        "ALTER TABLE campaigns ADD COLUMN search_keyword TEXT",
        "ALTER TABLE prospects ADD COLUMN last_checked_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN last_message_at TIMESTAMP",
        "ALTER TABLE bot_accounts ADD COLUMN owner_user VARCHAR(255)",
        "UPDATE bot_accounts SET owner_user = 'renderbyte73' WHERE username = '@brandomwhite_'",
        "ALTER TABLE campaigns ADD COLUMN owner_user VARCHAR(255)",
        "UPDATE campaigns SET owner_user = 'renderbyte73' WHERE owner_user IS NULL",
      ];
      for (const sql of criticalMigrations) {
        try { await db.execute(sql); } catch (e) { /* ya existe */ }
      }
    }

    dbInstance = db;
    return dbInstance;
  })();

  return dbPromise;
}

export async function initializeDatabase(providedClient = null) {
  const client = providedClient || await getDb();

  const pgSchema = `
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      ig_handle VARCHAR(255) UNIQUE NOT NULL,
      followers_count INT,
      bio_data TEXT,
      status VARCHAR(50) DEFAULT 'cold',
      source_url TEXT,
      campaign_id TEXT,
      is_priority INT DEFAULT 0,
      manual_trigger INT DEFAULT 0,
      automation_paused INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bot_accounts (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(255) UNIQUE NOT NULL,
      proxy_endpoint VARCHAR(255),
      daily_dm_count INT DEFAULT 0,
      daily_dm_limit INT DEFAULT 25,
      status VARCHAR(50) DEFAULT 'active',
      fingerprint_id TEXT,
      warmup_level INT DEFAULT 0,
      owner_user VARCHAR(255),
      session_data TEXT,
      last_active TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id TEXT,
      bot_account_id TEXT,
      content TEXT NOT NULL,
      role VARCHAR(50) NOT NULL,
      ai_enabled INT DEFAULT 1,
      sentiment VARCHAR(50),
      sent_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scrape_jobs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      target_url TEXT NOT NULL,
      scrape_type VARCHAR(50) DEFAULT 'followers',
      status VARCHAR(50) DEFAULT 'pending',
      leads_found INT DEFAULT 0,
      filters TEXT,
      campaign_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS prospects (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(255) UNIQUE NOT NULL,
      full_name VARCHAR(255),
      biography TEXT,
      status VARCHAR(50) DEFAULT 'listo',
      campaign_id TEXT,
      last_checked_at TIMESTAMP,
      last_message_at TIMESTAMP,
      owner_user VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bot_sessions (
      username VARCHAR(255) PRIMARY KEY,
      storage_state TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
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
      owner_user VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
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
      owner_user VARCHAR(255),
      session_data TEXT,
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
      status VARCHAR(50) DEFAULT 'listo',
      campaign_id TEXT REFERENCES campaigns(id),
      last_checked_at TIMESTAMP,
      last_message_at TIMESTAMP,
      owner_user VARCHAR(255),
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
      owner_user VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await client.executeMultiple(client.isPostgres ? pgSchema : sqliteSchema);

  // Migrations seguras — ignoran si ya existen
  const migrations = [
    `ALTER TABLE bot_accounts RENAME COLUMN proxy_endpoint TO proxy_endpoint_old`,
    `ALTER TABLE bot_accounts ADD COLUMN proxy_endpoint VARCHAR(255)`,
    `UPDATE bot_accounts SET proxy_endpoint = proxy_endpoint_old`,
    `ALTER TABLE bot_accounts ADD COLUMN session_data TEXT`,
    `ALTER TABLE leads ADD COLUMN campaign_id TEXT REFERENCES campaigns(id)`,
    `ALTER TABLE scrape_jobs ADD COLUMN campaign_id TEXT REFERENCES campaigns(id)`,
    `ALTER TABLE leads ADD COLUMN is_priority INT DEFAULT 0`,
    `ALTER TABLE leads ADD COLUMN manual_trigger INT DEFAULT 0`,
    `ALTER TABLE leads ADD COLUMN automation_paused INT DEFAULT 0`,
    `ALTER TABLE campaigns ADD COLUMN status_message TEXT`,
    `ALTER TABLE campaigns ADD COLUMN search_keyword TEXT`,
    `ALTER TABLE prospects ADD COLUMN last_checked_at TIMESTAMP`,
    `ALTER TABLE bot_accounts ADD COLUMN owner_user VARCHAR(255)`,
    `UPDATE bot_accounts SET owner_user = 'renderbyte73' WHERE username = '@brandomwhite_'`,
    `UPDATE bot_accounts SET owner_user = 'renderbyte1' WHERE LOWER(username) = 'empresa'`,
    `UPDATE bot_accounts SET owner_user = 'renderbyte152' WHERE LOWER(username) = 'personal'`,
    `ALTER TABLE campaigns ADD COLUMN owner_user VARCHAR(255)`,
    `UPDATE campaigns SET owner_user = 'renderbyte73' WHERE owner_user IS NULL`,
    `ALTER TABLE prospects ADD COLUMN owner_user VARCHAR(255)`,
    `UPDATE prospects SET owner_user = 'renderbyte73' WHERE owner_user IS NULL`
  ];

  for (const sql of migrations) {
    try { await client.execute(sql); } catch { /* ya migrado */ }
  }

  return { success: true };
}
