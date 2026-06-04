import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, parseBasicAuthHeader } from '../src/server/app';
import { createDatabase } from '../src/server/storage';

const tempDirs: string[] = [];

function makeDbPath() {
  const directory = mkdtempSync(join(tmpdir(), 'sip-mind-http-test-'));
  tempDirs.push(directory);
  return join(directory, 'sip-mind.sqlite');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const ai = {
  generateRecommendations: async () => []
};

function basic(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

describe('admin inventory category deletion route', () => {
  it('parses Basic auth passwords containing colons', () => {
    expect(parseBasicAuthHeader(basic('admin', 'pa:ss'))).toEqual({ username: 'admin', password: 'pa:ss' });
  });

  it('deletes a category and moves inventory items to uncategorized', async () => {
    const database = createDatabase(makeDbPath());
    const userId = database.createUser({ username: 'category-route-test', password: 'test' });
    database.addInventoryCategory('syrup/sweet');
    database.setInventory(userId, [
      { id: 'grenadine', name: 'Grenadine', amount: 100, unit: 'ml', category: 'syrup/sweet' }
    ]);

    const app = createApp(database, ai as any, { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'pa:ss' });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server did not bind to a port');

      const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/inventory/categories`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: basic('admin', 'pa:ss')
        },
        body: JSON.stringify({ name: 'syrup/sweet' })
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.categories.map((category: any) => category.name)).not.toContain('syrup/sweet');
      const inventory = database.getInventory(userId) as any[];
      expect(inventory.find(item => item.id === 'grenadine')?.category).toBe('uncategorized');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      database.db.close();
    }
  });

  it('adds bilingual inventory categories for multilingual display', async () => {
    const database = createDatabase(makeDbPath());
    const app = createApp(database, ai as any, { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'pa:ss' });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server did not bind to a port');

      const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/inventory/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: basic('admin', 'pa:ss')
        },
        body: JSON.stringify({ label_zh: '糖浆', label_en: 'Syrup' })
      });
      const body = await response.json();
      const category = body.categories.find((item: any) => item.label_zh === '糖浆');

      expect(response.status).toBe(200);
      expect(category).toMatchObject({ label_zh: '糖浆', label_en: 'Syrup' });
      expect(category.name).toBe('syrup');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      database.db.close();
    }
  });

  it('exposes the public food library without login', async () => {
    const database = createDatabase(makeDbPath());
    const userId = database.createUser({ username: 'public-library-user', password: 'test' });
    database.setInventory(userId, [
      { id: 'shared-tea', name: 'Shared Tea', amount: 100, unit: 'ml', category: 'tea', sharePublicFoodLibrary: true }
    ]);
    const app = createApp(database, ai as any, { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'pa:ss' });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server did not bind to a port');
      const response = await fetch(`http://127.0.0.1:${address.port}/api/food-library/public`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.foodLibrary.some((item: any) => item.name === 'Shared Tea')).toBe(true);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      database.db.close();
    }
  });

  it('exposes the guest daily generation limit without login', async () => {
    const database = createDatabase(makeDbPath());
    database.setConfig('daily_limit_guest', '12');
    const app = createApp(database, ai as any, { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'pa:ss' });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server did not bind to a port');
      const response = await fetch(`http://127.0.0.1:${address.port}/api/public/config`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.daily_limit_guest).toBe('12');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      database.db.close();
    }
  });
});
