import Database from 'better-sqlite3';

const UNCATEGORIZED_CATEGORY = 'uncategorized';

export function orderInventoryCategories(categories: string[]) {
  const seen = new Set<string>();
  const ordered = categories.filter(category => {
    if (!category || category === UNCATEGORIZED_CATEGORY || seen.has(category)) return false;
    seen.add(category);
    return true;
  });

  return [...ordered, UNCATEGORIZED_CATEGORY];
}

export function createDatabase(dbPath: string) {
  const db = new Database(dbPath);

  // Users & Invite Codes
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      invite_code TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
      created_by_user_id INTEGER,
      is_used INTEGER DEFAULT 0
    );

    -- Initial admin
    INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin');
  `);

  // Data following users
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL,
      unit TEXT DEFAULT 'ml',
      category TEXT DEFAULT 'uncategorized',
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      rating INTEGER DEFAULT 5,
      ingredients_json TEXT,
      steps_json TEXT,
      metadata_json TEXT,
      created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS recommendation_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_json TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      recommendations_json TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS food_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'uncategorized',
      created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
      UNIQUE(user_id, normalized_name, category),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  const inventoryColumns = db.prepare('PRAGMA table_info(inventory)').all() as { name: string }[];
  if (!inventoryColumns.some(column => column.name === 'category')) {
    db.exec(`ALTER TABLE inventory ADD COLUMN category TEXT DEFAULT 'uncategorized';`);
  }

  // Limits & Logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    INSERT OR IGNORE INTO config (key, value) VALUES ('daily_limit_ip', '10');
    INSERT OR IGNORE INTO config (key, value) VALUES ('daily_limit_account', '20');
    INSERT OR IGNORE INTO config (key, value) VALUES ('daily_limit_invite', '15');

    CREATE TABLE IF NOT EXISTS inventory_categories (
      name TEXT PRIMARY KEY,
      created_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
    );

    INSERT OR IGNORE INTO inventory_categories (name) VALUES ('coffee');
    INSERT OR IGNORE INTO inventory_categories (name) VALUES ('alcohol');
    INSERT OR IGNORE INTO inventory_categories (name) VALUES ('soft');
    INSERT OR IGNORE INTO inventory_categories (name) VALUES ('milk');
    INSERT OR IGNORE INTO inventory_categories (name) VALUES ('powder');
    INSERT OR IGNORE INTO inventory_categories (name) VALUES ('fruit');
    INSERT OR IGNORE INTO inventory_categories (name) VALUES ('tea');
    INSERT OR IGNORE INTO inventory_categories (name) VALUES ('uncategorized');

    CREATE TABLE IF NOT EXISTS login_attempts (
      ip TEXT,
      attempt_date DATE DEFAULT (date('now', 'localtime')),
      count INTEGER DEFAULT 1,
      PRIMARY KEY(ip, attempt_date)
    );

    CREATE TABLE IF NOT EXISTS registration_attempts (
      ip TEXT,
      attempt_date DATE DEFAULT (date('now', 'localtime')),
      count INTEGER DEFAULT 1,
      PRIMARY KEY(ip, attempt_date)
    );

    CREATE TABLE IF NOT EXISTS generation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      ip TEXT,
      created_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
    );
  `);

  return {
    db, // Export raw for complex queries
    
    // Auth
    getUserByUsername(username: string) {
      return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    },
    getUserByInviteCode(code: string) {
      return db.prepare('SELECT * FROM users WHERE invite_code = ?').get(code);
    },
    getInviteCodeRecord(code: string) {
      return db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(code);
    },
    createUser(data: {username?: string, password?: string, invite_code?: string, role?: string}) {
      const stmt = db.prepare('INSERT INTO users (username, password, invite_code, role) VALUES (?, ?, ?, ?)');
      const res = stmt.run(data.username || null, data.password || null, data.invite_code || null, data.role || 'user');
      return Number(res.lastInsertRowid);
    },

    // Security & Limits
    recordLoginAttempt(ip: string) {
      db.prepare(`
        INSERT INTO login_attempts (ip) VALUES (?) 
        ON CONFLICT(ip, attempt_date) DO UPDATE SET count = count + 1
      `).run(ip);
    },
    getLoginAttempts(ip: string) {
      const row = db.prepare("SELECT count FROM login_attempts WHERE ip = ? AND attempt_date = date('now', 'localtime')").get(ip) as any;
      return row ? row.count : 0;
    },
    recordRegistrationAttempt(ip: string) {
      db.prepare(`
        INSERT INTO registration_attempts (ip) VALUES (?) 
        ON CONFLICT(ip, attempt_date) DO UPDATE SET count = count + 1
      `).run(ip);
    },
    getRegistrationAttempts(ip: string) {
      const row = db.prepare("SELECT count FROM registration_attempts WHERE ip = ? AND attempt_date = date('now', 'localtime')").get(ip) as any;
      return row ? row.count : 0;
    },
    getConfig(key: string) {
      const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as any;
      return row ? row.value : null;
    },
    setConfig(key: string, value: string) {
      db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
    },

    // Inventory categories
    getInventoryCategories() {
      const categories = db.prepare(`
        SELECT name FROM inventory_categories
        ORDER BY CASE WHEN name = ? THEN 1 ELSE 0 END, rowid ASC
      `).all(UNCATEGORIZED_CATEGORY).map((row: any) => row.name);
      return orderInventoryCategories(categories);
    },
    addInventoryCategory(name: string) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Category name is required');
      db.prepare('INSERT OR IGNORE INTO inventory_categories (name) VALUES (?)').run(trimmed);
      return trimmed;
    },
    deleteInventoryCategory(name: string) {
      const trimmed = name.trim();
      if (!trimmed || trimmed === UNCATEGORIZED_CATEGORY) throw new Error('Cannot delete this category');
      const txn = db.transaction((category: string) => {
        db.prepare('UPDATE inventory SET category = ? WHERE category = ?').run(UNCATEGORIZED_CATEGORY, category);
        const result = db.prepare('DELETE FROM inventory_categories WHERE name = ?').run(category);
        if (result.changes === 0) throw new Error('Category not found');
      });
      txn(trimmed);
    },

    // Inventory
    getInventory(userId: number) {
      return db.prepare(`
        SELECT id, user_id, name, amount, unit, COALESCE(category, ?) AS category
        FROM inventory
        WHERE user_id = ?
      `).all(UNCATEGORIZED_CATEGORY, userId);
    },
    setInventory(user_id: number, items: any[]) {
      const txn = db.transaction(() => {
        db.prepare('DELETE FROM inventory WHERE user_id = ?').run(user_id);
        const stmt = db.prepare('INSERT INTO inventory (id, user_id, name, amount, unit, category) VALUES (?, ?, ?, ?, ?, ?)');
        const libraryStmt = db.prepare(`
          INSERT OR IGNORE INTO food_library (user_id, name, normalized_name, category)
          VALUES (?, ?, ?, ?)
        `);
        for (const item of items) {
          const category = typeof item.category === 'string' && item.category.trim() ? item.category : UNCATEGORIZED_CATEGORY;
          stmt.run(item.id, user_id, item.name, item.amount ?? null, item.unit || 'ml', category);
          const name = String(item.name ?? '').trim();
          if (name) libraryStmt.run(user_id, name, name.toLocaleLowerCase(), category);
        }
      });
      txn();
    },

    // Food library
    getFoodLibrary(userId: number) {
      return db.prepare(`
        SELECT id, user_id, name, category, created_at
        FROM food_library
        WHERE user_id = ?
        ORDER BY category ASC, name ASC
      `).all(userId);
    },
    upsertFoodLibraryItem(userId: number, name: string, category: string) {
      const trimmed = String(name ?? '').trim();
      if (!trimmed) return null;
      const normalized = trimmed.toLocaleLowerCase();
      const safeCategory = String(category || UNCATEGORIZED_CATEGORY).trim() || UNCATEGORIZED_CATEGORY;
      const result = db.prepare(`
        INSERT OR IGNORE INTO food_library (user_id, name, normalized_name, category)
        VALUES (?, ?, ?, ?)
      `).run(userId, trimmed, normalized, safeCategory);
      return result.changes;
    },
    deleteFoodLibraryItem(userId: number, id: number) {
      db.prepare('DELETE FROM food_library WHERE user_id = ? AND id = ?').run(userId, id);
    },
    clearFoodLibrary(userId: number) {
      db.prepare('DELETE FROM food_library WHERE user_id = ?').run(userId);
    },

    // Favorites
    getFavorites(userId: number) {
      return db.prepare('SELECT * FROM favorites WHERE user_id = ? ORDER BY rating DESC, created_at DESC').all(userId);
    },
    upsertFavorite(userId: number, data: any) {
      if (data.id && typeof data.id === 'number') {
        const stmt = db.prepare(`
          UPDATE favorites SET name = ?, rating = ?, ingredients_json = ?, steps_json = ?, metadata_json = ?
          WHERE id = ? AND user_id = ?
        `);
        stmt.run(data.name, data.rating, JSON.stringify(data.ingredients), JSON.stringify(data.steps), JSON.stringify(data.metadata), data.id, userId);
        return data.id;
      } else {
        const stmt = db.prepare(`
          INSERT INTO favorites (user_id, name, rating, ingredients_json, steps_json, metadata_json)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        const res = stmt.run(userId, data.name, data.rating, JSON.stringify(data.ingredients), JSON.stringify(data.steps), JSON.stringify(data.metadata));
        return Number(res.lastInsertRowid);
      }
    },
    deleteFavorite(userId: number, id: number) {
      db.prepare('DELETE FROM favorites WHERE id = ? AND user_id = ?').run(id, userId);
    },

    // Recommendation history
    saveRecommendationSession(data: { request: unknown, provider: string, model: string, prompt: string, recommendations: unknown[] }) {
      const stmt = db.prepare(`
        INSERT INTO recommendation_sessions (request_json, provider, model, prompt, recommendations_json)
        VALUES (?, ?, ?, ?, ?)
      `);
      const res = stmt.run(
        JSON.stringify(data.request),
        data.provider,
        data.model,
        data.prompt,
        JSON.stringify(data.recommendations)
      );
      return { id: Number(res.lastInsertRowid) };
    },
    listRecommendationHistory(limit = 20) {
      return db.prepare(`
        SELECT * FROM recommendation_sessions
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `).all(limit).map((row: any) => ({
        id: row.id,
        request: JSON.parse(row.request_json),
        provider: row.provider,
        model: row.model,
        prompt: row.prompt,
        recommendations: JSON.parse(row.recommendations_json),
        created_at: row.created_at
      }));
    },

    // Generation logs & limit checks
    logGeneration(userId: number | null, ip: string) {
      db.prepare('INSERT INTO generation_logs (user_id, ip) VALUES (?, ?)').run(userId, ip);
    },
    getDailyGenerationCount(userId: number | null, ip: string) {
      if (userId) {
        const row = db.prepare("SELECT count(*) as c FROM generation_logs WHERE user_id = ? AND date(created_at) = date('now', 'localtime')").get(userId) as any;
        return row.c;
      } else {
        const row = db.prepare("SELECT count(*) as c FROM generation_logs WHERE ip = ? AND date(created_at) = date('now', 'localtime')").get(ip) as any;
        return row.c;
      }
    },

    // Admin stuff
    listInviteCodes() {
      return db.prepare('SELECT * FROM invite_codes ORDER BY created_at DESC').all();
    },
    createInviteCode(code: string, creatorId: number) {
      const columns = db.prepare('PRAGMA table_info(invite_codes)').all() as { name: string }[];
      if (columns.some(column => column.name === 'created_by_user_id')) {
        db.prepare('INSERT INTO invite_codes (code, created_by_user_id) VALUES (?, ?)').run(code, creatorId);
        return;
      }
      db.prepare('INSERT INTO invite_codes (code, created_by) VALUES (?, ?)').run(code, String(creatorId));
    }
  };
}
