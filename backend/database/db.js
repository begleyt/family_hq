const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'family.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

function initDatabase() {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  // Migrations for existing databases
  runMigrations(db);

  // Seed default admin if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const hash = bcrypt.hashSync('changeme', 10);
    db.prepare(`
      INSERT INTO users (username, display_name, password_hash, role, avatar_emoji, avatar_color, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('admin', 'Mom/Dad', hash, 'parent', '👨‍👩‍👧‍👦', '#6366f1', 1);
    console.log('Created default admin user (admin / changeme)');
  }

  console.log('Database initialized');
  return db;
}

function runMigrations(db) {
  // Check if requests table needs new columns
  const cols = db.prepare("PRAGMA table_info(requests)").all().map(c => c.name);
  if (!cols.includes('grocery_category')) {
    console.log('Running migration: adding grocery/meal fields to requests...');
    // SQLite doesn't support ALTER CHECK, so recreate the table
    db.exec(`
      CREATE TABLE IF NOT EXISTS requests_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        grocery_category TEXT,
        grocery_quantity TEXT,
        meal_type_requested TEXT,
        priority TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'open',
        submitted_by INTEGER NOT NULL REFERENCES users(id),
        assigned_to INTEGER REFERENCES users(id),
        parent_note TEXT,
        resolved_by INTEGER REFERENCES users(id),
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO requests_new SELECT id, title, description, category, NULL, NULL, NULL, priority, status, submitted_by, assigned_to, parent_note, resolved_by, resolved_at, created_at, updated_at FROM requests;
      DROP TABLE requests;
      ALTER TABLE requests_new RENAME TO requests;
      CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
      CREATE INDEX IF NOT EXISTS idx_requests_submitted_by ON requests(submitted_by);
    `);
    console.log('Migration complete: requests table updated');
  }

  // Add requested_by to grocery_items
  const groceryCols = db.prepare("PRAGMA table_info(grocery_items)").all().map(c => c.name);
  if (!groceryCols.includes('requested_by')) {
    console.log('Running migration: adding requested_by to grocery_items...');
    db.exec('ALTER TABLE grocery_items ADD COLUMN requested_by INTEGER REFERENCES users(id)');
    console.log('Migration complete: grocery_items updated');
  }

  // Add ride/allowance fields to requests
  const reqCols2 = db.prepare("PRAGMA table_info(requests)").all().map(c => c.name);
  if (!reqCols2.includes('ride_time')) {
    console.log('Running migration: adding ride/allowance fields to requests...');
    db.exec(`
      ALTER TABLE requests ADD COLUMN ride_time TEXT;
      ALTER TABLE requests ADD COLUMN ride_destination TEXT;
      ALTER TABLE requests ADD COLUMN allowance_amount TEXT;
    `);
    console.log('Migration complete: ride/allowance fields added');
  }

  // Add sort_order to messages
  const msgCols = db.prepare("PRAGMA table_info(messages)").all().map(c => c.name);
  if (msgCols.length > 0 && !msgCols.includes('sort_order')) {
    console.log('Running migration: adding sort_order to messages...');
    db.exec('ALTER TABLE messages ADD COLUMN sort_order INTEGER DEFAULT 0');
    console.log('Migration complete: messages sort_order added');
  }

  // Add dashboard role to users table (recreate to update CHECK constraint)
  // Test if dashboard role is allowed
  try {
    db.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('__test_dashboard__', 'test', 'test', 'dashboard')").run();
    db.prepare("DELETE FROM users WHERE username = '__test_dashboard__'").run();
  } catch (e) {
    if (e.message.includes('CHECK')) {
      console.log('Running migration: adding dashboard role to users...');
      db.pragma('foreign_keys = OFF');
      db.exec(`
        DROP TABLE IF EXISTS users_new;
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('parent', 'teen', 'child', 'dashboard')),
          avatar_emoji TEXT DEFAULT '😊',
          avatar_color TEXT DEFAULT '#6366f1',
          must_change_password INTEGER DEFAULT 1,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO users_new SELECT * FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
      db.pragma('foreign_keys = ON');
      console.log('Migration complete: dashboard role added');
    }
  }

  // Add image columns to messages
  const msgCols2 = db.prepare("PRAGMA table_info(messages)").all().map(c => c.name);
  if (!msgCols2.includes('image_url')) {
    console.log('Running migration: adding image fields to messages...');
    db.exec(`
      ALTER TABLE messages ADD COLUMN image_url TEXT;
      ALTER TABLE messages ADD COLUMN image_asset_id TEXT;
    `);
    console.log('Migration complete: message image fields added');
  }

  // Seed Immich config if not exists
  const immichCount = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='immich_config'").get();
  if (immichCount) {
    const existing = db.prepare('SELECT COUNT(*) as count FROM immich_config').get();
    if (existing.count === 0) {
      db.prepare('INSERT INTO immich_config (server_url, api_key) VALUES (?, ?)').run(
        'https://photos.begley.life', 'Wb8NP2ir7xoXJw4CRSqSuSWt9jw4EGlqd9gA2vur4cE'
      );
      console.log('Seeded Immich config');
    }
  }
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

function logActivity(userId, action, entityType, entityId, details) {
  try {
    getDb().prepare(`
      INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, action, entityType, entityId, details);
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
}

module.exports = { initDatabase, getDb, logActivity };
