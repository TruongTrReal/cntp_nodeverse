// init_db.js
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

// Change the DB file name/path as needed
const DB_PATH = path.resolve(__dirname, './db/cache.db');

async function initDB() {
  // Open (or create) the database
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  // Create tables if they don't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS keys (
      id INTEGER PRIMARY KEY,
      the_key TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS keys_proxies (
      key_id INTEGER,
      proxy TEXT UNIQUE,
      FOREIGN KEY(key_id) REFERENCES keys(id)
    );

    CREATE TABLE IF NOT EXISTS filtered_proxies (
      proxy   TEXT UNIQUE PRIMARY KEY,
      success TEXT NOT NULL,
      fail    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_monitoring (
      id INTEGER PRIMARY KEY,
      key_id INTEGER NOT NULL,
      proxy TEXT NOT NULL,
      service TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      point INTEGER NOT NULL DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(key_id) REFERENCES accounts(id)
    );
  `);

  return db;
}

// If you run this file directly (e.g. `node init_db.js`),
// it will initialize the DB and then exit.
if (require.main === module) {
  initDB().then(() => {
    console.log('DB init complete!');
    process.exit(0);
  }).catch(err => {
    console.error('DB init error:', err);
    process.exit(1);
  });
}

module.exports = { initDB };
