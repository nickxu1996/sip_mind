import Database from 'better-sqlite3';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const UNCATEGORIZED_CATEGORY = 'uncategorized';
const PASSWORD_PREFIX = 'scrypt$';
const SESSION_DAYS = 30;

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${PASSWORD_PREFIX}${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored) return false;
  if (!stored.startsWith(PASSWORD_PREFIX)) return password === stored;
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function sessionExpiry() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}
const DEFAULT_CATEGORY_LABELS: Record<string, { zh: string; en: string }> = {
  coffee: { zh: '咖啡', en: 'Coffee' },
  alcohol: { zh: '酒类', en: 'Alcohol' },
  soft: { zh: '软饮', en: 'Soft Drinks' },
  milk: { zh: '奶类', en: 'Dairy' },
  powder: { zh: '粉末', en: 'Powder' },
  fruit: { zh: '水果', en: 'Fruit' },
  tea: { zh: '茶', en: 'Tea' },
  uncategorized: { zh: '未分类', en: 'Uncategorized' }
};
const COMMON_CATEGORY_TRANSLATIONS: Record<string, string> = {
  糖浆: 'Syrup',
  甜味剂: 'Sweeteners',
  果汁: 'Juice',
  苏打: 'Soda',
  气泡水: 'Sparkling Water',
  水: 'Water',
  冰: 'Ice',
  香料: 'Spices',
  草本: 'Herbs',
  奶油: 'Cream',
  巧克力: 'Chocolate',
  酸味: 'Sour Ingredients',
  其他: 'Other'
};

