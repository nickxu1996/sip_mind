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
    expect(categories.at(-1)).toBe('uncategorized');
    expect(categories.indexOf('syrup')).toBeGreaterThan(-1);
    expect(categories.indexOf('syrup')).toBeLessThan(categories.indexOf('uncategorized'));
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
    expect(database.getInventoryCategories()).not.toContain('syrup');
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
});
