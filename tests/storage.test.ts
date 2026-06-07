import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, orderInventoryCategories } from '../src/server/storage';
import type { RecommendationRequest } from '../src/server/recommendation';

const tempDirs: string[] = [];

function makeDbPath() {
  const directory = mkdtempSync(join(tmpdir(), 'sip-mind-test-'));
  tempDirs.push(directory);
  return join(directory, 'sip-mind.sqlite');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch (e) {
        console.warn('Cleanup failed (expected on Windows if DB still locked):', e);
      }
    }
  }
});

const request: RecommendationRequest = {
  inventory: [{ id: 'tea', name: 'Oolong tea', amount: 200, unit: 'ml', category: 'tea' }],
  preferences: {
    alcohol: 'none',
    caffeine: 'low',
    temperature: 'cold',
    calories: 'low',
    frugalMode: true,
    independentDrinks: false,
    requiredIngredientIds: ['tea'],
    recommendationCount: 2
  },
  language: 'en'
};

describe('SQLite storage', () => {
  it('keeps uncategorized last when normalizing category lists', () => {
    expect(orderInventoryCategories(['coffee', 'uncategorized', 'tea', 'coffee'])).toEqual(['coffee', 'tea', 'uncategorized']);
    expect(orderInventoryCategories([])).toEqual(['uncategorized']);
  });

  it('returns new admin categories above uncategorized', () => {
    const database = createDatabase(makeDbPath());

    database.addInventoryCategory('syrup');

    const categories = database.getInventoryCategories();
    const names = categories.map((category: any) => category.name);
    expect(names.at(-1)).toBe('uncategorized');
    expect(names.indexOf('syrup')).toBeGreaterThan(-1);
    expect(names.indexOf('syrup')).toBeLessThan(names.indexOf('uncategorized'));
    const coffee = categories.find((category: any) => category.name === 'coffee') as any;
    expect(coffee?.label_en).toBe('Coffee');
    expect(coffee?.label_zh).toBe('咖啡');
  });

  it('persists inventory item categories for every item', () => {
    const database = createDatabase(makeDbPath());
    const userId = database.createUser({ username: 'inventory-category-test', password: 'test' });

    database.setInventory(userId, [
      { id: 'espresso', name: 'Espresso', amount: 60, unit: 'ml', category: 'coffee' },
      { id: 'milk', name: 'Milk', amount: 120, unit: 'ml', category: 'milk' },
      { id: 'mint', name: 'Mint', amount: 0, unit: 'piece' }
    ]);

    const inventory = database.getInventory(userId) as any[];
    expect(inventory.find(item => item.id === 'espresso')?.category).toBe('coffee');
    expect(inventory.find(item => item.id === 'milk')?.category).toBe('milk');
    expect(inventory.find(item => item.id === 'mint')?.category).toBe('uncategorized');
    expect(inventory.find(item => item.id === 'mint')?.amount).toBe(0);
  });

  it('adds the inventory category column to legacy databases', () => {
    const dbPath = makeDbPath();
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE inventory (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL,
        unit TEXT DEFAULT 'ml'
      );
    `);
    legacy.close();

    const database = createDatabase(dbPath);
    const columns = database.db.prepare('PRAGMA table_info(inventory)').all() as { name: string }[];
    expect(columns.map(column => column.name)).toContain('category');
    expect(columns.map(column => column.name)).toContain('share_public_food_library');
  });

  it('shares public food library items across accounts while keeping private items personal', () => {
    const database = createDatabase(makeDbPath());
    const firstUserId = database.createUser({ username: 'library-one', password: 'test' });
    const secondUserId = database.createUser({ username: 'library-two', password: 'test' });

    database.setInventory(firstUserId, [
      { id: 'public-milk', name: 'Shared Milk', amount: 100, unit: 'ml', category: 'milk', sharePublicFoodLibrary: true },
      { id: 'private-syrup', name: 'Private Syrup', amount: 50, unit: 'ml', category: 'soft', sharePublicFoodLibrary: false }
    ]);

    const firstLibrary = database.getFoodLibrary(firstUserId) as any[];
    const secondLibrary = database.getFoodLibrary(secondUserId) as any[];
    const storedInventory = database.getInventory(firstUserId) as any[];

    expect(firstLibrary.some(item => item.name === 'Shared Milk')).toBe(true);
    expect(firstLibrary.some(item => item.name === 'Private Syrup')).toBe(true);
    expect(secondLibrary.some(item => item.name === 'Shared Milk')).toBe(true);
    expect(secondLibrary.some(item => item.name === 'Private Syrup')).toBe(false);
    expect(storedInventory.find(item => item.id === 'public-milk')?.sharePublicFoodLibrary).toBe(1);
  });

  it('migrates existing food library contents to public once', () => {
    const dbPath = makeDbPath();
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        invite_code TEXT UNIQUE,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
      );
      INSERT INTO users (id, username, password, role) VALUES (1, 'migration-one', 'test', 'user');
      INSERT INTO users (id, username, password, role) VALUES (2, 'migration-two', 'test', 'user');
      CREATE TABLE food_library (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'uncategorized',
        created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
        UNIQUE(user_id, normalized_name, category),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
      INSERT INTO food_library (user_id, name, normalized_name, category) VALUES (1, 'Legacy Syrup', 'legacy syrup', 'soft');
    `);
    legacy.close();

    const migrated = createDatabase(dbPath);
    const firstUserId = 1;
    const secondUserId = 2;
    const secondLibrary = migrated.getFoodLibrary(secondUserId) as any[];
    expect(secondLibrary.some(item => item.name === 'Legacy Syrup' && item.is_public === 1)).toBe(true);

    migrated.setInventory(firstUserId, [
      { id: 'private-new', name: 'New Private Cream', amount: 50, unit: 'ml', category: 'milk', sharePublicFoodLibrary: false }
    ]);
    expect((migrated.getFoodLibrary(secondUserId) as any[]).some(item => item.name === 'New Private Cream')).toBe(false);
  });

  it('moves inventory items to uncategorized when deleting a category', () => {
    const database = createDatabase(makeDbPath());
    const userId = database.createUser({ username: 'category-test', password: 'test' });
    database.addInventoryCategory('syrup');
    database.setInventory(userId, [
      { id: 'grenadine', name: 'Grenadine', amount: 100, unit: 'ml', category: 'syrup' },
      { id: 'oolong', name: 'Oolong tea', amount: 200, unit: 'ml', category: 'tea' }
    ]);

    database.deleteInventoryCategory('syrup');

    const inventory = database.getInventory(userId) as any[];
    expect(inventory.find(item => item.id === 'grenadine')?.category).toBe('uncategorized');
    expect(inventory.find(item => item.id === 'oolong')?.category).toBe('tea');
    expect(database.getInventoryCategories().map((category: any) => category.name)).not.toContain('syrup');
  });

  it('persists recommendation history and returns newest first', () => {
    const database = createDatabase(makeDbPath());

    const first = database.saveRecommendationSession({
      request,
      provider: 'local-demo',
      model: 'demo',
      prompt: 'prompt-one',
      recommendations: [{ name: 'Cold Oolong Sparkler', ingredients: ['Oolong tea'], steps: ['Serve cold'] }]
    });
    const second = database.saveRecommendationSession({
      request,
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      prompt: 'prompt-two',
      recommendations: [{ name: 'Iced Tea Cooler', ingredients: ['Oolong tea'], steps: ['Shake'] }]
    });

    const history = database.listRecommendationHistory(10);

    expect(first.id).toBeGreaterThan(0);
    expect(second.id).toBeGreaterThan(first.id);
    expect(history).toHaveLength(2);
    // history[0] is second because of ORDER BY timestamp DESC
    expect(history[0].provider).toBe('gemini');
    expect(history[0].recommendations[0]?.name).toBe('Iced Tea Cooler');
  });

  it('does not insert duplicate favorites with the same signature', () => {
    const database = createDatabase(makeDbPath());
    const userId = database.createUser({ username: 'favorite-user', password: 'secret123' });
    const favorite = {
      name: 'Iced Latte',
      rating: 88,
      ingredients: ['Coffee 120 ml', 'Milk 120 ml'],
      steps: ['Mix and serve cold'],
      metadata: { favoriteSignature: 'same-drink-signature', calories: 120 }
    };

    const firstId = database.upsertFavorite(userId, favorite);
    const secondId = database.upsertFavorite(userId, favorite);
    const favorites = database.getFavorites(userId) as any[];

    expect(secondId).toBe(firstId);
    expect(favorites).toHaveLength(1);
  });
});