function translateCategoryName(name: string) {
  return COMMON_CATEGORY_TRANSLATIONS[name] ?? name;
}

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
    INSERT OR IGNORE INTO users (id, username, password, role) VALUES (0, '__public_food_library__', NULL, 'system');
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
      share_public_food_library INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  const inventoryColumns = db.prepare('PRAGMA table_info(inventory)').all() as { name: string }[];
  if (!inventoryColumns.some(column => column.name === 'category')) {
    db.exec(`ALTER TABLE inventory ADD COLUMN category TEXT DEFAULT 'uncategorized';`);
  }
  if (!inventoryColumns.some(column => column.name === 'share_public_food_library')) {
    db.exec(`ALTER TABLE inventory ADD COLUMN share_public_food_library INTEGER DEFAULT 0;`);
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
    INSERT OR IGNORE INTO config (key, value) VALUES ('daily_limit_global', '200');
    INSERT OR IGNORE INTO config (key, value) VALUES ('daily_limit_user', '50');
    INSERT OR IGNORE INTO config (key, value) VALUES ('daily_limit_guest', '10');

    CREATE TABLE IF NOT EXISTS inventory_categories (
      name TEXT PRIMARY KEY,
      label_zh TEXT,
      label_en TEXT,
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
      device_id TEXT,
      created_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
    );
  `);

  const generationLogColumns = db.prepare('PRAGMA table_info(generation_logs)').all() as { name: string }[];
  if (!generationLogColumns.some(column => column.name === 'device_id')) {
    db.exec(`ALTER TABLE generation_logs ADD COLUMN device_id TEXT;`);
  }

  if (db.prepare("SELECT value FROM config WHERE key = 'food_library_public_migration_v1'").get() === undefined) {
    db.exec(`
      INSERT OR IGNORE INTO food_library (user_id, name, normalized_name, category, created_at)
      SELECT 0, name, normalized_name, category, MIN(created_at)
      FROM food_library
      WHERE user_id <> 0
      GROUP BY normalized_name, category;

      DELETE FROM food_library
      WHERE user_id <> 0;

      UPDATE inventory
      SET share_public_food_library = 1;

      INSERT INTO config (key, value) VALUES ('food_library_public_migration_v1', 'done');
    `);
  }

  const categoryColumns = db.prepare('PRAGMA table_info(inventory_categories)').all() as { name: string }[];
  if (!categoryColumns.some(column => column.name === 'label_zh')) {
    db.exec(`ALTER TABLE inventory_categories ADD COLUMN label_zh TEXT;`);
  }
  if (!categoryColumns.some(column => column.name === 'label_en')) {
    db.exec(`ALTER TABLE inventory_categories ADD COLUMN label_en TEXT;`);
  }
  for (const [name, labels] of Object.entries(DEFAULT_CATEGORY_LABELS)) {
    db.prepare(`
      UPDATE inventory_categories
      SET label_zh = COALESCE(NULLIF(label_zh, ''), ?),
          label_en = COALESCE(NULLIF(label_en, ''), ?)
      WHERE name = ?
    `).run(labels.zh, labels.en, name);
  }
  const customCategories = db.prepare(`
    SELECT name, label_zh, label_en FROM inventory_categories
  `).all() as { name: string; label_zh?: string | null; label_en?: string | null }[];
  for (const category of customCategories) {
    const labelZh = category.label_zh?.trim() || category.name;
    const labelEn = category.label_en?.trim() || translateCategoryName(labelZh);
    db.prepare(`
      UPDATE inventory_categories
      SET label_zh = ?, label_en = ?
      WHERE name = ?
    `).run(labelZh, labelEn, category.name);
  }

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
      const password = data.password ? hashPassword(data.password) : null;
      const res = stmt.run(data.username || null, password, data.invite_code || null, data.role || 'user');
      return Number(res.lastInsertRowid);
    },
    verifyUserPassword(user: { id: number; password?: string | null }, password: string) {
      const ok = verifyPassword(password, user.password);
      if (ok && user.password && !user.password.startsWith(PASSWORD_PREFIX)) {
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(password), user.id);
      }
      return ok;
    },
    setUserPassword(username: string, password: string, role = 'user') {
      db.prepare('UPDATE users SET password = ?, role = ? WHERE username = ?').run(hashPassword(password), role, username);
    },
    createSession(userId: number) {
      const token = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), userId, sessionExpiry());
      return token;
    },
    getSessionUser(token: string) {
      const row = db.prepare(`
        SELECT users.id, users.username, users.invite_code, users.role
        FROM user_sessions
        JOIN users ON users.id = user_sessions.user_id
        WHERE user_sessions.token_hash = ? AND datetime(user_sessions.expires_at) > datetime('now')
      `).get(hashToken(token)) as any;
      return row ?? null;
    },
    deleteSession(token: string) {
      db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(hashToken(token));
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
        SELECT name,
               COALESCE(NULLIF(label_zh, ''), name) AS label_zh,
               COALESCE(NULLIF(label_en, ''), name) AS label_en
        FROM inventory_categories
        ORDER BY CASE WHEN name = ? THEN 1 ELSE 0 END, rowid ASC
      `).all(UNCATEGORIZED_CATEGORY);
      const orderedNames = orderInventoryCategories(categories.map((row: any) => row.name));
      return orderedNames.map(name => categories.find((row: any) => row.name === name));
    },
    addInventoryCategory(data: string | { name?: string; label_zh?: string; label_en?: string }) {
      if (typeof data === 'string') {
        const trimmed = data.trim();
        if (!trimmed) throw new Error('Category name is required');
        db.prepare(`
          INSERT OR IGNORE INTO inventory_categories (name, label_zh, label_en)
          VALUES (?, ?, ?)
        `).run(trimmed, trimmed, trimmed);
        return trimmed;
      }
      const rawZh = typeof data === 'string' ? data : data.label_zh ?? data.name;
      const rawEn = typeof data === 'string' ? data : data.label_en ?? data.name;
      const labelZh = String(rawZh ?? '').trim();
      const labelEn = String(rawEn ?? '').trim();
      if (!labelZh && !labelEn) throw new Error('Category name is required');
      const base = (labelEn || labelZh).toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `category-${Date.now()}`;
      let name = base;
      let suffix = 2;
      while (db.prepare('SELECT name FROM inventory_categories WHERE name = ?').get(name)) {
        name = `${base}-${suffix}`;
        suffix += 1;
      }
      db.prepare('INSERT INTO inventory_categories (name, label_zh, label_en) VALUES (?, ?, ?)').run(name, labelZh || labelEn, labelEn || labelZh);
      return name;
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
        SELECT id, user_id, name, amount, unit, COALESCE(category, ?) AS category,
               CASE WHEN share_public_food_library = 1 THEN 1 ELSE 0 END AS sharePublicFoodLibrary
        FROM inventory
        WHERE user_id = ?
      `).all(UNCATEGORIZED_CATEGORY, userId);
    },
    setInventory(user_id: number, items: any[]) {
      const txn = db.transaction(() => {
        db.prepare('DELETE FROM inventory WHERE user_id = ?').run(user_id);
        const stmt = db.prepare('INSERT INTO inventory (id, user_id, name, amount, unit, category, share_public_food_library) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const libraryStmt = db.prepare(`
          INSERT OR IGNORE INTO food_library (user_id, name, normalized_name, category)
          VALUES (?, ?, ?, ?)
        `);
        for (const item of items) {
          const category = typeof item.category === 'string' && item.category.trim() ? item.category : UNCATEGORIZED_CATEGORY;
          const sharePublic = item.sharePublicFoodLibrary ? 1 : 0;
          stmt.run(item.id, user_id, item.name, item.amount ?? null, item.unit || 'ml', category, sharePublic);
          const name = String(item.name ?? '').trim();
          const libraryUserId = sharePublic ? 0 : user_id;
          if (name) libraryStmt.run(libraryUserId, name, name.toLocaleLowerCase(), category);
        }
      });
      txn();
    },

    // Food library
    getFoodLibrary(userId: number) {
      const rows = db.prepare(`
        SELECT id, user_id, name, category, created_at,
               CASE WHEN user_id = 0 THEN 1 ELSE 0 END AS is_public
        FROM food_library
        WHERE user_id = ? OR user_id = 0
        ORDER BY category ASC, name ASC, user_id DESC
      `).all(userId) as any[];
      const seen = new Set<string>();
      return rows.filter(row => {
        const key = `${String(row.category).toLocaleLowerCase()}:${String(row.name).toLocaleLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
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
      db.prepare('DELETE FROM food_library WHERE (user_id = ? OR user_id = 0) AND id = ?').run(userId, id);
    },
    clearFoodLibrary(userId: number) {
      db.prepare('DELETE FROM food_library WHERE user_id = ? OR user_id = 0').run(userId);
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
    logGeneration(userId: number | null, ip: string, deviceId?: string | null) {
      db.prepare('INSERT INTO generation_logs (user_id, ip, device_id) VALUES (?, ?, ?)').run(userId, ip, deviceId ?? null);
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
    getDailyGlobalGenerationCount() {
      const row = db.prepare("SELECT count(*) as c FROM generation_logs WHERE date(created_at) = date('now', 'localtime')").get() as any;
      return row.c;
    },
    getDailyGuestGenerationCount(ip: string, deviceId: string) {
      const row = db.prepare(`
        SELECT count(*) as c FROM generation_logs
        WHERE user_id IS NULL
          AND ip = ?
          AND COALESCE(device_id, '') = ?
          AND date(created_at) = date('now', 'localtime')
      `).get(ip, deviceId) as any;
      return row.c;
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
